/**
 * Gemini Image Generation — API client for generating reference images.
 *
 * Uses Google's Gemini model with native image generation to produce
 * architectural reference images from text prompts. These images feed
 * into Meshy Image-to-3D for 3D building generation.
 *
 * Follows the pattern of lib/meshyClient.js (shared external API client).
 *
 * Requires GOOGLE_AI_API_KEY environment variable.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_MODEL = 'gemini-2.0-flash-exp';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function apiKey() {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error('GOOGLE_AI_API_KEY environment variable is not set');
  return key;
}

/**
 * Generate an image from a text prompt using Gemini.
 *
 * @param {string} prompt - Text prompt describing the image to generate
 * @param {object} [opts]
 * @param {string} [opts.model] - Gemini model ID (default: gemini-2.0-flash-exp)
 * @returns {Promise<{ image: Buffer, mimeType: string, prompt: string }>}
 */
export async function generateImage(prompt, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const url = `${BASE_URL}/${model}:generateContent?key=${apiKey()}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini image generation failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  // Extract image from response parts
  const candidates = data.candidates || [];
  if (candidates.length === 0) {
    throw new Error('Gemini returned no candidates');
  }

  const parts = candidates[0].content?.parts || [];
  const imagePart = parts.find(p => p.inlineData);

  if (!imagePart) {
    // Check for text-only response (safety filter, refusal, etc.)
    const textPart = parts.find(p => p.text);
    const msg = textPart ? textPart.text.slice(0, 200) : 'no image in response';
    throw new Error(`Gemini did not return an image: ${msg}`);
  }

  const { mimeType, data: b64 } = imagePart.inlineData;
  const image = Buffer.from(b64, 'base64');

  return { image, mimeType, prompt };
}

/**
 * Save a generated image to disk.
 *
 * @param {{ image: Buffer, mimeType: string }} result - from generateImage()
 * @param {string} outputPath - file path to write (parent dirs created automatically)
 * @returns {string} the outputPath
 */
export function saveImage(result, outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, result.image);
  return outputPath;
}

/**
 * Convert a generated image to a base64 data URI suitable for Meshy Image-to-3D.
 *
 * @param {{ image: Buffer, mimeType: string }} result - from generateImage()
 * @returns {string} data URI (e.g. "data:image/png;base64,...")
 */
export function toDataUri(result) {
  return `data:${result.mimeType};base64,${result.image.toString('base64')}`;
}
