-- Add 'bonus' value to TxType enum for coupon redemptions
ALTER TYPE "TxType" ADD VALUE IF NOT EXISTS 'bonus';
