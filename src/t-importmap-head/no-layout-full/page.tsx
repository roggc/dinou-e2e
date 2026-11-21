import { InteractiveCounter } from "../InteractiveCounter";

export default function ImportmapNoLayoutFullPage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>Standalone No Layout — Dinou 🚀</title>
        <meta property="og:title" content="Standalone OG" />
        <meta property="og:image" content="https://dinou.dev/standalone-og.png" />
        <link href="/styles.css" rel="stylesheet" />
      </head>
      <body>
        <main data-testid="importmap-no-layout-full">
          <h1 data-testid="importmap-no-layout-heading">Standalone — No Layout 🚀</h1>
          <InteractiveCounter label="nolayout" />
        </main>
      </body>
    </html>
  );
}
