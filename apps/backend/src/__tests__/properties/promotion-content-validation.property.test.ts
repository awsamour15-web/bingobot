// Feature: promotion-management-system, Property 1: Content length validation is consistent
// **Validates: Requirements 5.4**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_TEXT_LENGTH = 4096;

// ─── Promotion validation logic (mirrors PromotionService.create) ────────────

interface CreatePromotionInput {
  title: string;
  content_type: 'text' | 'image' | 'video' | 'gif';
  text_content?: string;
  media_file_id?: string;
}

/**
 * Simulates the validation logic from PromotionService.create.
 * This is the pure validation function that we're testing.
 */
function validatePromotionContent(data: CreatePromotionInput): { valid: boolean; error?: string } {
  if (data.content_type === 'text') {
    if (!data.text_content) {
      return { valid: false, error: 'text_content is required for text promotions' };
    }
    if (data.text_content.length > MAX_TEXT_LENGTH) {
      return { valid: false, error: `text_content exceeds ${MAX_TEXT_LENGTH} characters` };
    }
  } else {
    if (!data.media_file_id) {
      return { valid: false, error: 'media_file_id is required for media promotions' };
    }
  }
  return { valid: true };
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generates a string with length EXACTLY at or below MAX_TEXT_LENGTH.
 */
const validTextContentArb = fc.string({ minLength: 1, maxLength: MAX_TEXT_LENGTH });

/**
 * Generates a string with length STRICTLY GREATER than MAX_TEXT_LENGTH.
 */
const invalidTextContentArb = fc.string({ minLength: MAX_TEXT_LENGTH + 1, maxLength: MAX_TEXT_LENGTH + 1000 });

/**
 * Generates a valid promotion title.
 */
const titleArb = fc.string({ minLength: 1, maxLength: 200 });

// ─── Property 1: Content length validation is consistent ──────────────────────

describe('Property 1: Content length validation is consistent', () => {
  it('rejects text_content when length > 4096', () => {
    fc.assert(
      fc.property(titleArb, invalidTextContentArb, (title, text_content) => {
        const result = validatePromotionContent({
          title,
          content_type: 'text',
          text_content,
        });

        expect(result.valid).toBe(false);
        expect(result.error).toContain('exceeds');
        expect(result.error).toContain(String(MAX_TEXT_LENGTH));
      }),
      { numRuns: 100 },
    );
  });

  it('accepts text_content when length ≤ 4096', () => {
    fc.assert(
      fc.property(titleArb, validTextContentArb, (title, text_content) => {
        const result = validatePromotionContent({
          title,
          content_type: 'text',
          text_content,
        });

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('rejects text_content at exactly MAX_TEXT_LENGTH + 1', () => {
    fc.assert(
      fc.property(titleArb, fc.string({ minLength: 1, maxLength: 100 }), (title, baseString) => {
        // Construct a string that is exactly MAX_TEXT_LENGTH + 1 characters
        const text_content = baseString.repeat(Math.ceil((MAX_TEXT_LENGTH + 1) / baseString.length)).slice(0, MAX_TEXT_LENGTH + 1);

        const result = validatePromotionContent({
          title,
          content_type: 'text',
          text_content,
        });

        expect(result.valid).toBe(false);
        expect(text_content.length).toBe(MAX_TEXT_LENGTH + 1);
      }),
      { numRuns: 100 },
    );
  });

  it('accepts text_content at exactly MAX_TEXT_LENGTH', () => {
    fc.assert(
      fc.property(titleArb, fc.string({ minLength: 1, maxLength: 100 }), (title, baseString) => {
        // Construct a string that is exactly MAX_TEXT_LENGTH characters
        const text_content = baseString.repeat(Math.ceil(MAX_TEXT_LENGTH / baseString.length)).slice(0, MAX_TEXT_LENGTH);

        const result = validatePromotionContent({
          title,
          content_type: 'text',
          text_content,
        });

        expect(result.valid).toBe(true);
        expect(text_content.length).toBe(MAX_TEXT_LENGTH);
      }),
      { numRuns: 100 },
    );
  });

  it('validation result is deterministic for the same input', () => {
    fc.assert(
      fc.property(titleArb, fc.string({ minLength: 1, maxLength: 5000 }), (title, text_content) => {
        const result1 = validatePromotionContent({
          title,
          content_type: 'text',
          text_content,
        });
        const result2 = validatePromotionContent({
          title,
          content_type: 'text',
          text_content,
        });

        // Same input must produce the same validation result
        expect(result1.valid).toBe(result2.valid);
        expect(result1.error).toBe(result2.error);
      }),
      { numRuns: 100 },
    );
  });

  it('the boundary at 4096 is exact: 4096 passes, 4097 fails', () => {
    const title = 'Test Promotion';
    
    // Test at boundary
    const atBoundary = 'a'.repeat(MAX_TEXT_LENGTH);
    const resultAtBoundary = validatePromotionContent({
      title,
      content_type: 'text',
      text_content: atBoundary,
    });
    expect(resultAtBoundary.valid).toBe(true);

    // Test just over boundary
    const overBoundary = 'a'.repeat(MAX_TEXT_LENGTH + 1);
    const resultOverBoundary = validatePromotionContent({
      title,
      content_type: 'text',
      text_content: overBoundary,
    });
    expect(resultOverBoundary.valid).toBe(false);
  });
});
