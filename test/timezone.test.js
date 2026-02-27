import { describe, it } from 'node:test';
import assert from 'node:assert';
import { localToUtc, getLocalHour, getLocalMinutes, formatLocalISO, getLocalDateStr } from '../lib/timezone.js';

describe('Timezone Utilities', () => {
  describe('localToUtc', () => {
    it('converts Baton Rouge summer time correctly (CDT = UTC-5)', () => {
      // July 4, 1978 at 3pm Central Daylight Time
      const date = localToUtc(1978, 7, 4, 15, 0, 'America/Chicago');
      // CDT is UTC-5, so 3pm CDT = 8pm UTC = 20:00 UTC
      assert.strictEqual(date.getUTCHours(), 20);
      assert.strictEqual(date.getUTCFullYear(), 1978);
      assert.strictEqual(date.getUTCMonth(), 6); // 0-indexed
      assert.strictEqual(date.getUTCDate(), 4);
    });

    it('converts London summer time correctly (BST = UTC+1)', () => {
      // July 4, 1978 at 3pm British Summer Time
      const date = localToUtc(1978, 7, 4, 15, 0, 'Europe/London');
      // BST is UTC+1, so 3pm BST = 2pm UTC = 14:00 UTC
      assert.strictEqual(date.getUTCHours(), 14);
    });

    it('converts Tokyo time correctly (JST = UTC+9, no DST)', () => {
      // Jan 1, 2020 at 3pm JST
      const date = localToUtc(2020, 1, 1, 15, 0, 'Asia/Tokyo');
      // JST is UTC+9, so 3pm JST = 6am UTC = 06:00 UTC
      assert.strictEqual(date.getUTCHours(), 6);
    });

    it('converts winter time correctly (CST = UTC-6)', () => {
      // January 15, 2020 at 3pm Central Standard Time
      const date = localToUtc(2020, 1, 15, 15, 0, 'America/Chicago');
      // CST is UTC-6, so 3pm CST = 9pm UTC = 21:00 UTC
      assert.strictEqual(date.getUTCHours(), 21);
    });

    it('falls back to machine-local when no timezone given', () => {
      const date = localToUtc(1978, 7, 4, 15, 0, null);
      // Should still produce a valid Date
      assert.ok(!isNaN(date.getTime()));
      // With null timezone, uses machine-local, so hours depend on test machine
      // Just verify it created a Date for July 4, 1978
      assert.strictEqual(date.getFullYear(), 1978);
    });

    it('handles midnight correctly', () => {
      const date = localToUtc(2020, 6, 15, 0, 0, 'America/Chicago');
      // Midnight CDT = 5am UTC
      assert.strictEqual(date.getUTCHours(), 5);
      assert.strictEqual(date.getUTCDate(), 15);
    });

    it('handles date rollover (late night UTC+)', () => {
      // 11pm in Tokyo on Jan 1 = 2pm UTC on Jan 1 (no rollover)
      const date = localToUtc(2020, 1, 1, 23, 0, 'Asia/Tokyo');
      assert.strictEqual(date.getUTCHours(), 14);
      assert.strictEqual(date.getUTCDate(), 1);
    });
  });

  describe('getLocalHour', () => {
    it('returns correct local hour for CDT', () => {
      // 8pm UTC on July 4 = 3pm CDT
      const utc = new Date(Date.UTC(1978, 6, 4, 20, 0, 0));
      assert.strictEqual(getLocalHour(utc, 'America/Chicago'), 15);
    });

    it('returns correct local hour for JST', () => {
      // 6am UTC = 3pm JST
      const utc = new Date(Date.UTC(2020, 0, 1, 6, 0, 0));
      assert.strictEqual(getLocalHour(utc, 'Asia/Tokyo'), 15);
    });

    it('roundtrips with localToUtc', () => {
      const original = localToUtc(1978, 7, 4, 15, 0, 'America/Chicago');
      const hour = getLocalHour(original, 'America/Chicago');
      assert.strictEqual(hour, 15);
    });
  });

  describe('getLocalMinutes', () => {
    it('returns correct local minutes', () => {
      const utc = new Date(Date.UTC(2020, 0, 1, 6, 30, 0));
      // India is UTC+5:30
      assert.strictEqual(getLocalMinutes(utc, 'Asia/Kolkata'), 0);
    });
  });

  describe('formatLocalISO', () => {
    it('formats correctly for CDT', () => {
      // 8pm UTC on July 4, 1978 = 3pm CDT
      const utc = new Date(Date.UTC(1978, 6, 4, 20, 0, 0));
      const result = formatLocalISO(utc, 'America/Chicago');
      assert.strictEqual(result, '1978-07-04T15:00:00');
    });

    it('formats correctly for JST', () => {
      const utc = new Date(Date.UTC(2020, 0, 1, 6, 30, 0));
      const result = formatLocalISO(utc, 'Asia/Tokyo');
      assert.strictEqual(result, '2020-01-01T15:30:00');
    });

    it('falls back to machine-local when no timezone', () => {
      const utc = new Date(Date.UTC(1978, 6, 4, 20, 0, 0));
      const result = formatLocalISO(utc, null);
      // Should still be a valid ISO-like string
      assert.ok(result.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/));
    });
  });

  describe('getLocalDateStr', () => {
    it('returns correct local date for CDT', () => {
      // 2am UTC on July 5 = 9pm CDT on July 4 (previous day!)
      const utc = new Date(Date.UTC(1978, 6, 5, 2, 0, 0));
      const result = getLocalDateStr(utc, 'America/Chicago');
      assert.strictEqual(result, '1978-07-04');
    });

    it('returns correct date for JST (ahead of UTC)', () => {
      // 11pm UTC on Dec 31 = 8am JST on Jan 1 (next day!)
      const utc = new Date(Date.UTC(2019, 11, 31, 23, 0, 0));
      const result = getLocalDateStr(utc, 'Asia/Tokyo');
      assert.strictEqual(result, '2020-01-01');
    });
  });
});
