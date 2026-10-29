-- Additive: TON wallets. ADD VALUE cannot be used in the same transaction, so it runs on its own.
ALTER TYPE "Network" ADD VALUE IF NOT EXISTS 'TON';
