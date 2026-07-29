import { normalizeName, slugify, stableHash } from "./normalization.ts";
export const IdFactory = {
  manufacturer(name: string): string { const key=normalizeName(name); return `mfr_${slugify(name)}_${stableHash(key)}`; },
  material(manufacturerId: string, name: string): string { const key=`${manufacturerId}|${normalizeName(name)}`; return `mat_${slugify(name)}_${stableHash(key)}`; },
  substrate(name: string): string { const key=normalizeName(name); return `substrate_${slugify(name)}_${stableHash(key)}`; },
  materialSubstrate(materialId: string, substrateId: string): string { return `ms_${stableHash(`${materialId}|${substrateId}`)}`; },
  norm(materialId: string): string { return `norm_${stableHash(materialId)}_default`; },
  document(materialId: string): string { return `doc_excel_${stableHash(materialId)}`; },
  importBatch(checksum: string): string { return `imp_${stableHash(checksum)}`; },
};
