import type {
  ConsumptionNorm,
  Database,
  Document,
  Manufacturer,
  Material,
  Metadata,
  Unit,
} from "../types/database.ts";

export interface DatabaseRepository {
  load(): Promise<void>;
  reload(): Promise<void>;
  isLoaded(): boolean;
  getMetadata(): Metadata;
  getDatabase(): Readonly<Database>;
  getManufacturers(): Manufacturer[];
  getManufacturer(id: string): Manufacturer | null;
  getMaterials(): Material[];
  getActiveMaterials(): Material[];
  getMaterialsByManufacturer(manufacturerId: string): Material[];
  getMaterial(materialId: string): Material | null;
  getDefaultNorm(materialId: string): ConsumptionNorm | null;
  getNormsByMaterial(materialId: string): ConsumptionNorm[];
  getNorm(normId: string): ConsumptionNorm | null;
  getDocumentsByMaterial(materialId: string): Document[];
  getUnit(unitId: string): Unit | null;
}
