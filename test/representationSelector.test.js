import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectRepresentation,
  summarizeRegimes,
  DEFAULT_THRESHOLDS,
  REGIMES,
  METHODS,
} from '../lib/representationSelector.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A demolished background tenement with decent dating evidence — the default
// procedural case.
const demolishedBackground = {
  survivesToday: false,
  hasModernCapture: false,
  isHero: false,
  photoCount: 0,
  photoMaxResolutionPx: 0,
  evidenceConfidence: 0.6,
};

// Trinity Church as the spike actually found it: a surviving hero, but only
// sparse low-res archival photos and no modern capture done yet.
const trinityArchival = {
  survivesToday: true,
  hasModernCapture: false,
  isHero: true,
  photoCount: 5,
  photoMaxResolutionPx: 640,
  evidenceConfidence: 0.7,
};

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

describe('selectRepresentation output shape', () => {
  it('returns regime, method, reason, confidence', () => {
    const d = selectRepresentation(demolishedBackground);
    assert.ok(REGIMES.includes(d.regime), `regime ${d.regime} valid`);
    assert.ok(METHODS.includes(d.method), `method ${d.method} valid`);
    assert.equal(typeof d.reason, 'string');
    assert.ok(d.reason.length > 0, 'reason non-empty');
    assert.ok(typeof d.confidence === 'number' && d.confidence >= 0 && d.confidence <= 1);
  });

  it('is deterministic for identical input', () => {
    const a = selectRepresentation(trinityArchival);
    const b = selectRepresentation(trinityArchival);
    assert.deepEqual(a, b);
  });
});

// ---------------------------------------------------------------------------
// Decision table (PRD §17)
// ---------------------------------------------------------------------------

describe('capture regime — splat_modern', () => {
  it('surviving structure with modern capture → splat_modern (even non-hero)', () => {
    const d = selectRepresentation({
      survivesToday: true,
      hasModernCapture: true,
      isHero: false,
      photoCount: 0,
      photoMaxResolutionPx: 0,
      evidenceConfidence: 0.8,
    });
    assert.equal(d.regime, 'capture');
    assert.equal(d.method, 'splat_modern');
  });

  it('modern capture floors confidence high regardless of archival evidence', () => {
    const d = selectRepresentation({
      survivesToday: true, hasModernCapture: true, isHero: false,
      photoCount: 0, photoMaxResolutionPx: 0, evidenceConfidence: 0.4,
    });
    assert.ok(d.confidence >= 0.9, `expected >=0.9, got ${d.confidence}`);
  });

  it('Trinity (survives) → splat_modern once modern capture is available (Arm B2 ceiling)', () => {
    const d = selectRepresentation({ ...trinityArchival, hasModernCapture: true });
    assert.equal(d.method, 'splat_modern');
  });
});

describe('capture regime — splat_archival', () => {
  it('hero with enough photos and resolution → splat_archival', () => {
    const d = selectRepresentation({
      survivesToday: false, hasModernCapture: false, isHero: true,
      photoCount: 6, photoMaxResolutionPx: 2000, evidenceConfidence: 0.7,
    });
    assert.equal(d.regime, 'capture');
    assert.equal(d.method, 'splat_archival');
  });

  it('boundary: exactly at min photos and min resolution still qualifies', () => {
    const d = selectRepresentation({
      survivesToday: false, hasModernCapture: false, isHero: true,
      photoCount: DEFAULT_THRESHOLDS.splatArchivalMinPhotos,
      photoMaxResolutionPx: DEFAULT_THRESHOLDS.splatArchivalMinResolutionPx,
      evidenceConfidence: 0.7,
    });
    assert.equal(d.method, 'splat_archival');
  });
});

describe('procedural regime — mesh_meshy (hero fallback)', () => {
  it('THE Trinity spike case: hero, enough photos but low-res → mesh_meshy', () => {
    const d = selectRepresentation(trinityArchival);
    assert.equal(d.regime, 'procedural');
    assert.equal(d.method, 'mesh_meshy');
    assert.match(d.reason, /resolution|sparse|archival/i);
  });

  it('hero with one photo below the count gate → mesh_meshy', () => {
    const d = selectRepresentation({
      survivesToday: false, hasModernCapture: false, isHero: true,
      photoCount: DEFAULT_THRESHOLDS.splatArchivalMinPhotos - 1,
      photoMaxResolutionPx: 3000, evidenceConfidence: 0.7,
    });
    assert.equal(d.method, 'mesh_meshy');
  });

  it('hero with no photos at all → mesh_meshy', () => {
    const d = selectRepresentation({
      survivesToday: false, hasModernCapture: false, isHero: true,
      photoCount: 0, photoMaxResolutionPx: 0, evidenceConfidence: 0.7,
    });
    assert.equal(d.method, 'mesh_meshy');
  });
});

describe('procedural regime — massing_procedural', () => {
  it('demolished background with decent evidence → massing_procedural', () => {
    const d = selectRepresentation(demolishedBackground);
    assert.equal(d.regime, 'procedural');
    assert.equal(d.method, 'massing_procedural');
    assert.equal(d.confidence, 0.6);
  });

  it('low evidence below floor → massing_procedural, reduced detail, low confidence', () => {
    const d = selectRepresentation({
      survivesToday: false, hasModernCapture: false, isHero: false,
      photoCount: 0, photoMaxResolutionPx: 0, evidenceConfidence: 0.15,
    });
    assert.equal(d.method, 'massing_procedural');
    assert.match(d.reason, /floor|reduce detail|5\.5|neutral/i);
    assert.ok(d.confidence < DEFAULT_THRESHOLDS.evidenceConfidenceFloor);
  });
});

// ---------------------------------------------------------------------------
// Threshold overrides
// ---------------------------------------------------------------------------

describe('threshold overrides', () => {
  it('lowering the resolution gate lets Trinity attempt splat_archival', () => {
    const d = selectRepresentation(trinityArchival, {
      thresholds: { splatArchivalMinResolutionPx: 600 },
    });
    assert.equal(d.method, 'splat_archival');
  });

  it('missing photo fields default to zero (no throw)', () => {
    const d = selectRepresentation({
      survivesToday: false, hasModernCapture: false, isHero: true,
      evidenceConfidence: 0.7,
    });
    assert.equal(d.method, 'mesh_meshy');
  });
});

// ---------------------------------------------------------------------------
// Precedence
// ---------------------------------------------------------------------------

describe('precedence', () => {
  it('modern capture wins over archival splat eligibility', () => {
    const d = selectRepresentation({
      survivesToday: true, hasModernCapture: true, isHero: true,
      photoCount: 10, photoMaxResolutionPx: 4000, evidenceConfidence: 0.8,
    });
    assert.equal(d.method, 'splat_modern');
  });

  it('hero intent wins over the low-confidence floor (heroes are not silenced)', () => {
    const d = selectRepresentation({
      survivesToday: false, hasModernCapture: false, isHero: true,
      photoCount: 0, photoMaxResolutionPx: 0, evidenceConfidence: 0.1,
    });
    assert.equal(d.method, 'mesh_meshy');
  });
});

// ---------------------------------------------------------------------------
// Batch summary (for the accuracy manifest)
// ---------------------------------------------------------------------------

describe('summarizeRegimes', () => {
  it('counts methods and regimes across decisions', () => {
    const decisions = [
      selectRepresentation(demolishedBackground),
      selectRepresentation(trinityArchival),
      selectRepresentation({ survivesToday: true, hasModernCapture: true, isHero: false, evidenceConfidence: 0.8 }),
    ];
    const s = summarizeRegimes(decisions);
    assert.equal(s.total, 3);
    assert.equal(s.capture, 1);
    assert.equal(s.procedural, 2);
    assert.equal(s.byMethod.massing_procedural, 1);
    assert.equal(s.byMethod.mesh_meshy, 1);
    assert.equal(s.byMethod.splat_modern, 1);
  });

  it('handles an empty list', () => {
    const s = summarizeRegimes([]);
    assert.equal(s.total, 0);
    assert.equal(s.capture, 0);
    assert.equal(s.procedural, 0);
  });
});
