# Admin Panel - Visual Guide

## Your Admin Panel Already Has Everything! ✅

Navigate to: `https://your-admin-url.com/promotions`

---

## 🎨 What You'll See

### Top Section: Statistics
```
┌─────────────────────────────────────────────────────┐
│  Total: 10    Active: 5    Delivered: 1,247        │
│  Targets: 2                                         │
└─────────────────────────────────────────────────────┘
```

### Broadcast Targets Section
```
┌─────────────────────────────────────────────────────┐
│  Broadcast Targets                   [+ Add Target] │
├─────────────────────────────────────────────────────┤
│  🤖 All Users     [on]  ⏸ ✕                        │
│  📢 Main Channel  [on]  ⏸ ✕  @YourChannel         │
└─────────────────────────────────────────────────────┘
```

### Promotions List
```
┌─────────────────────────────────────────────────────┐
│  Promotions                        [+ New Promotion]│
├──────────┬──────┬────────┬─────────┬───────────────┤
│ Title    │ Type │ Status │ Created │ Actions       │
├──────────┼──────┼────────┼─────────┼───────────────┤
│ Weekend  │ image│ active │ Aug 18  │ [Edit]        │
│ Bonus    │      │        │         │ [Disable]     │
│ 🎁 50 ETB│      │        │         │ [🚀 Send Now] │
│          │      │        │         │ [Copy]        │
│          │      │        │         │ [↺ Retry]     │
│          │      │        │         │ [▼ Schedule]  │
│          │      │        │         │ [▼ Bonus]     │
└──────────┴──────┴────────┴─────────┴───────────────┘
```

### Delivery Logs
```
┌─────────────────────────────────────────────────────┐
│  Delivery Logs            [All Promotions ▼]   [↻] │
├───────────┬─────────────┬────────┬────────────────┤
│ Promotion │ Destination │ Status │ Sent At        │
├───────────┼─────────────┼────────┼────────────────┤
│ Weekend   │ 🤖 All Users│ sent   │ Aug 18, 10:30  │
│ Weekend   │ @User123    │ sent   │ Aug 18, 10:30  │
│ Weekend   │ @User456    │ failed │ Aug 18, 10:30  │
└───────────┴─────────────┴────────┴────────────────┘
```

---

## 📝 Create Promotion Form

When you click **"+ New Promotion"**, you see:

```
┌─────────────────────────────────────────────────────┐
│  New Promotion                                      │
├─────────────────────────────────────────────────────┤
│  Title: [Weekend Bonus August 2026          ]      │
│  Type:  [Image ▼]                                  │
│                                                     │
│  Telegram File ID:                                  │
│  [AgACAgIAAxkBAAICrl234example...          ]      │
│  💡 Send file to bot first to get its file_id      │
│                                                     │
│  Caption: (max 1024 chars)                          │
│  ┌──────────────────────────────────────────┐      │
│  │ 🎉 WEEKEND BONUS!                        │      │
│  │                                          │      │
│  │ 💰 Deposit 100 → Get 150 ETB             │      │
│  │ 💰 Deposit 200 → Get 300 ETB             │      │
│  │                                          │      │
│  │ ⏰ Valid until Sunday!                   │      │
│  │                                          │      │
│  │ 👉 Tap Deposit 💰 now!                   │      │
│  └──────────────────────────────────────────┘      │
│                                                     │
│  ──────────────────────────────────────────────    │
│                                                     │
│  ☑ 🎁 Attach Bonus to this Promotion               │
│                                                     │
│  ┌─────────────────────────────────────────┐       │
│  │ Bonus Amount (ETB): [50]                │       │
│  │ Wallet:            [Play Wallet ▼]      │       │
│  │                                         │       │
│  │ Eligibility Criteria:                   │       │
│  │ Min Balance:       [   ] ETB            │       │
│  │ Max Balance:       [   ] ETB            │       │
│  │ Min Deposits:      [100] ETB            │       │
│  │ Account Age:       [7  ] days           │       │
│  │ ☑ Must have played at least one round   │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│                     [Cancel] [Create Promotion]    │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 Send Now Modal

When you click **"🚀 Send Now"**:

```
┌─────────────────────────────────────────────────────┐
│  Send — Weekend Bonus                          [×]  │
├─────────────────────────────────────────────────────┤
│  SELECT DESTINATIONS                                │
│                                                     │
│  ┌────────────┐  ┌────────────┐                   │
│  │ 🤖 All Users│  │ 📢 Main Ch │                   │
│  │  Selected  │  │            │                   │
│  └────────────┘  └────────────┘                   │
│                                                     │
│  ────────────────────────────────────────────────  │
│                                                     │
│  MESSAGE PREVIEW                                    │
│  ┌─────────────────────────────────────────┐       │
│  │ 📎 IMAGE — 🎉 WEEKEND BONUS!            │       │
│  │                                         │       │
│  │ 💰 Deposit 100 → Get 150 ETB...         │       │
│  └─────────────────────────────────────────┘       │
│                                                     │
│                    [Cancel] [🚀 Send to 1 target]  │
└─────────────────────────────────────────────────────┘
```

After sending:

```
┌─────────────────────────────────────────────────────┐
│  Send — Weekend Bonus                          [×]  │
├─────────────────────────────────────────────────────┤
│                    ✅                                │
│                                                     │
│                1,247 sent                           │
│                                                     │
│                                                     │
│                    [Done]                           │
└─────────────────────────────────────────────────────┘
```

---

## 🗓️ Schedule Section

When you click **"▼ Schedule"**:

```
┌─────────────────────────────────────────────────────┐
│  SCHEDULES                                          │
├──────────┬──────┬──────────┬────────┬──────────────┤
│ Targets  │ Freq │ Next Run │ Status │              │
├──────────┼──────┼──────────┼────────┼──────────────┤
│ @Channel │ daily│ Aug 19   │ active │ [Cancel]     │
│          │      │ 10:00 AM │        │              │
└──────────┴──────┴──────────┴────────┴──────────────┘
│                                                     │
│  Select targets for this schedule:                  │
│  ┌──────────┐ ┌──────────┐                         │
│  │🤖 All    │ │📢 Channel│                         │
│  └──────────┘ └──────────┘                         │
│                                                     │
│  Frequency: [Daily ▼]                               │
│  Send At:   [2026-08-20 10:00]                      │
│                                                     │
│                           [Add Schedule]            │
└─────────────────────────────────────────────────────┘
```

---

## 🎁 Bonus Section

When you click **"▼ Bonus"**:

```
┌─────────────────────────────────────────────────────┐
│  BONUS DISTRIBUTION             [Preview] [History] │
│  50 ETB  play wallet  Deposits ≥ 100 ETB  7d old   │
├─────────────────────────────────────────────────────┤
│  1,234 players are eligible                         │
│                                                     │
│  ┌─────────────┬──────────────┐                    │
│  │ Player      │ Telegram ID  │                    │
│  ├─────────────┼──────────────┤                    │
│  │ @user123    │ 123456789    │                    │
│  │ @user456    │ 987654321    │                    │
│  │ ...         │ ...          │                    │
│  └─────────────┴──────────────┘                    │
│                                                     │
│  [↻ Refresh] [🎁 Apply to 1,234 players]           │
└─────────────────────────────────────────────────────┘
```

---

## 🎯 Add Broadcast Target Form

When you click **"+ Add Target"**:

```
┌─────────────────────────────────────────────────────┐
│  Name:       [Main Channel              ]          │
│  Type:       [📢 Channel / Group ▼]                │
│  Channel ID: [-1001234567890            ]          │
│                                 [Save]              │
└─────────────────────────────────────────────────────┘
```

Or for bot broadcast:

```
┌─────────────────────────────────────────────────────┐
│  Name: [All Users                   ]              │
│  Type: [🤖 Bot — All Users ▼]                      │
│                                 [Save]              │
└─────────────────────────────────────────────────────┘
```

---

## 💡 Field Hints

Throughout the interface, you'll see helpful hints:

| Field | Hint |
|-------|------|
| File ID | "Send the file to the bot first to get its file_id" |
| Caption | "565/1024" (character counter) |
| Min Balance | "Total wallet balance ≥" |
| Channel ID | "e.g. -1001234567890" |
| Account Age | "Registered ≥ X days ago" |

---

## 🎨 Color Codes

The interface uses badges with colors:

- **Green (Active)**: Promotion is enabled
- **Gray (Inactive)**: Promotion is disabled
- **Blue**: Content type (image/text/video/gif)
- **Yellow**: Bonus attached
- **Red (Failed)**: Delivery failed
- **Green (Sent)**: Successfully delivered

---

## 📱 Mobile Responsive

The admin panel works on:
- Desktop (best experience)
- Tablet (optimized)
- Mobile (functional, better on desktop)

---

## ⌨️ Keyboard Shortcuts

None needed! Everything is point-and-click.

---

## 🔔 Real-time Updates

- Delivery logs update automatically
- Stats refresh after each send
- No page reload needed

---

## 🎓 Pro Tips

1. **Test Before Broadcasting**
   - Create a test channel
   - Add as broadcast target
   - Send there first

2. **Preview is Your Friend**
   - Always check the preview before sending
   - Verify emoji and formatting

3. **Monitor Logs**
   - Check delivery logs after sending
   - Retry failed deliveries if needed

4. **Use Schedules**
   - Schedule promotions during peak hours
   - Set daily reminders for active campaigns

5. **Segment with Bonuses**
   - Target specific player groups
   - Different bonuses for different criteria

---

**Your admin panel is fully functional and ready to use!** 

Just add your admin Telegram ID to the bot code and start sending promotions. 🎉
