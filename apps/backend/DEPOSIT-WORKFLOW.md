# Deposit Workflow Guide

## For Admins: How to Process Deposits

### Step 1: Receive deposit notification
Customer sends money via Telebirr and provides proof.

### Step 2: Create pending deposit record
```bash
POST /api/admin/deposits
{
  "tx_number": "DHC8QENUF0",
  "amount": 50.00
}
```

Or use the admin panel at `/admin/deposits`.

### Step 3: Inform player
Tell the player to paste their Telebirr SMS into the bot.

### Step 4: Monitor status
- Check admin panel to see when deposit is claimed
- Status changes from `pending` → `claimed`
- Player information appears once claimed

## For Players: How to Deposit

### Step 1: Start deposit in bot
1. Tap "Deposit 💰" button in Telegram bot
2. Enter amount (minimum 10 ETB)

### Step 2: Get payment instructions
Bot shows:
```
1. ከታቹ ባለው የቴሌብር አካውንት 50 ብር ያስገቡ

   Phone: 0912345678

2. የካፈሉትን አጭር የደሁፍ መልዕክት(message) copy በማድረግ እዚ ላይ Past አድርገው ያስጉና ይላኩት 👇👇👇
```

### Step 3: Send money via Telebirr
Send the amount to the provided phone number using Telebirr app or USSD.

### Step 4: Copy SMS receipt
You'll receive an SMS like:
```
ውድZerabrukወደ Abebe Zewude(0934****72) 50.00 ብር በ 12/08/2026 18:22:26 ልከዋል። 
የሂሳብ እንቅስቃሴ ቁጥርዎ DHC8QENUF0 ነዉ። 
...
```

### Step 5: Paste entire SMS to bot
1. Copy the complete SMS message
2. Paste it into the bot chat
3. Send it

### Step 6: Receive confirmation
If successful:
```
✅ Your deposit of 50 ETB is Approved.

Ref: DHC8QENUF0
```

## Common Issues & Solutions

### ❌ "Transaction number not found"
**Cause**: Admin hasn't created the pending deposit record yet.
**Solution**: Contact support and provide your transaction number.

### ❌ "ደረሰኙ ትክክለኛ አይደለም" (Receipt is not correct)
**Cause**: Money was sent to wrong phone number.
**Solution**: Verify you sent to the correct number shown in instructions.

### ❌ "This transaction has already been used"
**Cause**: Transaction number already claimed.
**Solution**: Contact support with proof of payment.

### ❌ "ደረሰኙን ማግኘት አልተቻለም" (Cannot read receipt)
**Cause**: SMS format not recognized or incomplete.
**Solution**: 
1. Copy the ENTIRE SMS message
2. Make sure you didn't edit it
3. If issue persists, contact support with transaction number

## Supported SMS Formats

### ✅ Amharic (Ethio Telecom)
```
የሂሳብ እንቅስቃሴ ቁጥርዎ DHC8QENUF0 ነዉ።
```

### ✅ English
```
Your transaction number is DHC8QENUF0
```

### ✅ Receipt URL
```
https://transactioninfo.ethiotelecom.et/receipt/DHC8QENUF0
```

All formats are automatically detected!

## Technical Details

### Database Schema
```typescript
model PendingDeposit {
  id         String        @id @default(uuid())
  tx_number  String        @unique
  amount     Decimal
  status     DepositStatus @default(pending) // pending | claimed | cancelled
  player_id  String?
  claimed_at DateTime?
  created_at DateTime
  updated_at DateTime
}
```

### API Endpoints

- `GET /api/admin/deposits` - List all deposits
- `POST /api/admin/deposits` - Create pending deposit
- `POST /api/admin/deposits/:id/cancel` - Cancel deposit

### Bot Commands

- `/start` - Start bot and register
- Tap "Deposit 💰" - Begin deposit flow
- Paste SMS - Process deposit claim
