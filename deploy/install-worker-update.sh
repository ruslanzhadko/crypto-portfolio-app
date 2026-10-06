#!/usr/bin/env bash
set -Eeuo pipefail
if [[ $EUID != 0 ]]; then echo "Run using sudo bash deploy/install-worker-update.sh"; exit 1; fi
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
test -s /home/rzhadko/.config/cryptoportfolio/exchange-dev.env
for command in git docker flock tar; do command -v "$command" >/dev/null; done
install -m 0755 worker-update.sh /usr/local/sbin/cryptoportfolio-worker-update
install -m 0644 cryptoportfolio-worker-update.service cryptoportfolio-worker-update.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now cryptoportfolio-worker-update.timer
systemctl start --no-block cryptoportfolio-worker-update.service
echo 'Update started. Follow: sudo journalctl -u cryptoportfolio-worker-update -f'
