import { describe, it } from 'node:test';
import assert from 'node:assert';
import { LOCALES, DEFAULT_LOCALE, resolveLocale } from '../lib/localePresets.js';

// ─── Existing presets unchanged ─────────────────────────────────

describe('Locale Presets — LOCALES', () => {
  it('has baton_rouge_suburb as default', () => {
    assert.strictEqual(DEFAULT_LOCALE, 'baton_rouge_suburb');
    assert.ok(LOCALES[DEFAULT_LOCALE]);
  });

  it('all presets have required fields', () => {
    for (const [key, locale] of Object.entries(LOCALES)) {
      assert.ok(typeof locale.audioBaseDb === 'number', `${key} missing audioBaseDb`);
      assert.ok(typeof locale.activity === 'number', `${key} missing activity`);
      assert.ok(typeof locale.hazeBias === 'number', `${key} missing hazeBias`);
      assert.ok('audioProfileId' in locale, `${key} missing audioProfileId`);
    }
  });
});

// ─── resolveLocale — population tiers ───────────────────────────

describe('resolveLocale — population tiers', () => {
  it('large city (≥500k) gets highest noise + activity', () => {
    const { locale } = resolveLocale({ population: 8_000_000 }, 2024);
    assert.strictEqual(locale.audioBaseDb, 30);
    assert.strictEqual(locale.activity, 0.40);
  });

  it('mid city (100k–500k) gets mid-high values', () => {
    const { locale } = resolveLocale({ population: 150_000 }, 2024);
    assert.strictEqual(locale.audioBaseDb, 28);
    assert.strictEqual(locale.activity, 0.30);
  });

  it('small city (10k–100k) gets mid values', () => {
    const { locale } = resolveLocale({ population: 25_000 }, 2024);
    assert.strictEqual(locale.audioBaseDb, 26);
    assert.strictEqual(locale.activity, 0.20);
  });

  it('rural (<10k) gets lowest values', () => {
    const { locale } = resolveLocale({ population: 500 }, 2024);
    assert.strictEqual(locale.audioBaseDb, 24);
    assert.strictEqual(locale.activity, 0.12);
  });

  it('zero population treated as rural', () => {
    const { locale } = resolveLocale({ population: 0 }, 2024);
    assert.strictEqual(locale.audioBaseDb, 24);
  });

  it('missing population treated as rural', () => {
    const { locale } = resolveLocale({}, 2024);
    assert.strictEqual(locale.audioBaseDb, 24);
  });
});

// ─── resolveLocale — era modulation ─────────────────────────────

describe('resolveLocale — era modulation', () => {
  it('pre-1900 reduces activity by 15%', () => {
    const { locale } = resolveLocale({ population: 500_000 }, 1884);
    // 0.40 * 0.85 = 0.34
    assert.strictEqual(locale.activity, 0.34);
  });

  it('1900–1920 reduces activity by 8%', () => {
    const { locale } = resolveLocale({ population: 500_000 }, 1910);
    // 0.40 * 0.92 = 0.368 → rounded to 0.37
    assert.strictEqual(locale.activity, 0.37);
  });

  it('post-1920 keeps full activity', () => {
    const { locale } = resolveLocale({ population: 500_000 }, 1950);
    assert.strictEqual(locale.activity, 0.40);
  });

  it('industrial era (1850–1950) gets high haze', () => {
    const { locale } = resolveLocale({ population: 100_000 }, 1884);
    assert.strictEqual(locale.hazeBias, 0.05);
  });

  it('pre-industrial gets low haze', () => {
    const { locale } = resolveLocale({ population: 100_000 }, 1800);
    assert.strictEqual(locale.hazeBias, 0.02);
  });

  it('post-industrial gets moderate haze', () => {
    const { locale } = resolveLocale({ population: 100_000 }, 2024);
    assert.strictEqual(locale.hazeBias, 0.03);
  });
});

// ─── resolveLocale — architectural era ──────────────────────────

describe('resolveLocale — architectural era', () => {
  it('includes architecturalEra from resolveEra()', () => {
    const { locale } = resolveLocale({ population: 100_000 }, 1884);
    assert.ok(locale.architecturalEra, 'should have an architecturalEra');
    assert.strictEqual(typeof locale.architecturalEra, 'string');
  });

  it('null year → null architecturalEra', () => {
    const { locale } = resolveLocale({ population: 100_000 });
    assert.strictEqual(locale.architecturalEra, null);
  });
});

// ─── resolveLocale — metadata ───────────────────────────────────

describe('resolveLocale — return metadata', () => {
  it('always sets inferred: true', () => {
    const result = resolveLocale({ population: 100_000 }, 2024);
    assert.strictEqual(result.inferred, true);
  });

  it('sets deterministic audioProfileId for generated profiles', () => {
    const { locale } = resolveLocale({ population: 8_000_000, name: 'New York' }, 2024);
    assert.strictEqual(locale.audioProfileId, 'gen_new_york_2024');
    assert.strictEqual(locale._generatedProfile, true);
  });

  it('warns about procedural audio profile', () => {
    const { warnings } = resolveLocale({ population: 100_000 }, 2024);
    assert.ok(warnings.length > 0);
    assert.ok(warnings.some(w => w.includes('procedural audio profile')), 'should mention procedural profile');
  });

  it('null geo handled gracefully', () => {
    const { locale } = resolveLocale(null, 2024);
    assert.strictEqual(locale.audioBaseDb, 24);
    assert.strictEqual(locale.activity, 0.12);
    assert.strictEqual(locale.audioProfileId, 'gen_unknown_2024');
  });
});
