"use client";

import { useEffect, useRef, useState } from "react";
import { ClientRedirect, Link, useRouter, type DinouRoute } from "dinou";

export function NavRefClientControls() {
  const router = useRouter();
  const [localTick, setLocalTick] = useState(0);
  const [effectRuns, setEffectRuns] = useState(0);
  const [extUrl, setExtUrl] = useState("");
  const [mountClientRedirect, setMountClientRedirect] = useState(false);

  const prevRouterRef = useRef(router);
  const refChangesRef = useRef(0);
  if (prevRouterRef.current !== router) {
    refChangesRef.current += 1;
    prevRouterRef.current = router;
  }

  useEffect(() => {
    setEffectRuns((c) => c + 1);
  }, [router]);

  return (
    <section data-testid="api-nav-controls">
      <div>
        <button
          type="button"
          data-testid="api-nav-bump-local"
          onClick={() => setLocalTick((n) => n + 1)}
        >
          Local:{localTick}
        </button>
        <span data-testid="api-nav-effect-runs">EffectRuns:{effectRuns}</span>
        <span data-testid="api-nav-ref-changes">
          RefChanges:{refChangesRef.current}
        </span>
      </div>

      <nav style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <Link href="/t-api-ref-nav/guarded" data-testid="api-nav-link-guarded">
          Go Guarded
        </Link>
        <Link
          href="/t-api-ref-nav/layout-guarded"
          data-testid="api-nav-link-layout-guarded"
        >
          Go Layout Guarded
        </Link>
        <Link
          href="/t-api-ref-nav/report"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="api-nav-link-blank"
        >
          Report New Tab
        </Link>
        <Link
          href="/t-api-ref-nav/report"
          target="_self"
          data-testid="api-nav-link-self"
        >
          Report Self Tab
        </Link>
        <Link
          href="/t-api-ref-nav/report"
          download="api-ref-report.html"
          data-testid="api-nav-link-download"
        >
          Download Report
        </Link>
        <Link
          href="/t-api-ref-nav/counter#target-sec"
          fresh
          data-testid="api-nav-link-hash-fresh"
        >
          Fresh Hash Counter
        </Link>
      </nav>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
        <a
          href="/t-api-ref-nav/report"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="api-nav-anchor-blank"
        >
          Plain Anchor Blank
        </a>
        <a
          href="/t-api-ref-nav/report"
          target="_self"
          data-testid="api-nav-anchor-self"
        >
          Plain Anchor Self
        </a>
        <a
          href="/downloads/brochure%202026.pdf"
          download="brochure-2026.pdf"
          data-testid="api-nav-anchor-download"
        >
          Plain Anchor Download
        </a>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
        <input
          type="text"
          value={extUrl}
          onChange={(e) => setExtUrl(e.target.value)}
          placeholder="External URL"
          data-testid="api-nav-ext-url-input"
        />
        <button
          type="button"
          data-testid="api-nav-btn-ext-push"
          onClick={() => {
            if (extUrl) router.push(extUrl as DinouRoute);
          }}
        >
          External Push
        </button>
        <button
          type="button"
          data-testid="api-nav-btn-ext-replace"
          onClick={() => {
            if (extUrl) router.replace(extUrl as DinouRoute);
          }}
        >
          External Replace
        </button>
        <button
          type="button"
          data-testid="api-nav-btn-ext-client-redirect"
          onClick={() => {
            if (extUrl) setMountClientRedirect(true);
          }}
        >
          External ClientRedirect
        </button>
        {mountClientRedirect && extUrl ? <ClientRedirect to={extUrl} /> : null}
      </div>
    </section>
  );
}
