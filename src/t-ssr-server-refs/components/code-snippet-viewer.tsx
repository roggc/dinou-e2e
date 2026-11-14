"use client";

import { useState } from "react";

const SERVER_SNIPPET_DOC = `"use server";
import "server-only";

export async function exampleServerAction(text: string) {
  return text.toUpperCase();
}`;

// Verifies that a "use client" component containing "use server" inside a string/template
// literal is never mistaken for a server module in Pass B or any client bundler.
export default function CodeSnippetViewer() {
  const [expanded, setExpanded] = useState(true);

  return (
    <section data-testid="code-snippet-viewer">
      <button
        type="button"
        data-testid="snippet-toggle-btn"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {expanded ? "Hide Snippet" : "Show Snippet"}
      </button>
      {expanded && (
        <pre data-testid="snippet-preview">{SERVER_SNIPPET_DOC}</pre>
      )}
    </section>
  );
}

