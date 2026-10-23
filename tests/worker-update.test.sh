#!/usr/bin/env bash
# Run inside a disposable Linux container: no real Docker daemon or user secrets.
set -euo pipefail
mkdir -p /tmp/mock/bin /tmp/mock/containers /tmp/mock/archive /home/rzhadko/.config/cryptoportfolio
echo test-only > /home/rzhadko/.config/cryptoportfolio/exchange-dev.env
export PATH="/tmp/mock/bin:$PATH"
cat > /tmp/mock/bin/git <<'MOCK'
#!/bin/bash
case "$*" in
  *init*) mkdir -p /var/lib/cryptoportfolio-worker-deploy/repo.git ;;
  *rev-parse*) cat /tmp/mock/sha ;;
  *archive*) tar -c -C /tmp/mock/archive . ;;
  # Worker files unchanged between the deployed and the new commit only when the test says so.
  *diff*) [[ -e /tmp/mock/same-worker ]] ;;
esac
MOCK
cat > /tmp/mock/bin/docker <<'MOCK'
#!/bin/bash
set -e
echo "$*" >> /tmp/mock/calls
case "$1" in
  build) [[ ! -e /tmp/mock/build-fail ]] ;;
  container) [[ -e "/tmp/mock/containers/$3" ]] ;;
  inspect)
    if [[ -e /tmp/mock/unhealthy ]]; then echo unhealthy; else echo healthy; fi ;;
  stop|start) [[ -e "/tmp/mock/containers/${@: -1}" ]] ;;
  logs) printf '%s
' '[feed] listener started for 7 channels' '[triggers] trigger worker started' ;;
  rename) mv "/tmp/mock/containers/$2" "/tmp/mock/containers/$3" ;;
  rm) rm -f "/tmp/mock/containers/${@: -1}" ;;
  run)
    while [[ $1 != --name ]]; do shift; done
    echo new > "/tmp/mock/containers/$2" ;;
esac
MOCK
printf '#!/bin/bash\nexit 0\n' > /tmp/mock/bin/sleep
chmod +x /tmp/mock/bin/*
echo old > /tmp/mock/containers/cryptoportfolio-worker-dev
echo first > /tmp/mock/sha
bash /source/deploy/worker-update.sh
[[ "$(cat /tmp/mock/containers/cryptoportfolio-worker-dev)" = new ]]
[[ "$(cat /var/lib/cryptoportfolio-worker-deploy/deployed)" = first ]]
before=$(wc -l < /tmp/mock/calls)
bash /source/deploy/worker-update.sh
[[ "$(wc -l < /tmp/mock/calls)" = "$before" ]]
# The listener starts only once its secrets exist; an unchanged commit starts a missing listener.
[[ ! -e /tmp/mock/containers/cryptoportfolio-listener-production ]]
echo test-only > /home/rzhadko/.config/cryptoportfolio/telegram-feed.env
bash /source/deploy/worker-update.sh
[[ "$(cat /tmp/mock/containers/cryptoportfolio-listener-production)" = new ]]
# The trigger worker follows the same rule: absent env file, no container; created later, started.
[[ ! -e /tmp/mock/containers/cryptoportfolio-triggers-production ]]
echo test-only > /home/rzhadko/.config/cryptoportfolio/price-triggers.env
bash /source/deploy/worker-update.sh
[[ "$(cat /tmp/mock/containers/cryptoportfolio-triggers-production)" = new ]]
# A website-only commit is recorded as deployed without building or touching containers.
echo website > /tmp/mock/sha
touch /tmp/mock/same-worker
before=$(wc -l < /tmp/mock/calls)
bash /source/deploy/worker-update.sh
[[ "$(wc -l < /tmp/mock/calls)" = "$before" ]]
[[ "$(cat /var/lib/cryptoportfolio-worker-deploy/deployed)" = website ]]
rm /tmp/mock/same-worker
echo retained > /tmp/mock/containers/cryptoportfolio-worker-dev
echo second > /tmp/mock/sha
touch /tmp/mock/unhealthy
if bash /source/deploy/worker-update.sh; then echo 'Expected failure'; exit 1; fi
[[ "$(cat /tmp/mock/containers/cryptoportfolio-worker-dev)" = retained ]]
[[ "$(cat /var/lib/cryptoportfolio-worker-deploy/failed)" = second ]]
[[ "$(cat /var/lib/cryptoportfolio-worker-deploy/deployed)" = website ]]
echo third > /tmp/mock/sha
touch /tmp/mock/build-fail
if bash /source/deploy/worker-update.sh; then echo 'Expected build failure'; exit 1; fi
[[ "$(cat /tmp/mock/containers/cryptoportfolio-worker-dev)" = retained ]]
echo 1111111111111111111111111111111111111111 > /tmp/mock/sha
before=$(wc -l < /tmp/mock/calls)
SSH_ORIGINAL_COMMAND='deploy 2222222222222222222222222222222222222222' bash /source/deploy/worker-update.sh
[[ "$(wc -l < /tmp/mock/calls)" = "$before" ]]
if SSH_ORIGINAL_COMMAND='arbitrary command' bash /source/deploy/worker-update.sh; then
  echo 'Expected invalid SSH command rejection'; exit 1
fi
[[ "$(wc -l < /tmp/mock/calls)" = "$before" ]]
echo 'PASS: deployment, listener, trigger worker, unchanged commit, website-only commit, rollback, failed build, stale push, invalid command'
