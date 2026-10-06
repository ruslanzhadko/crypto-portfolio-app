#!/usr/bin/env bash
# Installed as root-owned code. Only deploy the explicitly configured develop branch.
set -Eeuo pipefail
umask 077
state=/var/lib/cryptoportfolio-worker-deploy
env_file=/home/rzhadko/.config/cryptoportfolio/exchange-dev.env
name=cryptoportfolio-worker-dev
repo=https://github.com/ruslanzhadko/crypto-portfolio-app.git
mkdir -p "$state"
exec 9>"$state/lock"
flock -n 9 || exit 0
test -s "$env_file"
if [[ ! -d "$state/repo.git" ]]; then git init --bare "$state/repo.git"; fi
git --git-dir="$state/repo.git" fetch --depth=1 "$repo" refs/heads/develop
sha=$(git --git-dir="$state/repo.git" rev-parse FETCH_HEAD)
if [[ -f "$state/deployed" ]] && [[ $(cat "$state/deployed") == "$sha" ]]; then exit 0; fi
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
if $had_old; then docker rm "$old"; fi
echo "Worker deployed and heartbeat verified: $sha"
