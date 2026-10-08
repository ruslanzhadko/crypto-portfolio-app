# Worker deployment through GitHub Actions

Push to `develop` runs checks, then deploys the test worker. Push to `main`
uses the separate `worker-production` GitHub environment. Configure production
only after its database migration, credentials and dedicated worker are ready.
The VM builds the Docker image; GitHub holds only a restricted SSH key, never
the Neon password or exchange encryption keys. Vercel deploys independently.

Checks use an automatically created, disposable PostgreSQL service in GitHub,
not Neon. They run the behavior/security regressions, database integration,
deployment rollback, production build (including lint and TypeScript), and
three critical Chromium browser flows. No additional database secrets or
manual test infrastructure setup are required. See `CI_REVIEW.md` for scope.

## One-time setup for the existing test VM

Run on the VM as `rzhadko`:

```bash
cd ~/cryptoportfolio
git pull --ff-only origin develop
umask 077
ssh-keygen -t ed25519 -N '' -C github-actions-worker-preview \
  -f ~/.config/cryptoportfolio/actions-preview
sudo bash deploy/install-worker-actions.sh \
  ~/.config/cryptoportfolio/actions-preview.pub
```

The installer replaces the deployment account's authorized key; use this
account only for this deployment. It disables the old polling timer if present.
The private key is not the encryption key and must not be pasted into chat.

Open repository Settings → Environments → New environment and create
`worker-preview`. Add environment variables:

| Variable | Value |
| --- | --- |
| `WORKER_HOST` | `34.118.101.48` |
| `WORKER_USER` | `worker-deploy` |

Add environment secrets:

* `WORKER_SSH_KEY`: entire output of
  `cat ~/.config/cryptoportfolio/actions-preview`, including BEGIN/END lines.
* `WORKER_KNOWN_HOSTS`: output of the following command on the VM itself,
  through your existing trusted SSH console:

```bash
printf '34.118.101.48 '
sudo cat /etc/ssh/ssh_host_ed25519_key.pub
```

This pins the server key without trusting a network key scan.
Verify GCP firewall permits TCP 22 from the GitHub-hosted runner. If SSH is
restricted to your own IP or IAP, do not replace that restriction blindly:
use GCP IAP/OIDC or a runner with a fixed allowed IP instead.

After saving configuration, rerun the latest workflow in GitHub → Actions →
Check and deploy exchange worker → Re-run all jobs. The workflow must have
both `check` and `deploy` green. Inspect the VM:

```bash
sudo docker ps --filter name=cryptoportfolio-worker-dev
sudo docker inspect --format '{{.State.Health.Status}}' cryptoportfolio-worker-dev
sudo cat /var/lib/cryptoportfolio-worker-deploy/deployed
```

Expect `healthy` and the latest develop SHA. Force a later push to verify
event-driven updating. The workflow is not fully configured until this works.

## Production transition

Do not point the test worker at production. Create a separately configured
production VM/account and `worker-production` environment with its own key,
host and pinned host key. On that VM install root-owned mode-0600
`/etc/cryptoportfolio-worker-deploy.conf` containing:

```bash
branch=main
state=/var/lib/cryptoportfolio-worker-production-deploy
env_file=/home/rzhadko/.config/cryptoportfolio/exchange-production.env
name=cryptoportfolio-worker-production
```

Provision that environment file securely, migrate production schema after a
backup, enable your own user first, and only then merge to main. Future main
pushes update both Vercel and the production worker automatically. Database
migrations and changes to the root-owned deployment script remain explicit
operations; ordinary source pushes do not perform them.

The wallet exchange index is the one targeted exception: the worker's startup
prepares a unique `(walletId, exchange)` index and removes the previous unique
`walletId` index in one transaction. This changes no stored rows and permits
Aster and Hyperliquid on the same wallet. The upgrade is idempotent and is
verified against the previous schema in the isolated database tests. An older
worker that used the single-wallet index cannot be restored without adapting
its wallet discovery query to the compound index.

## Failures and retry

Build failure leaves the current worker running. Failed heartbeat restores
the previous container. Inspect Actions logs first. To retry a failed SHA after
fixing configuration, remove only the recorded failure marker on the VM and
rerun the workflow:

```bash
sudo rm -f /var/lib/cryptoportfolio-worker-deploy/failed
```

Queued old pushes are skipped when the branch already points to a newer SHA.
GitHub concurrency and the VM lock serialize deployment. No registry token,
public webhook or privileged self-hosted runner is required.
