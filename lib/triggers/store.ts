import { TriggerDirection } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  sendPriceAlert,
  sendPriceTargetAlert,
  TelegramError,
} from "@/lib/services/telegram";
import type { EngineTrigger, Firing } from "./engine";

/** Database side of the VM trigger worker: rules once per window, writes only when something fires. */
export async function loadActiveTriggers(): Promise<EngineTrigger[]> {
  return prisma.priceTrigger.findMany({
    where: { isActive: true, user: { isBlocked: false } },
    select: {
      id: true,
      userId: true,
      tokenId: true,
      tokenSymbol: true,
      tokenName: true,
      triggerType: true,
      threshold: true,
      targetPrice: true,
      direction: true,
      interval: true,
      lastPrice: true,
    },
  });
}

/** Newest price for the alerts page; one small batch per window instead of a write per check. */
export async function persistLatestPrices(
  prices: Map<string, number>,
  now: Date,
): Promise<void> {
  if (!prices.size) return;
  await prisma.$transaction(
    [...prices].map(([id, price]) =>
      prisma.priceTrigger.updateMany({
        where: { id, isActive: true },
        data: { lastPrice: price, lastCheckedAt: now },
      }),
    ),
  );
}

export type Delivery = "sent" | "failed" | "skipped";

/**
 * Sends one alert and records it the same way the Vercel cron did. Recipient settings are read
 * now, not from the cached rules, so a user who just turned notifications off is respected.
 */
export async function deliverFiring(firing: Firing, now: Date): Promise<Delivery> {
  const { trigger, price } = firing;
  const user = await prisma.user.findUnique({
    where: { id: trigger.userId },
    select: { telegramChatId: true, isBlocked: true, telegramNotificationsEnabled: true },
  });
  if (!user?.telegramChatId || user.isBlocked || user.telegramNotificationsEnabled === false) {
    await prisma.priceTrigger.updateMany({
      where: { id: trigger.id },
      data: { lastPrice: price, lastCheckedAt: now },
    });
    return "skipped";
  }

  const isTarget = firing.kind === "target";
  const up = isTarget ? trigger.direction !== TriggerDirection.DOWN && price >= (trigger.targetPrice ?? 0) : false;
  try {
    if (firing.kind === "target")
      await sendPriceTargetAlert(user.telegramChatId, {
        tokenSymbol: trigger.tokenSymbol,
        tokenName: trigger.tokenName,
        targetPrice: trigger.targetPrice ?? price,
        currentPrice: price,
        direction: up ? "UP" : "DOWN",
      });
    else
      await sendPriceAlert(user.telegramChatId, {
        tokenSymbol: trigger.tokenSymbol,
        tokenName: trigger.tokenName,
        deltaPercent: firing.delta,
        price,
        intervalMinutes: trigger.interval,
      });
  } catch (error) {
    await prisma.notificationLog.create({
      data: {
        userId: trigger.userId,
        triggerId: trigger.id,
        tokenSymbol: trigger.tokenSymbol,
        message: error instanceof TelegramError ? error.message : "Помилка надсилання",
        deltaPercent: firing.kind === "percent" ? firing.delta : 0,
        price,
        status: "failed",
      },
    });
    return "failed";
  }

  const message =
    firing.kind === "target"
      ? `Ціль $${trigger.targetPrice} досягнута (${up ? "вище" : "нижче"})`
      : `${firing.delta > 0 ? "+" : ""}${firing.delta.toFixed(2)}% за ${trigger.interval}хв ($${price})`;
  await prisma.$transaction([
    prisma.notificationLog.create({
      data: {
        userId: trigger.userId,
        triggerId: trigger.id,
        tokenSymbol: trigger.tokenSymbol,
        message,
        deltaPercent: firing.kind === "percent" ? firing.delta : 0,
        price,
        status: "sent",
      },
    }),
    // A reached price target is one-shot.
    prisma.priceTrigger.updateMany({
      where: { id: trigger.id },
      data: {
        lastPrice: price,
        lastCheckedAt: now,
        ...(isTarget ? { isActive: false } : {}),
      },
    }),
  ]);
  return "sent";
}
