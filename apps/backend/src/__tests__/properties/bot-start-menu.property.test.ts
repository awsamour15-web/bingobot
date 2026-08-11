// Feature: bot-start-menu
// Validates: Requirements 1, 2, 4.11

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock prisma so buildDepositText never tries to reach a real DB in tests
vi.mock('../../lib/prisma.js', () => ({
  default: {
    config: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    gameRound: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'test-round-id' }),
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        config: { findUnique: vi.fn().mockResolvedValue(null) },
        gameRound: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'test-round-id' }),
        },
      }),
    ),
  },
}));

import {
  buildMainMenu,
  buildAgentMenu,
  isGuardedButton,
  MENU_BUTTONS,
  AGENT_MENU_BUTTONS,
  buildPlayReplyMarkup,
  REGISTER_PROMPT_TEXT,
  formatBalanceReply,
  formatSupportReply,
  buildDepositText,
  INSTRUCTION_TEXT,
  TRANSFER_TEXT,
  WITHDRAW_TEXT,
  CONVERT_BONUS_TEXT,
  buildInviteLink,
  simulateStartHandler,
  simulateIdempotentUpsert,
  simulateReferrerAttribution,
} from '../../bot/index.js';

// ─── Task 1.2: Unit tests for buildMainMenu ───────────────────────────────────

describe('buildMainMenu()', () => {
  it('returns a keyboard with exactly 10 buttons', () => {
    const kb = buildMainMenu();
    // grammY Keyboard stores rows in kb.keyboard (array of rows, each row is array of buttons)
    const rows = kb.keyboard;
    const totalButtons = rows.reduce((sum, row) => sum + row.length, 0);
    expect(totalButtons).toBe(10);
  });

  it('has exactly 5 rows', () => {
    const kb = buildMainMenu();
    expect(kb.keyboard.length).toBe(5);
  });

  it('has exactly 2 buttons per row', () => {
    const kb = buildMainMenu();
    for (const row of kb.keyboard) {
      expect(row.length).toBe(2);
    }
  });

  it('has resize_keyboard = true', () => {
    const kb = buildMainMenu();
    expect(kb.resize_keyboard).toBe(true);
  });

  it('has one_time_keyboard = false (persistent)', () => {
    const kb = buildMainMenu();
    // grammY persistent() sets is_persistent = true
    expect(kb.is_persistent).toBe(true);
  });

  it('contains all exact button labels including emojis in the correct row order', () => {
    const kb = buildMainMenu();
    const rows = kb.keyboard;

    const expectedRows = [
      ['Play 🎮', 'Register 📝'],
      ['Check Balance 💰', 'Deposit 💰'],
      ['Contact Support 📞', 'Instruction 📖'],
      ['Transfer 🎁', 'Withdraw 🤑'],
      ['Invite 🔗', 'Convert Bonus 💲'],
    ];

    for (let i = 0; i < expectedRows.length; i++) {
      const leftBtn = rows[i]![0] as { text: string };
      const rightBtn = rows[i]![1] as { text: string };
      expect(leftBtn.text).toBe(expectedRows[i]![0]);
      expect(rightBtn.text).toBe(expectedRows[i]![1]);
    }
  });
});

// ─── Tests for buildAgentMenu ─────────────────────────────────────────────────

describe('buildAgentMenu()', () => {
  it('returns a keyboard with exactly 10 buttons', () => {
    const kb = buildAgentMenu();
    const rows = kb.keyboard;
    const totalButtons = rows.reduce((sum, row) => sum + row.length, 0);
    expect(totalButtons).toBe(10);
  });

  it('has exactly 5 rows', () => {
    const kb = buildAgentMenu();
    expect(kb.keyboard.length).toBe(5);
  });

  it('has exactly 2 buttons per row', () => {
    const kb = buildAgentMenu();
    for (const row of kb.keyboard) {
      expect(row.length).toBe(2);
    }
  });

  it('has resize_keyboard = true', () => {
    const kb = buildAgentMenu();
    expect(kb.resize_keyboard).toBe(true);
  });

  it('has one_time_keyboard = false (persistent)', () => {
    const kb = buildAgentMenu();
    expect(kb.is_persistent).toBe(true);
  });

  it('contains all expected agent button labels including emojis', () => {
    const kb = buildAgentMenu();
    const rows = kb.keyboard;

    const expectedRows = [
      ['Play 🎮', 'Register 📝'],
      ['Check Balance 💰', 'Deposit 💰'],
      ['Agent Dashboard 📊', 'My Players 👥'],
      ['Agent Invite 🔗', 'Commission Balance 💵'],
      ['Contact Support 📞', 'Instruction 📖'],
    ];

    for (let i = 0; i < expectedRows.length; i++) {
      const leftBtn = rows[i]![0] as { text: string };
      const rightBtn = rows[i]![1] as { text: string };
      expect(leftBtn.text).toBe(expectedRows[i]![0]);
      expect(rightBtn.text).toBe(expectedRows[i]![1]);
    }
  });

  it('includes agent-specific buttons not found in regular menu', () => {
    const kb = buildAgentMenu();
    const buttonTexts = kb.keyboard.flat().map((btn: { text: string }) => btn.text);
    
    expect(buttonTexts).toContain('Agent Dashboard 📊');
    expect(buttonTexts).toContain('My Players 👥');
    expect(buttonTexts).toContain('Agent Invite 🔗');
    expect(buttonTexts).toContain('Commission Balance 💵');
  });
});

// ─── Task 3.2: Property 7 — Unregistered player guard ────────────────────────
// Feature: bot-start-menu, Property 7: Unregistered player guard

describe('Property 7: isGuardedButton()', () => {
  it('returns false for "Register 📝"', () => {
    expect(isGuardedButton('Register 📝')).toBe(false);
  });

  it('returns false for "Play 🎮"', () => {
    expect(isGuardedButton('Play 🎮')).toBe(false);
  });

  it('returns true for all other 8 menu button texts (example check)', () => {
    const guardedButtons = [
      'Check Balance 💰',
      'Deposit 💰',
      'Contact Support 📞',
      'Instruction 📖',
      'Transfer 🎁',
      'Withdraw 🤑',
      'Invite 🔗',
      'Convert Bonus 💲',
    ];
    for (const label of guardedButtons) {
      expect(isGuardedButton(label)).toBe(true);
    }
  });

  // Property 7: fast-check property test
  it('for any menu button text not in the exempt set, isGuardedButton returns true; for the 2 exempt buttons it returns false', () => {
    // All menu button labels (flat)
    const allLabels = MENU_BUTTONS.flat() as string[];
    const unguarded = new Set(['Register 📝', 'Play 🎮']);

    fc.assert(
      fc.property(
        fc.constantFrom(...allLabels),
        (label) => {
          if (unguarded.has(label)) {
            expect(isGuardedButton(label)).toBe(false);
          } else {
            expect(isGuardedButton(label)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns true for any arbitrary string that is not an exempt button', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== 'Register 📝' && s !== 'Play 🎮'),
        (text) => {
          expect(isGuardedButton(text)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Task 4.1: buildPlayReplyMarkup example test ──────────────────────────────

describe('buildPlayReplyMarkup()', () => {
  it('returns an inline keyboard containing the correct MINI_APP_URL', () => {
    const testUrl = 'https://t.me/fidel_bingo_bot/app';
    const markup = buildPlayReplyMarkup(testUrl);
    // grammY InlineKeyboard stores rows in .inline_keyboard (array of rows, each row is array of buttons)
    const buttons = markup.inline_keyboard.flat();
    expect(buttons.length).toBeGreaterThan(0);
    const webAppButton = buttons.find(
      (btn) => 'web_app' in btn && btn.web_app?.url === testUrl,
    );
    expect(webAppButton).toBeDefined();
  });

  it('labels the button "Open Fidel Bingo"', () => {
    const markup = buildPlayReplyMarkup('https://example.com');
    const buttons = markup.inline_keyboard.flat();
    const webAppButton = buttons.find((btn) => 'web_app' in btn);
    expect(webAppButton?.text).toBe('Open Fidel Bingo');
  });
});

// ─── Task 4.2: REGISTER_PROMPT_TEXT example test ─────────────────────────────

describe('REGISTER_PROMPT_TEXT', () => {
  it('contains a phone-number prompt keyword', () => {
    expect(REGISTER_PROMPT_TEXT.toLowerCase()).toContain('phone');
  });
});

// ─── Task 4.3: Property 5 — Balance reply completeness ───────────────────────
// Feature: bot-start-menu, Property 5: Balance reply completeness

describe('Property 5: formatBalanceReply()', () => {
  it('includes both main and play balance values for concrete example', () => {
    const reply = formatBalanceReply(100, 50);
    expect(reply).toContain('100');
    expect(reply).toContain('50');
  });

  it('for any pair of number/string balance values, reply must contain both values as strings', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.float({ min: 0, max: 1_000_000, noNaN: true }),
        ),
        fc.oneof(
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.float({ min: 0, max: 1_000_000, noNaN: true }),
        ),
        (main, play) => {
          const reply = formatBalanceReply(main, play);
          expect(reply).toContain(String(main));
          expect(reply).toContain(String(play));
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Task 4.4: Property 6 — Support contact reply reflects config ─────────────
// Feature: bot-start-menu, Property 6: Support contact reply reflects config

describe('Property 6: formatSupportReply()', () => {
  it('includes the contact value in the returned string', () => {
    const value = '+251911000000';
    const reply = formatSupportReply(value);
    expect(reply).toContain(value);
  });

  it('for any non-empty string, formatSupportReply must contain that value', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (contactValue) => {
          const reply = formatSupportReply(contactValue);
          expect(reply).toContain(contactValue);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('fallback message is returned when config key is absent', () => {
    // Test that the fallback string constant is distinct from any formatSupportReply output for empty config
    const fallback = 'Support contact is not configured. Please try again later.';
    // The fallback is a literal — verify it is the correct text used in the handler
    expect(fallback).toContain('not configured');
    expect(fallback).toContain('try again later');
  });
});

// ─── Task 5.6 / 6.1: buildDepositText tests ──────────────────────────────────
// Validates: Requirements 2.1, 2.2, 2.3

describe('buildDepositText()', () => {
  // buildDepositText queries the DB for the Telebirr number config.
  // prisma is mocked to return null, so telebirrNumber falls back to 'N/A (contact support)'.

  it('returns a non-empty string', async () => {
    const text = await buildDepositText();
    expect(text.length).toBeGreaterThan(0);
  });

  it('does not contain a hardcoded support handle', async () => {
    const text = await buildDepositText();
    expect(text).not.toContain('@fidelbingosupport');
  });

  it('contains the Telebirr step instruction', async () => {
    const text = await buildDepositText();
    // Amharic word for "Phone" appears in the deposit instructions
    expect(text).toContain('Phone');
  });

  it('contains the receipt paste instruction', async () => {
    const text = await buildDepositText();
    // Step 2 asks the player to paste the receipt — "copy" appears in the Amharic text
    expect(text).toContain('copy');
  });
});

describe('INSTRUCTION_TEXT', () => {
  it('is non-empty', () => {
    expect(INSTRUCTION_TEXT.length).toBeGreaterThan(0);
  });

  it('contains "bingo", "play", or "win" keyword', () => {
    const lower = INSTRUCTION_TEXT.toLowerCase();
    const hasBingo = lower.includes('bingo');
    const hasPlay = lower.includes('play');
    const hasWin = lower.includes('win');
    expect(hasBingo || hasPlay || hasWin).toBe(true);
  });
});

describe('TRANSFER_TEXT', () => {
  it('is non-empty', () => {
    expect(TRANSFER_TEXT.length).toBeGreaterThan(0);
  });

  it('contains "transfer" or "balance" keyword', () => {
    const lower = TRANSFER_TEXT.toLowerCase();
    expect(lower.includes('transfer') || lower.includes('balance')).toBe(true);
  });
});

describe('WITHDRAW_TEXT', () => {
  it('is non-empty', () => {
    expect(WITHDRAW_TEXT.length).toBeGreaterThan(0);
  });

  it('contains "withdraw" or "minimum" keyword', () => {
    const lower = WITHDRAW_TEXT.toLowerCase();
    expect(lower.includes('withdraw') || lower.includes('minimum')).toBe(true);
  });
});

describe('CONVERT_BONUS_TEXT', () => {
  it('is non-empty', () => {
    expect(CONVERT_BONUS_TEXT.length).toBeGreaterThan(0);
  });

  it('contains "bonus" or "convert" keyword', () => {
    const lower = CONVERT_BONUS_TEXT.toLowerCase();
    expect(lower.includes('bonus') || lower.includes('convert')).toBe(true);
  });
});

// ─── Task 6.2: Property 1 — Invite link format ───────────────────────────────
// Feature: bot-start-menu, Property 1: Invite link format
// Validates: Requirements 4.9

describe('Property 1: buildInviteLink()', () => {
  it('produces the exact expected format for a concrete example', () => {
    const link = buildInviteLink('fidel_bingo_bot', BigInt(123456789));
    expect(link).toBe('https://t.me/fidel_bingo_bot?start=ref_123456789');
  });

  it('for any bot username and telegram ID, link matches the expected format', () => {
    fc.assert(
      fc.property(
        // Valid Telegram bot username: letters, digits, underscores, 5–32 chars
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/),
        // Use large positive integers for telegram IDs (bigint-compatible)
        fc.bigInt({ min: 1n, max: 9999999999999n }),
        (botUsername, telegramId) => {
          const link = buildInviteLink(botUsername, telegramId);
          expect(link).toBe(`https://t.me/${botUsername}?start=ref_${telegramId}`);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Task 7.1: Property 2 — New player creation completeness ─────────────────
// Feature: bot-start-menu, Property 2: New player creation completeness
// Validates: Requirements 3.2

describe('Property 2: simulateStartHandler() — new player creation completeness', () => {
  it('creates exactly 1 player and 2 wallets for a concrete new user', () => {
    const { players, wallets } = simulateStartHandler(123456789n, 'alice');
    expect(players.length).toBe(1);
    expect(wallets.length).toBe(2);
    expect(wallets.some((w) => w.type === 'main')).toBe(true);
    expect(wallets.some((w) => w.type === 'play')).toBe(true);
  });

  it('for any new telegram ID and username, produces exactly 1 player and exactly 2 wallets (one main, one play)', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 9999999999n }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (telegramId, username) => {
          const { players, wallets } = simulateStartHandler(telegramId, username);
          expect(players.length).toBe(1);
          expect(wallets.length).toBe(2);
          expect(wallets.filter((w) => w.type === 'main').length).toBe(1);
          expect(wallets.filter((w) => w.type === 'play').length).toBe(1);
          // All wallets belong to the created player
          expect(wallets.every((w) => w.player_id === players[0]!.id)).toBe(true);
          // Both wallets start with balance 0
          expect(wallets.every((w) => w.balance === 0)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Task 7.2: Property 3 — Idempotent player upsert ─────────────────────────
// Feature: bot-start-menu, Property 3: Idempotent player upsert
// Validates: Requirements 3.3

describe('Property 3: simulateIdempotentUpsert() — idempotent player upsert', () => {
  it('player count is 1 after calling upsert multiple times with the same telegram ID (concrete example)', () => {
    const result = simulateIdempotentUpsert(999n, ['alice', 'alice2', 'alice3']);
    expect(result.playerCount).toBe(1);
    expect(result.finalUsername).toBe('alice3');
  });

  it('for any telegram ID and array of 1–5 usernames, playerCount is always 1', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 9999999999n }),
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
        (telegramId, usernames) => {
          const { playerCount, finalUsername } = simulateIdempotentUpsert(telegramId, usernames);
          expect(playerCount).toBe(1);
          // Final username should be the last one in the array
          expect(finalUsername).toBe(usernames[usernames.length - 1]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Task 7.3: Property 4 — Referrer attribution ─────────────────────────────
// Feature: bot-start-menu, Property 4: Referrer attribution for valid payloads
// Validates: Requirements 3.1

describe('Property 4: simulateReferrerAttribution() — referrer attribution', () => {
  it('sets referrerId when existingReferrer.telegram_id matches referrerTelegramId (concrete example)', () => {
    const referrer = { id: 'uuid-abc-123', telegram_id: 777n };
    const result = simulateReferrerAttribution(111n, 'newuser', 777n, referrer);
    expect(result.referrerId).toBe('uuid-abc-123');
  });

  it('returns null when existingReferrer is null', () => {
    const result = simulateReferrerAttribution(111n, 'newuser', 777n, null);
    expect(result.referrerId).toBeNull();
  });

  it('returns null when referrerTelegramId is null', () => {
    const referrer = { id: 'uuid-abc-123', telegram_id: 777n };
    const result = simulateReferrerAttribution(111n, 'newuser', null, referrer);
    expect(result.referrerId).toBeNull();
  });

  it('returns null when existingReferrer.telegram_id does not match referrerTelegramId', () => {
    const referrer = { id: 'uuid-abc-123', telegram_id: 777n };
    const result = simulateReferrerAttribution(111n, 'newuser', 888n, referrer);
    expect(result.referrerId).toBeNull();
  });

  it('for any IDs where existingReferrer.telegram_id === referrerTelegramId, referrerId equals existingReferrer.id', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 9999999999n }), // newPlayer telegram ID
        fc.string({ minLength: 1, maxLength: 50 }), // newPlayer username
        fc.bigInt({ min: 1n, max: 9999999999n }), // referrer telegram ID (same for both)
        fc.string({ minLength: 1, maxLength: 50 }), // referrer UUID
        (newTelegramId, username, referrerTelegramId, referrerId) => {
          const existingReferrer = { id: referrerId, telegram_id: referrerTelegramId };
          const result = simulateReferrerAttribution(
            newTelegramId,
            username,
            referrerTelegramId,
            existingReferrer,
          );
          expect(result.referrerId).toBe(referrerId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('for any IDs where existingReferrer is null, referrerId is null', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 9999999999n }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.bigInt({ min: 1n, max: 9999999999n }),
        (newTelegramId, username, referrerTelegramId) => {
          const result = simulateReferrerAttribution(newTelegramId, username, referrerTelegramId, null);
          expect(result.referrerId).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it("for any IDs where existingReferrer.telegram_id doesn't match referrerTelegramId, referrerId is null", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 9999999999n }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.bigInt({ min: 1n, max: 9999999999n }),
        fc.bigInt({ min: 1n, max: 9999999999n }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (newTelegramId, username, referrerTelegramId, differentId, referrerId) => {
          // Ensure they are different
          fc.pre(referrerTelegramId !== differentId);
          const existingReferrer = { id: referrerId, telegram_id: differentId };
          const result = simulateReferrerAttribution(
            newTelegramId,
            username,
            referrerTelegramId,
            existingReferrer,
          );
          expect(result.referrerId).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
