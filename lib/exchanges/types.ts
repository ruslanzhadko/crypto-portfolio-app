export type ExchangeId =
  | "binance"
  | "bybit"
  | "gate"
  | "okx"
  | "bingx"
  | "bitget"
  | "kucoin"
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
  /** Deposits and withdrawals since `since` (ms); absent where the exchange is not supported yet. */
  transfers?(since: number): Promise<import("./transfers").Transfer[]>;
  /**
   * Exact net result of a fully closed position from the exchange ledger (settle currency), or
   * null when it is not available yet or cannot be attributed; absent where not supported.
   */
  closedResult?(
    input: import("./closed-result").ClosedInput,
  ): Promise<string | null>;
  /** Fully closed positions between two moments (ms) from the exchange's own history. */
  closedTrades?(
    since: number,
    until: number,
  ): Promise<import("./closed-trades").ClosedTradeRow[]>;
  close(): Promise<void>;
}

export class ExchangeError extends Error {
  constructor(
    public readonly code: ErrorCode,
    /** Safe diagnosis for logs (endpoint, provider code, field names); never provider text. */
    public readonly detail?: string,
  ) {
    super(code);
    this.name = "ExchangeError";
  }
}
/**
 * What a log may say about a provider failure: the error class and the exchange's numeric code.
 * Never the message itself, which can contain signed URLs or headers.
 */
export function errorDiagnostics(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : "";
  const code = /"(?:code|retCode|ret_code)"\s*:\s*"?(-?\d{1,9})"?/.exec(
    message,
  )?.[1];
  const detail =
    error instanceof ExchangeError && error.detail ? ` [${error.detail}]` : "";
  return (code ? `${name} code ${code}` : name) + detail;
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
