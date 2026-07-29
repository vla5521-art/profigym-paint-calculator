export function Header(): React.JSX.Element {
  return (
    <header className="hero">
      <div className="brand-logo-backdrop">
        <img className="brand-logo" src="/assets/logo-transparent.png" alt="PROFiGYM" />
      </div>
      <div className="hero-title-row">
        <h1 id="page-title">КАЛЬКУЛЯТОР РАСХОДА КРАСКИ</h1>
        <p className="version">Версия 1.3.0</p>
      </div>
    </header>
  );
}
