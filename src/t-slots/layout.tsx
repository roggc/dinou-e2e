"use client";

import type { ReactNode } from "react";
import "@/globals.css";

export default function Layout({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Dinou app</title>
        <link rel="icon" type="image/png" href="/favicon.ico" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
        <link rel="manifest" href="/site.webmanifest"></link>
        <link href="/styles.css" rel="stylesheet"></link>
      </head>
      <body>
        <div id="slots-layout" style={{ display: "flex", gap: "20px" }}>
          {/* Área lateral (Slot) */}
          <aside
            id="area-sidebar"
            style={{ border: "2px solid red", padding: "10px" }}
          >
            <h2>Zona Sidebar</h2>
            {sidebar}
          </aside>

          {/* Área principal (Page) */}
          <main
            id="area-main"
            style={{ border: "2px solid blue", padding: "10px", flex: 1 }}
          >
            <h2>Zona Principal</h2>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
