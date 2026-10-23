-- CreateTable
CREATE TABLE "TokenHoldingSeries" (
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "result" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenHoldingSeries_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "TokenPriceSeries" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenPriceSeries_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TokenHoldingSeries" ADD CONSTRAINT "TokenHoldingSeries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

