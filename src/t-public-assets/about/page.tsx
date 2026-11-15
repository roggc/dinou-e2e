import { Link } from "./dinou";

export default function PublicAssetsAboutPage() {
  return (
    <main data-testid="public-assets-about-page">
      <h1>About Public Static Export</h1>
      <p data-testid="public-export-about-copy">
        Serverless RSC payload loaded from page.rsc
      </p>
      <Link
        data-testid="public-export-home-query-link"
        href="/t-public-assets?returned=1"
        prefetch={false}
      >
        Back to Public Assets
      </Link>
    </main>
  );
}

