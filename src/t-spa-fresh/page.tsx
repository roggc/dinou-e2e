"use client";

import { Link } from "dinou";

export default function HomePage() {
  return (
    <div>
      <h1>Home</h1>
      {/* Enlace Normal (usará caché si ya visitamos la página) */}
      <Link href="/t-spa-fresh/random" id="link-cached" prefetch={false}>
        Go Cached
      </Link>

      <br />

      {/* Enlace Fresh (borrará caché antes de navegar) */}
      <Link href="/t-spa-fresh/random" fresh id="link-fresh">
        Go Fresh
      </Link>
    </div>
  );
}
