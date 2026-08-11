// Quick test of withdrawal functionality
import { WalletService } from './dist/services/wallet.service.js';
import { TxType, WalletType } from '@prisma/client';

console.log('WalletService:', !!WalletService);
console.log('WalletService.debit:', typeof WalletService?.debit);
console.log('TxType.withdrawal:', TxType.withdrawal);
console.log('WalletType.main:', WalletType.main);

// Test the basic structure
if (WalletService && WalletService.debit) {
  console.log('✅ WalletService.debit is available');
} else {
  console.log('❌ WalletService.debit is NOT available');
}