# Hyperliquid in the wallet tracker

Hyperliquid is one L1 with two execution environments: HyperCore (spot and
perpetual trading) and HyperEVM (EVM contracts). Both use the same `0x` account
address, but their balances are distinct. The wallet UI therefore presents
`HyperCore Spot`, `HyperCore Perps`, and `HyperEVM` as separate balance sources
under an existing EVM address. Moving HYPE between Core and EVM changes the
source of the balance; it does not create a second asset in a single source.
Add the master or subaccount address itself; an API agent wallet address does
not expose the account's balances.

## Balance sources

| Source | API | Portfolio treatment |
| --- | --- | --- |
| HyperCore spot | `spotClearinghouseState`, `spotMetaAndAssetCtxs` | Token `total` (including held amounts); USD prices from spot market contexts. |
| HyperCore perps | `clearinghouseState` | `marginSummary.accountValue` as a separate USD-denominated equity line **only** in standard/disabled account mode. Open position notional is not added. |
| Unified / portfolio margin | `userAbstraction` | Spot state is authoritative for collateral shared with perps; perps equity is not added again. |
| HyperEVM | Hyperscan Blockscout `/api/v2/addresses/{address}` and `/tokens` | Native HYPE plus ERC-20 balances, separate from Core tokens. |

No API key or wallet signature is needed. A failed source preserves its previous
stored balances and is listed in the sync result. HyperCore token IDs are kept
as HyperCore IDs and are never treated as EVM contract addresses.

## Activity

HyperCore activity uses `userFills` (spot and perpetual executions) and
`userNonFundingLedgerUpdates` (deposits, withdrawals and transfers). Fills have
per-fill IDs because one transaction hash may contain multiple executions.
The API provides up to 2,000 recent fills. Ledger activity is read within the
last 30 days; if the 500-entry response cap is reached, the window is narrowed
to keep the newest activity. Older activity is not included in this view.

HyperEVM activity uses Hyperscan's address transactions and ERC-20 transfer
pages. The current EVM view lists transfer events, including both sides of a
swap; it does not derive a single swap from internal contract flows. HyperCore
fills appear as trades in the existing swap row layout. Core and EVM transfers
may each appear as their own event when moving funds between environments.

## Scope to extend

The existing portfolio model holds positive token balances and has no position
or liability type. Open perpetual positions, unrealized PnL details, borrowed
amounts, staking, vault shares, HIP-3 collateral across additional perp DEXs,
subaccounts, and full historical backfill need dedicated models and UI. The
standard-mode equity line is an account value, not a freely withdrawable USDC
token amount.

References: [HyperEVM](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/hyperevm),
[spot API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/spot),
[perpetual API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals),
[account modes](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/account-abstraction-modes),
[general info API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint),
[official explorer list](https://hyperliquid.gitbook.io/hyperliquid-docs/builder-tools/hyperevm-tools).
