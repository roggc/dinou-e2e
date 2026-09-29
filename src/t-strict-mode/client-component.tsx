"use client";
import { useEffect, useState } from "react";

export default function ClientComponent() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__STRICT_MODE_EFFECT_COUNT__ =
        ((window as any).__STRICT_MODE_EFFECT_COUNT__ || 0) + 1;
      setCount((window as any).__STRICT_MODE_EFFECT_COUNT__);
    }
  }, []);

  return (
    <div>
      <h1 id="strict-mode-title">React StrictMode Test</h1>
      <p id="strict-mode-effect-count">{count}</p>
    </div>
  );
}
