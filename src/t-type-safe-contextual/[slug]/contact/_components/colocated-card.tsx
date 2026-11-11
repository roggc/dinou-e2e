"use client";

// Exercises parent relative "../dinou" resolution inside private `_components/`
// across esbuild (+ .dinou/swc/), Rollup, Webpack, and Dual-Engine SSR!
import { Link, ROUTE } from "../dinou";

export function ColocatedCard() {
  return (
    <div data-testid="ctx-colocated-card" data-colocated-route={ROUTE}>
      <Link data-testid="colocated-link-sub" to="./sub">
        Colocated Link to Sub
      </Link>
    </div>
  );
}

