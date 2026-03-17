import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PHOTO_ARCHIVES,
  AVAILABILITY_ERAS,
  matchArchives,
  assessPhotoAvailability,
  researchPhotoArchives
} from '../lib/agents/photoArchiveAgent.js';

// ---------------------------------------------------------------------------
// PHOTO_ARCHIVES data integrity
// ---------------------------------------------------------------------------

describe('Photo Archive Agent — PHOTO_ARCHIVES', () => {
  it('has at least 8 archive entries', () => {
    assert.ok(PHOTO_ARCHIVES.length >= 8, `Expected >= 8, got ${PHOTO_ARCHIVES.length}`);
  });

  it('every archive has required fields', () => {
    for (const archive of PHOTO_ARCHIVES) {
      assert.ok(archive.id, `Archive missing id`);
      assert.ok(archive.name, `${archive.id} missing name`);
      // url can be null for local_historical_societies
      assert.ok(typeof archive.apiAvailable === 'boolean', `${archive.id} apiAvailable must be boolean`);
      assert.ok(archive.coverage, `${archive.id} missing coverage`);
      assert.ok(Array.isArray(archive.coverage.geographic), `${archive.id} coverage.geographic must be array`);
      assert.ok(archive.coverage.temporal, `${archive.id} missing coverage.temporal`);
      assert.ok(Array.isArray(archive.coverage.types), `${archive.id} coverage.types must be array`);
      assert.ok(archive.strengths, `${archive.id} missing strengths`);
      assert.ok(archive.limitations, `${archive.id} missing limitations`);
    }
  });

  it('all archive IDs are unique', () => {
    const ids = PHOTO_ARCHIVES.map(a => a.id);
    const unique = new Set(ids);
    assert.equal(ids.length, unique.size, `Duplicate IDs: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
  });

  it('archives with apiAvailable=true have apiUrl', () => {
    for (const archive of PHOTO_ARCHIVES) {
      if (archive.apiAvailable) {
        assert.ok(archive.apiUrl, `${archive.id} has apiAvailable=true but no apiUrl`);
      }
    }
  });

  it('archives with apiAvailable=false have null apiUrl', () => {
    for (const archive of PHOTO_ARCHIVES) {
      if (!archive.apiAvailable) {
        assert.equal(archive.apiUrl, null, `${archive.id} has apiAvailable=false but non-null apiUrl`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// AVAILABILITY_ERAS data integrity
// ---------------------------------------------------------------------------

describe('Photo Archive Agent — AVAILABILITY_ERAS', () => {
  it('eras cover full timeline without gaps', () => {
    // First era should have null minYear, last should have null maxYear
    assert.equal(AVAILABILITY_ERAS[0].minYear, null);
    assert.equal(AVAILABILITY_ERAS[AVAILABILITY_ERAS.length - 1].maxYear, null);

    // Check adjacent eras connect
    for (let i = 1; i < AVAILABILITY_ERAS.length; i++) {
      const prev = AVAILABILITY_ERAS[i - 1];
      const curr = AVAILABILITY_ERAS[i];
      assert.equal(curr.minYear, prev.maxYear + 1,
        `Gap between ${prev.label} (max ${prev.maxYear}) and ${curr.label} (min ${curr.minYear})`);
    }
  });

  it('all eras have availability 0-1', () => {
    for (const era of AVAILABILITY_ERAS) {
      assert.ok(era.availability >= 0 && era.availability <= 1,
        `${era.label} availability ${era.availability} out of range`);
    }
  });

  it('pre-photography era has zero availability', () => {
    const pre = AVAILABILITY_ERAS.find(e => e.label === 'pre_photography');
    assert.ok(pre);
    assert.equal(pre.availability, 0);
  });
});

// ---------------------------------------------------------------------------
// matchArchives — geographic filtering
// ---------------------------------------------------------------------------

describe('Photo Archive Agent — matchArchives geographic', () => {
  it('NYC location gets NYPL and MCNY', () => {
    const matched = matchArchives({ location: 'New York, NY', year: 1900 });
    const ids = matched.map(a => a.id);
    assert.ok(ids.includes('nypl_digital'), 'Should include NYPL');
    assert.ok(ids.includes('mcny'), 'Should include MCNY');
  });

  it('Manhattan location gets NYC-specific archives', () => {
    const matched = matchArchives({ location: 'Manhattan, NY', year: 1900 });
    const ids = matched.map(a => a.id);
    assert.ok(ids.includes('nypl_digital'));
  });

  it('Chicago does NOT get NYC-specific archives', () => {
    const matched = matchArchives({ location: 'Chicago, IL', year: 1900 });
    const ids = matched.map(a => a.id);
    assert.ok(!ids.includes('nypl_digital'), 'Chicago should not get NYPL');
    assert.ok(!ids.includes('mcny'), 'Chicago should not get MCNY');
  });

  it('Baton Rouge does NOT get NYC archives', () => {
    const matched = matchArchives({ location: 'Baton Rouge, LA', year: 1978 });
    const ids = matched.map(a => a.id);
    assert.ok(!ids.includes('nypl_digital'));
    assert.ok(!ids.includes('mcny'));
  });

  it('national archives match any US location', () => {
    const matched = matchArchives({ location: 'Baton Rouge, LA', year: 1900 });
    const ids = matched.map(a => a.id);
    assert.ok(ids.includes('loc_prints'), 'LOC should match any US location');
    assert.ok(ids.includes('nara'), 'NARA should match any US location');
  });

  it('lat/lon within NYC bounding box triggers NYC archives', () => {
    const matched = matchArchives({ year: 1900, lat: 40.7128, lon: -74.006 });
    const ids = matched.map(a => a.id);
    assert.ok(ids.includes('nypl_digital'));
  });

  it('local_historical_societies matches any location', () => {
    const matched = matchArchives({ location: 'Baton Rouge, LA', year: 1950 });
    const ids = matched.map(a => a.id);
    assert.ok(ids.includes('local_historical_societies'));
  });
});

// ---------------------------------------------------------------------------
// matchArchives — temporal filtering
// ---------------------------------------------------------------------------

describe('Photo Archive Agent — matchArchives temporal', () => {
  it('stereographs match for 1900 (within 1850-1930)', () => {
    const matched = matchArchives({ location: 'New York, NY', year: 1900 });
    const ids = matched.map(a => a.id);
    assert.ok(ids.includes('stereograph_collections'));
  });

  it('stereographs do NOT match for 1950 (after 1930)', () => {
    const matched = matchArchives({ location: 'New York, NY', year: 1950 });
    const ids = matched.map(a => a.id);
    assert.ok(!ids.includes('stereograph_collections'));
  });

  it('Detroit Publishing matches for 1900 (within 1880-1920)', () => {
    const matched = matchArchives({ location: 'New York, NY', year: 1900 });
    const ids = matched.map(a => a.id);
    assert.ok(ids.includes('detroit_publishing'));
  });

  it('Detroit Publishing does NOT match for 1950 (after 1920)', () => {
    const matched = matchArchives({ location: 'New York, NY', year: 1950 });
    const ids = matched.map(a => a.id);
    assert.ok(!ids.includes('detroit_publishing'));
  });

  it('year 1800 matches very few archives', () => {
    const matched = matchArchives({ location: 'New York, NY', year: 1800 });
    // Only local_historical_societies has no temporal limits
    assert.ok(matched.length <= 2, `Expected <= 2 archives for 1800, got ${matched.length}`);
  });

  it('year 2020 matches modern archives but not Detroit Publishing or stereographs', () => {
    const matched = matchArchives({ location: 'New York, NY', year: 2020 });
    const ids = matched.map(a => a.id);
    assert.ok(!ids.includes('detroit_publishing'));
    assert.ok(!ids.includes('stereograph_collections'));
    assert.ok(ids.includes('loc_prints'));
  });
});

// ---------------------------------------------------------------------------
// assessPhotoAvailability
// ---------------------------------------------------------------------------

describe('Photo Archive Agent — assessPhotoAvailability', () => {
  it('pre-1839 returns zero availability', () => {
    const result = assessPhotoAvailability(1820);
    assert.equal(result.availability, 0);
    assert.equal(result.era, 'pre_photography');
  });

  it('1839 returns daguerreotype era', () => {
    const result = assessPhotoAvailability(1839);
    assert.equal(result.era, 'daguerreotype');
    assert.ok(result.availability > 0, 'Daguerreotype era should have nonzero availability');
    assert.ok(result.availability <= 0.1, 'Daguerreotype availability should be very low');
  });

  it('1884 returns golden_age', () => {
    const result = assessPhotoAvailability(1884);
    assert.equal(result.era, 'golden_age');
    assert.ok(result.availability >= 0.7, 'Golden age should have high availability');
  });

  it('1935 returns documentary era', () => {
    const result = assessPhotoAvailability(1935);
    assert.equal(result.era, 'documentary');
  });

  it('1978 returns modern era', () => {
    const result = assessPhotoAvailability(1978);
    assert.equal(result.era, 'modern');
    assert.ok(result.availability >= 0.8);
  });

  it('2020 returns modern era', () => {
    const result = assessPhotoAvailability(2020);
    assert.equal(result.era, 'modern');
  });

  it('always returns era, availability, and description', () => {
    for (const year of [1700, 1839, 1870, 1900, 1935, 1960, 2020]) {
      const result = assessPhotoAvailability(year);
      assert.ok(result.era, `Missing era for ${year}`);
      assert.ok(typeof result.availability === 'number', `Missing availability for ${year}`);
      assert.ok(result.description, `Missing description for ${year}`);
    }
  });

  it('availability increases over time (general trend)', () => {
    const a1700 = assessPhotoAvailability(1700).availability;
    const a1860 = assessPhotoAvailability(1860).availability;
    const a1900 = assessPhotoAvailability(1900).availability;
    const a2000 = assessPhotoAvailability(2000).availability;
    assert.ok(a1700 <= a1860, `1700 (${a1700}) should be <= 1860 (${a1860})`);
    assert.ok(a1860 <= a1900, `1860 (${a1860}) should be <= 1900 (${a1900})`);
    assert.ok(a1900 <= a2000, `1900 (${a1900}) should be <= 2000 (${a2000})`);
  });
});

// ---------------------------------------------------------------------------
// researchPhotoArchives — layer envelope
// ---------------------------------------------------------------------------

describe('Photo Archive Agent — researchPhotoArchives', () => {
  it('returns valid layer envelope', () => {
    const layer = researchPhotoArchives({ location: 'New York, NY', year: 1884 });
    assert.ok(layer.data);
    assert.ok(typeof layer.confidence === 'number');
    assert.ok(Array.isArray(layer.sources));
    assert.ok(Array.isArray(layer.knownCompromises));
  });

  it('confidence is 0-1', () => {
    for (const year of [1700, 1839, 1884, 1935, 1978, 2020]) {
      const layer = researchPhotoArchives({ location: 'New York, NY', year });
      assert.ok(layer.confidence >= 0 && layer.confidence <= 1,
        `Year ${year}: confidence ${layer.confidence} out of range`);
    }
  });

  it('NYC 1884 gets multiple archive matches', () => {
    const layer = researchPhotoArchives({ location: 'New York, NY', year: 1884, lat: 40.7128, lon: -74.006 });
    assert.ok(layer.data.matchedArchives.length >= 4,
      `Expected >= 4 matched archives for NYC 1884, got ${layer.data.matchedArchives.length}`);
    assert.ok(layer.data.archiveCount >= 4);
  });

  it('confidence is higher for well-documented eras (1880-1920) than early eras', () => {
    const golden = researchPhotoArchives({ location: 'New York, NY', year: 1900 });
    const early = researchPhotoArchives({ location: 'New York, NY', year: 1855 });
    assert.ok(golden.confidence > early.confidence,
      `Golden age (${golden.confidence}) should exceed early (${early.confidence})`);
  });

  it('confidence is zero for pre-daguerreotype era', () => {
    const layer = researchPhotoArchives({ location: 'New York, NY', year: 1820 });
    assert.equal(layer.confidence, 0);
  });

  it('sources are generated for matched archives', () => {
    const layer = researchPhotoArchives({ location: 'New York, NY', year: 1900 });
    assert.ok(layer.sources.length > 0);
    for (const src of layer.sources) {
      assert.ok(src.id, 'Source missing id');
      assert.ok(src.type, 'Source missing type');
      assert.equal(src.type, 'photo_archive');
      assert.ok(src.name, 'Source missing name');
      assert.ok(src.citation, 'Source missing citation');
    }
  });

  it('source count matches archive count', () => {
    const layer = researchPhotoArchives({ location: 'New York, NY', year: 1900 });
    assert.equal(layer.sources.length, layer.data.matchedArchives.length);
  });

  it('data includes research summary', () => {
    const layer = researchPhotoArchives({ location: 'Baton Rouge, LA', year: 1978 });
    const summary = layer.data._researchSummary;
    assert.ok(summary);
    assert.ok(summary.totalArchivesEvaluated >= 8);
    assert.ok(typeof summary.matchedCount === 'number');
    assert.ok(summary.photoEra);
    assert.ok(summary.recommendation);
  });

  it('pre-1839 has compromises about no photography', () => {
    const layer = researchPhotoArchives({ location: 'New York, NY', year: 1800 });
    assert.ok(layer.knownCompromises.some(c => c.includes('not yet invented') || c.includes('photography')));
  });

  it('data includes era and availability fields', () => {
    const layer = researchPhotoArchives({ location: 'New York, NY', year: 1884 });
    assert.equal(layer.data.era, 'golden_age');
    assert.ok(layer.data.availability >= 0.7);
    assert.ok(layer.data.eraDescription);
    assert.equal(layer.data.year, 1884);
  });

  it('data reports apiArchiveCount', () => {
    const layer = researchPhotoArchives({ location: 'New York, NY', year: 1900 });
    assert.ok(typeof layer.data.apiArchiveCount === 'number');
    assert.ok(layer.data.apiArchiveCount > 0);
    assert.ok(layer.data.apiArchiveCount <= layer.data.archiveCount);
  });

  it('matched archives are sorted by relevance descending', () => {
    const layer = researchPhotoArchives({ location: 'New York, NY', year: 1900 });
    const relevances = layer.data.matchedArchives.map(a => a.relevance);
    for (let i = 1; i < relevances.length; i++) {
      assert.ok(relevances[i - 1] >= relevances[i],
        `Archives not sorted by relevance: ${relevances[i - 1]} < ${relevances[i]}`);
    }
  });

  it('non-US country code filters out national archives', () => {
    const layer = researchPhotoArchives({ location: 'London, UK', year: 1900, countryCode: 'GB' });
    const ids = layer.data.matchedArchives.map(a => a.id);
    assert.ok(!ids.includes('loc_prints'), 'LOC should not match non-US');
    assert.ok(!ids.includes('nara'), 'NARA should not match non-US');
    // local_historical_societies should still match
    assert.ok(ids.includes('local_historical_societies'));
  });
});
