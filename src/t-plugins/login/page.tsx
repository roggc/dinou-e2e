import { Suspense } from "react";
import { Link } from "./dinou";
import { ClientLoginQuery } from "./ClientLoginQuery";

export default function TPluginsLoginPage() {
  return (
    <main data-testid="t-plugins-login-page">
      <h1 id="t-plugins-login-heading">Plugin Auth Login Required</h1>
      <Suspense fallback={<p>Loading login query...</p>}>
        <ClientLoginQuery />
      </Suspense>
      <Link to="/t-plugins" id="link-back-plugins-home">
        Back to Plugins Home
      </Link>
    </main>
  );
}

