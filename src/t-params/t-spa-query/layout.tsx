"use client";
import type { ReactNode } from "react";
import "@/globals.css";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>SPA Query Test</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
