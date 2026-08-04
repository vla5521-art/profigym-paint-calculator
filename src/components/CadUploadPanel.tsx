import { useEffect, useRef, useState } from "react";
import {
  createManualCadFeature,
  decideCadFeature,
  decideCadContact,
  deleteManualCadFeature,
  getCadFeatures,
  getCadContacts,
  getCadJob,
  getJobViewerMesh,
  integrateCadWithPaint,
  saveCadCalculation,
  type PaintIntegration,
  type SavedCadCalculation,
  type ViewerMesh,
  type CadDiagnostics,
  type CadFeature,
  type CadJob,
  type ContactResult,
  type FeatureResult,
  type FeatureRules,
  updateCadFeatureRules,
  uploadCadFile,
  uploadCadReportPreview,
} from "../cad/api.ts";
import { validateCadFile } from "../cad/validation.ts";
import { LazyCadViewer } from "./cad-viewer/LazyCadViewer.tsx";

const TERMINAL = new Set(["completed", "failed", "timed_out", "cancelled"]);

const DEFAULT_FEATURE_RULES: FeatureRules = {
  autoExcludeEnabled: true,
  holeMinDiameterMm: 0.5,
  holeMaxDiameterMm: 1000,
  holeMinDepthMm: 0.5,
  holeMaxDepthMm: 1000,
  excludeThrough: true,
  excludeBlind: true,
  excludeBottomFace: false,
  excludeCountersink: true,
  excludeCounterbore: true,
  excludeClosedCavity: true,
  openCavityReviewRequired: true,
  confidenceThreshold: 0.9,
  areaToleranceMm2: 0.01,
  axisToleranceMm: 0.05,
  angleToleranceDeg: 1,
};

function stage3FeatureFallback(data: CadDiagnostics): FeatureResult {
  const zero = { mm2: 0, cm2: 0, m2: 0 };
  const contact = data.contacts.summary;
  return {
    features: [],
    summary: {
      totalAreaMm2: contact.totalAreaMm2,
      confirmedPhysicalContactAreaMm2: contact.confirmedPhysicalContactAreaMm2,
      confirmedContactExcludedAreaMm2: contact.confirmedExcludedPaintAreaMm2,
      confirmedHoleExcludedAreaMm2: 0,
      confirmedCavityExcludedAreaMm2: 0,
      confirmedManualExcludedAreaMm2: 0,
      reviewRequiredFeatureAreaMm2: 0,
      rawContactExcludedAreaMm2: contact.confirmedExcludedPaintAreaMm2,
      rawFeatureExcludedAreaMm2: 0,
      rawExcludedAreaMm2: contact.confirmedExcludedPaintAreaMm2,
      overlapAreaMm2: 0,
      uniqueConfirmedExcludedAreaMm2: contact.confirmedExcludedPaintAreaMm2,
      paintableAreaMm2: contact.paintableAreaMm2,
      totalArea: contact.totalArea,
      confirmedPhysicalContactArea: contact.confirmedPhysicalContactArea,
      confirmedContactExcludedArea: contact.confirmedExcludedPaintArea,
      confirmedHoleExcludedArea: zero,
      confirmedCavityExcludedArea: zero,
      confirmedManualExcludedArea: zero,
      reviewRequiredFeatureArea: zero,
      rawExcludedArea: contact.confirmedExcludedPaintArea,
      overlapArea: zero,
      uniqueConfirmedExcludedArea: contact.confirmedExcludedPaintArea,
      paintableArea: contact.paintableArea,
    },
    statistics: {
      candidateExtractionMs: 0,
      holeRecognitionMs: 0,
      cavityRecognitionMs: 0,
      ruleEvaluationMs: 0,
      overlapResolutionMs: 0,
      totalFeatureProcessingMs: 0,
      featureCandidateCount: 0,
      confirmedFeatureCount: 0,
      reviewRequiredCount: 0,
    },
  };
}

function formatArea(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 6 }).format(value);
}

function AreaMetric({ label, value }: { label: string; value: { mm2: number; cm2: number; m2: number } }): React.JSX.Element {
  return <div><span>{label}</span><strong>{formatArea(value.m2)} м²</strong><small>{formatArea(value.cm2)} см² · {formatArea(value.mm2)} мм²</small></div>;
}

const CONTACT_TYPE_LABELS: Record<string, string> = {
  full_planar_contact: "Полный плоский контакт",
  partial_planar_contact: "Частичный плоский контакт",
  cylindrical_contact: "Цилиндрический контакт",
  tangent_contact: "Касательное соприкосновение",
  near_gap: "Малый зазор",
  ambiguous_contact: "Неоднозначный контакт",
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Подтвержден",
  review_required: "Требует проверки",
  rejected: "Отклонен",
  manually_confirmed: "Подтвержден вручную",
  manually_rejected: "Отклонен вручную",
};

const FEATURE_TYPE_LABELS: Record<string, string> = {
  through_hole: "Сквозное отверстие",
  blind_hole: "Глухое отверстие",
  stepped_hole: "Ступенчатое отверстие",
  countersunk_hole: "Отверстие с зенковкой",
  counterbored_hole: "Отверстие с цековкой",
  intersecting_holes: "Пересекающееся отверстие",
  closed_internal_cavity: "Закрытая внутренняя полость",
  open_internal_cavity: "Открытая внутренняя полость",
  slot: "Паз",
  ambiguous_feature: "Неоднозначный элемент",
  manual_feature: "Ручное исключение",
};

function FeaturesTable({
  jobId,
  result,
  onChange,
  onSelectFaceIds,
  selectedEntityIds,
  onToggleEntity,
}: {
  jobId: string;
  result: FeatureResult;
  onChange: (result: FeatureResult) => void;
  onSelectFaceIds: (ids: string[]) => void;
  selectedEntityIds: string[];
  onToggleEntity: (id: string, checked: boolean) => void;
}): React.JSX.Element {
  const [pending, setPending] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const decide = async (feature: CadFeature, decision: "confirm" | "reject" | "reset" | "delete") => {
    setPending(`${feature.featureId}:${decision}`);
    setDecisionError(null);
    try {
      onChange(decision === "delete"
        ? await deleteManualCadFeature(jobId, feature.featureId)
        : await decideCadFeature(jobId, feature.featureId, decision));
    } catch (caught) {
      setDecisionError(caught instanceof Error ? caught.message : "Не удалось изменить решение");
    } finally {
      setPending(null);
    }
  };

  return <section aria-labelledby="features-title">
    <h3 id="features-title">Технологические элементы</h3>
    {decisionError && <div className="form-error" role="alert">{decisionError}</div>}
    {result.features.length === 0 ? <p className="field-hint">Отверстия и внутренние полости не обнаружены.</p> : (
      <div className="cad-feature-table-wrap">
        <table className="cad-feature-table" data-testid="cad-feature-table">
          <thead><tr>
            <th>Выбор</th><th>Тип</th><th>Тело / грани</th><th>Размеры</th><th>Доступность</th>
            <th>Площадь</th><th>Уверенность</th><th>Статус</th><th>Правило / причина</th><th>Решение</th>
          </tr></thead>
          <tbody>{result.features.map((feature) => <tr key={feature.featureId} data-feature-id={feature.featureId} data-face-id={feature.faceIds.join(",")} data-status={feature.status} tabIndex={0} onClick={() => onSelectFaceIds(feature.faceIds)} onKeyDown={(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectFaceIds(feature.faceIds); } }}>
            <td><input aria-label={`Выбрать feature ${feature.featureId}`} type="checkbox" checked={selectedEntityIds.includes(feature.featureId)} onClick={(event: MouseEvent) => event.stopPropagation()} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onToggleEntity(feature.featureId, event.target.checked)} /></td>
            <td>{FEATURE_TYPE_LABELS[feature.featureType] ?? feature.featureType}</td>
            <td><code>{feature.bodyId}</code><small>{feature.faceIds.join(", ")}</small></td>
            <td>
              {feature.diameterMm === null ? "—" : `Ø ${formatArea(feature.diameterMm)} мм`}
              <small>{feature.depthMm === null ? "Глубина: —" : `Глубина: ${formatArea(feature.depthMm)} мм`}</small>
              <small>{feature.through ? "Сквозное" : "Глухое / полость"}</small>
            </td>
            <td>{feature.accessible === null ? "—" : feature.accessible ? "Доступен снаружи" : "Недоступен"}</td>
            <td>
              Потенциально: {formatArea(feature.potentialAreaMm2)} мм²
              <small>Исключается: {formatArea(feature.excludedAreaMm2)} мм²</small>
            </td>
            <td>{formatArea(feature.confidence * 100)}%</td>
            <td>{STATUS_LABELS[feature.status] ?? feature.status}</td>
            <td><code>{feature.ruleId}</code><small>{feature.reason}</small></td>
            <td><div className="contact-actions">
              {feature.featureType === "manual_feature" ? (
                <button type="button" disabled={pending !== null} onClick={() => { void decide(feature, "delete"); }}>Удалить</button>
              ) : <>
                {(feature.status === "review_required" || feature.status === "rejected") && (
                  <button type="button" disabled={pending !== null} onClick={() => { void decide(feature, "confirm"); }}>Подтвердить исключение</button>
                )}
                {feature.status !== "manually_rejected" && (
                  <button type="button" disabled={pending !== null} onClick={() => { void decide(feature, "reject"); }}>Отклонить</button>
                )}
                {feature.manualDecision && (
                  <button type="button" disabled={pending !== null} onClick={() => { void decide(feature, "reset"); }}>Сбросить решение</button>
                )}
              </>}
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
    )}
  </section>;
}

function FeatureRulesPanel({
  jobId,
  rules,
  onChange,
}: {
  jobId: string;
  rules: FeatureRules;
  onChange: (rules: FeatureRules, result: FeatureResult) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(rules);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(rules), [rules]);
  const number = (key: keyof FeatureRules, value: string) => setDraft((current) => ({
    ...current,
    [key]: Number(value),
  }));
  const toggle = (key: keyof FeatureRules, value: boolean) => setDraft((current) => ({
    ...current,
    [key]: value,
  }));
  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await updateCadFeatureRules(jobId, draft);
      onChange(response.rules, response.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось обновить правила");
    } finally {
      setPending(false);
    }
  };

  return <details className="feature-rules">
    <summary>Правила технологических исключений</summary>
    <div className="feature-rule-grid">
      <label>Диаметр от, мм<input aria-label="Минимальный диаметр" type="number" min="0" value={draft.holeMinDiameterMm} onChange={(event: React.ChangeEvent<HTMLInputElement>) => number("holeMinDiameterMm", event.target.value)} /></label>
      <label>Диаметр до, мм<input aria-label="Максимальный диаметр" type="number" min="0" value={draft.holeMaxDiameterMm} onChange={(event: React.ChangeEvent<HTMLInputElement>) => number("holeMaxDiameterMm", event.target.value)} /></label>
      <label>Глубина от, мм<input aria-label="Минимальная глубина" type="number" min="0" value={draft.holeMinDepthMm} onChange={(event: React.ChangeEvent<HTMLInputElement>) => number("holeMinDepthMm", event.target.value)} /></label>
      <label>Глубина до, мм<input aria-label="Максимальная глубина" type="number" min="0" value={draft.holeMaxDepthMm} onChange={(event: React.ChangeEvent<HTMLInputElement>) => number("holeMaxDepthMm", event.target.value)} /></label>
    </div>
    <div className="feature-rule-checks">
      {([
        ["excludeThrough", "Исключать сквозные отверстия"],
        ["excludeBlind", "Исключать глухие отверстия"],
        ["excludeBottomFace", "Учитывать дно и переходы"],
        ["excludeCountersink", "Исключать зенковки"],
        ["excludeCounterbore", "Исключать цековки"],
        ["excludeClosedCavity", "Исключать закрытые полости"],
      ] as Array<[keyof FeatureRules, string]>).map(([key, label]) => <label key={key}>
        <input type="checkbox" checked={Boolean(draft[key])} onChange={(event: React.ChangeEvent<HTMLInputElement>) => toggle(key, event.target.checked)} />{label}
      </label>)}
    </div>
    {error && <div className="form-error" data-testid="cad-decision-error" role="alert">{error}</div>}
    <button className="secondary-button" type="button" disabled={pending} onClick={() => { void save(); }}>
      {pending ? "Применение…" : "Применить правила"}
    </button>
  </details>;
}

function ContactsTable({
  jobId,
  result,
  onChange,
  onFeatureRefresh,
  onSelectFaceIds,
  selectedEntityIds,
  onToggleEntity,
}: {
  jobId: string;
  result: ContactResult;
  onChange: (result: ContactResult) => void;
  onFeatureRefresh: ((result: FeatureResult) => void) | undefined;
  onSelectFaceIds: (ids: string[]) => void;
  selectedEntityIds: string[];
  onToggleEntity: (id: string, checked: boolean) => void;
}): React.JSX.Element {
  const [pending, setPending] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const decide = async (contactId: string, decision: "confirm" | "reject" | "reset") => {
    setPending(`${contactId}:${decision}`);
    setDecisionError(null);
    try {
      onChange(await decideCadContact(jobId, contactId, decision));
      if (onFeatureRefresh) onFeatureRefresh(await getCadFeatures(jobId));
    } catch (caught) {
      setDecisionError(caught instanceof Error ? caught.message : "Не удалось изменить решение");
    } finally {
      setPending(null);
    }
  };

  return (
    <section aria-labelledby="contacts-title">
      <h3 id="contacts-title">Контактные исключения</h3>
      {decisionError && <div className="form-error" role="alert">{decisionError}</div>}
      {result.contacts.length === 0 ? (
        <p className="field-hint">Контактные зоны не обнаружены.</p>
      ) : (
        <div className="cad-contact-table-wrap">
          <table className="cad-contact-table" data-testid="cad-contact-table">
            <thead>
              <tr>
                <th>Выбор</th><th>Тип</th><th>Тела / грани</th><th>Физическая площадь</th>
                <th>Исключается</th><th>Уверенность</th><th>Статус</th>
                <th>Причина / допуск</th><th>Решение</th>
              </tr>
            </thead>
            <tbody>
              {result.contacts.map((contact) => (
                <tr key={contact.contactId} data-contact-id={contact.contactId} data-face-id={`${contact.faceAId},${contact.faceBId}`} data-status={contact.status} tabIndex={0} onClick={() => onSelectFaceIds([contact.faceAId, contact.faceBId])} onKeyDown={(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectFaceIds([contact.faceAId, contact.faceBId]); } }}>
                  <td><input aria-label={`Выбрать контакт ${contact.contactId}`} type="checkbox" checked={selectedEntityIds.includes(contact.contactId)} onClick={(event: MouseEvent) => event.stopPropagation()} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onToggleEntity(contact.contactId, event.target.checked)} /></td>
                  <td>{CONTACT_TYPE_LABELS[contact.contactType] ?? contact.contactType}</td>
                  <td>
                    <code>{contact.bodyAId}</code> / <code>{contact.bodyBId}</code><br />
                    <code>{contact.faceAId}</code> / <code>{contact.faceBId}</code>
                  </td>
                  <td>
                    {formatArea(contact.physicalContactAreaMm2)} мм²
                    {contact.potentialContactAreaMm2 > 0 && (
                      <small>Потенциально: {formatArea(contact.potentialContactAreaMm2)} мм²</small>
                    )}
                  </td>
                  <td>{formatArea(contact.excludedPaintAreaMm2)} мм²</td>
                  <td>{formatArea(contact.confidence * 100)}%</td>
                  <td>{STATUS_LABELS[contact.status] ?? contact.status}</td>
                  <td>{contact.reason}<small>Допуск: {formatArea(contact.toleranceMm)} мм</small></td>
                  <td>
                    <div className="contact-actions">
                      {contact.status === "review_required" && (
                        <>
                          <button
                            type="button"
                            disabled={pending !== null}
                            onClick={() => { void decide(contact.contactId, "confirm"); }}
                          >Подтвердить исключение</button>
                          <button
                            type="button"
                            disabled={pending !== null}
                            onClick={() => { void decide(contact.contactId, "reject"); }}
                          >Отклонить</button>
                        </>
                      )}
                      {contact.manualDecision && (
                        <button
                          type="button"
                          disabled={pending !== null}
                          onClick={() => { void decide(contact.contactId, "reset"); }}
                        >Сбросить решение</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Diagnostics({
  data,
  jobId,
  onContactsChange,
  onFeaturesChange,
  featureRules,
  onFeatureRulesChange,
  selectedFaces,
  onSelectedFacesChange,
  children,
}: {
  data: CadDiagnostics;
  jobId: string;
  onContactsChange: (result: ContactResult) => void;
  onFeaturesChange: (result: FeatureResult) => void;
  featureRules: FeatureRules;
  onFeatureRulesChange: (rules: FeatureRules, result: FeatureResult) => void;
  selectedFaces: string[];
  onSelectedFacesChange: (ids: string[]) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const detailsOpenStateBeforePrintRef = useRef<Array<{ element: HTMLDetailsElement; open: boolean }>>([]);
  const [manualPending, setManualPending] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [reviewTab, setReviewTab] = useState<"all" | "contacts" | "holes" | "cavities" | "manual" | "review" | "rejected" | "included">("all");
  const [reviewSearch, setReviewSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [areaSort, setAreaSort] = useState<"desc" | "asc">("desc");
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [bulkPending, setBulkPending] = useState(false);
  const featureResult = data.features ?? stage3FeatureFallback(data);
  const summary = data.exclusions ?? featureResult.summary;
  const reviewRequiredCount = data.contacts.contacts.filter((contact) => contact.status === "review_required").length
    + featureResult.features.filter((feature) => feature.status === "review_required").length;
  useEffect(() => {
    const revealDetailsForPrint = () => {
      if (!detailsRef.current) return;
      if (detailsOpenStateBeforePrintRef.current.length > 0) return;
      const elements = [detailsRef.current, ...detailsRef.current.querySelectorAll<HTMLDetailsElement>("details")];
      detailsOpenStateBeforePrintRef.current = elements.map((element) => ({ element, open: element.open }));
      elements.forEach((element) => { element.open = true; });
    };
    const restoreDetailsAfterPrint = () => {
      detailsOpenStateBeforePrintRef.current.forEach(({ element, open }) => { element.open = open; });
      detailsOpenStateBeforePrintRef.current = [];
    };
    window.addEventListener("beforeprint", revealDetailsForPrint);
    window.addEventListener("afterprint", restoreDetailsAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", revealDetailsForPrint);
      window.removeEventListener("afterprint", restoreDetailsAfterPrint);
    };
  }, []);
  const search = reviewSearch.trim().toLocaleLowerCase("ru-RU");
  const matchesStatus = (status: string) => statusFilter === "all"
    || (statusFilter === "confirmed" && ["confirmed", "manually_confirmed"].includes(status))
    || (statusFilter === "review" && status === "review_required")
    || (statusFilter === "rejected" && ["rejected", "manually_rejected"].includes(status));
  const matchesTabStatus = (status: string) => reviewTab === "review" ? status === "review_required"
    : reviewTab === "rejected" ? ["rejected", "manually_rejected"].includes(status)
      : reviewTab === "included" ? ["confirmed", "manually_confirmed"].includes(status)
        : true;
  const visibleContacts = [...data.contacts.contacts].filter((contact) => {
    const searchable = [contact.contactId, contact.bodyAId, contact.bodyBId, contact.faceAId, contact.faceBId].join(" ").toLocaleLowerCase("ru-RU");
    return !["holes", "cavities", "manual"].includes(reviewTab)
      && ["all", "contact"].includes(typeFilter)
      && matchesStatus(contact.status)
      && matchesTabStatus(contact.status)
      && (!search || searchable.includes(search));
  }).sort((left, right) => areaSort === "desc" ? right.potentialContactAreaMm2 - left.potentialContactAreaMm2 : left.potentialContactAreaMm2 - right.potentialContactAreaMm2);
  const visibleFeatures = [...featureResult.features].filter((feature) => {
    const hole = feature.featureType.includes("hole") || feature.featureType === "intersecting_holes";
    const cavity = feature.featureType.includes("cavity");
    const manual = feature.featureType === "manual_feature";
    const searchable = [feature.featureId, feature.bodyId, ...feature.faceIds].join(" ").toLocaleLowerCase("ru-RU");
    const tabMatch = reviewTab === "contacts" ? false : reviewTab === "holes" ? hole : reviewTab === "cavities" ? cavity : reviewTab === "manual" ? manual : true;
    const typeMatch = typeFilter === "all" || (typeFilter === "hole" && hole) || (typeFilter === "cavity" && cavity) || (typeFilter === "manual" && manual);
    return tabMatch && typeMatch && matchesStatus(feature.status) && matchesTabStatus(feature.status) && (!search || searchable.includes(search));
  }).sort((left, right) => areaSort === "desc" ? right.potentialAreaMm2 - left.potentialAreaMm2 : left.potentialAreaMm2 - right.potentialAreaMm2);
  const toggleEntity = (id: string, checked: boolean) => setSelectedEntityIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  const applyBulk = async (decision: "confirm" | "reject" | "reset") => {
    const contacts = data.contacts.contacts.filter((item) => selectedEntityIds.includes(item.contactId));
    const features = featureResult.features.filter((item) => selectedEntityIds.includes(item.featureId) && item.featureType !== "manual_feature");
    if (contacts.length + features.length === 0) return;
    const verb = decision === "confirm" ? "подтвердить" : decision === "reject" ? "отклонить" : "сбросить решения для";
    if (!window.confirm(`${verb} выбранные элементы (${contacts.length + features.length})? Итоговая площадь будет пересчитана.`)) return;
    setBulkPending(true);
    setManualError(null);
    try {
      for (const contact of contacts) await decideCadContact(jobId, contact.contactId, decision);
      for (const feature of features) await decideCadFeature(jobId, feature.featureId, decision);
      const [contactResult, updatedFeatures] = await Promise.all([getCadContacts(jobId), getCadFeatures(jobId)]);
      onContactsChange(contactResult);
      onFeaturesChange(updatedFeatures);
      setSelectedEntityIds([]);
    } catch (caught) {
      setManualError(caught instanceof Error ? caught.message : "Массовое решение не применено");
    } finally { setBulkPending(false); }
  };
  const createManual = async () => {
    setManualPending(true);
    setManualError(null);
    try {
      onFeaturesChange(await createManualCadFeature(jobId, selectedFaces));
      onSelectedFacesChange([]);
    } catch (caught) {
      setManualError(caught instanceof Error ? caught.message : "Не удалось создать ручное исключение");
    } finally {
      setManualPending(false);
    }
  };
  const toggleFace = (faceId: string, checked: boolean) => onSelectedFacesChange(
    checked ? [...selectedFaces, faceId] : selectedFaces.filter((id) => id !== faceId),
  );
  return (
    <section className="cad-report" aria-labelledby="cad-report-title">
      <div className="cad-metrics cad-primary-metrics" aria-label="Основные площади CAD-расчёта">
        <div data-testid="cad-summary-total-area" data-area-m2={summary.totalArea.m2}><AreaMetric label="Полная площадь" value={summary.totalArea} /></div>
        <div data-testid="cad-summary-paintable-area" data-area-m2={summary.paintableArea.m2}><AreaMetric label="Площадь для окрашивания" value={summary.paintableArea} /></div>
      </div>
      {data.warnings.length > 0 && (
        <div className="cad-issues cad-warnings" aria-label="Предупреждения">
          {data.warnings.map((issue) => <p key={issue.code}><strong>{issue.code}</strong>: {issue.message}</p>)}
        </div>
      )}
      {data.errors.length > 0 && (
        <div className="cad-issues cad-errors" role="alert">
          {data.errors.map((issue) => <p key={issue.code}><strong>{issue.code}</strong>: {issue.message}</p>)}
        </div>
      )}
      <details ref={detailsRef} className="cad-details" data-testid="cad-details">
        <summary>
          <span>Подробнее</span>
          {reviewRequiredCount > 0 && <span className="cad-review-indicator" data-testid="cad-review-required-indicator" role="status" aria-live="polite">Требуют проверки: {reviewRequiredCount}</span>}
        </summary>
        <div className="cad-details-content" data-testid="cad-details-content">
          {children}
          <div className="cad-metrics cad-secondary-metrics" aria-label="Детальные площади CAD-расчёта">
            <AreaMetric label="Исключено по контактам" value={summary.confirmedContactExcludedArea} />
            <AreaMetric label="Исключено по отверстиям" value={summary.confirmedHoleExcludedArea} />
            <AreaMetric label="Исключено по внутренним полостям" value={summary.confirmedCavityExcludedArea} />
            <AreaMetric label="Ручные исключения" value={summary.confirmedManualExcludedArea} />
            <AreaMetric label="Перекрытие исключений" value={summary.overlapArea} />
            <AreaMetric label="Уникально исключённая площадь" value={summary.uniqueConfirmedExcludedArea} />
            <AreaMetric label="Требует проверки" value={summary.reviewRequiredFeatureArea} />
          </div>
          <p className="formula-line">Окрашиваемая площадь = Полная площадь − Уникальная подтверждённая площадь исключений</p>
          {selectedFaces[0] && (() => {
            const face = data.faces.find((item) => item.id === selectedFaces[0]);
            return face ? <aside className="selected-face-properties" data-testid="cad-selected-face-properties" data-face-id={face.id} data-area-mm2={face.area.mm2} aria-live="polite">
              <strong>Выбрана грань {face.id}</strong><span>{face.surfaceType}</span><span>{formatArea(face.area.mm2)} мм²</span>
            </aside> : null;
          })()}
          <h3 id="cad-report-title">Диагностический отчет</h3>
          <dl className="cad-diagnostic-list">
            <div><dt>Оболочки</dt><dd>{data.counts.shells}</dd></div>
            <div><dt>Ребра</dt><dd>{data.counts.edges}</dd></div>
            <div><dt>Вершины</dt><dd>{data.counts.vertices}</dd></div>
            <div><dt>Площадь, мм²</dt><dd>{formatArea(data.totalArea.mm2)}</dd></div>
            <div><dt>Площадь, см²</dt><dd>{formatArea(data.totalArea.cm2)}</dd></div>
            <div><dt>Импорт</dt><dd>{formatArea(data.performance.importMs)} мс</dd></div>
            <div><dt>Расчет</dt><dd>{formatArea(data.performance.calculationMs)} мс</dd></div>
            <div><dt>Полный цикл</dt><dd>{formatArea(data.performance.totalMs)} мс</dd></div>
            <div><dt>Broad phase</dt><dd>{formatArea(data.contacts.statistics.broadPhaseMs)} мс</dd></div>
            <div><dt>Narrow phase</dt><dd>{formatArea(data.contacts.statistics.narrowPhaseMs)} мс</dd></div>
            <div><dt>Точных проверок</dt><dd>{data.contacts.statistics.exactCheckCount}</dd></div>
          </dl>
          <section className="cad-review-controls" aria-labelledby="review-controls-title">
        <h3 id="review-controls-title">Проверка исключений</h3>
        <div className="review-tabs" role="tablist" aria-label="Категории исключений">
          {([['all', 'Все'], ['contacts', 'Контакты'], ['holes', 'Отверстия'], ['cavities', 'Полости'], ['manual', 'Ручные'], ['review', 'Требуют проверки'], ['rejected', 'Отклонённые'], ['included', 'Учтённые поверхности']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={reviewTab === value} className={reviewTab === value ? "is-active" : ""} onClick={() => setReviewTab(value)}>{label}</button>)}
        </div>
        <div className="review-filters">
          <label>Поиск по ID<input value={reviewSearch} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setReviewSearch(event.target.value)} placeholder="face, body, feature, contact" /></label>
          <label>Тип<select value={typeFilter} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setTypeFilter(event.target.value)}><option value="all">Все типы</option><option value="contact">Контакты</option><option value="hole">Отверстия</option><option value="cavity">Полости</option><option value="manual">Ручные</option></select></label>
          <label>Статус<select value={statusFilter} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(event.target.value)}><option value="all">Все статусы</option><option value="confirmed">Подтверждённые</option><option value="review">Требуют проверки</option><option value="rejected">Отклонённые</option></select></label>
          <label>Площадь<select value={areaSort} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setAreaSort(event.target.value === "asc" ? "asc" : "desc")}><option value="desc">Сначала большие</option><option value="asc">Сначала малые</option></select></label>
        </div>
        <div className="bulk-actions"><span>Выбрано: {selectedEntityIds.length}</span><button type="button" disabled={bulkPending || selectedEntityIds.length === 0} onClick={() => { void applyBulk("confirm"); }}>Подтвердить выбранные</button><button type="button" disabled={bulkPending || selectedEntityIds.length === 0} onClick={() => { void applyBulk("reject"); }}>Отклонить выбранные</button><button type="button" disabled={bulkPending || selectedEntityIds.length === 0} onClick={() => { void applyBulk("reset"); }}>Сбросить решения</button></div>
          </section>
          {reviewTab !== "holes" && reviewTab !== "cavities" && reviewTab !== "manual" && typeFilter !== "hole" && typeFilter !== "cavity" && typeFilter !== "manual" && <ContactsTable
        jobId={jobId}
        result={{ ...data.contacts, contacts: visibleContacts }}
        onChange={onContactsChange}
        onFeatureRefresh={data.features ? onFeaturesChange : undefined}
        onSelectFaceIds={onSelectedFacesChange}
        selectedEntityIds={selectedEntityIds}
        onToggleEntity={toggleEntity}
          />}
          {reviewTab !== "contacts" && typeFilter !== "contact" && <FeaturesTable jobId={jobId} result={{ ...featureResult, features: visibleFeatures }} onChange={onFeaturesChange} onSelectFaceIds={onSelectedFacesChange} selectedEntityIds={selectedEntityIds} onToggleEntity={toggleEntity} />}
          <FeatureRulesPanel jobId={jobId} rules={featureRules} onChange={onFeatureRulesChange} />
          <details open={selectedFaces.length > 0 ? true : undefined}>
        <summary>Грани и ручное исключение</summary>
        <div className="cad-face-table-wrap">
          <table className="cad-face-table" data-testid="cad-face-table">
            <thead><tr><th>Выбрать</th><th>ID грани</th><th>Тип</th><th>Площадь, мм²</th></tr></thead>
            <tbody>{data.faces.map((face) => <tr key={face.id} id={`face-row-${face.id}`} data-face-id={face.id} aria-selected={selectedFaces.includes(face.id)} className={selectedFaces.includes(face.id) ? "is-selected" : ""} tabIndex={0} onClick={() => onSelectedFacesChange([face.id])} onKeyDown={(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectedFacesChange([face.id]); } }}>
              <td><input aria-label={`Выбрать грань ${face.id}`} type="checkbox" checked={selectedFaces.includes(face.id)} onChange={(event: React.ChangeEvent<HTMLInputElement>) => toggleFace(face.id, event.target.checked)} /></td>
              <td><code>{face.id}</code></td><td>{face.surfaceType}</td><td>{formatArea(face.area.mm2)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {manualError && <div className="form-error" role="alert">{manualError}</div>}
        <button className="secondary-button manual-feature-button" type="button" disabled={manualPending || selectedFaces.length === 0} onClick={() => { void createManual(); }}>
          {manualPending ? "Создание…" : `Создать ручное исключение (${selectedFaces.length})`}
        </button>
          </details>
        </div>
      </details>
    </section>
  );
}

export function CadUploadPanel({ onPaintIntegration }: { onPaintIntegration?: (integration: PaintIntegration) => void }): React.JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<CadJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewerMesh, setViewerMesh] = useState<ViewerMesh | null>(null);
  const [selectedFaces, setSelectedFaces] = useState<string[]>([]);
  const [calculation, setCalculation] = useState<SavedCadCalculation | null>(null);
  const [calculationName, setCalculationName] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const transferButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!job || TERMINAL.has(job.status)) return undefined;
    const timer = window.setTimeout(() => {
      void getCadJob(job.id)
        .then((next) => {
          setJob(next);
          if (["failed", "timed_out", "cancelled"].includes(next.status)) {
            setError(next.publicError ?? next.error?.message ?? "Не удалось обработать CAD-модель");
          }
        })
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Ошибка получения статуса"));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [job]);

  useEffect(() => {
    if (job?.status !== "completed") return;
    if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) return;
    void getJobViewerMesh(job.id).then(setViewerMesh).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "3D-сетка недоступна"));
  }, [job?.id, job?.status]);

  useEffect(() => {
    const faceId = selectedFaces[0];
    const row = faceId ? document.getElementById(`face-row-${faceId}`) : null;
    if (row && typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
  }, [selectedFaces]);

  const choose = (selected: File | null) => {
    setJob(null);
    setViewerMesh(null);
    setCalculation(null);
    setSelectedFaces([]);
    setFile(selected);
    setCalculationName(selected?.name.replace(/\.(stp|step)$/i, "") ?? "");
    setError(selected ? validateCadFile(selected) : null);
  };

  const save = async (): Promise<SavedCadCalculation | null> => {
    if (!job || job.status !== "completed") return null;
    setActionPending(true);
    setError(null);
    try {
      const saved = await saveCadCalculation(job.id, calculationName || file?.name || "CAD-расчёт");
      setCalculation(saved);
      return saved;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить расчёт");
      return null;
    } finally { setActionPending(false); }
  };

  const transferToPaint = async () => {
    const target = calculation ?? await save();
    if (!target) return;
    const m2 = target.featureSummary.paintableArea.m2.toLocaleString("ru-RU", { maximumFractionDigits: 6 });
    if (!window.confirm(`В расчёт ЛКМ будет передана окрашиваемая площадь: ${m2} м²`)) {
      window.requestAnimationFrame(() => transferButtonRef.current?.focus());
      return;
    }
    setActionPending(true);
    try {
      const integration = await integrateCadWithPaint(target.calculationId, true);
      onPaintIntegration?.(integration);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Передача площади не выполнена"); }
    finally { setActionPending(false); }
  };

  const savePreview = async (preview: Blob) => {
    const target = calculation ?? await save();
    if (!target) return;
    setActionPending(true);
    try {
      await uploadCadReportPreview(target.calculationId, preview);
      setCalculation({ ...target, preview: { available: true, mime: "image/png", sizeBytes: preview.size } });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Снимок для отчёта не сохранён"); }
    finally { setActionPending(false); }
  };

  const submit = async () => {
    if (!file) { setError("Выберите CAD-файл"); return; }
    const validationError = validateCadFile(file);
    if (validationError) { setError(validationError); return; }
    setLoading(true);
    setError(null);
    try {
      setJob(await uploadCadFile(file));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  const updateContacts = (contacts: ContactResult) => {
    setJob((current) => {
      if (!current?.diagnostics) return current;
      return {
        ...current,
        paintableArea: contacts.summary.paintableArea,
        diagnostics: { ...current.diagnostics, contacts },
      };
    });
  };

  const updateFeatures = (features: FeatureResult) => {
    setJob((current) => {
      if (!current?.diagnostics) return current;
      return {
        ...current,
        paintableArea: features.summary.paintableArea,
        diagnostics: {
          ...current.diagnostics,
          features,
          exclusions: features.summary,
        },
      };
    });
  };

  const updateFeatureRules = (rules: FeatureRules, features: FeatureResult) => {
    setJob((current) => {
      if (!current?.diagnostics) return current;
      return {
        ...current,
        featureRules: rules,
        paintableArea: features.summary.paintableArea,
        diagnostics: {
          ...current.diagnostics,
          features,
          exclusions: features.summary,
        },
      };
    });
  };

  return <section className="import-card cad-upload-card" aria-labelledby="cad-upload-title">
    <div className="import-card-header"><div><h2 id="cad-upload-title">Расчет площади по CAD</h2><p className="field-hint">Точный B-Rep импорт Open Cascade, проверка геометрии и площадь каждой грани.</p></div></div>
    <label className="file-picker">Выбрать CAD-файл<input data-testid="cad-upload-input" aria-label="CAD-файл" type="file" accept=".stp,.step" onChange={(event: React.ChangeEvent<HTMLInputElement>) => choose(event.target.files?.[0] ?? null)} /></label>
    <p className="field-hint">Поддерживаемые форматы: STEP (.stp, .step). Максимальный размер — 50 МБ.</p>
    {file && <p className="import-file-name">Выбран: <strong>{file.name}</strong> ({Math.ceil(file.size / 1024)} КБ)</p>}
    {error && <div className="form-error" data-testid="cad-upload-error" role="alert">{error}</div>}
    <div className="import-actions"><button className="calculate-button" type="button" disabled={!file || loading || Boolean(error)} onClick={() => { void submit(); }}>{loading ? "Загрузка…" : "Импортировать и рассчитать"}</button></div>
    {job && !job.diagnostics && <div className="import-summary import-summary-ok" data-testid="cad-processing-status" role="status">Статус: <strong>{job.status === "queued" ? "в очереди" : "обработка модели"}</strong>.</div>}
    {job?.diagnostics && <Diagnostics
      data={job.diagnostics}
      jobId={job.id}
      onContactsChange={updateContacts}
      onFeaturesChange={updateFeatures}
      featureRules={job.featureRules ?? DEFAULT_FEATURE_RULES}
      onFeatureRulesChange={updateFeatureRules}
      selectedFaces={selectedFaces}
      onSelectedFacesChange={setSelectedFaces}
    >
      {job.status === "completed" && <div className="cad-result-toolbar" data-testid="cad-result-screen">
        <label>Название расчёта<input value={calculationName} maxLength={160} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setCalculationName(event.target.value)} /></label>
        <button className="secondary-button" data-testid="cad-save-button" type="button" disabled={actionPending} onClick={() => { void save(); }}>{calculation ? "Сохранено" : "Сохранить расчёт"}</button>
        <button ref={transferButtonRef} className="secondary-button" data-testid="cad-transfer-paint-button" type="button" disabled={actionPending} onClick={() => { void transferToPaint(); }}>Передать площадь в расчёт ЛКМ</button>
        {calculation && <><a className="secondary-button" data-testid="cad-report-button" target="_blank" rel="noreferrer" href={calculation.reportHtmlUrl}>Печатный отчёт</a><a className="secondary-button" href={calculation.reportJsonUrl} download>JSON-отчёт</a></>}
      </div>}
      <LazyCadViewer mesh={viewerMesh} selectedFaceIds={selectedFaces} onSelectFace={(faceId) => setSelectedFaces([faceId])} onPreview={(preview) => { void savePreview(preview); }} />
    </Diagnostics>}
  </section>;
}
