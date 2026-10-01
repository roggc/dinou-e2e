"use client";

import { useState, type ReactNode } from "react";
import "@/globals.css";

export default function Layout({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Dinou Nested Layout Error Test</title>
      </head>
      <body>
        <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
          <h1 id="err-nested-parent-title">Nested Error Parent Layout</h1>
          <div style={{ margin: "10px 0", display: "flex", gap: "10px", alignItems: "center" }}>
            <button id="btn-err-nested-inc" onClick={() => setCount((c) => c + 1)}>
              Inc Parent ({count})
            </button>
            <span id="val-err-nested-count">{count}</span>
          </div>
          <nav style={{ margin: "10px 0", display: "flex", gap: "15px" }}>
            <a id="link-nested-healthy" href="/t-err-nested/healthy">
              Healthy Sibling
            </a>
            <a id="link-nested-broken" href="/t-err-nested/child">
              Broken Nested Layout
            </a>
          </nav>
          <hr />
          <div id="err-nested-parent-slot">{children}</div>
        </div>
      </body>
    </html>
  );
}
