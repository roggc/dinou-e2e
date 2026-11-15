import "./theme-first.css";
import "./theme-second.css";
import styles from "./card.module.css";
import fontAssetUrl from "./assets/test-font.woff2";
import { CounterWidget } from "./CounterWidget";

export default function StylesCssPage() {
  return (
    <main data-testid="styles-page-root">
      <h1>Unified Styles &amp; CSS Modules E2E</h1>
      <article data-testid="styles-server-card" className={styles.serverCard}>
        Server Styled Card
      </article>
      <div data-testid="styles-second-css" className="t-styles-second-css">
        Second Server CSS
      </div>
      <div data-testid="styles-asset-banner" className="t-styles-asset-banner">
        CSS URL Assets
      </div>
      <div
        data-testid="styles-imported-tile"
        className="t-styles-imported-tile"
      >
        Imported Tile Asset
      </div>
      <span
        data-testid="styles-tailwind-pill"
        className="bg-amber-600 text-white"
      >
        Tailwind Pill
      </span>
      <code data-testid="styles-font-import-url">{fontAssetUrl}</code>
      <CounterWidget />
    </main>
  );
}

