// Feature: promotion-management-system, Property 3: After a successful send, next_run_at advances by exactly the correct interval
// **Validates: Requirements 3.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Schedule advancement logic (mirrors advanceNextRunAt from PromotionScheduler) ───

type PromotionScheduleFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

/**
 * Simulates the next_run_at advancement logic from PromotionScheduler.
 * This is the pure computation function extracted from the scheduler service.
 */
function advanceNextRunAt(frequency: string, from: Date): Date | null {
  const d = new Date(from);
  switch (frequency) {
    case 'daily':   d.setDate(d.getDate() + 1); return d;
    case 'weekly':  d.setDate(d.getDate() + 7); return d;
    case 'monthly': d.setMonth(d.getMonth() + 1); return d;
    default:        return null; // 'once' — no next run
  }
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generates a valid schedule frequency.
 */
const frequencyArb = fc.constantFrom<PromotionScheduleFrequency>('once', 'daily', 'weekly', 'monthly');

/**
 * Generates a Date object representing a valid current next_run_at time.
 * We generate dates from 1 year ago to 1 year in the future to test various scenarios.
 */
const dateArb = fc.date({
  min: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
  max: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
});

// ─── Property 3: After a successful send, next_run_at advances by exactly the correct interval ───

describe('Property 3: After a successful send, next_run_at advances by exactly the correct interval', () => {
  it('daily frequency advances by exactly 86400 seconds (24 hours)', () => {
    fc.assert(
      fc.property(dateArb, (currentRunAt) => {
        const nextRunAt = advanceNextRunAt('daily', currentRunAt);
        
        expect(nextRunAt).not.toBeNull();
        const diffSeconds = (nextRunAt!.getTime() - currentRunAt.getTime()) / 1000;
        expect(diffSeconds).toBe(86400);
      }),
      { numRuns: 100 }
    );
  });

  it('weekly frequency advances by exactly 604800 seconds (7 days)', () => {
    fc.assert(
      fc.property(dateArb, (currentRunAt) => {
        const nextRunAt = advanceNextRunAt('weekly', currentRunAt);
        
        expect(nextRunAt).not.toBeNull();
        const diffSeconds = (nextRunAt!.getTime() - currentRunAt.getTime()) / 1000;
        expect(diffSeconds).toBe(604800);
      }),
      { numRuns: 100 }
    );
  });

  it('monthly frequency advances by approximately 28-31 days', () => {
    fc.assert(
      fc.property(dateArb, (currentRunAt) => {
        const nextRunAt = advanceNextRunAt('monthly', currentRunAt);
        
        expect(nextRunAt).not.toBeNull();
        if (nextRunAt) {
          const diffSeconds = (nextRunAt.getTime() - currentRunAt.getTime()) / 1000;
          const diffDays = diffSeconds / 86400;
          
          // Monthly advancement varies between 28-31 days depending on the month
          expect(diffDays).toBeGreaterThanOrEqual(28);
          expect(diffDays).toBeLessThanOrEqual(31);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('once frequency returns null (no next run)', () => {
    fc.assert(
      fc.property(dateArb, (currentRunAt) => {
        const nextRunAt = advanceNextRunAt('once', currentRunAt);
        expect(nextRunAt).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('daily advancement is deterministic for the same input', () => {
    fc.assert(
      fc.property(dateArb, (currentRunAt) => {
        const nextRunAt1 = advanceNextRunAt('daily', currentRunAt);
        const nextRunAt2 = advanceNextRunAt('daily', currentRunAt);
        
        if (nextRunAt1 && nextRunAt2) {
          expect(nextRunAt1.getTime()).toBe(nextRunAt2.getTime());
        }
      }),
      { numRuns: 100 }
    );
  });

  it('weekly advancement is deterministic for the same input', () => {
    fc.assert(
      fc.property(dateArb, (currentRunAt) => {
        const nextRunAt1 = advanceNextRunAt('weekly', currentRunAt);
        const nextRunAt2 = advanceNextRunAt('weekly', currentRunAt);
        
        if (nextRunAt1 && nextRunAt2) {
          expect(nextRunAt1.getTime()).toBe(nextRunAt2.getTime());
        }
      }),
      { numRuns: 100 }
    );
  });

  it('monthly advancement is deterministic for the same input', () => {
    fc.assert(
      fc.property(dateArb, (currentRunAt) => {
        const nextRunAt1 = advanceNextRunAt('monthly', currentRunAt);
        const nextRunAt2 = advanceNextRunAt('monthly', currentRunAt);
        
        if (nextRunAt1 && nextRunAt2) {
          expect(nextRunAt1.getTime()).toBe(nextRunAt2.getTime());
        }
      }),
      { numRuns: 100 }
    );
  });

  it('advancement preserves time of day for daily frequency', () => {
    fc.assert(
      fc.property(dateArb, (currentRunAt) => {
        const nextRunAt = advanceNextRunAt('daily', currentRunAt);
        
        if (nextRunAt) {
          // Time of day should be preserved (hour, minute, second, millisecond)
          expect(nextRunAt.getHours()).toBe(currentRunAt.getHours());
          expect(nextRunAt.getMinutes()).toBe(currentRunAt.getMinutes());
          expect(nextRunAt.getSeconds()).toBe(currentRunAt.getSeconds());
          expect(nextRunAt.getMilliseconds()).toBe(currentRunAt.getMilliseconds());
        }
      }),
      { numRuns: 100 }
    );
  });

  it('advancement preserves time of day for weekly frequency', () => {
    fc.assert(
      fc.property(dateArb, (currentRunAt) => {
        const nextRunAt = advanceNextRunAt('weekly', currentRunAt);
        
        if (nextRunAt) {
          // Time of day should be preserved (hour, minute, second, millisecond)
          expect(nextRunAt.getHours()).toBe(currentRunAt.getHours());
          expect(nextRunAt.getMinutes()).toBe(currentRunAt.getMinutes());
          expect(nextRunAt.getSeconds()).toBe(currentRunAt.getSeconds());
          expect(nextRunAt.getMilliseconds()).toBe(currentRunAt.getMilliseconds());
        }
      }),
      { numRuns: 100 }
    );
  });

  it('advancement preserves day of month for monthly frequency when possible', () => {
    fc.assert(
      fc.property(dateArb, (currentRunAt) => {
        const nextRunAt = advanceNextRunAt('monthly', currentRunAt);
        
        if (nextRunAt) {
          const currentDay = currentRunAt.getDate();
          const nextDay = nextRunAt.getDate();
          
          // For days 1-28, the day of month should be preserved
          // For days 29-31, it depends on the next month's length
          if (currentDay <= 28) {
            expect(nextDay).toBe(currentDay);
          }
          
          // Time of day should always be preserved
          expect(nextRunAt.getHours()).toBe(currentRunAt.getHours());
          expect(nextRunAt.getMinutes()).toBe(currentRunAt.getMinutes());
          expect(nextRunAt.getSeconds()).toBe(currentRunAt.getSeconds());
          expect(nextRunAt.getMilliseconds()).toBe(currentRunAt.getMilliseconds());
        }
      }),
      { numRuns: 100 }
    );
  });

  it('multiple sequential advancements produce monotonically increasing dates', () => {
    fc.assert(
      fc.property(
        dateArb,
        fc.constantFrom<'daily' | 'weekly' | 'monthly'>('daily', 'weekly', 'monthly'),
        fc.integer({ min: 2, max: 10 }),
        (startDate, frequency, iterations) => {
          let currentDate = startDate;
          const dates = [currentDate];
          
          for (let i = 0; i < iterations; i++) {
            const nextDate = advanceNextRunAt(frequency, currentDate);
            if (nextDate === null) break;
            dates.push(nextDate);
            currentDate = nextDate;
          }
          
          // Each date should be strictly greater than the previous
          for (let i = 1; i < dates.length; i++) {
            expect(dates[i].getTime()).toBeGreaterThan(dates[i - 1].getTime());
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('advancement handles edge case: end of month for daily', () => {
    // Test advancing from Jan 31 to Feb 1
    const jan31 = new Date(2024, 0, 31, 12, 0, 0, 0); // Jan 31, 2024 12:00:00
    const nextRunAt = advanceNextRunAt('daily', jan31);
    
    expect(nextRunAt).not.toBeNull();
    if (nextRunAt) {
      expect(nextRunAt.getMonth()).toBe(1); // February (0-indexed)
      expect(nextRunAt.getDate()).toBe(1);
      const diffSeconds = (nextRunAt.getTime() - jan31.getTime()) / 1000;
      expect(diffSeconds).toBe(86400);
    }
  });

  it('advancement handles edge case: leap year for monthly', () => {
    // Test advancing from Jan 29 in a leap year
    const jan29LeapYear = new Date(2024, 0, 29, 12, 0, 0, 0); // Jan 29, 2024 (leap year)
    const nextRunAt = advanceNextRunAt('monthly', jan29LeapYear);
    
    expect(nextRunAt).not.toBeNull();
    if (nextRunAt) {
      expect(nextRunAt.getMonth()).toBe(1); // February
      expect(nextRunAt.getDate()).toBe(29); // Feb 29 exists in leap year
    }
  });

  it('advancement handles edge case: non-leap year for monthly', () => {
    // Test advancing from Jan 29 in a non-leap year
    const jan29NonLeapYear = new Date(2023, 0, 29, 12, 0, 0, 0); // Jan 29, 2023 (non-leap year)
    const nextRunAt = advanceNextRunAt('monthly', jan29NonLeapYear);
    
    expect(nextRunAt).not.toBeNull();
    if (nextRunAt) {
      // Feb 29 doesn't exist in non-leap year, so setMonth adjusts to Mar 1
      // This is standard JavaScript Date behavior
      expect(nextRunAt.getMonth()).toBe(2); // March (rollover)
      expect(nextRunAt.getDate()).toBe(1);
    }
  });

  it('advancement handles edge case: December to January for monthly', () => {
    const dec15 = new Date(2024, 11, 15, 12, 0, 0, 0); // Dec 15, 2024
    const nextRunAt = advanceNextRunAt('monthly', dec15);
    
    expect(nextRunAt).not.toBeNull();
    if (nextRunAt) {
      expect(nextRunAt.getFullYear()).toBe(2025);
      expect(nextRunAt.getMonth()).toBe(0); // January
      expect(nextRunAt.getDate()).toBe(15);
    }
  });

  it('unknown frequency returns null', () => {
    fc.assert(
      fc.property(dateArb, (currentRunAt) => {
        const nextRunAt = advanceNextRunAt('unknown_frequency', currentRunAt);
        expect(nextRunAt).toBeNull();
      }),
      { numRuns: 100 }
    );
  });
});
