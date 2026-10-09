export type ExchangeId =
  | "binance"
  | "bybit"
  | "gate"
  | "okx"
  | "bingx"
  | "bitget"
  | "hyperliquid"
  | "aster";
export type SyncStatus =
  | "PENDING"
  | "ACTIVE"
  | "PARTIAL"
  | "ERROR"
  | "PAUSED"
  | "DISCONNECTED"
  | "INVALID_KEY"
  | "UNSUPPORTED";
export type ErrorCode =
  | "INVALID_KEY"
  | "UNSAFE_KEY"
  | "IP_RESTRICTED"
  | "RATE_LIMIT"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "UNSUPPORTED_ACCOUNT"
  | "FUTURES_UNAVAILABLE"
  | "SPOT_UNAVAILABLE"
  | "PRIVATE_ACCOUNT"
  | "UNPRICED_ASSETS"
  | "DUPLICATE_ACCOUNT"
  | "CONFIGURATION";
export interface Credentials {
  apiKey: string;
  secret: string;
  passphrase?: string;
}
export interface AssetBalance {
  assetId: string;
  symbol: string;
  total: string;
  free: string | null;
  locked: string | null;
  debt: string | null;
  usdValue: string | null;
  priceUsd: string | null;
}
export interface OpenPosition {
  funding?: import("./funding").FundingSummary;
  positionKey: string;
  symbol: string;
  base: string;
  settle: string;
  side: "long" | "short";
  contracts: string;
  contractSize: string;
  baseSize: string;
  notionalUsd: string | null;
  entryPrice: string | null;
  markPrice: string | null;
  liquidationPrice: string | null;
  leverage: string | null;
  marginMode: string | null;
  margin: string | null;
  unrealizedPnl: string | null;
  unrealizedPnlUsd: string | null;
}
export interface AccountBalance {
  accountKey: string;
  kind: "spot" | "futures" | "unified";
  mode: string;
  equityUsd: string | null;
  availableUsd: string | null;
  unrealizedPnlUsd: string | null;
  complete: boolean;
  errorCode: ErrorCode | null;
  balances: AssetBalance[];
  // Undefined means this section was NOT fetched. Empty array means verified empty.
  positions?: OpenPosition[];
}
export interface SyncResult {
  accounts: AccountBalance[];
  failedAccounts: { accountKey: string; kind: string; errorCode: ErrorCode }[];
  externalAccountId?: string;
}
export interface ExchangeAdapter {
  verify(): Promise<{ externalAccountId?: string }>;
  fetch(includeSpot: boolean): Promise<SyncResult>;
  close(): Promise<void>;
}

export class ExchangeError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(code);
    this.name = "ExchangeError";
  }
}
// Never forward provider messages: they can contain signed URLs or headers.
export function safeError(error: unknown): ErrorCode {
  if (error instanceof ExchangeError) return error.code;
  const name = error instanceof Error ? error.name : "";
  if (/Authentication|AccountSuspended/.test(name)) return "INVALID_KEY";
  if (/PermissionDenied/.test(name)) return "IP_RESTRICTED";
  if (/RateLimit|DDoS/.test(name)) return "RATE_LIMIT";
  if (/BadSymbol|NotSupported/.test(name)) return "UNSUPPORTED_ACCOUNT";
  return "UNAVAILABLE";
}
