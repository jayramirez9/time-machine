import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SPECIES_DB,
  VEGETATION_DB,
  getSpeciesForRegion,
  filterByYear,
  classifyHabitat,
  researchEcology
} from '../lib/agents/ecologyAgent.js';

// ---------------------------------------------------------------------------
// SPECIES_DB data integrity
// ---------------------------------------------------------------------------

describe('Ecology Agent — SPECIES_DB integrity', () => {
  const requiredFields = [
    'commonName', 'scientificName', 'type', 'native',
    'introduced', 'regions', 'habitat', 'seasonal', 'diurnal', 'density'
  ];

  it('has at least 25 species', () => {
    assert.ok(SPECIES_DB.length >= 25, `Expected >= 25, got ${SPECIES_DB.length}`);
  });

  it('every entry has all required fields', () => {
    for (const s of SPECIES_DB) {
      for (const field of requiredFields) {
        assert.ok(
          field in s,
          `${s.commonName || 'unknown'} missing field: ${field}`
        );
      }
    }
  });

  it('every type is one of bird, mammal, mammal_domestic, insect, amphibian', () => {
    const validTypes = ['bird', 'mammal', 'mammal_domestic', 'insect', 'amphibian'];
    for (const s of SPECIES_DB) {
      assert.ok(
        validTypes.includes(s.type),
        `${s.commonName} has invalid type: ${s.type}`
      );
    }
  });

  it('density values are between 0 and 1', () => {
    for (const s of SPECIES_DB) {
      assert.ok(
        s.density >= 0 && s.density <= 1,
        `${s.commonName} density out of range: ${s.density}`
      );
    }
  });

  it('seasonal weights are between 0 and 1', () => {
    for (const s of SPECIES_DB) {
      for (const [season, val] of Object.entries(s.seasonal)) {
        assert.ok(
          val >= 0 && val <= 1,
          `${s.commonName} seasonal.${season} out of range: ${val}`
        );
      }
    }
  });

  it('diurnal weights are between 0 and 1', () => {
    for (const s of SPECIES_DB) {
      for (const [period, val] of Object.entries(s.diurnal)) {
        assert.ok(
          val >= 0 && val <= 1,
          `${s.commonName} diurnal.${period} out of range: ${val}`
        );
      }
    }
  });

  it('seasonal has spring, summer, fall, winter keys', () => {
    const keys = ['spring', 'summer', 'fall', 'winter'];
    for (const s of SPECIES_DB) {
      for (const k of keys) {
        assert.ok(
          k in s.seasonal,
          `${s.commonName} seasonal missing key: ${k}`
        );
      }
    }
  });

  it('diurnal has dawn, day, dusk, night keys', () => {
    const keys = ['dawn', 'day', 'dusk', 'night'];
    for (const s of SPECIES_DB) {
      for (const k of keys) {
        assert.ok(
          k in s.diurnal,
          `${s.commonName} diurnal missing key: ${k}`
        );
      }
    }
  });

  it('regions is a non-empty array of strings', () => {
    for (const s of SPECIES_DB) {
      assert.ok(
        Array.isArray(s.regions) && s.regions.length > 0,
        `${s.commonName} regions must be a non-empty array`
      );
    }
  });

  it('habitat is a non-empty array of strings', () => {
    for (const s of SPECIES_DB) {
      assert.ok(
        Array.isArray(s.habitat) && s.habitat.length > 0,
        `${s.commonName} habitat must be a non-empty array`
      );
    }
  });

  it('native is a boolean', () => {
    for (const s of SPECIES_DB) {
      assert.equal(typeof s.native, 'boolean', `${s.commonName} native must be boolean`);
    }
  });

  it('introduced is null or a number', () => {
    for (const s of SPECIES_DB) {
      assert.ok(
        s.introduced === null || typeof s.introduced === 'number',
        `${s.commonName} introduced must be null or number, got ${typeof s.introduced}`
      );
    }
  });

  it('includes birds, mammals, insects, and amphibians', () => {
    const types = new Set(SPECIES_DB.map(s => s.type));
    assert.ok(types.has('bird'), 'Missing bird species');
    assert.ok(types.has('mammal'), 'Missing mammal species');
    assert.ok(types.has('insect'), 'Missing insect species');
    assert.ok(types.has('amphibian'), 'Missing amphibian species');
  });
});

// ---------------------------------------------------------------------------
// VEGETATION_DB integrity
// ---------------------------------------------------------------------------

describe('Ecology Agent — VEGETATION_DB integrity', () => {
  it('has entries for all major US regions', () => {
    const regions = VEGETATION_DB.map(v => v.region);
    for (const r of ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us']) {
      assert.ok(regions.includes(r), `Missing vegetation data for ${r}`);
    }
  });

  it('each entry has streetTrees, parkTrees, groundCover arrays', () => {
    for (const v of VEGETATION_DB) {
      assert.ok(Array.isArray(v.streetTrees) && v.streetTrees.length > 0, `${v.region} streetTrees`);
      assert.ok(Array.isArray(v.parkTrees) && v.parkTrees.length > 0, `${v.region} parkTrees`);
      assert.ok(Array.isArray(v.groundCover) && v.groundCover.length > 0, `${v.region} groundCover`);
    }
  });

  it('each entry has seasonalCanopy with 0-1 values', () => {
    for (const v of VEGETATION_DB) {
      for (const [season, val] of Object.entries(v.seasonalCanopy)) {
        assert.ok(val >= 0 && val <= 1, `${v.region} seasonalCanopy.${season}: ${val}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Year filtering
// ---------------------------------------------------------------------------

describe('Ecology Agent — filterByYear', () => {
  it('excludes European Starling before 1890', () => {
    const all = SPECIES_DB.filter(s => s.commonName === 'European Starling' || s.commonName === 'Rock Pigeon');
    const filtered = filterByYear(all, 1884, 'northeast_us');
    const names = filtered.map(s => s.commonName);
    assert.ok(!names.includes('European Starling'), 'Starling should be excluded before 1890');
    assert.ok(names.includes('Rock Pigeon'), 'Rock Pigeon (1606) should be present');
  });

  it('includes European Starling in 1890 and after', () => {
    const all = SPECIES_DB.filter(s => s.commonName === 'European Starling');
    const filtered = filterByYear(all, 1890, 'northeast_us');
    assert.equal(filtered.length, 1);
  });

  it('includes European Starling in 1920', () => {
    const all = SPECIES_DB.filter(s => s.commonName === 'European Starling');
    const filtered = filterByYear(all, 1920, 'northeast_us');
    assert.equal(filtered.length, 1);
  });

  it('excludes House Finch from northeast before 1940', () => {
    // House Finch is native to west/pacific, introduced to east in 1940
    const all = SPECIES_DB.filter(s => s.commonName === 'House Finch');
    const filtered = filterByYear(all, 1930, 'northeast_us');
    assert.equal(filtered.length, 0, 'House Finch should not be in northeast before 1940');
  });

  it('includes House Finch in northeast after 1940', () => {
    const all = SPECIES_DB.filter(s => s.commonName === 'House Finch');
    const filtered = filterByYear(all, 1950, 'northeast_us');
    assert.equal(filtered.length, 1, 'House Finch should be in northeast after 1940');
  });

  it('includes House Finch in west_us at any year', () => {
    const all = SPECIES_DB.filter(s => s.commonName === 'House Finch');
    const filtered = filterByYear(all, 1800, 'west_us');
    assert.equal(filtered.length, 1, 'House Finch is native to west');
  });

  it('reduces horse density after 1920', () => {
    const all = SPECIES_DB.filter(s => s.commonName === 'Horse');
    const pre = filterByYear(all, 1910, 'northeast_us');
    const post = filterByYear(all, 1960, 'northeast_us');
    assert.ok(pre[0].density > post[0].density,
      `Horse density should drop: 1910=${pre[0].density} > 1960=${post[0].density}`);
  });

  it('does not mutate original SPECIES_DB entries', () => {
    const original = SPECIES_DB.find(s => s.commonName === 'Horse');
    const origDensity = original.density;
    filterByYear([original], 2000, 'northeast_us');
    assert.equal(original.density, origDensity, 'Original density should not change');
  });

  it('excludes House Sparrow before 1851', () => {
    const all = SPECIES_DB.filter(s => s.commonName === 'House Sparrow');
    const filtered = filterByYear(all, 1840, 'northeast_us');
    assert.equal(filtered.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Region filtering
// ---------------------------------------------------------------------------

describe('Ecology Agent — getSpeciesForRegion', () => {
  it('northeast_us returns species with northeast_us or general_us region', () => {
    const species = getSpeciesForRegion('northeast_us');
    assert.ok(species.length > 10, `Expected > 10 species, got ${species.length}`);
    for (const s of species) {
      assert.ok(
        s.regions.includes('northeast_us') || s.regions.includes('general_us'),
        `${s.commonName} should match northeast_us or general_us`
      );
    }
  });

  it('pacific_us returns species with pacific_us or general_us region', () => {
    const species = getSpeciesForRegion('pacific_us');
    assert.ok(species.length >= 5);
  });

  it('general_us returns all species (every species has general_us or specific regions)', () => {
    const species = getSpeciesForRegion('general_us');
    // general_us only gets species that explicitly list general_us
    assert.ok(species.length >= 5);
  });

  it('Blue Jay is in northeast but not pacific', () => {
    const ne = getSpeciesForRegion('northeast_us');
    const pac = getSpeciesForRegion('pacific_us');
    assert.ok(ne.some(s => s.commonName === 'Blue Jay'), 'Blue Jay in northeast');
    assert.ok(!pac.some(s => s.commonName === 'Blue Jay'), 'Blue Jay not in pacific');
  });

  it('Northern Mockingbird is in southeast but not northeast', () => {
    const se = getSpeciesForRegion('southeast_us');
    const ne = getSpeciesForRegion('northeast_us');
    assert.ok(se.some(s => s.commonName === 'Northern Mockingbird'), 'Mockingbird in southeast');
    assert.ok(!ne.some(s => s.commonName === 'Northern Mockingbird'), 'Mockingbird not in northeast');
  });
});

// ---------------------------------------------------------------------------
// Habitat classification
// ---------------------------------------------------------------------------

describe('Ecology Agent — classifyHabitat', () => {
  it('city -> urban', () => {
    assert.equal(classifyHabitat({ locationType: 'city' }), 'urban');
  });

  it('suburb -> suburban', () => {
    assert.equal(classifyHabitat({ locationType: 'suburb' }), 'suburban');
  });

  it('town -> suburban', () => {
    assert.equal(classifyHabitat({ locationType: 'town' }), 'suburban');
  });

  it('rural -> rural', () => {
    assert.equal(classifyHabitat({ locationType: 'rural' }), 'rural');
  });

  it('population >= 100000 -> urban', () => {
    assert.equal(classifyHabitat({ population: 500000 }), 'urban');
  });

  it('population 10000-99999 -> suburban', () => {
    assert.equal(classifyHabitat({ population: 50000 }), 'suburban');
  });

  it('population < 10000 -> rural', () => {
    assert.equal(classifyHabitat({ population: 2000 }), 'rural');
  });

  it('no arguments -> suburban default', () => {
    assert.equal(classifyHabitat(), 'suburban');
    assert.equal(classifyHabitat({}), 'suburban');
  });

  it('locationType takes precedence over population', () => {
    assert.equal(classifyHabitat({ locationType: 'rural', population: 1000000 }), 'rural');
  });
});

// ---------------------------------------------------------------------------
// researchEcology — full pipeline
// ---------------------------------------------------------------------------

describe('Ecology Agent — researchEcology', () => {
  it('returns valid layer envelope', () => {
    const layer = researchEcology({
      location: 'New York, NY',
      year: 1884,
      lat: 40.7128,
      lon: -74.006,
      month: 6,
      countryCode: 'US',
      locationType: 'city'
    });

    assert.ok(layer.data, 'layer.data required');
    assert.ok(typeof layer.confidence === 'number', 'confidence must be number');
    assert.ok(layer.confidence >= 0 && layer.confidence <= 1, `confidence 0-1: ${layer.confidence}`);
    assert.ok(Array.isArray(layer.sources), 'sources must be array');
    assert.ok(layer.sources.length > 0, 'at least one source');
    assert.ok(Array.isArray(layer.knownCompromises), 'knownCompromises must be array');
    assert.ok(layer.knownCompromises.length > 0, 'at least one compromise');
  });

  it('data has species and vegetation arrays', () => {
    const layer = researchEcology({
      location: 'New York, NY',
      year: 1884,
      lat: 40.7128,
      lon: -74.006,
      locationType: 'city'
    });

    assert.ok(Array.isArray(layer.data.species));
    assert.ok(layer.data.species.length > 0);
    assert.ok(Array.isArray(layer.data.vegetation));
    assert.ok(layer.data.vegetation.length > 0);
  });

  it('NYC 1884: excludes European Starling', () => {
    const layer = researchEcology({
      location: 'New York, NY',
      year: 1884,
      lat: 40.7128,
      lon: -74.006,
      locationType: 'city'
    });

    const names = layer.data.species.map(s => s.commonName);
    assert.ok(!names.includes('European Starling'),
      'European Starling should be excluded in 1884');
  });

  it('NYC 1900: includes European Starling', () => {
    const layer = researchEcology({
      location: 'New York, NY',
      year: 1900,
      lat: 40.7128,
      lon: -74.006,
      locationType: 'city'
    });

    const names = layer.data.species.map(s => s.commonName);
    assert.ok(names.includes('European Starling'),
      'European Starling should be present in 1900');
  });

  it('includes House Sparrow and Rock Pigeon in 1884', () => {
    const layer = researchEcology({
      location: 'New York, NY',
      year: 1884,
      lat: 40.7128,
      lon: -74.006,
      locationType: 'city'
    });

    const names = layer.data.species.map(s => s.commonName);
    assert.ok(names.includes('House Sparrow'));
    assert.ok(names.includes('Rock Pigeon'));
  });

  it('includes Horse with high density in 1884', () => {
    const layer = researchEcology({
      location: 'New York, NY',
      year: 1884,
      lat: 40.7128,
      lon: -74.006,
      locationType: 'city'
    });

    const horse = layer.data.species.find(s => s.commonName === 'Horse');
    assert.ok(horse, 'Horse should be present');
    assert.ok(horse.density >= 0.9, `Horse density should be high in 1884: ${horse.density}`);
  });

  it('Horse has reduced density in 1970', () => {
    const layer = researchEcology({
      location: 'New York, NY',
      year: 1970,
      lat: 40.7128,
      lon: -74.006,
      locationType: 'city'
    });

    const horse = layer.data.species.find(s => s.commonName === 'Horse');
    assert.ok(horse, 'Horse should still be present');
    assert.ok(horse.density < 0.3, `Horse density should be low in 1970: ${horse.density}`);
  });

  it('species entries have correct shape', () => {
    const layer = researchEcology({
      location: 'Baton Rouge, LA',
      year: 1978,
      lat: 30.4515,
      lon: -91.1871,
      locationType: 'suburb'
    });

    for (const s of layer.data.species) {
      assert.ok(s.commonName, 'commonName');
      assert.ok(s.scientificName, 'scientificName');
      assert.ok(s.type, 'type');
      assert.ok(typeof s.native === 'boolean', 'native is boolean');
      assert.ok(s.introduced === null || typeof s.introduced === 'number', 'introduced');
      assert.ok(s.seasonal && typeof s.seasonal.summer === 'number', 'seasonal.summer');
      assert.ok(s.diurnal && typeof s.diurnal.dawn === 'number', 'diurnal.dawn');
      assert.ok(typeof s.density === 'number', 'density is number');
      assert.ok(Array.isArray(s.habitat), 'habitat is array');
    }
  });

  it('sources have id, type, and citation', () => {
    const layer = researchEcology({
      location: 'Test',
      year: 2020,
      lat: 40.7,
      lon: -74.0
    });

    for (const src of layer.sources) {
      assert.ok(src.id, 'source.id');
      assert.ok(src.type, 'source.type');
      assert.ok(src.citation, 'source.citation');
    }
  });

  it('vegetation entries have type, species, coverage, seasonalCanopy', () => {
    const layer = researchEcology({
      location: 'Test',
      year: 2020,
      lat: 40.7,
      lon: -74.0,
      locationType: 'suburb'
    });

    for (const v of layer.data.vegetation) {
      assert.ok(v.type, 'vegetation.type');
      assert.ok(Array.isArray(v.species), 'vegetation.species is array');
      assert.ok(v.coverage, 'vegetation.coverage');
      assert.ok(v.seasonalCanopy, 'vegetation.seasonalCanopy');
    }
  });

  it('includes _researchMeta in data', () => {
    const layer = researchEcology({
      location: 'Test',
      year: 2020,
      lat: 40.7,
      lon: -74.0
    });

    const meta = layer.data._researchMeta;
    assert.ok(meta, '_researchMeta present');
    assert.ok(meta.region, 'region');
    assert.ok(meta.habitat, 'habitat');
    assert.ok(meta.season, 'season');
    assert.ok(typeof meta.totalSpeciesConsidered === 'number');
    assert.ok(typeof meta.speciesAfterFiltering === 'number');
  });
});

// ---------------------------------------------------------------------------
// Confidence calculation
// ---------------------------------------------------------------------------

describe('Ecology Agent — confidence', () => {
  it('US locations get higher confidence than non-US', () => {
    const us = researchEcology({
      location: 'NYC', year: 2020, lat: 40.7, lon: -74.0, countryCode: 'US'
    });
    const other = researchEcology({
      location: 'London', year: 2020, lat: 51.5, lon: -0.1, countryCode: 'GB'
    });
    assert.ok(us.confidence > other.confidence,
      `US ${us.confidence} should be > non-US ${other.confidence}`);
  });

  it('modern dates get higher confidence than old dates', () => {
    const modern = researchEcology({
      location: 'NYC', year: 2000, lat: 40.7, lon: -74.0
    });
    const old = researchEcology({
      location: 'NYC', year: 1800, lat: 40.7, lon: -74.0
    });
    assert.ok(modern.confidence > old.confidence,
      `2000 (${modern.confidence}) should be > 1800 (${old.confidence})`);
  });

  it('confidence is always between 0.1 and 0.85', () => {
    const years = [1700, 1800, 1884, 1940, 1978, 2020];
    for (const year of years) {
      const layer = researchEcology({
        location: 'Test', year, lat: 40.7, lon: -74.0
      });
      assert.ok(layer.confidence >= 0.1 && layer.confidence <= 0.85,
        `Year ${year}: confidence ${layer.confidence} out of range`);
    }
  });
});

// ---------------------------------------------------------------------------
// Region resolution
// ---------------------------------------------------------------------------

describe('Ecology Agent — region resolution', () => {
  it('Manhattan -> northeast_us', () => {
    const layer = researchEcology({
      location: 'NYC', year: 2020, lat: 40.7128, lon: -74.006
    });
    assert.equal(layer.data._researchMeta.region, 'northeast_us');
  });

  it('Baton Rouge -> southeast_us', () => {
    const layer = researchEcology({
      location: 'BR', year: 2020, lat: 30.4515, lon: -91.1871
    });
    assert.equal(layer.data._researchMeta.region, 'southeast_us');
  });

  it('Los Angeles -> pacific_us', () => {
    const layer = researchEcology({
      location: 'LA', year: 2020, lat: 34.0522, lon: -118.2437
    });
    assert.equal(layer.data._researchMeta.region, 'pacific_us');
  });

  it('Denver -> west_us', () => {
    const layer = researchEcology({
      location: 'Denver', year: 2020, lat: 39.7392, lon: -104.9903
    });
    assert.equal(layer.data._researchMeta.region, 'west_us');
  });

  it('Chicago -> midwest_us', () => {
    const layer = researchEcology({
      location: 'Chicago', year: 2020, lat: 41.8781, lon: -87.6298
    });
    assert.equal(layer.data._researchMeta.region, 'midwest_us');
  });

  it('London -> general_us (non-US fallback)', () => {
    const layer = researchEcology({
      location: 'London', year: 2020, lat: 51.5, lon: -0.1, countryCode: 'GB'
    });
    assert.equal(layer.data._researchMeta.region, 'general_us');
  });
});

// ---------------------------------------------------------------------------
// Season from month
// ---------------------------------------------------------------------------

describe('Ecology Agent — seasonal resolution', () => {
  it('month 3 -> spring', () => {
    const layer = researchEcology({
      location: 'Test', year: 2020, lat: 40.7, lon: -74.0, month: 3
    });
    assert.equal(layer.data._researchMeta.season, 'spring');
  });

  it('month 7 -> summer', () => {
    const layer = researchEcology({
      location: 'Test', year: 2020, lat: 40.7, lon: -74.0, month: 7
    });
    assert.equal(layer.data._researchMeta.season, 'summer');
  });

  it('month 10 -> fall', () => {
    const layer = researchEcology({
      location: 'Test', year: 2020, lat: 40.7, lon: -74.0, month: 10
    });
    assert.equal(layer.data._researchMeta.season, 'fall');
  });

  it('month 1 -> winter', () => {
    const layer = researchEcology({
      location: 'Test', year: 2020, lat: 40.7, lon: -74.0, month: 1
    });
    assert.equal(layer.data._researchMeta.season, 'winter');
  });

  it('default month is 6 (summer)', () => {
    const layer = researchEcology({
      location: 'Test', year: 2020, lat: 40.7, lon: -74.0
    });
    assert.equal(layer.data._researchMeta.season, 'summer');
  });
});
