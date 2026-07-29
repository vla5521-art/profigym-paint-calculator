export type Nullable<T> = T | null;
export type RecordStatus = "draft" | "active" | "archived" | string;

export interface Metadata {
  dataset_name: string;
  dataset_type: string;
  schema_version: string;
  demo_version?: string;
  generated_for?: string;
  generated_at: string;
  source_master_file?: string;
  is_demo: boolean;
  allow_production_use?: boolean;
  warning?: string;
  calculation_warning?: string;
}

export interface Manufacturer {
  manufacturer_id: string;
  name: string;
  country: Nullable<string>;
  website_url: Nullable<string>;
  is_active: boolean;
}

export interface Category {
  category_id: string;
  name: string;
  material_type: string;
  parent_category_id: Nullable<string>;
  sort_order: number;
  is_active: boolean;
}

export interface Technology {
  technology_id: string;
  name_ru: string;
  name_en: Nullable<string>;
  is_active: boolean;
}

export interface GlossLevel {
  gloss_id: string;
  name_ru: string;
  name_en: Nullable<string>;
  sort_order: number;
  is_active: boolean;
}

export interface Unit {
  unit_id: string;
  symbol: string;
  dimension: string;
  base_unit_id: Nullable<string>;
  conversion_type: string;
  to_base_factor: Nullable<number>;
  formula_code: Nullable<string>;
  decimal_precision: number;
  is_active: boolean;
}

export interface ApplicationMethod {
  method_id: string;
  name: string;
  is_active: boolean;
}

export interface Substrate {
  substrate_id: string;
  name: string;
  is_active: boolean;
}


export interface MaterialSubstrate {
  material_substrate_id: string;
  material_id: string;
  substrate_id: string;
  created_at: string;
  source_import_batch_id: Nullable<string>;
}

export interface ImportBatch {
  import_batch_id: string;
  file_name: string;
  file_size: number;
  checksum: string;
  imported_at: string;
  rows_total: number;
  rows_imported: number;
  rows_rejected: number;
  status: RecordStatus;
  database_version_before: string;
  database_version_after: string;
}

export interface Material {
  material_id: string;
  name: string;
  manufacturer_id: string;
  category_id: string;
  manufacturer_product_code: Nullable<string>;
  description: Nullable<string>;
  technology_id: Nullable<string>;
  components_count: Nullable<number>;
  density_kg_l: Nullable<number>;
  volume_solids_pct: Nullable<number>;
  mix_ratio_base: Nullable<number>;
  mix_ratio_hardener: Nullable<number>;
  mix_ratio_unit: Nullable<string>;
  pot_life_min: Nullable<number>;
  shelf_life_months: Nullable<number>;
  color: Nullable<string>;
  gloss_id: Nullable<string>;
  min_temp_c: Nullable<number>;
  max_temp_c: Nullable<number>;
  status: RecordStatus;
  is_user_material: boolean;
  created_at: string;
  updated_at: string;
  record_version: number;
  introduced_in_version: Nullable<string>;
  retired_in_version: Nullable<string>;
  verified_at: Nullable<string>;
  notes: Nullable<string>;
  source_record_status?: Nullable<string>;
  is_demo?: boolean;
}

export interface ConsumptionNorm {
  norm_id: string;
  material_id: string;
  norm_type: string;
  basis_type: string;
  value_min: Nullable<number>;
  value_nominal: number;
  value_max: Nullable<number>;
  unit_id: string;
  dry_film_thickness_um: Nullable<number>;
  wet_film_thickness_um: Nullable<number>;
  coats_count: number;
  application_method_id: string;
  substrate_id: string;
  temperature_c: Nullable<number>;
  humidity_pct: Nullable<number>;
  application_loss_factor: number;
  is_default: boolean;
  status: RecordStatus;
  valid_from: Nullable<string>;
  valid_to: Nullable<string>;
  source_document_id: string;
  verified_at: Nullable<string>;
  verified_by: Nullable<string>;
  created_at: string;
  updated_at: string;
  record_version: number;
  notes: Nullable<string>;
  source_type?: string;
  is_demo?: boolean;
}

export interface Document {
  document_id: string;
  material_id: string;
  document_type_id: string;
  document_number: Nullable<string>;
  document_version: Nullable<string>;
  language_code: string;
  region_code: string;
  url: Nullable<string>;
  document_date: Nullable<string>;
  effective_date: Nullable<string>;
  retrieved_at: Nullable<string>;
  checksum: Nullable<string>;
  mime_type: Nullable<string>;
  file_name: Nullable<string>;
  is_primary: boolean;
  status: RecordStatus;
  notes: Nullable<string>;
  is_demo?: boolean;
}

export interface DocumentType {
  document_type_id: string;
  name_ru: string;
  name_en: Nullable<string>;
  is_active: boolean;
  is_demo?: boolean;
}

export interface StatusDefinition {
  entity_type: string;
  status_id: string;
  name_ru: string;
  allowed_in_calculation: boolean;
  is_terminal: boolean;
}

export interface Language {
  language_code: string;
  name_ru: string;
  name_en: string;
  is_active: boolean;
}

export interface Region {
  region_code: string;
  name_ru: string;
  name_en: string;
  is_active: boolean;
}

export interface DatabaseVersion {
  version: string;
  released_at: string;
  change_type: string;
  description: string;
  status: string;
}

export interface Database {
  metadata: Metadata;
  manufacturers: Manufacturer[];
  categories: Category[];
  technologies: Technology[];
  gloss_levels: GlossLevel[];
  units: Unit[];
  application_methods: ApplicationMethod[];
  substrates: Substrate[];
  materials: Material[];
  material_substrates: MaterialSubstrate[];
  import_batches: ImportBatch[];
  consumption_norms: ConsumptionNorm[];
  documents: Document[];
  document_types: DocumentType[];
  statuses: StatusDefinition[];
  languages: Language[];
  regions: Region[];
  database_versions: DatabaseVersion[];
}
