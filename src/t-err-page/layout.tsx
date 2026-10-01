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
        <title>Dinou Page Error Test</title>
      </head>
      <body>
        <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
          <h1 id="err-page-layout-title">Error Isolation Page Layout</h1>
          <div style={{ margin: "10px 0", display: "flex", gap: "10px", alignItems: "center" }}>
            <button id="btn-err-page-inc" onClick={() => setCount((c) => c + 1)}>
              Inc ({count})
            </button>
            <span id="val-err-page-count">{count}</span>
          </div>
          <nav style={{ margin: "10px 0", display: "flex", gap: "15px" }}>
            <a id="link-err-page-healthy" href="/t-err-page/healthy">
              Healthy Page
            </a>
            <a id="link-err-page-broken" href="/t-err-page/broken">
              Broken Page
            </a>
          </nav>
          <hr />
          <div id="err-page-slot">{children}</div>
        </div>
      </body>
    </html>
  );
}
