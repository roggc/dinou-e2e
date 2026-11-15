import { Link } from "./dinou";

export default function PublicAssetsTestPage() {
  return (
    <main data-testid="public-assets-page">
      <h1>Public Static Assets E2E</h1>
      <a data-testid="pwa-manifest-link" href="/manifest.json">
        PWA Manifest
      </a>
      <Link
        data-testid="public-export-about-link"
        href="/t-public-assets/about"
        prefetch={false}
      >
        Go to Static Export About
      </Link>
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
