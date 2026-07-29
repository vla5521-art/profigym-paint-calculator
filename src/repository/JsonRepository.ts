import { DATABASE_URL } from "../config/database.ts";
import type { DatabaseRepository } from "./DatabaseRepository.ts";
import type {
  ConsumptionNorm,
  Database,
  Document,
  Manufacturer,
  Material,
  Metadata,
  Unit,
} from "../types/database.ts";
import { logDatabaseSummary } from "../utils/logger.ts";
import { parseAndValidateDatabase } from "../utils/validator.ts";

export class RepositoryNotLoadedError extends Error {
  public constructor() {
    super("База данных ещё не загружена.");
    this.name = "RepositoryNotLoadedError";
  }
}

export class JsonRepository implements DatabaseRepository {
  private database: Database | null = null;
  private loadingPromise: Promise<void> | null = null;

  private readonly databaseUrl: string;

  public constructor(databaseUrl: string = DATABASE_URL) {
    this.databaseUrl = databaseUrl;
  }

  public async load(): Promise<void> {
    if (this.database !== null) return;
    if (this.loadingPromise !== null) return this.loadingPromise;

    this.loadingPromise = this.fetchDatabase();
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  public async reload(): Promise<void> {
    this.database = null;
    this.loadingPromise = null;
    await this.load();
  }

  public isLoaded(): boolean {
    return this.database !== null;
  }

  public getMetadata(): Metadata {
    return this.requireDatabase().metadata;
  }

  public getDatabase(): Readonly<Database> {
    return this.requireDatabase();
  }

  public getManufacturers(): Manufacturer[] {
    return this.requireDatabase().manufacturers
      .filter((item) => item.is_active)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  public getManufacturer(id: string): Manufacturer | null {
    return this.requireDatabase().manufacturers.find((item) => item.manufacturer_id === id) ?? null;
  }

  public getMaterials(): Material[] {
    return this.requireDatabase().materials.slice().sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  public getActiveMaterials(): Material[] {
    return this.getMaterials().filter((item) => item.status === "active");
  }

  public getMaterialsByManufacturer(manufacturerId: string): Material[] {
    return this.getActiveMaterials().filter((item) => item.manufacturer_id === manufacturerId);
  }

  public getMaterial(materialId: string): Material | null {
    return this.requireDatabase().materials.find((item) => item.material_id === materialId) ?? null;
  }

  public getDefaultNorm(materialId: string): ConsumptionNorm | null {
    return this.requireDatabase().consumption_norms.find(
      (item) => item.material_id === materialId && item.status === "active" && item.is_default,
    ) ?? null;
  }

  public getNormsByMaterial(materialId: string): ConsumptionNorm[] {
    return this.requireDatabase().consumption_norms.filter((item) => item.material_id === materialId);
  }

  public getNorm(normId: string): ConsumptionNorm | null {
    return this.requireDatabase().consumption_norms.find((item) => item.norm_id === normId) ?? null;
  }

  public getDocumentsByMaterial(materialId: string): Document[] {
    return this.requireDatabase().documents.filter((item) => item.material_id === materialId);
  }

  public getUnit(unitId: string): Unit | null {
    return this.requireDatabase().units.find((item) => item.unit_id === unitId) ?? null;
  }

  private async fetchDatabase(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(this.databaseUrl, { cache: "no-store" });
    } catch (error: unknown) {
      throw new Error(`Не удалось подключиться к источнику данных ${this.databaseUrl}.`, { cause: error });
    }

    if (!response.ok) {
      throw new Error(`Не удалось загрузить базу: HTTP ${response.status} ${response.statusText}.`);
    }

    let raw: unknown;
    try {
      raw = await response.json() as unknown;
    } catch (error: unknown) {
      throw new Error("Файл базы повреждён или содержит некорректный JSON.", { cause: error });
    }

    const validated = parseAndValidateDatabase(raw);
    this.database = validated;
    logDatabaseSummary(validated);
  }

  private requireDatabase(): Database {
    if (this.database === null) throw new RepositoryNotLoadedError();
    return this.database;
  }
}

export const databaseRepository: DatabaseRepository = new JsonRepository();
