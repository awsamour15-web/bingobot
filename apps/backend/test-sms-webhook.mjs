/**
 * Test script for the SMS webhook endpoint.
 * Run: node apps/backend/test-sms-webhook.mjs
 *
 * Edit the variables below before running.
 */

const SERVER_URL = process.env.SERVER_URL ?? 'https://fidelbingobot.onrender.com';
const SMS_SECRET = process.env.SMS_WEBHOOK_SECRET ?? 'change-me-to-a-strong-random-secret';

// ─── Test cases ───────────────────────────────────────────────────────────────

const tests = [
  {
    name: '✅ Valid English Telebirr received SMS',
    sms: 'You have received ETB 250.00 from 0911234567. Ref: DHD8R7TEST. Your new balance is ETB 1,250.00.',
    expectedStatus: ['credited', 'unmatched', 'failed'], // unmatched = no player with that phone
  },
  {
    name: '✅ Valid Amharic Telebirr received SMS',
    sms: 'ከ 0911234567 ETB 150.00 ተቀብለዋል። Ref: AMHTEST01',
    expectedStatus: ['credited', 'unmatched', 'failed'],
  },
  {
    name: '🚫 Wrong secret — should get 401',
    sms: 'You have received ETB 100.00 from 0911234567. Ref: BADTEST01.',
    secret: 'wrong-secret',
    expectedHttpStatus: 401,
  },
  {
    name: '🚫 Non-Telebirr SMS — should be ignored',
    sms: 'Your OTP is 123456. Do not share it with anyone.',
    expectedStatus: ['ignored'],
  },
  {
    name: '🚫 Missing SMS body — should get 400',
    sms: null,
    expectedHttpStatus: 400,
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

for (const test of tests) {
  const secret = test.secret ?? SMS_SECRET;
  const body = test.sms !== null ? JSON.stringify({ sms: test.sms }) : JSON.stringify({});

  try {
    const res = await fetch(`${SERVER_URL}/api/sms-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SMS-Secret': secret,
      },
      body,
    });

    const json = await res.json().catch(() => ({}));

    if (test.expectedHttpStatus) {
      if (res.status === test.expectedHttpStatus) {
        console.log(`PASS  ${test.name}`);
        console.log(`      HTTP ${res.status} — ${JSON.stringify(json)}\n`);
        passed++;
      } else {
        console.log(`FAIL  ${test.name}`);
        console.log(`      Expected HTTP ${test.expectedHttpStatus}, got ${res.status} — ${JSON.stringify(json)}\n`);
        failed++;
      }
    } else if (test.expectedStatus) {
      if (test.expectedStatus.includes(json.status)) {
        console.log(`PASS  ${test.name}`);
        console.log(`      status=${json.status} — ${JSON.stringify(json)}\n`);
        passed++;
      } else {
        console.log(`FAIL  ${test.name}`);
        console.log(`      Expected status in [${test.expectedStatus}], got: ${JSON.stringify(json)}\n`);
        failed++;
      }
    }
  } catch (err) {
    console.log(`ERROR ${test.name}: ${err.message}\n`);
    failed++;
  }
}

console.log(`─────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
