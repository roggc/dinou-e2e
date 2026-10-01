"use client";

import type { ReactNode } from "react";
import "@/globals.css";
import { HeaderWithNamedCounter } from "./components/named-client";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Dinou Named Exports Test</title>
      </head>
      <body>
        <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
          <h1 id="named-exports-layout-title">Named Exports Shell Layout</h1>
          <HeaderWithNamedCounter />
          <hr />
          <div id="named-exports-content">{children}</div>
        </div>
      </body>
    </html>
  );
}
