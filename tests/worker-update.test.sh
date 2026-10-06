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
esac
MOCK
cat > /tmp/mock/bin/docker <<'MOCK'
#!/bin/bash
set -e
echo "$*" >> /tmp/mock/calls
case "$1" in
  build) test ! -e /tmp/mock/build-fail ;;
  container) test -e "/tmp/mock/containers/$3" ;;
  inspect)
    if [[ -e /tmp/mock/unhealthy ]]; then echo unhealthy; else echo healthy; fi ;;
  stop|start) test -e "/tmp/mock/containers/${@: -1}" ;;
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
test "$(cat /tmp/mock/containers/cryptoportfolio-worker-dev)" = new
test "$(cat /var/lib/cryptoportfolio-worker-deploy/deployed)" = first
before=$(wc -l < /tmp/mock/calls)
bash /source/deploy/worker-update.sh
test "$(wc -l < /tmp/mock/calls)" = "$before"
echo retained > /tmp/mock/containers/cryptoportfolio-worker-dev
echo second > /tmp/mock/sha
touch /tmp/mock/unhealthy
if bash /source/deploy/worker-update.sh; then echo 'Expected failure'; exit 1; fi
test "$(cat /tmp/mock/containers/cryptoportfolio-worker-dev)" = retained
test "$(cat /var/lib/cryptoportfolio-worker-deploy/failed)" = second
test "$(cat /var/lib/cryptoportfolio-worker-deploy/deployed)" = first
echo third > /tmp/mock/sha
touch /tmp/mock/build-fail
if bash /source/deploy/worker-update.sh; then echo 'Expected build failure'; exit 1; fi
test "$(cat /tmp/mock/containers/cryptoportfolio-worker-dev)" = retained
echo 'PASS: deployment, unchanged commit, failed health rollback, failed build preservation'
