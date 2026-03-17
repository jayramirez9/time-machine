import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROAD_SURFACES_BY_ERA,
  ACOUSTIC_PROPERTIES,
  INFRASTRUCTURE_TIMELINE,
  FACADE_MATERIALS_BY_ERA,
  ROOFING_BY_ERA,
  resolveRoadEra,
  getInfrastructureForYear,
  getPrimaryLighting,
  researchMaterials,
  researchInfrastructure
} from '../lib/agents/materialsInfraAgent.js';

// ---------------------------------------------------------------------------
// Data integrity
// ---------------------------------------------------------------------------

describe('Materials/Infra Agent — data integrity', () => {
  it('ROAD_SURFACES_BY_ERA has all era keys', () => {
    const eras = ['pre_1800', 'early_1800s', 'mid_1800s', 'gilded_age',
      'progressive', 'interwar', 'postwar', 'modern'];
    for (const era of eras) {
      assert.ok(ROAD_SURFACES_BY_ERA[era], `Missing era: ${era}`);
      assert.ok(ROAD_SURFACES_BY_ERA[era].primary);
      assert.ok(ROAD_SURFACES_BY_ERA[era].residential);
    }
  });

  it('ACOUSTIC_PROPERTIES has numeric values', () => {
    for (const [surface, props] of Object.entries(ACOUSTIC_PROPERTIES)) {
      assert.ok(typeof props.reverbSend === 'number', `${surface}.reverbSend`);
      assert.ok(typeof props.impactHardness === 'number', `${surface}.impactHardness`);
      assert.ok(props.impactHardness >= 0 && props.impactHardness <= 1,
        `${surface}.impactHardness should be 0-1`);
    }
  });

  it('INFRASTRUCTURE_TIMELINE entries have required fields', () => {
    for (const item of INFRASTRUCTURE_TIMELINE) {
      assert.ok(item.type, `Missing type for ${item.item}`);
      assert.ok(item.item, 'Missing item');
      assert.ok(item.label, `Missing label for ${item.item}`);
      assert.ok(['lighting', 'transport', 'communication', 'utility'].includes(item.type),
        `Invalid type ${item.type} for ${item.item}`);
    }
  });

  it('FACADE_MATERIALS_BY_ERA covers all road eras', () => {
    for (const era of Object.keys(ROAD_SURFACES_BY_ERA)) {
      assert.ok(FACADE_MATERIALS_BY_ERA[era], `Missing facade era: ${era}`);
      assert.ok(FACADE_MATERIALS_BY_ERA[era].length > 0);
    }
  });

  it('ROOFING_BY_ERA covers all road eras', () => {
    for (const era of Object.keys(ROAD_SURFACES_BY_ERA)) {
      assert.ok(ROOFING_BY_ERA[era], `Missing roofing era: ${era}`);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveRoadEra
// ---------------------------------------------------------------------------

describe('Materials/Infra Agent — resolveRoadEra', () => {
  it('1750 → pre_1800', () => assert.equal(resolveRoadEra(1750), 'pre_1800'));
  it('1820 → early_1800s', () => assert.equal(resolveRoadEra(1820), 'early_1800s'));
  it('1860 → mid_1800s', () => assert.equal(resolveRoadEra(1860), 'mid_1800s'));
  it('1884 → gilded_age', () => assert.equal(resolveRoadEra(1884), 'gilded_age'));
  it('1910 → progressive', () => assert.equal(resolveRoadEra(1910), 'progressive'));
  it('1935 → interwar', () => assert.equal(resolveRoadEra(1935), 'interwar'));
  it('1978 → postwar', () => assert.equal(resolveRoadEra(1978), 'postwar'));
  it('2020 → modern', () => assert.equal(resolveRoadEra(2020), 'modern'));
});

// ---------------------------------------------------------------------------
// getInfrastructureForYear
// ---------------------------------------------------------------------------

describe('Materials/Infra Agent — getInfrastructureForYear', () => {
  it('1884 has gas lamps', () => {
    const infra = getInfrastructureForYear(1884);
    assert.ok(infra.lighting.some(l => l.item === 'gas_lamp'));
  });

  it('1884 has horse-drawn transport', () => {
    const infra = getInfrastructureForYear(1884);
    assert.ok(infra.transport.some(t => t.item === 'horse_drawn'));
  });

  it('1884 has elevated railway', () => {
    const infra = getInfrastructureForYear(1884);
    assert.ok(infra.transport.some(t => t.item === 'elevated_railway'));
  });

  it('1884 has NO automobile', () => {
    const infra = getInfrastructureForYear(1884);
    assert.ok(!infra.transport.some(t => t.item === 'automobile'));
  });

  it('1884 has NO subway', () => {
    const infra = getInfrastructureForYear(1884);
    assert.ok(!infra.transport.some(t => t.item === 'subway'));
  });

  it('1884 has telegraph', () => {
    const infra = getInfrastructureForYear(1884);
    assert.ok(infra.communication.some(c => c.item === 'telegraph'));
  });

  it('1884 has telephone (limited)', () => {
    const infra = getInfrastructureForYear(1884);
    assert.ok(infra.communication.some(c => c.item === 'telephone'));
  });

  it('1978 has automobile', () => {
    const infra = getInfrastructureForYear(1978);
    assert.ok(infra.transport.some(t => t.item === 'automobile'));
  });

  it('1978 has NO horse-drawn (superseded + 20 years)', () => {
    const infra = getInfrastructureForYear(1978);
    assert.ok(!infra.transport.some(t => t.item === 'horse_drawn'));
  });

  it('1978 has television', () => {
    const infra = getInfrastructureForYear(1978);
    assert.ok(infra.communication.some(c => c.item === 'television'));
  });

  it('1978 has air conditioning', () => {
    const infra = getInfrastructureForYear(1978);
    assert.ok(infra.utility.some(u => u.item === 'air_conditioning'));
  });

  it('1750 has pedestrian but not horse_car', () => {
    const infra = getInfrastructureForYear(1750);
    assert.ok(infra.transport.some(t => t.item === 'pedestrian'));
    assert.ok(!infra.transport.some(t => t.item === 'horse_car'));
  });
});

// ---------------------------------------------------------------------------
// getPrimaryLighting
// ---------------------------------------------------------------------------

describe('Materials/Infra Agent — getPrimaryLighting', () => {
  it('1800 → candle_oil', () => {
    assert.equal(getPrimaryLighting(1800).primary, 'candle_oil');
    assert.equal(getPrimaryLighting(1800).electric, false);
  });

  it('1850 → gas', () => {
    assert.equal(getPrimaryLighting(1850).primary, 'gas');
  });

  it('1884 → gas with limited electric', () => {
    const l = getPrimaryLighting(1884);
    assert.equal(l.primary, 'gas');
    assert.equal(l.electric, 'limited');
  });

  it('1920 → electric with gas remaining', () => {
    const l = getPrimaryLighting(1920);
    assert.equal(l.primary, 'electric');
    assert.equal(l.gasRemaining, true);
  });

  it('1960 → electric, no gas', () => {
    const l = getPrimaryLighting(1960);
    assert.equal(l.primary, 'electric');
    assert.equal(l.gasRemaining, false);
  });
});

// ---------------------------------------------------------------------------
// researchMaterials
// ---------------------------------------------------------------------------

describe('Materials/Infra Agent — researchMaterials', () => {
  it('returns valid layer envelope', () => {
    const layer = researchMaterials({ year: 1884 });
    assert.ok(layer.data);
    assert.ok(typeof layer.confidence === 'number');
    assert.ok(Array.isArray(layer.sources));
    assert.ok(Array.isArray(layer.knownCompromises));
  });

  it('1884 has belgian_block primary roads', () => {
    const layer = researchMaterials({ year: 1884 });
    assert.equal(layer.data.roads.primary, 'belgian_block');
  });

  it('1884 has no asphalt roads', () => {
    const layer = researchMaterials({ year: 1884 });
    const surfaces = Object.values(layer.data.roads);
    assert.ok(!surfaces.includes('asphalt'));
  });

  it('1978 has asphalt primary roads', () => {
    const layer = researchMaterials({ year: 1978 });
    assert.equal(layer.data.roads.primary, 'asphalt');
  });

  it('has acoustic properties for used surfaces', () => {
    const layer = researchMaterials({ year: 1884 });
    assert.ok(layer.data.acousticProperties.belgian_block);
    assert.ok(layer.data.acousticProperties.cobblestone);
  });

  it('has building facade materials', () => {
    const layer = researchMaterials({ year: 1884 });
    assert.ok(layer.data.buildingFacades.includes('brownstone'));
    assert.ok(layer.data.buildingFacades.includes('cast_iron'));
  });

  it('1978 facades include glass and concrete', () => {
    const layer = researchMaterials({ year: 1978 });
    assert.ok(layer.data.buildingFacades.includes('concrete'));
  });

  it('has roofing materials', () => {
    const layer = researchMaterials({ year: 1884 });
    assert.ok(layer.data.roofing.includes('slate'));
  });

  it('confidence is 0-1', () => {
    for (const year of [1750, 1884, 1978, 2020]) {
      const layer = researchMaterials({ year });
      assert.ok(layer.confidence >= 0 && layer.confidence <= 1, `${year}: ${layer.confidence}`);
    }
  });
});

// ---------------------------------------------------------------------------
// researchInfrastructure
// ---------------------------------------------------------------------------

describe('Materials/Infra Agent — researchInfrastructure', () => {
  it('returns valid layer envelope', () => {
    const layer = researchInfrastructure({ year: 1884 });
    assert.ok(layer.data);
    assert.ok(typeof layer.confidence === 'number');
    assert.ok(Array.isArray(layer.sources));
    assert.ok(Array.isArray(layer.knownCompromises));
  });

  it('1884 has gas primary lighting', () => {
    const layer = researchInfrastructure({ year: 1884 });
    assert.equal(layer.data.lighting.primary, 'gas');
  });

  it('1884 transport includes horse_drawn and elevated_railway', () => {
    const layer = researchInfrastructure({ year: 1884 });
    assert.ok(layer.data.transport.modes.includes('horse_drawn'));
    assert.ok(layer.data.transport.modes.includes('elevated_railway'));
  });

  it('1884 transport excludes automobile and subway', () => {
    const layer = researchInfrastructure({ year: 1884 });
    assert.ok(!layer.data.transport.modes.includes('automobile'));
    assert.ok(!layer.data.transport.modes.includes('subway'));
  });

  it('1978 has electric lighting', () => {
    const layer = researchInfrastructure({ year: 1978 });
    assert.equal(layer.data.lighting.primary, 'electric');
  });

  it('has street furniture from prop catalog', () => {
    const layer = researchInfrastructure({ year: 1884 });
    assert.ok(layer.data.streetFurniture.length > 0);
  });

  it('has public services', () => {
    const layer = researchInfrastructure({ year: 1884 });
    assert.ok(layer.data.publicServices.fire);
    assert.ok(layer.data.publicServices.police);
  });

  it('small population adds compromise about lag', () => {
    const layer = researchInfrastructure({ year: 1884, population: 5000 });
    assert.ok(layer.knownCompromises.some(c => c.includes('lag') || c.includes('Small-town')));
  });

  it('confidence is 0-1', () => {
    for (const year of [1750, 1884, 1978, 2020]) {
      const layer = researchInfrastructure({ year });
      assert.ok(layer.confidence >= 0 && layer.confidence <= 1);
    }
  });
});
