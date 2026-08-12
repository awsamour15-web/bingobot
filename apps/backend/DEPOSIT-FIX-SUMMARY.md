# Deposit System Fix - Amharic SMS Support

## Problem
The system was not reading and processing Telebirr deposit SMS messages in **Amharic** language. The `parseTelebirrReceipt` function only supported English SMS formats.

## Example Amharic SMS
```
ውድZerabrukወደ Abebe Zewude(0934****72) 50.00 ብር በ 12/08/2026 18:22:26 ልከዋል። 
የሂሳብ እንቅስቃሴ ቁጥርዎ DHC8QENUF0 ነዉ። 
የአገልግሎት ክፍያው 0.87 ብር ፤ የአገልግሎት ክፍያው 15% VAT 0.13 ብር ነዉ። 
አሁን ያለዎት ቀሪ ሂሳብ 43.71 ብር ነው។ 
የክፍያ መረጃዎን ለማግኘት ማስፈንጠርያውን ይጫኑ፡ 
https://transactioninfo.ethiotelecom.et/receipt/DHC8QENUF0
በቴሌብር ስለተገለገሉ እናመሰግናለን ኢትዮ ቴሌኮም
```

## Solution Implemented

### Updated `parseTelebirrReceipt` in `apps/backend/src/bot/index.ts`

Added support for:

1. **Amharic Transaction Number Pattern**
   - Pattern: `የሂሳብ እንቅስቃሴ ቁጥርዎ [TX_NUMBER] ነዉ`
   - Translation: "Your transaction number is [TX_NUMBER]"
   - Regex: `/የሂሳብ\s+እንቅስቃሴ\s+ቁጥርዎ\s+([A-Z0-9]{6,20})\s+ነዉ/i`

2. **Amharic Phone Number Format**
   - Format: `(09xxxxxxxx)` - Ethiopian local format
   - Converts to international format: `2519xxxxxxxx`
   - Handles masked numbers: `(0934****72)` → `251934****72`

3. **Fallback Pattern**
   - Added standalone alphanumeric code matching as last resort
   - Matches any 6-20 character alphanumeric code: `/\b([A-Z0-9]{6,20})\b/`

### Parsing Priority Order

1. **English explicit label**: "Your transaction number is DHC8QENUF0"
2. **Amharic explicit label**: "የሂሳብ እንቅስቃሴ ቁጥርዎ DHC8QENUF0 ነዉ"
3. **Receipt URL**: `/receipt/DHC8QENUF0`
4. **Loose English pattern**: "number is DHC8QENUF0"
5. **Standalone code**: Any `DHC8QENUF0` alphanumeric string

### Phone Number Extraction

- **English format**: `(2519****1234)` or `(+2519****1234)`
- **Amharic format**: `(0934****72)` → converted to `251934****72`

## How It Works Now

### Complete Deposit Flow

1. **Admin creates pending deposit**
   - Admin calls `POST /api/admin/deposits` with transaction number and amount
   - System creates `PendingDeposit` record with status `pending`

2. **Player initiates deposit via bot**
   - Player taps "Deposit 💰" button
   - Bot asks for amount
   - Bot provides Telebirr payment instructions with phone number

3. **Player sends SMS receipt**
   - Player copies Telebirr SMS (Amharic or English)
   - Pastes into bot chat
   - Parser extracts transaction number and receiver phone

4. **System validates and processes**
   - Validates receiver phone matches configured deposit number
   - Finds `PendingDeposit` by transaction number
   - Checks status is `pending` (not `claimed` or `cancelled`)
   - Credits player's wallet
   - Marks deposit as `claimed`
   - Credits agent commission if applicable

## Testing Results

✅ Successfully parsed Amharic SMS:
- **Transaction Number**: DHC8QENUF0
- **Receiver Phone**: 251934****72

## Files Modified

- `apps/backend/src/bot/index.ts` - Updated `parseTelebirrReceipt` function

## Next Steps

To ensure deposits work correctly:

1. **Admin must create pending deposits first**
   - Use admin panel or API: `POST /api/admin/deposits`
   - Provide transaction number and amount
   - This creates the record players can claim

2. **Players can now paste Amharic SMS**
   - Both Amharic and English formats supported
   - Phone validation works with both formats

3. **Monitor deposit processing**
   - Check admin panel for claimed deposits
   - Review bot logs for parsing issues

## Important Notes

- The system requires **admin to pre-create pending deposits** before players can claim them
- This is a manual reconciliation system, not automatic payment gateway integration
- The parser now supports multiple language formats and fallback patterns
- Phone number validation handles both international and local Ethiopian formats
