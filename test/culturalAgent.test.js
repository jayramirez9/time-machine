import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ERA_CULTURE_DB,
  MUSIC_ERA_DB,
  resolveEraKey,
  getMusicEra,
  researchCulture
} from '../lib/agents/culturalAgent.js';

// ---------------------------------------------------------------------------
// ERA_CULTURE_DB data integrity
// ---------------------------------------------------------------------------

describe('Cultural Agent — ERA_CULTURE_DB integrity', () => {
  const requiredFields = ['label', 'yearRange', 'languages', 'commerce', 'dailyLife', 'newspapers', 'technology'];
  const requiredCommerceFields = ['currency', 'streetVendors', 'markets', 'vendorDensityBase'];
  const requiredDailyLifeFields = ['workday', 'peakActivity', 'sabbath'];

  for (const [key, era] of Object.entries(ERA_CULTURE_DB)) {
    it(`${key} has all required top-level fields`, () => {
      for (const field of requiredFields) {
        assert.ok(era[field] !== undefined, `${key} missing ${field}`);
      }
    });

    it(`${key} has all required commerce fields`, () => {
      for (const field of requiredCommerceFields) {
        assert.ok(era.commerce[field] !== undefined, `${key}.commerce missing ${field}`);
      }
    });

    it(`${key} has all required dailyLife fields`, () => {
      for (const field of requiredDailyLifeFields) {
        assert.ok(era.dailyLife[field] !== undefined, `${key}.dailyLife missing ${field}`);
      }
    });

    it(`${key} has a _default language entry`, () => {
      assert.ok(era.languages._default, `${key}.languages missing _default`);
      assert.ok(era.languages._default.primary, `${key}.languages._default missing primary`);
    });

    it(`${key} yearRange is a 2-element array`, () => {
      assert.equal(era.yearRange.length, 2);
    });

    it(`${key} has at least one street vendor`, () => {
      assert.ok(era.commerce.streetVendors.length >= 1, `${key} has no street vendors`);
    });

    it(`${key} has vendorDensityBase > 0`, () => {
      assert.ok(era.commerce.vendorDensityBase > 0);
    });

    it(`${key} technology is a non-empty array`, () => {
      assert.ok(Array.isArray(era.technology));
      assert.ok(era.technology.length > 0);
    });
  }

  it('has 8 era keys', () => {
    assert.equal(Object.keys(ERA_CULTURE_DB).length, 8);
  });
});

// ---------------------------------------------------------------------------
// MUSIC_ERA_DB data integrity
// ---------------------------------------------------------------------------

describe('Cultural Agent — MUSIC_ERA_DB integrity', () => {
  const requiredFields = ['label', 'yearRange', 'formats', 'genres', 'notableSongs', 'performanceVenues'];

  for (const [key, era] of Object.entries(MUSIC_ERA_DB)) {
    it(`${key} has all required fields`, () => {
      for (const field of requiredFields) {
        assert.ok(era[field] !== undefined, `${key} missing ${field}`);
      }
    });

    it(`${key} has at least one format`, () => {
      assert.ok(era.formats.length >= 1);
    });

    it(`${key} genres sum to ~1.0`, () => {
      const sum = Object.values(era.genres).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1.0) < 0.01, `${key} genres sum to ${sum}`);
    });

    it(`${key} has at least one notable song`, () => {
      assert.ok(era.notableSongs.length >= 1);
    });

    it(`${key} has at least one venue`, () => {
      assert.ok(era.performanceVenues.length >= 1);
    });

    it(`${key} yearRange is a 2-element array`, () => {
      assert.equal(era.yearRange.length, 2);
    });
  }

  it('has 5 music era keys', () => {
    assert.equal(Object.keys(MUSIC_ERA_DB).length, 5);
  });
});

// ---------------------------------------------------------------------------
// resolveEraKey
// ---------------------------------------------------------------------------

describe('Cultural Agent — resolveEraKey', () => {
  it('1750 => colonial', () => {
    assert.equal(resolveEraKey(1750), 'colonial');
  });

  it('1830 => antebellum', () => {
    assert.equal(resolveEraKey(1830), 'antebellum');
  });

  it('1884 => gilded_age', () => {
    assert.equal(resolveEraKey(1884), 'gilded_age');
  });

  it('1910 => progressive', () => {
    assert.equal(resolveEraKey(1910), 'progressive');
  });

  it('1925 => jazz_age', () => {
    assert.equal(resolveEraKey(1925), 'jazz_age');
  });

  it('1955 => postwar', () => {
    assert.equal(resolveEraKey(1955), 'postwar');
  });

  it('1978 => counterculture', () => {
    assert.equal(resolveEraKey(1978), 'counterculture');
  });

  it('2020 => modern', () => {
    assert.equal(resolveEraKey(2020), 'modern');
  });

  // Boundary tests
  it('1800 boundary => antebellum', () => {
    assert.equal(resolveEraKey(1800), 'antebellum');
  });

  it('1799 boundary => colonial', () => {
    assert.equal(resolveEraKey(1799), 'colonial');
  });

  it('1865 boundary => gilded_age', () => {
    assert.equal(resolveEraKey(1865), 'gilded_age');
  });

  it('1864 boundary => antebellum', () => {
    assert.equal(resolveEraKey(1864), 'antebellum');
  });

  it('1900 boundary => progressive', () => {
    assert.equal(resolveEraKey(1900), 'progressive');
  });

  it('1920 boundary => jazz_age', () => {
    assert.equal(resolveEraKey(1920), 'jazz_age');
  });

  it('1940 boundary => postwar', () => {
    assert.equal(resolveEraKey(1940), 'postwar');
  });

  it('1965 boundary => counterculture', () => {
    assert.equal(resolveEraKey(1965), 'counterculture');
  });

  it('1980 boundary => modern', () => {
    assert.equal(resolveEraKey(1980), 'modern');
  });
});

// ---------------------------------------------------------------------------
// getMusicEra
// ---------------------------------------------------------------------------

describe('Cultural Agent — getMusicEra', () => {
  it('1800 => pre_recording', () => {
    assert.equal(getMusicEra(1800), 'pre_recording');
  });

  it('1876 => pre_recording (before phonograph)', () => {
    assert.equal(getMusicEra(1876), 'pre_recording');
  });

  it('1877 => early_recording (phonograph invented)', () => {
    assert.equal(getMusicEra(1877), 'early_recording');
  });

  it('1884 => early_recording', () => {
    assert.equal(getMusicEra(1884), 'early_recording');
  });

  it('1919 => early_recording', () => {
    assert.equal(getMusicEra(1919), 'early_recording');
  });

  it('1920 => broadcast_radio', () => {
    assert.equal(getMusicEra(1920), 'broadcast_radio');
  });

  it('1949 => broadcast_radio', () => {
    assert.equal(getMusicEra(1949), 'broadcast_radio');
  });

  it('1950 => broadcast_tv', () => {
    assert.equal(getMusicEra(1950), 'broadcast_tv');
  });

  it('1978 => broadcast_tv', () => {
    assert.equal(getMusicEra(1978), 'broadcast_tv');
  });

  it('1989 => broadcast_tv', () => {
    assert.equal(getMusicEra(1989), 'broadcast_tv');
  });

  it('1990 => streaming', () => {
    assert.equal(getMusicEra(1990), 'streaming');
  });

  it('2020 => streaming', () => {
    assert.equal(getMusicEra(2020), 'streaming');
  });
});

// ---------------------------------------------------------------------------
// researchCulture — layer envelope validity
// ---------------------------------------------------------------------------

describe('Cultural Agent — researchCulture layer envelopes', () => {
  it('returns both culture and music layers', () => {
    const result = researchCulture({ location: 'New York, NY', year: 1884 });
    assert.ok(result.culture, 'missing culture layer');
    assert.ok(result.music, 'missing music layer');
  });

  it('culture layer has valid envelope', () => {
    const { culture } = researchCulture({ location: 'Test', year: 1950 });
    assert.ok(culture.data, 'missing data');
    assert.ok(typeof culture.confidence === 'number', 'confidence not a number');
    assert.ok(culture.confidence >= 0 && culture.confidence <= 1, `confidence ${culture.confidence} out of range`);
    assert.ok(Array.isArray(culture.sources), 'sources not an array');
    assert.ok(culture.sources.length > 0, 'no sources');
    assert.ok(culture.sources[0].id, 'source missing id');
    assert.ok(culture.sources[0].type, 'source missing type');
    assert.ok(Array.isArray(culture.knownCompromises), 'knownCompromises not an array');
    assert.ok(culture.knownCompromises.length > 0, 'no compromises');
  });

  it('music layer has valid envelope', () => {
    const { music } = researchCulture({ location: 'Test', year: 1950 });
    assert.ok(music.data, 'missing data');
    assert.ok(typeof music.confidence === 'number', 'confidence not a number');
    assert.ok(music.confidence >= 0 && music.confidence <= 1, `confidence ${music.confidence} out of range`);
    assert.ok(Array.isArray(music.sources), 'sources not an array');
    assert.ok(music.sources.length > 0, 'no sources');
    assert.ok(music.sources[0].id, 'source missing id');
    assert.ok(music.sources[0].type, 'source missing type');
    assert.ok(Array.isArray(music.knownCompromises), 'knownCompromises not an array');
    assert.ok(music.knownCompromises.length > 0, 'no compromises');
  });
});

// ---------------------------------------------------------------------------
// researchCulture — 1884 NYC (gilded_age)
// ---------------------------------------------------------------------------

describe('Cultural Agent — 1884 NYC', () => {
  const result = researchCulture({
    location: 'New York, NY',
    year: 1884,
    countryCode: 'US',
    population: 1_200_000
  });

  it('culture era is gilded_age', () => {
    assert.equal(result.culture.data.eraKey, 'gilded_age');
  });

  it('has correct street vendors for gilded age', () => {
    const vendors = result.culture.data.commerce.streetVendors;
    assert.ok(vendors.includes('oyster seller'), 'missing oyster seller');
    assert.ok(vendors.includes('newsboy'), 'missing newsboy');
    assert.ok(vendors.includes('boot black'), 'missing boot black');
    assert.ok(vendors.includes('organ grinder'), 'missing organ grinder');
  });

  it('primary language is English', () => {
    assert.equal(result.culture.data.languages.primary, 'English');
  });

  it('secondary languages include German, Italian, Yiddish', () => {
    const sec = result.culture.data.languages.secondary;
    assert.ok(sec.includes('German'), 'missing German');
    assert.ok(sec.includes('Italian'), 'missing Italian');
    assert.ok(sec.includes('Yiddish'), 'missing Yiddish');
  });

  it('currency is USD', () => {
    assert.equal(result.culture.data.commerce.currency, 'USD');
  });

  it('has newspapers', () => {
    assert.ok(result.culture.data.newspapers.length > 0);
  });

  it('music era is early_recording (phonograph existed but rare)', () => {
    assert.equal(result.music.data.era, 'early_recording');
  });

  it('music formats include parlor_piano and street_musician', () => {
    const formats = result.music.data.formats;
    assert.ok(formats.includes('parlor_piano'), 'missing parlor_piano');
    assert.ok(formats.includes('street_musician'), 'missing street_musician');
  });
});

// ---------------------------------------------------------------------------
// researchCulture — 1978 (counterculture)
// ---------------------------------------------------------------------------

describe('Cultural Agent — 1978', () => {
  const result = researchCulture({
    location: 'Baton Rouge, LA',
    year: 1978,
    countryCode: 'US',
    population: 220_000
  });

  it('culture era is counterculture', () => {
    assert.equal(result.culture.data.eraKey, 'counterculture');
  });

  it('music era is broadcast_tv', () => {
    assert.equal(result.music.data.era, 'broadcast_tv');
  });

  it('music formats include vinyl_record and radio', () => {
    const formats = result.music.data.formats;
    assert.ok(formats.includes('vinyl_record'), 'missing vinyl_record');
    assert.ok(formats.includes('radio'), 'missing radio');
  });

  it('has rock in genre weights', () => {
    assert.ok(result.music.data.genreWeights.rock > 0);
  });
});

// ---------------------------------------------------------------------------
// Population affects vendor count
// ---------------------------------------------------------------------------

describe('Cultural Agent — population affects vendors', () => {
  it('large city gets more vendors than small town', () => {
    const big = researchCulture({ location: 'NYC', year: 1884, population: 1_200_000 });
    const small = researchCulture({ location: 'Village', year: 1884, population: 5_000 });

    assert.ok(
      big.culture.data.commerce.vendorDensity > small.culture.data.commerce.vendorDensity,
      `big city ${big.culture.data.commerce.vendorDensity} should be > small town ${small.culture.data.commerce.vendorDensity}`
    );
  });

  it('small population trims vendor variety', () => {
    const big = researchCulture({ location: 'NYC', year: 1884, population: 1_000_000 });
    const tiny = researchCulture({ location: 'Hamlet', year: 1884, population: 2_000 });

    assert.ok(
      big.culture.data.commerce.streetVendors.length > tiny.culture.data.commerce.streetVendors.length,
      `big city vendor types ${big.culture.data.commerce.streetVendors.length} should be > tiny ${tiny.culture.data.commerce.streetVendors.length}`
    );
  });

  it('no population provided still returns vendors', () => {
    const result = researchCulture({ location: 'Test', year: 1884 });
    assert.ok(result.culture.data.commerce.streetVendors.length > 0);
    assert.ok(result.culture.data.commerce.vendorDensity > 0);
  });
});

// ---------------------------------------------------------------------------
// Confidence varies by era
// ---------------------------------------------------------------------------

describe('Cultural Agent — confidence by era', () => {
  it('modern era has higher culture confidence than colonial', () => {
    const modern = researchCulture({ location: 'Test', year: 2020 });
    const colonial = researchCulture({ location: 'Test', year: 1750 });
    assert.ok(
      modern.culture.confidence > colonial.culture.confidence,
      `modern ${modern.culture.confidence} should be > colonial ${colonial.culture.confidence}`
    );
  });

  it('streaming era has higher music confidence than pre_recording', () => {
    const streaming = researchCulture({ location: 'Test', year: 2020 });
    const preRec = researchCulture({ location: 'Test', year: 1800 });
    assert.ok(
      streaming.music.confidence > preRec.music.confidence,
      `streaming ${streaming.music.confidence} should be > pre_recording ${preRec.music.confidence}`
    );
  });

  it('all confidence values are between 0 and 1', () => {
    for (const year of [1750, 1830, 1884, 1910, 1930, 1955, 1978, 2020]) {
      const result = researchCulture({ location: 'Test', year });
      assert.ok(result.culture.confidence >= 0 && result.culture.confidence <= 1,
        `culture confidence ${result.culture.confidence} for ${year}`);
      assert.ok(result.music.confidence >= 0 && result.music.confidence <= 1,
        `music confidence ${result.music.confidence} for ${year}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Country code handling
// ---------------------------------------------------------------------------

describe('Cultural Agent — country codes', () => {
  it('GB gets English primary with Welsh secondary', () => {
    const result = researchCulture({ location: 'London', year: 1884, countryCode: 'GB' });
    assert.equal(result.culture.data.languages.primary, 'English');
    assert.ok(result.culture.data.languages.secondary.includes('Welsh'));
  });

  it('FR gets French primary', () => {
    const result = researchCulture({ location: 'Paris', year: 1884, countryCode: 'FR' });
    assert.equal(result.culture.data.languages.primary, 'French');
  });

  it('unknown country falls back to _default', () => {
    const result = researchCulture({ location: 'Tokyo', year: 1884, countryCode: 'JP' });
    assert.ok(result.culture.data.languages.primary, 'has a primary language');
  });

  it('defaults to US when no countryCode provided', () => {
    const result = researchCulture({ location: 'Test', year: 1884 });
    // US gilded_age should have German, Italian, Yiddish
    const sec = result.culture.data.languages.secondary;
    assert.ok(sec.includes('German'));
  });
});

// ---------------------------------------------------------------------------
// Music format matches year
// ---------------------------------------------------------------------------

describe('Cultural Agent — music format matches year', () => {
  it('1884 has early_recording formats (phonograph, cylinder_record)', () => {
    const { music } = researchCulture({ location: 'Test', year: 1884 });
    assert.equal(music.data.era, 'early_recording');
    assert.ok(music.data.formats.includes('phonograph'));
  });

  it('1978 has broadcast_tv formats (vinyl_record, cassette_tape)', () => {
    const { music } = researchCulture({ location: 'Test', year: 1978 });
    assert.equal(music.data.era, 'broadcast_tv');
    assert.ok(music.data.formats.includes('vinyl_record'));
    assert.ok(music.data.formats.includes('cassette_tape'));
  });

  it('2020 has streaming formats', () => {
    const { music } = researchCulture({ location: 'Test', year: 2020 });
    assert.equal(music.data.era, 'streaming');
    assert.ok(music.data.formats.includes('streaming'));
  });

  it('1750 has pre_recording formats (no phonograph)', () => {
    const { music } = researchCulture({ location: 'Test', year: 1750 });
    assert.equal(music.data.era, 'pre_recording');
    assert.ok(!music.data.formats.includes('phonograph'));
    assert.ok(music.data.formats.includes('barrel_organ'));
  });
});
