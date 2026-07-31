import fs from 'node:fs/promises';
import { analyzeStepContent } from '../kernel.js';

export const STEP_EXTENSIONS = Object.freeze(['.stp', '.step']);
export const STEP_MIME_TYPES = Object.freeze([
  'application/step',
  'application/x-step',
  'model/step',
  'text/plain',
  'application/octet-stream',
]);

export const stepImporter = Object.freeze({
  id: 'step',
  extensions: STEP_EXTENSIONS,
  async importFile(filePath, sourceName, options = {}) {
    const content = await fs.readFile(filePath, 'utf8');
    return analyzeStepContent(content, sourceName, options);
  },
});

export function isAllowedStepMimeType(mimeType) {
  return !mimeType || STEP_MIME_TYPES.includes(mimeType.toLowerCase());
}
