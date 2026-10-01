"use client";

import { useState, type ReactNode } from "react";
import "@/globals.css";

export default function Layout({ children }: { children: ReactNode }) {
  const [topCount, setTopCount] = useState(0);
  const [text, setText] = useState("");

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Dinou RSC Segmentation</title>
      </head>
      <body>
        <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
          <h1 id="seg-top-title">RSC Segmentation Root Layout</h1>
          <div style={{ margin: "10px 0", display: "flex", gap: "10px", alignItems: "center" }}>
            <button id="btn-top-inc" onClick={() => setTopCount((c) => c + 1)}>
              Inc Top
            </button>
            <span id="val-top-count">{topCount}</span>
            <input
              id="input-top-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="State preservation test"
            />
          </div>
          <nav style={{ margin: "10px 0", display: "flex", gap: "15px" }}>
            <a id="link-seg-a1" href="/t-seg-rsc/nested-a/page-1">
              Section A - Page 1
            </a>
            <a id="link-seg-a2" href="/t-seg-rsc/nested-a/page-2">
              Section A - Page 2
            </a>
            <a id="link-seg-b1" href="/t-seg-rsc/nested-b/page-1">
              Section B - Page 1
            </a>
          </nav>
          <hr />
          <div id="seg-root-slot">{children}</div>
        </div>
      </body>
    </html>
  );
}
