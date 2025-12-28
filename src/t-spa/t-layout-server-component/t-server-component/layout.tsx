"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  return (
    <div>
      <div>
        Layout: hello from
        t-layout-server-component/t-client-component/layout.tsx
      </div>
      <div>
        <p data-testid="counter">{count}</p>
        <button onClick={() => setCount(count + 1)}>Increment</button>
      </div>
      {children}
    </div>
  );
}
