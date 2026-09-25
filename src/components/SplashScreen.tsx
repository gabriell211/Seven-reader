import { BrandMark } from "./BrandMark";

export function SplashScreen({ leaving }: { leaving: boolean }) {
  return (
    <div className={`splash ${leaving ? "splash--leaving" : ""}`} role="status" aria-live="polite">
      <div className="splash-glow splash-glow--one" />
      <div className="splash-glow splash-glow--two" />
      <div className="splash-content">
        <div className="splash-brand-shell">
          <BrandMark size={82} />
          <div className="splash-orbit" />
        </div>
        <div className="splash-copy">
          <h1>Seven Reader</h1>
          <p>Read. Edit. Convert. Sign. Protect.</p>
        </div>
        <div className="splash-progress" aria-hidden="true">
          <span />
        </div>
      </div>
      <div className="splash-foot">Documentos locais. Controle seu.</div>
    </div>
  );
}
