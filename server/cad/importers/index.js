import { ApiError } from '../../errors.js';
import { stepImporter } from './step.js';

const importers = Object.freeze([stepImporter]);

export function getCadImporter(extension) {
  const normalized = extension.toLowerCase();
  const importer = importers.find((candidate) => candidate.extensions.includes(normalized));
  if (!importer) {
    throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Допустимые форматы: .stp, .step');
  }
  return importer;
}

export function registeredCadImporters() {
  return [...importers];
}
