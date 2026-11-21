"use client";

import { useState } from "react";

export function InteractiveCounter({ label = "ssg" }: { label?: string }) {
  const [count, setCount] = useState(0);

  return (
    <div data-testid={`importmap-counter-${label}`}>
      <span data-testid={`importmap-count-val-${label}`}>Count:{count}</span>
      <button
        type="button"
        data-testid={`importmap-count-btn-${label}`}
        onClick={() => setCount((c) => c + 1)}
      >
        Increment
      </button>
    </div>
  );
}
