-- Additive: closed trades for trading statistics, and how far each connection's history is read.
BEGIN;
ALTER TABLE "ExchangeConnection" ADD COLUMN     "tradesAt" TIMESTAMP(3);
CREATE TABLE "ClosedTrade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "settle" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "size" DECIMAL(38,18),
    "entryPrice" DECIMAL(38,18),
    "exitPrice" DECIMAL(38,18),
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3) NOT NULL,
    "pnl" DECIMAL(38,18) NOT NULL,
    "pnlUsd" DECIMAL(38,18) NOT NULL,
    "exact" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClosedTrade_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClosedTrade_userId_closedAt_idx" ON "ClosedTrade"("userId", "closedAt");
CREATE UNIQUE INDEX "ClosedTrade_connectionId_externalId_key" ON "ClosedTrade"("connectionId", "externalId");
ALTER TABLE "ClosedTrade" ADD CONSTRAINT "ClosedTrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClosedTrade" ADD CONSTRAINT "ClosedTrade_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ExchangeConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;
