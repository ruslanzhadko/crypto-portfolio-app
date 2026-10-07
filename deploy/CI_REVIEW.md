# CI review — 2026-10-07

## Findings

The old Actions job ran all Vitest tests without a database. Five valuable
database tests silently skipped, and no browser flow ran before worker deployment.
The old default browser suite used a development server, generated persistent
login state, repeated basic page checks, and retried login three times plus
two suite retries. Its setup could inherit a remote DATABASE_URL.

The local baseline had 507 passing tests and five skipped tests. The slowest
test file was Telegram's real Auth.js callback integration (~1.42 seconds
for seven cases); most other files took under half a second. Therefore
removing fast security or accounting tests would save little while weakening
protection. Test counts do not measure maintenance cost or coverage quality.

## Removed or consolidated

| Check | Decision and reason |
| --- | --- |
| `networks.test.ts` (9 tests) | Removed fixed palette/name/count expectations. Adding a supported network or changing a color should not require rewriting assertions about constants. |
| 9 formatting tests | Removed thin Intl/date-fns wrapper assertions, address slicing examples and a return-type-only assertion. Kept amount precision, PnL signs, non-finite guards and locale-specific freshness behavior. |
| Manifest navigation scope test | Removed a tautology: constructing an absolute path and checking that it starts with `/` says nothing about browser navigation. Kept the manifest middleware bypass check. |
| Old Telegram discovery failure | Removed a test that deliberately rewrote the provider into a configuration the app no longer uses. Kept real Auth.js successful callback plus signature/audience/expiry/state/PKCE rejection. |
| Old default Playwright suite/setup | Replaced with one isolated production-build suite. Registration, duplicate user/wallet rejection, invalid login and protected access remain in a real browser/API/DB lifecycle. Exchange E2E already covers valid login, so a separate login-only test adds little. |
| Page-heading, empty required-field and dialog-opening-only E2E | Removed. Critical lifecycle tests exercise the actual forms and persistence instead. |
| Always-written screenshots and exact Recharts circle count | Removed. Failure-only screenshots/traces are retained; chart source-transition correctness stays covered by the small targeted regression test. |
| Separate CI lint/typecheck commands | Production Next build performs both already. Local commands remain available. |

20 unit tests were removed, not merely excluded from CI. No behavior or
production code was changed to satisfy the tests.

## Retained useful checks

| Area | What the tests protect |
| --- | --- |
| Exchange adapters, permissions, crypto, decimal and API | Read-only/IP enforcement, encrypted credentials and rotation, decimal precision, partial failures, authorization and secret-safe responses. Adapter transport uses deterministic provider fixtures, not real accounts. |
| Auth, middleware, user/admin routes, health, Telegram callback | Authentication/ownership/blocking/revocation, CSRF/state/signatures, linking to the right user, least-privilege boundaries and database-independent health checks. Mocked route regressions remain useful for exhaustive denied/error cases. |
| Wallet APIs and provider services | User-scoped operations, provider failures preserving stored balances, transaction pagination, unit conversion and correct asset identities. |
| Portfolio math, chart transitions, token filtering/grouping | Correct percentage denominators, losses, source-composition changes, hiding/spam and avoiding identity mistakes. These are cheap deterministic regression tests. |
| Price alerts and Telegram/feed parsers/routes | Threshold crossing, consent/notification settings, safe media/links, album attribution and parsing of real provider payloads. No live Telegram sends or public exchange calls are needed by these fixture tests. |
| Settings rendering | Password/provider controls and legacy Telegram identity handling. These protect account-management behavior, rather than pixel styling. |
| Five real database scenarios | Job contention, expired lease recovery, stale-writer fencing, partial-failure preservation, no equity double counting, legacy HyperCore exclusion and composition changes not being reported as investment profit. |
| Three E2E scenarios | Registration/auth/wallet persistence; exchange create/queue/balances/positions/key replacement/disconnect; dashboard/mobile/filters/navigation. External wallet synchronization is stubbed, real auth/API/database writes are not. |
| Deployment script scenarios | Successful swap, unchanged commit, failed-build preservation, failed-heartbeat rollback, stale push and invalid SSH command. Runs with fake Docker/Git, no privileged real deployment. |

## Final pipeline

1. Node 22 with npm download cache, clean lockfile install.
2. Disposable PostgreSQL 16, explicit localhost `/exchange_test` URL and schema push.
3. Fast behavioral/security tests, then explicit database integration. CI errors
   if database configuration is absent/unsafe rather than silently skipping.
4. Deployment rollback scenarios using fake tools.
5. Production Next build, including lint and TypeScript checks.
6. Chromium only, three critical E2E flows, one worker and zero retries.
7. Failure-only diagnostics, three-day retention.
8. Restricted SSH deployment and real worker heartbeat; rollback on failure.

The database service and browser installation increase useful validation
compared with the old unit-only job. No claim is made that total CI time is
shorter; runtime must be measured on the hosted runner. The first green check
does not prove VM deployment until environment credentials are configured.

## Local validation

492 Vitest tests passed with zero skips (487 behavioral/security regressions
plus five database integration tests). Production build including lint/type
checks passed. All three browser flows passed in 17.3 seconds without retries.
The six deployment-script scenarios also passed in a disposable container.
Browser selectors now wait for account navigation and select the accessible
filter by role rather than hidden DOM copies during hydration.

## Manual checks still required before production

Real Binance/Bybit/Hyperliquid credentials, rate limits, actual exchange
balances/positions, production migration/backup, VM reboot recovery and a
real deployment failure/rollback drill are not covered by fixture E2E.
Vercel builds independently; a green worker check does not prove its deployment
is ready. The Actions workflow does not gate Vercel's automatic deployment.
