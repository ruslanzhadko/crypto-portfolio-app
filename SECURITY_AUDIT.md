# Dependency security review — 2026-10-07

Online npm registry audit before changes: 34 findings (1 critical, 24 high,
6 moderate, 3 low). An offline npm audit returned a misleading empty result;
always use `--offline=false` for these checks.

## Changes

- Next.js and eslint-config-next pinned to 15.5.27, the patched Maintenance LTS
  release: https://nextjs.org/blog/september-2026-security-release
- Async route params, page search params, cookies and headers migrated for Next 15.
- node-cron upgraded to 4.6.0; its bundled types replace @types/node-cron.
- Compatible transitive updates applied. PostCSS >=8.5.23 and selector-parser
  >=7.1.6 enforced through overrides, including Next's nested PostCSS.
- Unused Mermaid/ERD development generators removed. Existing ERD retained.
- Worker image prunes development dependencies after Prisma generation.

## Remaining findings

`npm audit --omit=dev --offline=false`: **0 findings**.

Full `npm audit --offline=false`: **8 high findings**, all rooted in
https://github.com/advisories/GHSA-vfj7-8cjw-p6xm (braces stack exhaustion).
Affected dependency paths: braces, micromatch, fast-glob, chokidar, Tailwind CSS,
tailwindcss-animate, @next/eslint-plugin-next and eslint-config-next.
The registry reports no patched braces release. These findings are NOT fixed
or suppressed. They remain a development/build risk when processing malicious
glob patterns. This application uses repository-controlled Tailwind content and
lint paths; HTTP inputs are not used as build glob patterns. Do not run builds
from untrusted source with production secrets. Revisit when upstream patches ship.

Zero production audit findings is not proof of absence of vulnerabilities, nor
does it validate exchange account permissions or the deployed configuration.
The existing main deployment and already running VPS container are unchanged
until separately redeployed/rebuilt.

## Validation

- TypeScript, ESLint and Next.js production build passed.
- 505 unit tests plus 5 isolated PostgreSQL integration tests passed.
- 2 Playwright tests passed against the production build and disposable local DB:
  connect, sync fixture, balances/positions, credential replacement, disconnect,
  desktop/mobile navigation and dashboard.
- Queue fixtures explicitly mark test jobs due, avoiding differences between
  Windows and Docker clocks; production scheduling is unchanged.
