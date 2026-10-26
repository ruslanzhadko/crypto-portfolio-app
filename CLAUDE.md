# Project rules for agents

Product: CryptoPortfolio, a monitor of crypto wallets and exchange accounts. Docs live in `docs/`
(start with `docs/INFRASTRUCTURE.md` section 0). Code and comments in English; product languages RU / UK / EN.

## Changelog (public page `/changelog`)

Entries live in `lib/changelog/entries.ts`, newest first, three languages each, 2-5 short lines.
Keep the page a digest, not a commit log.

**Include:** a new feature, page or integration; a noticeable speed-up; a bug fix users could see
(for example posts missing from the feed).
**Skip:** styling and spacing tweaks, wording, coin logos, refactors, tests, deploy and infrastructure,
docs, small fixes, anything the owner does not see as a product change.

**When to write one (do not wait to be reminded):**
1. Before every push to `main`, run `npm run changelog:check`. It lists commits since the newest entry.
2. If at least one item qualifies as above, or roughly 5+ user-facing commits have piled up, draft an entry
   and show it to the owner in the same message that announces the release.
3. A clearly major feature gets its entry in the same commit as the feature.
4. Date = the day the change reached `main`. Group related changes into one entry; do not add one per commit.
5. Add all three languages (`ru`, `uk`, `en`); `lib/changelog/entries.test.ts` checks they match.

## Working rules

- Never add `Co-Authored-By` or any mention of an AI assistant to commits.
- Push to `develop` and `main` only when the task is finished and verified; wait for green CI
  (the browser suite retries once; rerun a failed run one time at most).
- Never run tests or the worker against the local `.env` (it points at production). Use a throwaway
  PostgreSQL in Docker. Production database changes: backup first, additive only, no reset or drop.
- Do not print secrets in chat or logs. The VM deploy script archives container logs to `/var/log/cryptoportfolio`
  before recreating them; ask the owner to save logs by hand only when the script on the VM is older than that
  or a container is removed manually.
- Keep documentation short and current; delete outdated sections instead of accumulating history.
- No docs-only commits: leave doc edits uncommitted; they go out with the next code commit or fix.
- Long-running processes must not poll PostgreSQL continuously (Neon billing).
