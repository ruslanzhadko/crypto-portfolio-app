-- CreateTable
CREATE TABLE "ExchangeConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "credentials" TEXT,
    "keyMask" TEXT,
    "keyFingerprint" TEXT,
    "credentialVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "externalAccountId" TEXT,
    "walletId" TEXT,
    "hyperCoreMigratedAt" TIMESTAMP(3),
    "balancesAt" TIMESTAMP(3),
    "positionsAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeAccount" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "equityUsd" DECIMAL(38,18),
    "availableUsd" DECIMAL(38,18),
    "unrealizedPnlUsd" DECIMAL(38,18),
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "balancesAt" TIMESTAMP(3),
    "positionsAt" TIMESTAMP(3),

    CONSTRAINT "ExchangeAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeBalance" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "total" DECIMAL(38,18) NOT NULL,
    "free" DECIMAL(38,18),
    "locked" DECIMAL(38,18),
    "debt" DECIMAL(38,18),
    "usdValue" DECIMAL(38,18),
    "priceUsd" DECIMAL(38,18),

    CONSTRAINT "ExchangeBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangePosition" (
    "funding" JSONB,
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "positionKey" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "settle" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "contracts" DECIMAL(38,18) NOT NULL,
    "contractSize" DECIMAL(38,18) NOT NULL,
    "baseSize" DECIMAL(38,18) NOT NULL,
    "notionalUsd" DECIMAL(38,18),
    "entryPrice" DECIMAL(38,18),
    "markPrice" DECIMAL(38,18),
    "liquidationPrice" DECIMAL(38,18),
    "leverage" DECIMAL(38,18),
    "marginMode" TEXT,
    "margin" DECIMAL(38,18),
    "unrealizedPnl" DECIMAL(38,18),
    "unrealizedPnlUsd" DECIMAL(38,18),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangePosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeSyncJob" (
    "connectionId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "forceBalances" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExchangeSyncJob_pkey" PRIMARY KEY ("connectionId")
);

-- CreateTable
CREATE TABLE "ExchangeSyncRun" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeWorkerLease" (
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeWorkerLease_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "PortfolioCapitalSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "totalUsd" DECIMAL(38,18) NOT NULL,
    "walletsUsd" DECIMAL(38,18) NOT NULL,
    "exchangesUsd" DECIMAL(38,18) NOT NULL,
    "sourceSet" TEXT NOT NULL,
    "complete" BOOLEAN NOT NULL,
    "sources" JSONB NOT NULL,

    CONSTRAINT "PortfolioCapitalSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeConnection_walletId_exchange_key" ON "ExchangeConnection"("walletId", "exchange");

-- CreateIndex
CREATE INDEX "ExchangeConnection_userId_status_idx" ON "ExchangeConnection"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeConnection_userId_exchange_keyFingerprint_key" ON "ExchangeConnection"("userId", "exchange", "keyFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeConnection_userId_exchange_externalAccountId_key" ON "ExchangeConnection"("userId", "exchange", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeAccount_connectionId_accountKey_key" ON "ExchangeAccount"("connectionId", "accountKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeBalance_accountId_assetId_key" ON "ExchangeBalance"("accountId", "assetId");

-- CreateIndex
CREATE INDEX "ExchangePosition_base_side_idx" ON "ExchangePosition"("base", "side");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangePosition_accountId_positionKey_key" ON "ExchangePosition"("accountId", "positionKey");

-- CreateIndex
CREATE INDEX "ExchangeSyncJob_dueAt_leaseUntil_idx" ON "ExchangeSyncJob"("dueAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "ExchangeSyncRun_connectionId_createdAt_idx" ON "ExchangeSyncRun"("connectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioCapitalSnapshot_userId_bucket_key" ON "PortfolioCapitalSnapshot"("userId", "bucket");

-- CreateIndex
CREATE INDEX "CapitalEvent_userId_createdAt_idx" ON "CapitalEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExchangeConnection" ADD CONSTRAINT "ExchangeConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeConnection" ADD CONSTRAINT "ExchangeConnection_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeAccount" ADD CONSTRAINT "ExchangeAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ExchangeConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeBalance" ADD CONSTRAINT "ExchangeBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ExchangeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangePosition" ADD CONSTRAINT "ExchangePosition_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ExchangeAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeSyncJob" ADD CONSTRAINT "ExchangeSyncJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ExchangeConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeSyncRun" ADD CONSTRAINT "ExchangeSyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ExchangeConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioCapitalSnapshot" ADD CONSTRAINT "PortfolioCapitalSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalEvent" ADD CONSTRAINT "CapitalEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
