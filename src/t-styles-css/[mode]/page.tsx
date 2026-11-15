import styles from "../card.module.css";
import hmrStyles from "../hmr-live.module.css";
import fontAssetUrl from "../assets/test-font.woff2";
import { CounterWidget } from "../CounterWidget";

export default function StylesCssDynamicModePage({
  params,
}: {
  params: { mode: string };
}) {
  return (
    <main data-testid="styles-dynamic-root">
      <h1 data-testid="styles-dynamic-heading">Initial Styles Server Heading</h1>
      <article data-testid="styles-dynamic-card" className={styles.serverCard}>
        Dynamic Pass A + Pass B Server Card
      </article>
      <span
        data-testid="styles-dynamic-badge"
        className={styles.dynamicModeBadge}
      >
        Mode:{params.mode}
      </span>
      <div data-testid="styles-dynamic-hmr" className={hmrStyles.hmrTarget}>
        Server HMR Box
      </div>
      <span
        data-testid="styles-dynamic-tailwind-pill"
        className="bg-amber-600 text-white"
      >
        Tailwind Pill
      </span>
      <code data-testid="styles-dynamic-font-url">{fontAssetUrl}</code>
      <CounterWidget />
    </main>
  );
}

