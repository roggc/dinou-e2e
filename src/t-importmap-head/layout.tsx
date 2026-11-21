import type { ReactNode } from "react";

export default function ImportmapHeadLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Dinou — Importmap Head 🚀</title>
        <meta
          name="description"
          content="HTML5 Standards Mode & Open Graph Head Ordering — Dinou"
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Dinou — Standards Mode" />
        <meta
          property="og:image"
          content="https://dinou.dev/og-image.png"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href="https://dinou.dev/t-importmap-head" />
        <link href="/styles.css" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
