import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTexturePrompt,
  buildNegativePrompt,
  buildPromptsForBuilding,
  previewAllPrompts,
} from '../lib/texturePromptBuilder.js';
import { classifyBuilding, STYLES } from '../lib/architectureStyles.js';

describe('Texture Prompt Builder', () => {

  describe('buildTexturePrompt', () => {
    it('generates a prompt with era, style, and material', () => {
      const style = classifyBuilding('brick', 'residential', 4, { era: 'nyc_1884' });
      const prompt = buildTexturePrompt({
        style,
        building: { material: 'brick', use: 'residential', stories: 4 },
        year: 1884,
        eraLabel: '1884 New York City',
      });

      assert.ok(prompt.includes('1884 New York City'));
      assert.ok(prompt.includes('4-story'));
      assert.ok(prompt.includes('residential'));
      assert.ok(prompt.length <= 600, `Prompt too long: ${prompt.length} chars`);
    });

    it('includes weathering for pre-1960 buildings', () => {
      const style = classifyBuilding('brick', 'commercial', 5, { era: 'nyc_1884' });
      const prompt = buildTexturePrompt({
        style,
        building: { material: 'brick', use: 'commercial', stories: 5 },
        year: 1884,
      });

      assert.ok(prompt.includes('coal soot'), 'Should mention coal soot for 1884');
    });

    it('does not include coal soot for modern buildings', () => {
      const style = classifyBuilding('concrete', 'commercial', 5, { year: 2005 });
      const prompt = buildTexturePrompt({
        style,
        building: { material: 'concrete', use: 'commercial', stories: 5 },
        year: 2005,
      });

      assert.ok(!prompt.includes('coal soot'), 'No coal soot for 2005');
    });

    it('includes decorative elements from style', () => {
      const style = classifyBuilding('brick', 'residential', 4, { era: 'nyc_1884' });
      const prompt = buildTexturePrompt({
        style,
        building: { material: 'brick', use: 'residential', stories: 4 },
        year: 1884,
      });

      // brownstone_rowhouse has cornice_brackets, stoop, window_lintels, iron_railings
      assert.ok(prompt.includes('Details:'), 'Should include decorative element details');
    });

    it('stays under 600 chars for all NYC 1884 styles', () => {
      const testCases = [
        { material: 'brick', use: 'residential', stories: 4 },
        { material: 'brick', use: 'commercial', stories: 6 },
        { material: 'iron', use: 'commercial', stories: 5 },
        { material: 'stone', use: 'commercial', stories: 7 },
        { material: 'wood', use: 'residential', stories: 2 },
        { material: 'stone', use: 'church', stories: 1 },
        { material: 'stone', use: 'civic', stories: 3 },
      ];

      for (const tc of testCases) {
        const style = classifyBuilding(tc.material, tc.use, tc.stories, { era: 'nyc_1884' });
        const prompt = buildTexturePrompt({
          style,
          building: tc,
          year: 1884,
          eraLabel: '1884 New York City',
        });
        assert.ok(prompt.length <= 600,
          `${style.styleName} prompt too long: ${prompt.length} chars\n${prompt}`);
      }
    });

    it('adds geometry hints in text-to-3d mode', () => {
      const style = classifyBuilding('brick', 'residential', 4, { era: 'nyc_1884' });
      const prompt = buildTexturePrompt({
        style,
        building: { material: 'brick', use: 'residential', stories: 4 },
        year: 1884,
        mode: 'text-to-3d',
      });

      assert.ok(prompt.includes('Straight vertical walls'), 'Should include geometry hints');
    });

    it('does not add geometry hints in retexture mode', () => {
      const style = classifyBuilding('brick', 'residential', 4, { era: 'nyc_1884' });
      const prompt = buildTexturePrompt({
        style,
        building: { material: 'brick', use: 'residential', stories: 4 },
        year: 1884,
        mode: 'retexture',
      });

      assert.ok(!prompt.includes('Straight vertical walls'), 'No geometry hints for retexture');
    });

    it('includes roof description', () => {
      const style = classifyBuilding('stone', 'commercial', 5, { era: 'nyc_1884' });
      // second_empire has mansard roof
      if (style.roofType === 'mansard') {
        const prompt = buildTexturePrompt({
          style,
          building: { material: 'stone', use: 'commercial', stories: 5 },
          year: 1884,
        });
        assert.ok(prompt.includes('mansard'), 'Should mention mansard roof');
      }
    });

    it('includes trim material when different from primary', () => {
      const style = classifyBuilding('brick', 'commercial', 5, { era: 'nyc_1884' });
      const prompt = buildTexturePrompt({
        style,
        building: { material: 'brick', use: 'commercial', stories: 5 },
        year: 1884,
      });

      // italianate styles have brick primary, stone trim
      if (style.materials?.trim !== style.materials?.primary) {
        assert.ok(prompt.includes('Trim:'), 'Should include trim description');
      }
    });
  });

  describe('buildNegativePrompt', () => {
    it('always includes base exclusions', () => {
      const neg = buildNegativePrompt(1884);
      assert.ok(neg.includes('modern'));
      assert.ok(neg.includes('low quality'));
      assert.ok(neg.includes('cartoon'));
    });

    it('excludes electric lights for pre-1880', () => {
      const neg = buildNegativePrompt(1875);
      assert.ok(neg.includes('no electric lights'));
    });

    it('does not exclude electric lights for 1884', () => {
      const neg = buildNegativePrompt(1884);
      assert.ok(!neg.includes('no electric lights'));
    });

    it('excludes aluminum for pre-1940', () => {
      const neg = buildNegativePrompt(1920);
      assert.ok(neg.includes('no aluminum'));
    });

    it('has minimal exclusions for modern era', () => {
      const neg = buildNegativePrompt(2005);
      // Should only have base exclusions
      assert.ok(!neg.includes('no aluminum'));
      assert.ok(!neg.includes('no electric lights'));
    });
  });

  describe('buildPromptsForBuilding', () => {
    it('returns prompt, negative, style, and building', () => {
      const result = buildPromptsForBuilding(
        { material: 'brick', use: 'residential', stories: 4, address: '123 Broadway' },
        { era: 'nyc_1884' }
      );

      assert.ok(result.prompt);
      assert.ok(result.negative);
      assert.ok(result.style.styleName);
      assert.equal(result.building.stories, 4);
    });

    it('infers era from year when era not provided', () => {
      const result = buildPromptsForBuilding(
        { material: 'brick', use: 'residential', stories: 3 },
        { year: 1955 }
      );

      // 1955 should resolve to general_midcentury
      assert.ok(result.prompt.includes('circa 1955') || result.prompt.includes('Mid-Century'));
    });

    it('handles missing properties gracefully', () => {
      const result = buildPromptsForBuilding({}, { year: 1884 });
      assert.ok(result.prompt.length > 0);
      assert.ok(result.style.styleName);
    });
  });

  describe('previewAllPrompts', () => {
    it('generates prompts for all features in a geojson', () => {
      const geojson = {
        type: 'FeatureCollection',
        _meta: { targetYear: 1890 },
        features: [
          { type: 'Feature', properties: { material: 'brick', use: 'residential', stories: 4, address: '1 Broadway' }, geometry: {} },
          { type: 'Feature', properties: { material: 'stone', use: 'commercial', stories: 6, address: '2 Broadway' }, geometry: {} },
          { type: 'Feature', properties: { material: 'iron', use: 'commercial', stories: 5, address: '3 Broadway' }, geometry: {} },
        ]
      };

      const previews = previewAllPrompts(geojson, { era: 'nyc_1884' });

      assert.equal(previews.length, 3);
      assert.equal(previews[0].index, 0);
      assert.equal(previews[0].address, '1 Broadway');
      assert.ok(previews[0].prompt.length > 0);
      assert.ok(previews[0].negative.length > 0);
      assert.equal(previews[0].creditEstimate, 10); // retexture default
    });

    it('returns text-to-3d credit estimate when mode is text-to-3d', () => {
      const geojson = {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { material: 'brick', use: 'residential', stories: 3 }, geometry: {} },
        ]
      };

      const previews = previewAllPrompts(geojson, { year: 1884, mode: 'text-to-3d' });
      assert.equal(previews[0].creditEstimate, 30);
    });

    it('handles empty feature collection', () => {
      const geojson = { type: 'FeatureCollection', features: [] };
      const previews = previewAllPrompts(geojson, { year: 1884 });
      assert.equal(previews.length, 0);
    });
  });

  describe('prompt coverage across all styles', () => {
    it('generates valid prompts for every defined style', () => {
      for (const [styleName, style] of Object.entries(STYLES)) {
        const prompt = buildTexturePrompt({
          style: { styleName, ...style },
          building: {
            material: style.materials?.primary || 'brick',
            use: 'commercial',
            stories: 4,
          },
          year: 1900,
        });

        assert.ok(prompt.length > 50, `${styleName}: prompt too short (${prompt.length} chars)`);
        assert.ok(prompt.length <= 600, `${styleName}: prompt too long (${prompt.length} chars)`);
        assert.ok(!prompt.includes('undefined'), `${styleName}: prompt contains 'undefined'`);
        assert.ok(!prompt.includes('null'), `${styleName}: prompt contains 'null'`);
      }
    });
  });
});
