#!/usr/bin/env bash
# Installed as root-owned code. Only deploy the explicitly configured develop branch.
set -Eeuo pipefail
umask 077
state=/var/lib/cryptoportfolio-worker-deploy
env_file=/home/rzhadko/.config/cryptoportfolio/exchange-dev.env
name=cryptoportfolio-worker-dev
# Telegram feed listener: same image, own container and secrets. Skipped while the env file is absent.
listener_env_file=/home/rzhadko/.config/cryptoportfolio/telegram-feed.env
listener_name=cryptoportfolio-listener-production
# Price alert worker: same image, own secrets. Skipped while its env file is absent.
triggers_env_file=/home/rzhadko/.config/cryptoportfolio/price-triggers.env
triggers_name=cryptoportfolio-triggers-production
repo=https://github.com/ruslanzhadko/crypto-portfolio-app.git
branch=develop
# Optional root-owned configuration for a separately installed production worker.
if [[ -f /etc/cryptoportfolio-worker-deploy.conf ]]; then
  source /etc/cryptoportfolio-worker-deploy.conf
fi
[[ "$branch" == develop || "$branch" == main ]] || exit 1
mkdir -p "$state"
exec 9>"$state/lock"
flock -w 1200 9 || exit 1
[[ -s "$env_file" ]]
# Recreating a container deletes its logs: keep a copy of each one first (last 20 per container).
log_archive=/var/log/cryptoportfolio
archive_logs() {
  docker container inspect "$1" >/dev/null 2>&1 || return 0
  mkdir -p "$log_archive"
  docker logs "$1" > "$log_archive/$1-$(date -u +%Y%m%d-%H%M%S).log" 2>&1 || true
  ls -1t "$log_archive/$1-"*.log 2>/dev/null | tail -n +21 | xargs -r rm -f
}
# Only one process may use the Telegram session: the old container is removed before the new one starts.
# Failures here never roll back the exchange worker.
start_listener() {
  [[ -s "$listener_env_file" ]] || { echo 'Listener env file absent; listener skipped.'; return 0; }
  # Graceful stop lets the listener write the posts it is still holding.
  docker stop --time 20 "$listener_name" >/dev/null 2>&1 || true
  archive_logs "$listener_name"
  docker rm -f "$listener_name" >/dev/null 2>&1 || true
  docker run -d --name "$listener_name" --restart unless-stopped     --env-file "$listener_env_file" --no-healthcheck --log-driver json-file     --log-opt max-size=10m --log-opt max-file=3     --security-opt no-new-privileges:true --cap-drop ALL     "$1" node --import tsx scripts/telegram-feed-listener.ts || { echo 'WARNING: listener failed to start.'; return 0; }
  for _ in {1..18}; do
    if docker logs "$listener_name" 2>&1 | grep -q 'listener started'; then echo 'Listener started.'; return 0; fi
    sleep 5
  done
  echo 'WARNING: listener has not reported readiness; inspect docker logs.'
}
# Failures here never roll back the exchange worker either.
start_triggers() {
  [[ -s "$triggers_env_file" ]] || { echo 'Trigger worker env file absent; trigger worker skipped.'; return 0; }
  docker stop --time 15 "$triggers_name" >/dev/null 2>&1 || true
  archive_logs "$triggers_name"
  docker rm -f "$triggers_name" >/dev/null 2>&1 || true
  docker run -d --name "$triggers_name" --restart unless-stopped     --env-file "$triggers_env_file" --no-healthcheck --log-driver json-file     --log-opt max-size=10m --log-opt max-file=3     --security-opt no-new-privileges:true --cap-drop ALL     "$1" node --import tsx scripts/price-trigger-worker.ts || { echo 'WARNING: trigger worker failed to start.'; return 0; }
  for _ in {1..18}; do
    if docker logs "$triggers_name" 2>&1 | grep -q 'trigger worker started'; then echo 'Trigger worker started.'; return 0; fi
    sleep 5
  done
  echo 'WARNING: trigger worker has not reported readiness; inspect docker logs.'
}
if [[ ! -d "$state/repo.git" ]]; then git init --bare "$state/repo.git"; fi
git --git-dir="$state/repo.git" fetch --depth=1 "$repo" "refs/heads/$branch"
sha=$(git --git-dir="$state/repo.git" rev-parse FETCH_HEAD)
# A delayed Actions job must never replace newer code with its old commit.
if [[ -n ${SSH_ORIGINAL_COMMAND:-} ]]; then
  [[ "$SSH_ORIGINAL_COMMAND" =~ ^deploy\ ([a-f0-9]{40})$ ]] || exit 1
  if [[ ${BASH_REMATCH[1]} != "$sha" ]]; then
    echo 'Superseded push; deployment skipped.'; exit 0
  fi
fi
if [[ -f "$state/deployed" ]] && [[ $(cat "$state/deployed") == "$sha" ]]; then
  # Same commit: only start side containers that are missing (for example after an env file was created).
  if [[ -s "$listener_env_file" ]] && ! docker container inspect "$listener_name" >/dev/null 2>&1; then
    start_listener "cryptoportfolio-worker:git-$sha"
  fi
  if [[ -s "$triggers_env_file" ]] && ! docker container inspect "$triggers_name" >/dev/null 2>&1; then
    start_triggers "cryptoportfolio-worker:git-$sha"
  fi
  exit 0
fi
# Do not endlessly rebuild an unhealthy commit; a new push retries automatically.
if [[ -f "$state/failed" ]] && [[ $(cat "$state/failed") == "$sha" ]]; then
  echo "Commit $sha previously failed. Inspect journal; remove $state/failed to retry."; exit 1
fi
work=$(mktemp -d "$state/build.XXXXXX")
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT
git --git-dir="$state/repo.git" archive "$sha" | tar -x -C "$work"
image="cryptoportfolio-worker:git-$sha"
if ! docker build --label "org.opencontainers.image.revision=$sha" -f "$work/Dockerfile.exchanges" -t "$image" "$work"; then
  printf '%s\n' "$sha" > "$state/failed"; exit 1
fi
old="${name}-previous"
# An interrupted deployment leaves the previous container for manual recovery.
if docker container inspect "$old" >/dev/null 2>&1; then
  echo "Previous container exists; inspect and recover it before retrying."; exit 1
fi
had_old=false
replacement_started=false
rollback() {
  trap - ERR INT TERM
  if $had_old; then
    docker rm -f "$name" >/dev/null 2>&1 || true
    docker rename "$old" "$name"
    docker start "$name"
  elif $replacement_started; then
    docker rm -f "$name" >/dev/null 2>&1 || true
  else
    docker start "$name" >/dev/null 2>&1 || true
  fi
  printf '%s\n' "$sha" > "$state/failed"
  echo "Deployment failed; previous worker restored when available."
  exit 1
}
trap rollback ERR INT TERM
if docker container inspect "$name" >/dev/null 2>&1; then
  docker stop --time 30 "$name"
  docker rename "$name" "$old"
  had_old=true
fi
replacement_started=true
docker run -d --name "$name" --restart unless-stopped \
  --env-file "$env_file" --log-driver json-file \
  --log-opt max-size=10m --log-opt max-file=3 \
  --security-opt no-new-privileges:true --cap-drop ALL "$image"
healthy=false
for _ in {1..18}; do
  if [[ $(docker inspect --format '{{.State.Health.Status}}' "$name") == healthy ]]; then healthy=true; break; fi
  sleep 5
done
$healthy || rollback
printf '%s\n' "$sha" > "$state/deployed"
trap - ERR INT TERM
# Keep the previous image for rollback, but remove the superseded stopped container.
if $had_old; then archive_logs "$old"; docker rm "$old"; fi
echo "Worker deployed and heartbeat verified: $sha"
start_listener "$image"
start_triggers "$image"
# Keep the running image and the previous one for rollback; drop older images and stale build cache
# (the npm layer is ~1.3 GB per build and filled the 19 GB disk on 22.10).
docker images cryptoportfolio-worker --format '{{.CreatedAt}}	{{.Repository}}:{{.Tag}}'   | sort -r | tail -n +3 | cut -f2 | xargs -r docker rmi >/dev/null 2>&1 || true
docker builder prune -f --filter until=24h >/dev/null 2>&1 || true
