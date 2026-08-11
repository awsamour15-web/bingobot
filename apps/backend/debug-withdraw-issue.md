# Withdrawal Issue Debugging Guide

Based on my analysis of the codebase, the withdrawal functionality appears to be correctly implemented. Here are the most likely causes and solutions:

## Most Common Issues & Solutions

### 1. **Session Interference**
**Problem**: Users have stale deposit/withdrawal sessions that block new interactions.

**Solution**: Clear user sessions by restarting the bot or implementing session cleanup.

### 2. **Registration Status**
**Problem**: Users aren't properly registered or registration check is failing.

**Quick Test**: 
- Have user tap "Register 📝" first
- Then try "Check Balance 💰" to verify registration
- Finally try "Withdraw 🤑"

### 3. **Insufficient Balance**
**Problem**: Users don't have minimum 100 ETB in main wallet.

**Check**: The bot should show current balance when withdraw is attempted. Main wallet (not play wallet) needs ≥100 ETB.

### 4. **Button Text Mismatch**
**Problem**: The exact button text "Withdraw 🤑" must match.

**Solution**: Ensure users tap the actual button, not typing the text manually.

### 5. **Bot Not Responding**
**Problem**: Bot instance might not be running or receiving updates.

**Check Bot Status**:
```bash
# Check if bot is running in logs
curl https://api.telegram.org/bot<BOT_TOKEN>/getMe

# Check recent updates
curl https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
```

## Working Flow (Expected Behavior)

1. User taps "Withdraw 🤑" 
2. Bot checks registration → shows balance check if insufficient
3. Bot prompts: "💰 ማውጣት የሚፈልጉትን መጠን ያስጊቡ።"
4. User enters amount ≥100
5. Bot validates balance and prompts for phone
6. User enters phone number
7. Bot calls `WalletService.debit()` and confirms request

## Debug Steps

1. **Test Registration**: Have user tap "Register 📝" and "Check Balance 💰"
2. **Test Menu Response**: Have user tap other buttons like "Play 🎮"  
3. **Clear Sessions**: Restart bot server if possible
4. **Check Logs**: Look for any error messages in bot console
5. **Verify Balance**: Ensure user has sufficient main wallet balance

## Code Verification ✅

- ✅ Withdraw handler registered: `bot.hears('Withdraw 🤑', handleWithdrawStart)`
- ✅ Function defined: `handleWithdrawStart()` exists
- ✅ Session management: `withdrawSessions` Map is implemented  
- ✅ WalletService available: `WalletService.debit()` is accessible
- ✅ Database schema: Transaction and Wallet models support withdrawals
- ✅ Admin approval: Admin panel has withdrawal approval system

## Immediate Action

The most likely fix is **session cleanup**. Try having users:
1. Send any menu button (like "Play 🎮") to clear stale sessions
2. Then tap "Withdraw 🤑" again

If that doesn't work, the issue is likely insufficient balance or registration status.