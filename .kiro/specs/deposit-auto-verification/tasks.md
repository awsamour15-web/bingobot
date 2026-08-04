# Implementation Tasks

## Tasks

- [x] 1. Add PendingDeposit model to the database schema
  - [x] 1.1 Add `DepositStatus` enum (`pending`, `claimed`, `cancelled`) to `apps/backend/prisma/schema.prisma`
  - [x] 1.2 Add `PendingDeposit` model with fields: `id`, `tx_number` (unique), `amount`, `status`, `player_id` (nullable FK to Player), `claimed_at` (nullable), `created_at`, `updated_at`
  - [x] 1.3 Run `npx prisma migrate dev --name add-pending-deposit` to generate and apply migration
  - [x] 1.4 Regenerate Prisma client (`npx prisma generate`)

- [x] 2. Add deposit config to the database
  - [x] 2.1 Add a seed or migration entry for `Config` key `deposit_telebirr_number` with the Telebirr account number (`0934942672`)
  - [x] 2.2 Ensure existing `Config` model supports this key (already exists in schema — no change needed)

- [x] 3. Create admin deposit management API routes
  - [x] 3.1 Create `apps/backend/src/routes/admin/deposits.admin.router.ts`
  - [x] 3.2 Add `GET /api/admin/deposits` — list all PendingDeposit records with player username if claimed, sorted by `created_at` desc
  - [x] 3.3 Add `POST /api/admin/deposits` — create a new PendingDeposit with `tx_number` and `amount`; reject duplicate `tx_number` with `DUPLICATE_TX_NUMBER` error
  - [x] 3.4 Add `POST /api/admin/deposits/:id/cancel` — set status to `cancelled` if currently `pending`
  - [x] 3.5 Register the new router in `apps/backend/src/index.ts` under `/api/admin/deposits`

- [x] 4. Implement bot deposit verification flow
  - [x] 4.1 Update `DEPOSIT_TEXT` in `apps/backend/src/bot/index.ts` to instruct the player to send `/txn <transaction_number>` after paying, and to read the Telebirr number from the `Config` table instead of hardcoding it
  - [x] 4.2 Add `/txn` command handler in `apps/backend/src/bot/index.ts`
    - Parse the transaction number from the command argument
    - Look up PendingDeposit by `tx_number` where status is `pending`
    - If not found → reply "Transaction number not found. Please contact support."
    - If already `claimed` → reply "This transaction has already been used. Please contact support."
    - If found and pending → atomically update status to `claimed`, set `player_id` and `claimed_at`, credit player's Main_Wallet via `WalletService.credit`, record `deposit` transaction with `tx_number` as `reference_id`
    - On success → reply with credited amount and new main wallet balance
    - On DB error → reply with generic error, leave PendingDeposit as `pending` so the player can retry

- [x] 5. Add admin panel UI for deposit management
  - [x] 5.1 Add deposit management API calls to `apps/admin/src/lib/api.ts` (`getDeposits`, `createDeposit`, `cancelDeposit`)
  - [x] 5.2 Create `apps/admin/src/pages/DepositsPage.tsx` with:
    - Summary row: count of pending / claimed / cancelled
    - Table: tx_number, amount, status, player username, created_at, claimed_at
    - "Add Deposit" form: tx_number input + amount input + submit button
    - "Cancel" button per pending row
  - [x] 5.3 Add the Deposits page to the admin router and sidebar navigation in `apps/admin/src/App.tsx` and `apps/admin/src/components/Layout.tsx`

- [x] 6. Update Deposit button text in bot to read Telebirr number from Config
  - [x] 6.1 Modify the `Deposit 💰` handler in `apps/backend/src/bot/index.ts` to fetch `deposit_telebirr_number` from the `Config` table and include it in the reply instead of the hardcoded number in `DEPOSIT_TEXT`

- [x] 7. Write property-based tests
  - [x] 7.1 Create `apps/backend/src/__tests__/properties/deposit-verification.property.test.ts`
  - [x] 7.2 Property: claiming the same tx_number N times results in exactly one wallet credit (idempotency)
  - [x] 7.3 Property: for all claimed PendingDeposits, the sum of credited Transaction amounts equals the sum of PendingDeposit amounts (ledger consistency)
  - [x] 7.4 Property: a tx_number with status `claimed` always returns an already-used error on re-submission
