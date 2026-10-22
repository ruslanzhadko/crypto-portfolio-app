-- AlterTable
ALTER TABLE "ExchangeConnection" ADD COLUMN     "transfersAt" TIMESTAMP(3),
ADD COLUMN     "transfersError" TEXT;

-- CreateTable
CREATE TABLE "ExchangeTransfer" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "network" TEXT,
    "amount" DECIMAL(38,18) NOT NULL,
    "fee" DECIMAL(38,18),
    "address" TEXT,
    "txHash" TEXT,
    "status" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeTransfer_connectionId_occurredAt_idx" ON "ExchangeTransfer"("connectionId", "occurredAt");

-- CreateIndex
CREATE INDEX "ExchangeTransfer_txHash_idx" ON "ExchangeTransfer"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeTransfer_connectionId_direction_externalId_key" ON "ExchangeTransfer"("connectionId", "direction", "externalId");

-- AddForeignKey
ALTER TABLE "ExchangeTransfer" ADD CONSTRAINT "ExchangeTransfer_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ExchangeConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

