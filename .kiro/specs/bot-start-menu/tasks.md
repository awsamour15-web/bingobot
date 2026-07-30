# Tasks: bot-start-menu

## Task List

- [x] 1. Build the main menu keyboard helper
  - [x] 1.1 Add `buildMainMenu()` pure helper in `apps/backend/src/bot/index.ts` that returns a grammY `Keyboard` with all 10 buttons in the correct 5×2 layout, with `resizeKeyboard()` and `persistent()` (one_time_keyboard = false)
  - [x] 1.2 Write example unit test verifying button count (10), row structure (5 rows × 2 cols), keyboard flags, and exact label strings including emojis

- [x] 2. Update the /start handler to send the ReplyKeyboardMarkup
  - [x] 2.1 Replace the existing `InlineKeyboard` reply in the `/start` handler with `buildMainMenu()` and update the welcome message text to `"👋 Welcome to Beteseb Bingo! Choose an Option below."`
  - [x] 2.2 Preserve all existing upsert/wallet-creation/referral logic unchanged

- [x] 3. Add the registration guard helper
  - [x] 3.1 Implement `isRegistered(telegramId: bigint): Promise<boolean>` that returns true when a player with `phone_verified = true` exists for that `telegram_id`
  - [x] 3.2 Write property test (Property 7) verifying that `isGuardedButton(text)` returns false for "Register 📝" and "Play 🎮" and true for all other menu button texts

- [x] 4. Implement dynamic button handlers
  - [x] 4.1 Add `bot.hears("Play 🎮", ...)` — reply with `InlineKeyboard.webApp("Open Beteseb Bingo", MINI_APP_URL)`; write example test verifying the reply contains the correct URL
  - [x] 4.2 Add `bot.hears("Register 📝", ...)` — reply with phone-number prompt; write example test
  - [x] 4.3 Add `bot.hears("Check Balance 💰", ...)` — guard with `isRegistered`, query both wallets by player's telegram_id, format and reply; write property test (Property 5)
  - [x] 4.4 Add `bot.hears("Contact Support 📞", ...)` — guard with `isRegistered`, read `support_contact` from Config, reply with value or fallback message; write property test (Property 6) and example test for missing config key

- [x] 5. Implement static button handlers
  - [x] 5.1 Add `bot.hears("Deposit 💰", ...)` — guard + static instructions reply
  - [x] 5.2 Add `bot.hears("Instruction 📖", ...)` — guard + static how-to-play reply
  - [x] 5.3 Add `bot.hears("Transfer 🎁", ...)` — guard + static transfer instructions reply
  - [x] 5.4 Add `bot.hears("Withdraw 🤑", ...)` — guard + static withdrawal instructions reply
  - [x] 5.5 Add `bot.hears("Convert Bonus 💲", ...)` — guard + static bonus conversion instructions reply
  - [x] 5.6 Write example tests for each static handler confirming non-empty reply and expected keywords

- [x] 6. Implement Invite handler
  - [x] 6.1 Add `bot.hears("Invite 🔗", ...)` — guard with `isRegistered`, build link as `https://t.me/${bot.botInfo.username}?start=ref_${ctx.from.id}` and reply
  - [x] 6.2 Write property test (Property 1) for `buildInviteLink(botUsername, telegramId)` covering format correctness for arbitrary bigint telegram IDs and bot usernames

- [x] 7. Write remaining property-based tests
  - [x] 7.1 Property 2: new player creation completeness — in-memory simulation verifying exactly 1 player + 2 wallets created
  - [x] 7.2 Property 3: idempotent upsert — in-memory simulation verifying no duplicate player records on repeated /start
  - [x] 7.3 Property 4: referrer attribution — in-memory simulation verifying referrer_id is set correctly for valid ref_ payloads and null for unknown referrers
