"use client";

import { useState } from "react";
import styles from "./card.module.css";
import hmrStyles from "./hmr-live.module.css";

export function CounterWidget() {
  const [count, setCount] = useState(0);

  return (
    <div data-testid="styles-client-widget-root">
      <button
        type="button"
        data-testid="styles-client-counter"
        className={styles.clientCounter}
        onClick={() => setCount((c) => c + 1)}
      >
        Count: {count}
      </button>
      <div data-testid="styles-hmr-target" className={hmrStyles.hmrTarget}>
        HMR Target
      </div>
    </div>
  );
}

