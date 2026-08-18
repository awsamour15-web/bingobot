# Promotion Images Quick Start ⚡

## 3-Minute Setup

### 1️⃣ Add Your Admin ID
Edit `apps/backend/src/bot/index.ts`, find line ~667:

```typescript
const ADMIN_IDS = [
  123456789, // Replace with YOUR Telegram user ID
];
```

**Get your ID:**
- Message `@userinfobot` on Telegram
- Or message `@getidsbot`
- Copy your user ID number

### 2️⃣ Get File ID
1. Send your promotional image to your bot
2. Bot replies with file_id
3. Copy the file_id

### 3️⃣ Create Promotion in Admin Panel
1. Go to admin panel → **Promotions**
2. Click **"+ New Promotion"**
3. Fill:
   - Title: Weekend Bonus
   - Type: **Image**
   - File ID: `Paste file_id here`
   - Caption: Your promotional text
4. Click **Create**

### 4️⃣ Setup Broadcast Target (One-time)
1. In **Broadcast Targets** section
2. Click **"+ Add Target"**
3. Fill:
   - Name: All Users
   - Type: **Bot — All Users**
4. Click **Save**

### 5️⃣ Send
1. Find your promotion in list
2. Ensure status is **Active**
3. Click **"🚀 Send Now"**
4. Select "All Users"
5. Click **Send**

Done! ✅

**All users receive your promotional message with an inline "🎮 Play Now" button that links to your bot!**

## Example Caption

```
🎉 WEEKEND BONUS!

💰 Deposit 100 → Get 150 ETB
💰 Deposit 200 → Get 300 ETB
💰 Deposit 500 → Get 750 ETB

⏰ Valid until Sunday 11:59 PM

👉 Tap "Deposit 💰" to claim!
```

## Files You Created

- ✅ File ID helper added to bot
- ✅ Admin panel already configured
- ✅ API endpoints ready

## Need More Details?

See `ADMIN-PANEL-PROMOTION-GUIDE.md` for complete instructions.

---

**You're ready to send promotional images!** 🚀
