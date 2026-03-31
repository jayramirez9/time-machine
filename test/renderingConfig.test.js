import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRenderingScript,
  buildLampShadowScript,
  buildNaniteConversionScript,
  configureRendering,
  configureLampShadows,
} from '../lib/renderingConfig.js';
import {
  resolveToneMapping,
  TONE_MAPPING_PRESETS,
} from '../lib/localePresets.js';

describe('Rendering Config', () => {

  // ── Python Script Content ─────────────────────────────────────

  describe('buildRenderingScript', () => {
    const script = buildRenderingScript();

    it('enables Lumen diffuse indirect', () => {
      assert.ok(script.includes('r.Lumen.DiffuseIndirect.Allow'));
    });

    it('enables Lumen reflections', () => {
      assert.ok(script.includes('r.Lumen.Reflections.Allow'));
    });

    it('enables mesh SDF tracing', () => {
      assert.ok(script.includes('r.Lumen.TraceMeshSDFs'));
    });

    it('sets final gather quality', () => {
      assert.ok(script.includes('r.Lumen.ScreenProbeGather.FinalGatherQuality'));
    });

    it('sets Lumen scene detail', () => {
      assert.ok(script.includes('r.Lumen.Scene.Detail'));
    });

    it('reduces sky light leak', () => {
      assert.ok(script.includes('r.Lumen.DirectLighting.AllowSkyLightLeaking'));
    });

    it('enables Virtual Shadow Maps', () => {
      assert.ok(script.includes('r.Shadow.Virtual.Enable'));
    });

    it('enables Nanite', () => {
      assert.ok(script.includes('r.Nanite.Enable'));
    });

    it('configures auto-exposure histogram', () => {
      assert.ok(script.includes('AEM_HISTOGRAM'));
    });

    it('sets exposure brightness range', () => {
      assert.ok(script.includes('auto_exposure_min_brightness'));
      assert.ok(script.includes('auto_exposure_max_brightness'));
    });

    it('creates PostProcessVolume if missing', () => {
      assert.ok(script.includes('TM_PostProcess'));
      assert.ok(script.includes('spawn_actor_from_class'));
    });

    it('sets exposure speed for cinematic feel', () => {
      assert.ok(script.includes('auto_exposure_speed_up'));
      assert.ok(script.includes('auto_exposure_speed_down'));
    });
  });

  describe('buildLampShadowScript', () => {
    const script = buildLampShadowScript();

    it('targets TM_Lamp_ actors', () => {
      assert.ok(script.includes('TM_Lamp_'));
    });

    it('enables cast_shadows', () => {
      assert.ok(script.includes('cast_shadows'));
    });

    it('sets contact_shadow_length', () => {
      assert.ok(script.includes('contact_shadow_length'));
    });

    it('uses PointLight class', () => {
      assert.ok(script.includes('PointLight'));
    });
  });

  describe('buildNaniteConversionScript', () => {
    it('targets default TM_ prefix', () => {
      const script = buildNaniteConversionScript();
      assert.ok(script.includes('"TM_"'));
    });

    it('accepts custom prefix', () => {
      const script = buildNaniteConversionScript('TM_Bldg');
      assert.ok(script.includes('"TM_Bldg"'));
    });

    it('enables nanite_settings', () => {
      const script = buildNaniteConversionScript();
      assert.ok(script.includes('nanite_settings'));
      assert.ok(script.includes('.enabled = True'));
    });

    it('handles conversion failures gracefully', () => {
      const script = buildNaniteConversionScript();
      assert.ok(script.includes('except Exception'));
    });
  });

  // ── RC API Calls (offline — Unreal not reachable) ────────────

  describe('configureRendering (offline)', () => {
    it('returns ok: false when Unreal is unreachable', async () => {
      const result = await configureRendering('http://127.0.0.1:1');
      assert.equal(result.ok, false);
      assert.ok(result.error.includes('not reachable'));
    });
  });

  describe('configureLampShadows (offline)', () => {
    it('returns ok: false when Unreal is unreachable', async () => {
      const result = await configureLampShadows('http://127.0.0.1:1');
      assert.equal(result.ok, false);
    });
  });
});

// ── Tone Mapping Presets ──────────────────────────────────────

describe('Tone Mapping Presets', () => {
  it('has all 5 era presets', () => {
    const keys = Object.keys(TONE_MAPPING_PRESETS);
    assert.ok(keys.includes('pre_1900'));
    assert.ok(keys.includes('early_1900s'));
    assert.ok(keys.includes('kodachrome'));
    assert.ok(keys.includes('ektachrome'));
    assert.ok(keys.includes('modern'));
  });

  it('each preset has required fields', () => {
    for (const [name, preset] of Object.entries(TONE_MAPPING_PRESETS)) {
      assert.ok(typeof preset.filmSlope === 'number', `${name}.filmSlope`);
      assert.ok(typeof preset.filmToe === 'number', `${name}.filmToe`);
      assert.ok(typeof preset.filmShoulder === 'number', `${name}.filmShoulder`);
      assert.ok(typeof preset.saturation === 'number', `${name}.saturation`);
      assert.ok(typeof preset.exposureBias === 'number', `${name}.exposureBias`);
      assert.ok(typeof preset.colorGamma === 'object', `${name}.colorGamma`);
      assert.ok(typeof preset.colorGamma.r === 'number', `${name}.colorGamma.r`);
      assert.ok(typeof preset.colorGamma.g === 'number', `${name}.colorGamma.g`);
      assert.ok(typeof preset.colorGamma.b === 'number', `${name}.colorGamma.b`);
    }
  });

  describe('resolveToneMapping', () => {
    it('returns pre_1900 for 1884', () => {
      assert.deepEqual(resolveToneMapping(1884), TONE_MAPPING_PRESETS.pre_1900);
    });

    it('returns early_1900s for 1920', () => {
      assert.deepEqual(resolveToneMapping(1920), TONE_MAPPING_PRESETS.early_1900s);
    });

    it('returns kodachrome for 1955', () => {
      assert.deepEqual(resolveToneMapping(1955), TONE_MAPPING_PRESETS.kodachrome);
    });

    it('returns ektachrome for 1978', () => {
      assert.deepEqual(resolveToneMapping(1978), TONE_MAPPING_PRESETS.ektachrome);
    });

    it('returns modern for 2024', () => {
      assert.deepEqual(resolveToneMapping(2024), TONE_MAPPING_PRESETS.modern);
    });

    it('returns modern when year is null', () => {
      assert.deepEqual(resolveToneMapping(null), TONE_MAPPING_PRESETS.modern);
    });

    it('pre-1900 is warmer and less saturated than modern', () => {
      const old = resolveToneMapping(1884);
      const mod = resolveToneMapping(2024);
      assert.ok(old.saturation < mod.saturation, 'pre-1900 should be less saturated');
      assert.ok(old.colorGamma.r > mod.colorGamma.r, 'pre-1900 should have warmer red gamma');
    });

    it('kodachrome is more saturated than modern', () => {
      const koda = resolveToneMapping(1955);
      const mod = resolveToneMapping(2024);
      assert.ok(koda.saturation > mod.saturation, 'Kodachrome should be more saturated');
    });
  });
});
