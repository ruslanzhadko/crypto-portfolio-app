# Aster monitoring

Aster is an exchange connection linked to an existing active EVM wallet, not a
new network. The same wallet can also have an independent Hyperliquid
connection. Accounts are discovered when an existing wallet syncs; there is no
need to remove and re-add the wallet.

## Modes

| Mode | Credentials | Data |
| --- | --- | --- |
| Public wallet | None. Account privacy must be disabled in Aster | Futures balances and positions from the public `aster_getBalance` RPC. Funding, trading fees, realized PnL, break-even and liquidation price stay unknown |
| API Wallet (signed) | Signer address and private key **of a dedicated Aster API Wallet** with Read only and an IP list containing the worker IP. Never the user's main wallet key | `v3/account`, `v3/positionRisk`, `v3/userTrades`, `v3/income`: equity, positions, current-cycle closes, funding and fees |

Verification (`AsterApiAdapter.verify()`) reads `v3/agent` and requires the exact
agent address, `canRead`, a valid expiry, no trade/withdraw permissions and a
restricted `ipWhitelist`. The signer must differ from the main wallet.

Accounting details (API Wallet):

- Trade history lookback is 180 days with a separate bounded request budget, so
  positions opened months ago still get their current cycle.
- Fees are kept per asset (`tradingFeesByAsset`). Fees paid in ASTER are valued
  with historical one-minute prices (`v3/klines`). If a fee cannot be valued,
  net PnL and break-even stay unknown; closes and funding are still shown.
- A negative `walletBalance` with positive unrealized PnL is a real account
  state (e.g. −833 USDT cash, +936 unrealized, ~103 margin balance). It is never
  replaced with zero.

Spot is not included in either mode. Hidden, mismatched or malformed responses
are failures, never verified empty positions; stored values keep their previous
timestamp. Next funding uses the public premium index, cached for five minutes.

History: an `IP_RESTRICTED` incident in October 2026 was resolved by re-saving
the API Wallet; see `EXCHANGES_HANDOFF.md` §6.

References:
- https://asterdex.github.io/aster-api-website/rpc/endpoints/
- https://asterdex.github.io/aster-api-website/futures-v3/market-data/
- https://asterdex.github.io/aster-api-website/spot-v3/account%26trades/
