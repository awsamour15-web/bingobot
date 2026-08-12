# Implementation Plan: Promotion Management System

## Overview

Incrementally build the promotion management system across the monorepo: Prisma schema → backend service + admin API routes → promotion scheduler service → bot distribution → admin panel UI. Each task wires into the existing patterns (round-scheduler, admin router registration, admin panel nav/pages, api.ts).

## Tasks

- [x] 1. Add Prisma models for promotions
  - Add `PromotionContentType` enum (`text`, `image`, `video`, `gif`) to `apps/backend/prisma/schema.prisma`
  - Add `PromotionStatus` enum (`active`, `inactive`)
  - Add `PromotionScheduleFrequency` enum (`once`, `daily`, `weekly`, `monthly`)
  - Add `Promotion` model with fields: `id`, `title`, `content_type`, `text_content`, `media_file_id` (Telegram file_id), `status`, `created_at`, `updated_at`
  - Add `PromotionSchedule` model with fields: `id`, `promotion_id` (FK), `channel_ids` (String[], Telegram channel IDs), `frequency`, `send_at` (DateTime), `next_run_at` (DateTime?), `is_active`, `created_at`
  - Add `PromotionLog` model with fields: `id`, `promotion_id` (FK), `schedule_id` (FK nullable), `channel_id`, `status` (`sent` | `failed`), `error_message` (nullable), `sent_at`
  - Create migration: `npx prisma migrate dev --name add_promotion_models` (run manually)
  - _Requirements: 1.2, 3.3, 4.2, 6.1, 6.5_

- [ ] 2. Implement promotion backend service and admin API
  - [x] 2.1 Create `apps/backend/src/services/promotion.service.ts`
    - Implement `PromotionService.create(data)` — stores new promotion, validates `text_content` length ≤ 4096 chars, rejects unsupported content type
    - Implement `PromotionService.list()` — returns all promotions ordered by `created_at` desc
    - Implement `PromotionService.update(id, data)` — partial update of title, content, status
    - Implement `PromotionService.setStatus(id, status)` — enable/disable without deletion
    - Implement `PromotionService.createSchedule(promotionId, data)` — creates `PromotionSchedule`, sets `next_run_at = send_at`
    - Implement `PromotionService.listSchedules(promotionId)`
    - Implement `PromotionService.cancelSchedule(scheduleId)` — sets `is_active = false`
    - Implement `PromotionService.logDelivery(entry)` — inserts `PromotionLog` row
    - _Requirements: 1.2, 1.4, 1.5, 2.2, 3.1, 3.3, 3.6, 4.2, 5.4, 6.1_

  - [x] 2.2 Write property test for PromotionService validation
    - **Property 1: Content length validation is consistent** — for any `text_content` string, `create` rejects if `length > 4096` and accepts otherwise
    - **Validates: Requirements 5.4**
    - Place test in `apps/backend/src/__tests__/properties/promotion-content-validation.property.test.ts`

  - [x] 2.3 Create `apps/backend/src/routes/admin/promotions.admin.router.ts`
    - `GET /promotions` — list all promotions (calls `PromotionService.list()`)
    - `POST /promotions` — create promotion (calls `PromotionService.create()`)
    - `PATCH /promotions/:id` — update promotion content/status (calls `PromotionService.update()`)
    - `PATCH /promotions/:id/status` — toggle active/inactive (calls `PromotionService.setStatus()`)
    - `GET /promotions/:id/schedules` — list schedules
    - `POST /promotions/:id/schedules` — create schedule
    - `DELETE /promotions/schedules/:scheduleId` — cancel schedule
    - `GET /promotions/logs` — get delivery logs (supports `?promotionId=` filter)
    - Follow the pattern of `finance.admin.router.ts` — use `Router`, typed `Request`/`Response`, return `res.json()`
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 3.1, 3.4, 3.6, 4.1, 6.2, 6.6_

  - [x] 2.4 Write property test for schedule next_run_at computation
    - **Property 2: next_run_at is always ≥ send_at when schedule is created**
    - **Validates: Requirements 3.2**
    - Place test in `apps/backend/src/__tests__/properties/promotion-schedule.property.test.ts`

  - [x] 2.5 Register promotions router in `apps/backend/src/index.ts`
    - Import `promotionsAdminRouter` from `./routes/admin/promotions.admin.router.js`
    - Mount as `app.use('/api/admin/promotions', jwtAdminMiddleware, promotionsAdminRouter)`
    - _Requirements: 1.1, 2.1_

- [ ] 3. Implement promotion scheduler service
  - [x] 3.1 Create `apps/backend/src/services/promotion-scheduler.service.ts`
    - Model the service after `round-scheduler.service.ts` with `start()`, `stop()`, and interval-based `tick()`
    - `tick()` queries `PromotionSchedule` where `is_active = true AND next_run_at <= now()`
    - For each due schedule: fetch the linked `Promotion` (skip if `status !== 'active'`), call `sendPromotion(promotion, schedule)`
    - `sendPromotion(promotion, schedule)` iterates `schedule.channel_ids`, calls `bot.api.sendMessage` / `sendPhoto` / `sendVideo` / `sendAnimation` depending on `content_type`
    - On success: call `PromotionService.logDelivery({ ..., status: 'sent' })`, update `next_run_at` for recurring schedules (`daily` → +1 day, `weekly` → +7 days, `monthly` → +1 month), set `is_active = false` for `once` schedules
    - On failure: call `PromotionService.logDelivery({ ..., status: 'failed', error_message })`, log error, do not crash the tick loop
    - Export `PromotionScheduler` with `start()` and `stop()`
    - _Requirements: 3.2, 3.3, 3.5, 4.3, 5.1, 5.2, 5.3, 5.6, 6.1, 6.3_

  - [x] 3.2 Write property test for scheduler next_run_at advancement
    - **Property 3: After a successful send, next_run_at advances by exactly the correct interval** — daily → 86400s, weekly → 604800s, monthly → ~30 days
    - **Validates: Requirements 3.3**
    - Place test in `apps/backend/src/__tests__/properties/promotion-scheduler.property.test.ts`

  - [x] 3.3 Start `PromotionScheduler` in `apps/backend/src/index.ts`
    - Import `PromotionScheduler` from `./services/promotion-scheduler.service.js`
    - Call `PromotionScheduler.start()` after `RoundScheduler.start()` in the server listen callback
    - _Requirements: 3.2_

- [x] 4. Checkpoint — Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Build admin panel promotions page
  - [x] 5.1 Add promotion API functions to `apps/admin/src/lib/api.ts`
    - Add types: `Promotion`, `PromotionSchedule`, `PromotionLog`
    - Add `listPromotions()`, `createPromotion(data)`, `updatePromotion(id, data)`, `setPromotionStatus(id, status)`
    - Add `listSchedules(promotionId)`, `createSchedule(promotionId, data)`, `cancelSchedule(scheduleId)`
    - Add `getPromotionLogs(promotionId?)` 
    - Follow the existing `adminApiRequest` pattern
    - _Requirements: 1.1, 1.3, 3.1, 3.4, 6.2_

  - [x] 5.2 Create `apps/admin/src/pages/PromotionsPage.tsx`
    - Promotions list section: table showing title, content type, status badge (active/inactive), created date; "Enable"/"Disable" toggle button per row; "Edit" button per row
    - Create promotion form: fields for title, content type selector (`text` | `image` | `video` | `gif`), text content textarea (shown when type is `text`), Telegram media file_id input (shown for media types), submit button
    - Edit promotion inline or in a modal: pre-fill current values, call `updatePromotion`
    - Schedule section per promotion (expandable): list of schedules with frequency, `send_at`, status; "Cancel" button per active schedule; "Add Schedule" form with frequency selector, datetime input, channel IDs (comma-separated), submit button
    - Logs section: table showing channel, status, error message (if any), sent_at — filterable by promotionId
    - Use existing `C`, `Btn`, `Badge`, `Card`, `CardHeader`, `Table`, `Th`, `Td`, `Alert`, `Field`, `inputCss`, `selectCss` from `../components/ui`
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 2.5, 3.1, 3.4, 3.6, 4.1, 4.4, 4.6, 6.2, 6.4, 6.5, 6.6_

  - [x] 5.3 Register `PromotionsPage` in router and nav
    - In `apps/admin/src/main.tsx`: import `PromotionsPage` and add `<Route path="promotions" element={<PromotionsPage />} />`
    - In `apps/admin/src/components/Layout.tsx`: add `{ to: '/promotions', label: 'Promotions', icon: '📢' }` to `navItems`
    - _Requirements: 1.1_

- [x] 6. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Telegram `file_id` for media is obtained by sending the file to the bot once; the service uses it for subsequent sends
- Channel IDs must be stored as strings (e.g. `"-1001234567890"`) — Telegram channel IDs are large negative integers
- The scheduler tick interval can follow the same `CHECK_INTERVAL_MS` pattern as `round-scheduler.service.ts` (15s) or be set to 60s since promotion sends are not time-critical
- Property tests should mock Prisma using the pattern already established in the existing `properties/` test files
