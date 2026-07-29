interface ErrorStateProps { error: string; onReload: () => void; }

export function ErrorState({ error, onReload }: ErrorStateProps): React.JSX.Element {
  return (
    <section className="state-card error-state" role="alert">
      <h2>Не удалось загрузить базу материалов</h2>
      <p>{error}</p>
      <button type="button" className="secondary-button" onClick={onReload}>Повторить загрузку</button>
    </section>
  );
}
