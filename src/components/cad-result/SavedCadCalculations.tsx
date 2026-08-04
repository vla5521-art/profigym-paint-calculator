import { useEffect, useRef, useState } from "react";
import {
  deleteCadCalculation,
  deleteSavedManualFeature,
  decideSavedCadEntities,
  duplicateCadCalculation,
  getSavedCadCalculation,
  getSavedViewerMesh,
  integrateCadWithPaint,
  createSavedManualFeature,
  listCadCalculations,
  recalculateSavedCadCalculation,
  renameCadCalculation,
  type PaintIntegration,
  type SavedCadCalculation,
  type SavedCalculationListItem,
  type ViewerMesh,
  type FeatureRules,
  uploadCadReportPreview,
} from "../../cad/api.ts";
import { LazyCadViewer } from "../cad-viewer/LazyCadViewer.tsx";

export function SavedCadCalculations({ onPaintIntegration }: { onPaintIntegration: (integration: PaintIntegration) => void }): React.JSX.Element {
  const [items, setItems] = useState<SavedCalculationListItem[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SavedCadCalculation | null>(null);
  const [mesh, setMesh] = useState<ViewerMesh | null>(null);
  const [selectedFaces, setSelectedFaces] = useState<string[]>([]);
  const [ruleDraft, setRuleDraft] = useState<FeatureRules | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const detailsOpenStateBeforePrintRef = useRef<Array<{ element: HTMLDetailsElement; open: boolean }>>([]);

  const refresh = async (query = search) => {
    setLoading(true); setError(null);
    try { setItems(await listCadCalculations(query)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Не удалось загрузить расчёты"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(""); }, []);
  useEffect(() => {
    const revealDetailsForPrint = () => {
      if (!detailsRef.current || detailsOpenStateBeforePrintRef.current.length > 0) return;
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

  const open = async (id: string) => {
    if (detailsRef.current) detailsRef.current.open = false;
    setLoading(true); setError(null); setMesh(null);
    try {
      const [calculation, viewerMesh] = await Promise.all([
        getSavedCadCalculation(id),
        getSavedViewerMesh(id),
      ]);
      setSelected(calculation);
      setRuleDraft(calculation.featureRules);
      setMesh(viewerMesh);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Расчёт не открыт"); }
    finally { setLoading(false); }
  };

  const rename = async (item: SavedCalculationListItem) => {
    const name = window.prompt("Новое название расчёта", item.name);
    if (!name) return;
    try { await renameCadCalculation(item.calculationId, name); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Переименование не выполнено"); }
  };

  const duplicate = async (id: string) => {
    try { await duplicateCadCalculation(id); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Дублирование не выполнено"); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Удалить сохранённый CAD-расчёт и связанные STEP/mesh-файлы?")) return;
    try { await deleteCadCalculation(id); if (selected?.calculationId === id) { setSelected(null); setMesh(null); } await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Удаление не выполнено"); }
  };

  const recalculate = async () => {
    if (!selected || !window.confirm("Повторный расчёт создаст новую ревизию. Продолжить?")) return;
    setLoading(true);
    try {
      const updated = await recalculateSavedCadCalculation(selected.calculationId, { ...(ruleDraft ? { featureRules: ruleDraft } : {}), preserveManualDecisions: true, preserveReviewDecisions: true });
      setSelected(updated); setRuleDraft(updated.featureRules); setMesh(await getSavedViewerMesh(updated.calculationId)); await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Повторный расчёт не выполнен"); }
    finally { setLoading(false); }
  };

  const integrate = async () => {
    if (!selected) return;
    const value = selected.featureSummary.paintableArea.m2.toLocaleString("ru-RU", { maximumFractionDigits: 6 });
    if (!window.confirm(`В расчёт ЛКМ будет передана окрашиваемая площадь: ${value} м²`)) return;
    try { onPaintIntegration(await integrateCadWithPaint(selected.calculationId, true)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Площадь не передана"); }
  };

  const savePreview = async (preview: Blob) => {
    if (!selected) return;
    try {
      await uploadCadReportPreview(selected.calculationId, preview);
      setSelected({ ...selected, preview: { available: true, mime: "image/png", sizeBytes: preview.size } });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Снимок для отчёта не сохранён"); }
  };

  const decide = async (entityType: "contact" | "feature", id: string, decision: "confirm" | "reject" | "reset") => {
    if (!selected) return;
    try {
      const updated = await decideSavedCadEntities(selected.calculationId, entityType, [id], decision);
      setSelected(updated);
      setMesh(await getSavedViewerMesh(updated.calculationId));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Решение не применено"); }
  };

  const createManual = async () => {
    if (!selected || selectedFaces.length === 0 || !window.confirm(`Создать ручное исключение из граней: ${selectedFaces.join(", ")}?`)) return;
    try {
      const updated = await createSavedManualFeature(selected.calculationId, selectedFaces);
      setSelected(updated); setSelectedFaces([]); setMesh(await getSavedViewerMesh(updated.calculationId));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ручное исключение не создано"); }
  };

  const removeManual = async (featureId: string) => {
    if (!selected || !window.confirm("Удалить ручное исключение?")) return;
    try {
      const updated = await deleteSavedManualFeature(selected.calculationId, featureId);
      setSelected(updated); setMesh(await getSavedViewerMesh(updated.calculationId));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Ручное исключение не удалено"); }
  };

  const reviewRequiredCount = selected
    ? selected.contacts.filter((contact) => contact.status === "review_required").length
      + selected.features.filter((feature) => feature.status === "review_required").length
    : 0;

  return <section className="saved-calculations" data-testid="cad-saved-calculations" aria-labelledby="saved-title">
    <div className="saved-header"><div><h2 id="saved-title">Сохранённые CAD-расчёты</h2><p className="field-hint">Расчёты доступны после перезапуска backend и открываются без повторной загрузки STEP.</p></div>
      <form onSubmit={(event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); void refresh(); }}><label>Поиск по названию<input value={search} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} /></label><button className="secondary-button" type="submit">Найти</button></form></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    {loading && <p role="status">Загрузка…</p>}
    {!loading && items.length === 0 && <div className="state-card">Сохранённых CAD-расчётов пока нет.</div>}
    {items.length > 0 && <div className="saved-table-wrap"><table><thead><tr><th>Название</th><th>STEP</th><th>Изменён</th><th>Площадь</th><th>Ревизия</th><th>Действия</th></tr></thead><tbody>{items.map((item) => <tr key={item.calculationId} data-calculation-id={item.calculationId}>
      <td><strong>{item.name}</strong><small>{item.algorithmVersion}</small></td><td>{item.sourceFileName}</td><td>{new Date(item.updatedAt).toLocaleString("ru-RU")}</td><td>{item.paintableArea.m2.toLocaleString("ru-RU", { maximumFractionDigits: 6 })} м²</td><td>№ {item.revisionNumber}</td>
      <td><div className="table-actions"><button type="button" onClick={() => { void open(item.calculationId); }}>Открыть</button><button type="button" onClick={() => { void rename(item); }}>Переименовать</button><button type="button" onClick={() => { void duplicate(item.calculationId); }}>Дублировать</button><button type="button" onClick={() => { void remove(item.calculationId); }}>Удалить</button></div></td>
    </tr>)}</tbody></table></div>}
    {selected && <article className="saved-detail" data-testid="cad-saved-detail" data-calculation-id={selected.calculationId} data-revision-number={selected.revisionNumber}>
      <div className="cad-result-toolbar"><h3>{selected.name}</h3><span>Ревизия № {selected.revisionNumber}</span><button className="secondary-button" type="button" onClick={() => { void recalculate(); }}>Повторно рассчитать</button><button className="secondary-button" data-testid="cad-transfer-paint-button" type="button" onClick={() => { void integrate(); }}>Передать в ЛКМ</button><a className="secondary-button" data-testid="cad-report-button" href={selected.reportHtmlUrl} target="_blank" rel="noreferrer">Отчёт</a></div>
      <LazyCadViewer mesh={mesh} selectedFaceIds={selectedFaces} onSelectFace={(id) => setSelectedFaces([id])} onPreview={(preview) => { void savePreview(preview); }} />
      <div className="cad-metrics cad-primary-metrics" aria-label="Основные площади сохранённого CAD-расчёта">
        <div data-testid="cad-saved-summary-total-area" data-area-m2={selected.featureSummary.totalArea.m2}><span>Полная площадь</span><strong>{selected.featureSummary.totalArea.m2.toLocaleString("ru-RU")} м²</strong></div>
        <div data-testid="cad-saved-summary-paintable-area" data-area-m2={selected.featureSummary.paintableArea.m2}><span>Площадь для окрашивания</span><strong>{selected.featureSummary.paintableArea.m2.toLocaleString("ru-RU")} м²</strong></div>
      </div>
      {selected.warnings.length > 0 && <div className="cad-issues cad-warnings" data-testid="cad-saved-warnings" aria-label="Предупреждения сохранённого CAD-расчёта">
        {selected.warnings.map((warning) => <p key={`${warning.code}:${warning.message}`}><strong>{warning.code}</strong>: {warning.message}</p>)}
      </div>}
      {selected.diagnostics.errors.length > 0 && <div className="cad-issues cad-errors" data-testid="cad-saved-errors" role="alert">
        {selected.diagnostics.errors.map((diagnosticError) => <p key={`${diagnosticError.code}:${diagnosticError.message}`}><strong>{diagnosticError.code}</strong>: {diagnosticError.message}</p>)}
      </div>}
      <details ref={detailsRef} className="cad-details saved-cad-details" data-testid="cad-saved-details">
        <summary>
          <span>Подробнее</span>
          {reviewRequiredCount > 0 && <span className="cad-review-indicator" data-testid="cad-saved-review-required-indicator" role="status" aria-live="polite">Требуют проверки: {reviewRequiredCount}</span>}
        </summary>
        <div className="cad-details-content" data-testid="cad-saved-details-content">
          <div className="cad-metrics cad-secondary-metrics" aria-label="Детальные площади сохранённого CAD-расчёта">
            <div><span>Исключено по контактам</span><strong>{selected.featureSummary.confirmedContactExcludedArea.m2.toLocaleString("ru-RU")} м²</strong></div>
            <div><span>Исключено по отверстиям</span><strong>{selected.featureSummary.confirmedHoleExcludedArea.m2.toLocaleString("ru-RU")} м²</strong></div>
            <div><span>Исключено по внутренним полостям</span><strong>{selected.featureSummary.confirmedCavityExcludedArea.m2.toLocaleString("ru-RU")} м²</strong></div>
            <div><span>Ручные исключения</span><strong>{selected.featureSummary.confirmedManualExcludedArea.m2.toLocaleString("ru-RU")} м²</strong></div>
            <div><span>Перекрытие исключений</span><strong>{selected.featureSummary.overlapArea.m2.toLocaleString("ru-RU")} м²</strong></div>
            <div><span>Уникально исключённая площадь</span><strong>{selected.featureSummary.uniqueConfirmedExcludedArea.m2.toLocaleString("ru-RU")} м²</strong></div>
            <div><span>Требует проверки</span><strong>{selected.featureSummary.reviewRequiredFeatureArea.m2.toLocaleString("ru-RU")} м²</strong></div>
          </div>
          <p className="formula-line">Окрашиваемая площадь = Полная площадь − Уникальная подтверждённая площадь исключений</p>
          <div className="saved-review-actions"><button className="secondary-button" type="button" disabled={selectedFaces.length === 0} onClick={() => { void createManual(); }}>Создать ручное исключение из выбранных граней</button><span>Выбрано граней: {selectedFaces.length}</span></div>
          <details className="feature-rules"><summary>Правила новой ревизии</summary>{ruleDraft && <div className="feature-rule-checks">
            {([['excludeThrough', 'Исключать сквозные отверстия'], ['excludeBlind', 'Исключать глухие отверстия'], ['excludeBottomFace', 'Учитывать дно'], ['excludeCountersink', 'Исключать зенковки'], ['excludeCounterbore', 'Исключать цековки'], ['excludeClosedCavity', 'Исключать закрытые полости']] as Array<[keyof FeatureRules, string]>).map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(ruleDraft[key])} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setRuleDraft({ ...ruleDraft, [key]: event.target.checked })} />{label}</label>)}
          </div>}</details>
          <div className="saved-review-grid">
            <section><h4>Контакты</h4>{selected.contacts.length === 0 ? <p>Нет контактов.</p> : <table><thead><tr><th>ID / грани</th><th>Статус</th><th>Решение</th></tr></thead><tbody>{selected.contacts.map((contact) => <tr key={contact.contactId} onClick={() => setSelectedFaces([contact.faceAId, contact.faceBId])}><td><code>{contact.contactId}</code><small>{contact.faceAId}, {contact.faceBId}</small></td><td>{contact.status}</td><td><div className="table-actions"><button type="button" onClick={() => { void decide("contact", contact.contactId, "confirm"); }}>Подтвердить</button><button type="button" onClick={() => { void decide("contact", contact.contactId, "reject"); }}>Отклонить</button>{contact.manualDecision && <button type="button" onClick={() => { void decide("contact", contact.contactId, "reset"); }}>Сбросить</button>}</div></td></tr>)}</tbody></table>}</section>
            <section><h4>Features и ручные исключения</h4>{selected.features.length === 0 ? <p>Нет features.</p> : <table><thead><tr><th>Тип / грани</th><th>Статус</th><th>Решение</th></tr></thead><tbody>{selected.features.map((feature) => <tr key={feature.featureId} onClick={() => setSelectedFaces(feature.faceIds)}><td>{feature.featureType}<small>{feature.faceIds.join(", ")}</small></td><td>{feature.status}</td><td><div className="table-actions">{feature.featureType === "manual_feature" ? <button type="button" onClick={() => { void removeManual(feature.featureId); }}>Удалить</button> : <><button type="button" onClick={() => { void decide("feature", feature.featureId, "confirm"); }}>Подтвердить</button><button type="button" onClick={() => { void decide("feature", feature.featureId, "reject"); }}>Отклонить</button>{feature.manualDecision && <button type="button" onClick={() => { void decide("feature", feature.featureId, "reset"); }}>Сбросить</button>}</>}</div></td></tr>)}</tbody></table>}</section>
          </div>
        </div>
      </details>
    </article>}
  </section>;
}
