-- Additive: how far back each exchange account's transfer history has been read.
ALTER TABLE "ExchangeConnection" ADD COLUMN "transfersFrom" TIMESTAMP(3);
