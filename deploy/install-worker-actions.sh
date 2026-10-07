#!/usr/bin/env bash
set -Eeuo pipefail
if [[ $EUID != 0 || $# != 1 ]]; then
  echo 'Usage: sudo bash deploy/install-worker-actions.sh /path/to/actions-key.pub'; exit 1
fi
key=$(cat "$1")
[[ "$key" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ .*)?$ ]] || exit 1
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
test -s /home/rzhadko/.config/cryptoportfolio/exchange-dev.env
for command in git docker flock tar sshd; do command -v "$command" >/dev/null; done
id worker-deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash worker-deploy
install -m 0755 worker-update.sh /usr/local/sbin/cryptoportfolio-worker-update
install -d -m 0700 -o worker-deploy -g worker-deploy /home/worker-deploy/.ssh
printf 'restrict,command="sudo -n /usr/local/sbin/cryptoportfolio-worker-update" %s\n' "$key" > /home/worker-deploy/.ssh/authorized_keys
chown worker-deploy:worker-deploy /home/worker-deploy/.ssh/authorized_keys
chmod 0600 /home/worker-deploy/.ssh/authorized_keys
sudoers=$(mktemp)
trap 'rm -f "$sudoers"' EXIT
printf '%s\n' 'Defaults:worker-deploy env_keep += "SSH_ORIGINAL_COMMAND"' \
  'worker-deploy ALL=(root) NOPASSWD: /usr/local/sbin/cryptoportfolio-worker-update' > "$sudoers"
visudo -cf "$sudoers"
install -m 0440 "$sudoers" /etc/sudoers.d/cryptoportfolio-worker-deploy
systemctl disable --now cryptoportfolio-worker-update.timer 2>/dev/null || true
echo 'Actions access installed. No deployment started; existing worker remains running.'
