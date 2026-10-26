# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user tracks a personal crypto portfolio and monitors market activity. Administrators additionally manage users, integrations, and the Telegram sources that power the crypto feed.

## Product Purpose

The product combines read-only multichain wallet tracking, read-only exchange accounts (balances, positions, deposits and withdrawals), market data, alerts, and a curated Telegram-derived crypto feed in one authenticated dashboard.

## Operating Context

Users work in a responsive web dashboard. Long-running workers on a VM read exchange accounts with read-only keys, Telegram channels and prices, keep hot state in memory and write to PostgreSQL in batches; the web application reads that shared database.

## Capabilities and Constraints

- Next.js web application with localized Russian, Ukrainian, and English interfaces.
- PostgreSQL is accessed through Prisma.
- Roles are `USER` and `ADMIN`; administrative pages and APIs require `ADMIN`.
- Telegram source management is database-backed and restricted to administrators.
- Disabling a source hides its posts without deleting history.
- Telegram credentials and user sessions remain server-only secrets.

## Evidence on Hand

- Existing authenticated dashboard, admin area, and role guards in the repository.
- Existing Telegram feed page, API, classifier, Prisma models, and long-running listener.
- No external testimonials or performance claims should be invented.

## Product Principles

- Keep custody read-only: never request wallet private keys.
- Make operational state and recovery steps visible.
- Preserve collected history unless an administrator explicitly requests destructive removal.
- Keep privileged controls unavailable to regular users at both page and API levels.
