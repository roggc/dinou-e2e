export default function PublicAssetsTestPage() {
  return (
    <main data-testid="public-assets-page">
      <h1>Public Static Assets E2E</h1>
      <img
        id="og-preview"
        data-testid="public-og-preview"
        src="/images/og-image.png"
        alt="OG Preview"
      />
      <img
        id="nested-svg-preview"
        data-testid="public-nested-svg"
        src="/images/nested/badge.svg"
        alt="Nested Badge"
      />
    </main>
  );
}

