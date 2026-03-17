import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { generateImage, saveImage, toDataUri } from '../lib/geminiImageGen.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Gemini Image Generation', () => {

  describe('generateImage', () => {
    let originalFetch;
    let originalEnv;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      originalEnv = process.env.GOOGLE_AI_API_KEY;
      process.env.GOOGLE_AI_API_KEY = 'test-key-123';
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      if (originalEnv !== undefined) {
        process.env.GOOGLE_AI_API_KEY = originalEnv;
      } else {
        delete process.env.GOOGLE_AI_API_KEY;
      }
    });

    it('throws if GOOGLE_AI_API_KEY is not set', async () => {
      delete process.env.GOOGLE_AI_API_KEY;
      await assert.rejects(
        () => generateImage('test prompt'),
        /GOOGLE_AI_API_KEY/,
      );
    });

    it('sends correct request to Gemini API', async () => {
      let capturedUrl, capturedOpts;
      globalThis.fetch = async (url, opts) => {
        capturedUrl = url;
        capturedOpts = opts;
        return {
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  inlineData: {
                    mimeType: 'image/png',
                    data: Buffer.from('fake-image').toString('base64'),
                  },
                }],
              },
            }],
          }),
        };
      };

      await generateImage('a brownstone building');

      assert.ok(capturedUrl.includes('gemini-2.0-flash-exp'));
      assert.ok(capturedUrl.includes('key=test-key-123'));
      const body = JSON.parse(capturedOpts.body);
      assert.equal(body.contents[0].parts[0].text, 'a brownstone building');
      assert.deepEqual(body.generationConfig.responseModalities, ['IMAGE']);
    });

    it('returns image buffer and mimeType', async () => {
      const fakeImage = Buffer.from('test-png-data');
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                inlineData: {
                  mimeType: 'image/png',
                  data: fakeImage.toString('base64'),
                },
              }],
            },
          }],
        }),
      });

      const result = await generateImage('test');

      assert.ok(Buffer.isBuffer(result.image));
      assert.deepEqual(result.image, fakeImage);
      assert.equal(result.mimeType, 'image/png');
      assert.equal(result.prompt, 'test');
    });

    it('uses custom model when specified', async () => {
      let capturedUrl;
      globalThis.fetch = async (url) => {
        capturedUrl = url;
        return {
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{
                  inlineData: { mimeType: 'image/png', data: Buffer.from('x').toString('base64') },
                }],
              },
            }],
          }),
        };
      };

      await generateImage('test', { model: 'gemini-2.5-flash' });
      assert.ok(capturedUrl.includes('gemini-2.5-flash'));
    });

    it('throws on HTTP error', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 429,
        text: async () => 'rate limited',
      });

      await assert.rejects(
        () => generateImage('test'),
        /429.*rate limited/,
      );
    });

    it('throws when no candidates returned', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({ candidates: [] }),
      });

      await assert.rejects(
        () => generateImage('test'),
        /no candidates/,
      );
    });

    it('throws with text message when image is refused', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'I cannot generate that image because...' }],
            },
          }],
        }),
      });

      await assert.rejects(
        () => generateImage('test'),
        /did not return an image.*cannot generate/,
      );
    });
  });

  describe('saveImage', () => {
    it('writes image buffer to disk', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-test-'));
      const outputPath = path.join(tmpDir, 'subdir', 'test.png');
      const result = { image: Buffer.from('fake-png'), mimeType: 'image/png' };

      const saved = saveImage(result, outputPath);

      assert.equal(saved, outputPath);
      assert.ok(fs.existsSync(outputPath));
      assert.deepEqual(fs.readFileSync(outputPath), result.image);

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('toDataUri', () => {
    it('converts image result to base64 data URI', () => {
      const result = {
        image: Buffer.from('test-data'),
        mimeType: 'image/png',
      };

      const uri = toDataUri(result);

      assert.ok(uri.startsWith('data:image/png;base64,'));
      const decoded = Buffer.from(uri.split(',')[1], 'base64');
      assert.deepEqual(decoded, result.image);
    });

    it('preserves jpeg mimeType', () => {
      const result = {
        image: Buffer.from('jpeg-data'),
        mimeType: 'image/jpeg',
      };

      const uri = toDataUri(result);
      assert.ok(uri.startsWith('data:image/jpeg;base64,'));
    });
  });
});
