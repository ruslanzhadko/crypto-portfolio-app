import { ExchangeError } from "./types";

export function assertBinanceReadOnly(info: Record<string, unknown>) {
  const forbidden = [
    "enableWithdrawals",
    "enableInternalTransfer",
    "permitsUniversalTransfer",
    "enableMargin",
    "enableFutures",
    "enableVanillaOptions",
    "enableSpotAndMarginTrading",
    "enablePortfolioMarginTrading",
    "enableFixApiTrade",
  ];
  if (
    info.enableReading !== true ||
    forbidden.some((key) => info[key] !== undefined && info[key] !== false)
  )
    throw new ExchangeError("UNSAFE_KEY");
  // Missing core flags are not evidence that a key is safe.
  if (
    ["enableWithdrawals", "enableSpotAndMarginTrading", "enableFutures"].some(
      (key) => typeof info[key] !== "boolean",
    )
  )
    throw new ExchangeError("INVALID_RESPONSE");
  if (info.ipRestrict !== true) throw new ExchangeError("IP_RESTRICTED");
}
export function assertBybitReadOnly(info: Record<string, unknown>) {
  if (info.readOnly !== 1) throw new ExchangeError("UNSAFE_KEY");
  const ips = info.ips;
  if (
    !Array.isArray(ips) ||
    !ips.length ||
    ips.some(
      (ip) => typeof ip !== "string" || !ip || ip === "*" || ip === "0.0.0.0",
    )
  )
    throw new ExchangeError("IP_RESTRICTED");
  const permissions = info.permissions as Record<string, unknown> | undefined;
  if (!permissions || typeof permissions !== "object")
    throw new ExchangeError("INVALID_RESPONSE");
  for (const field of ["Wallet", "Withdraw"]) {
    const values = permissions[field];
    if (
      Array.isArray(values) &&
      values.some((v) => typeof v === "string" && /transfer|withdraw/i.test(v))
    )
      throw new ExchangeError("UNSAFE_KEY");
  }
}
