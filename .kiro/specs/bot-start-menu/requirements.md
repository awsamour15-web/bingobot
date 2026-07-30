# Requirements Document

## Introduction

This feature adds a persistent main menu to the Beteseb Bingo Telegram bot. When a user sends the `/start` command, the bot responds with a welcome message and a `ReplyKeyboardMarkup` grid of 10 buttons (5 rows × 2 columns) that remain visible in the user's keyboard area throughout the session. Each button serves as a shortcut to a specific bot function or Mini App section.

## Glossary

- **Bot**: The Beteseb Bingo Telegram bot powered by grammY.
- **Main_Menu**: The `ReplyKeyboardMarkup` displayed after `/start` containing the 10 action buttons.
- **Player**: A Telegram user who has interacted with the bot.
- **Mini_App**: The Beteseb Bingo Telegram Web App opened via a `web_app` keyboard button.
- **Reply_Keyboard**: A Telegram `ReplyKeyboardMarkup` that persists in the chat keyboard area until explicitly removed.
- **Deep_Link_Payload**: The optional text parameter appended to `/start` (e.g. `ref_<telegramId>`).

---

## Requirements

### Requirement 1: Display Main Menu on /start

**User Story:** As a Player, I want to see a menu of available actions when I start the bot, so that I can quickly navigate to the feature I need.

#### Acceptance Criteria

1. WHEN a Player sends the `/start` command, THE Bot SHALL reply with the message `"👋 Welcome to Beteseb Bingo! Choose an Option below."`.
2. WHEN a Player sends the `/start` command, THE Bot SHALL attach a `ReplyKeyboardMarkup` containing exactly 10 buttons arranged in 5 rows of 2 buttons each.
3. WHEN the Main_Menu is displayed, THE Bot SHALL set `resize_keyboard` to `true` so the keyboard fits compactly on the screen.
4. WHEN the Main_Menu is displayed, THE Bot SHALL set `one_time_keyboard` to `false` so the keyboard remains visible after a button is pressed.

---

### Requirement 2: Button Layout and Labels

**User Story:** As a Player, I want the menu buttons to be clearly labelled and consistently ordered, so that I always know where to find each action.

#### Acceptance Criteria

1. THE Main_Menu SHALL contain the buttons in the following row order:
   - Row 1: `"Play 🎮"` | `"Register 📝"`
   - Row 2: `"Check Balance 💰"` | `"Deposit 💰"`
   - Row 3: `"Contact Support 📞"` | `"Instruction 📖"`
   - Row 4: `"Transfer 🎁"` | `"Withdraw 🤑"`
   - Row 5: `"Invite 🔗"` | `"Convert Bonus 💲"`
2. WHEN the Main_Menu is rendered, THE Bot SHALL display each button label exactly as specified in criterion 1, including emoji characters.

---

### Requirement 3: Preserve Existing /start Behaviour

**User Story:** As a Player, I want the bot to still register me and handle referral links when I use /start, so that the new menu does not break my account setup.

#### Acceptance Criteria

1. WHEN a Player sends `/start` with a Deep_Link_Payload beginning with `ref_`, THE Bot SHALL resolve the referrer and set `referrer_id` on the new Player record before sending the Main_Menu.
2. WHEN a Player sends `/start` and no Player record exists for their `telegram_id`, THE Bot SHALL create the Player record and both `main` and `play` wallets before sending the Main_Menu.
3. WHEN a Player sends `/start` and a Player record already exists for their `telegram_id`, THE Bot SHALL update the Player's `username` field and send the Main_Menu without creating duplicate records.
4. IF an error occurs during the database transaction in the `/start` handler, THEN THE Bot SHALL send the message `"Something went wrong. Please try again later."` and log the error to the console.

---

### Requirement 4: Menu Button Response Handlers

**User Story:** As a Player, I want each menu button to trigger a relevant response when I tap it, so that the buttons are functional and not silent.

#### Acceptance Criteria

1. WHEN a Player sends the text `"Play 🎮"`, THE Bot SHALL open the Mini_App by replying with a message that includes a `web_app` inline button pointing to `MINI_APP_URL`.
2. WHEN a Player sends the text `"Register 📝"`, THE Bot SHALL reply with a prompt asking the Player to provide their phone number for registration.
3. WHEN a Player sends the text `"Check Balance 💰"`, THE Bot SHALL retrieve the Player's `main` and `play` wallet balances and reply with a formatted balance summary.
4. WHEN a Player sends the text `"Deposit 💰"`, THE Bot SHALL reply with deposit instructions including the accepted payment methods and the steps to complete a deposit.
5. WHEN a Player sends the text `"Contact Support 📞"`, THE Bot SHALL reply with the support contact details configured in the `Config` table under the key `support_contact`.
6. WHEN a Player sends the text `"Instruction 📖"`, THE Bot SHALL reply with a concise how-to-play summary for Beteseb Bingo.
7. WHEN a Player sends the text `"Transfer 🎁"`, THE Bot SHALL reply with instructions for transferring balance to another Player.
8. WHEN a Player sends the text `"Withdraw 🤑"`, THE Bot SHALL reply with withdrawal instructions including the minimum withdrawal amount and the steps to submit a request.
9. WHEN a Player sends the text `"Invite 🔗"`, THE Bot SHALL generate a referral deep-link in the format `https://t.me/<bot_username>?start=ref_<telegram_id>` and reply with it.
10. WHEN a Player sends the text `"Convert Bonus 💲"`, THE Bot SHALL reply with instructions for converting bonus balance to the Player's main wallet.
11. IF a Player who is not registered sends any menu button text other than `"Register 📝"` or `"Play 🎮"`, THEN THE Bot SHALL reply with a message prompting the Player to complete registration first.
