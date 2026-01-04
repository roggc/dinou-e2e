"use client";

import type { ReactNode } from "react";
import "@/globals.css";

export default function Layout({
  children,
  params,
  searchParams,
}: {
  children: ReactNode;
  params: Record<string, string>;
  searchParams: Record<string, string>;
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
        {children}
        <div>layout params:{JSON.stringify(params, null, 2)}</div>
        <div>layout searchParams:{JSON.stringify(searchParams, null, 2)}</div>
      </body>
    </html>
  );
}
