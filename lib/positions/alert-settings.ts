import { z } from "zod";

/**
 * Position notification settings (Settings → Notifications). Stored as JSON on the user;
 * they apply to every position of every connected account except the excluded connections.
 */
/** Quick choices for the liquidation threshold; any value in the range below is allowed. */
export const LIQUIDATION_PERCENTS = [5, 10, 15, 20] as const;
export const LIQUIDATION_MIN = 1;
export const LIQUIDATION_MAX = 50;

export const positionAlertSettingsSchema = z
  .object({
    opened: z.boolean(),
    closed: z.boolean(),
    pnlSign: z.boolean(),
    liquidation: z.boolean(),
    // Whole or half percent between 1% and 50%.
    liquidationPercent: z
      .number()
      .min(LIQUIDATION_MIN)
      .max(LIQUIDATION_MAX)
      .refine((n) => Number.isInteger(n * 2)),
    excludedConnections: z.array(z.string().min(1).max(64)).max(50),
  })
  .strict();

export type PositionAlertSettings = z.infer<typeof positionAlertSettingsSchema>;

export const DEFAULT_POSITION_ALERTS: PositionAlertSettings = {
  opened: false,
  closed: false,
  pnlSign: false,
  liquidation: false,
  liquidationPercent: 10,
  excludedConnections: [],
};

/** Stored JSON → settings; anything unknown or broken falls back to the defaults. */
export function readPositionAlertSettings(value: unknown): PositionAlertSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return DEFAULT_POSITION_ALERTS;
  const parsed = positionAlertSettingsSchema.safeParse({
    ...DEFAULT_POSITION_ALERTS,
    ...value,
  });
  return parsed.success ? parsed.data : DEFAULT_POSITION_ALERTS;
}

/** True when at least one kind is on: only then does the worker poll this user's positions. */
export function anyPositionAlert(settings: PositionAlertSettings): boolean {
  return settings.opened || settings.closed || settings.pnlSign || settings.liquidation;
}
