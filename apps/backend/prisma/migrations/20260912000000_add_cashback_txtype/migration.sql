-- Add cashback value to TxType enum
ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'cashback';
