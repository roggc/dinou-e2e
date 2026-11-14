"use client";

import { useState } from "react";

export default function InlineActionClient({
  itemId,
  inlineClosureAction,
  inlineFormAction,
}: {
  itemId: string;
  inlineClosureAction: (note: string) => Promise<string>;
  inlineFormAction: (formData: FormData) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [result, setResult] = useState("");
  const [errInfo, setErrInfo] = useState("");

  return (
    <div data-testid="inline-sc-client">
      <input
        type="text"
        data-testid="inline-note-input"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={`Note for ${itemId}`}
      />
      <button
        type="button"
        data-testid="inline-run-btn"
        onClick={async () => {
          setErrInfo("");
          try {
            const out = await inlineClosureAction(note);
            setResult(out);
          } catch (err: unknown) {
            const typed = err as { message?: string; digest?: string };
            setErrInfo(
              `${typed?.message ?? "Error"}|${typed?.digest ?? "NONE"}`
            );
          }
        }}
      >
        Run Inline Action
      </button>
      <p data-testid="inline-result">{result}</p>
      <p data-testid="inline-error">{errInfo}</p>

      <form data-testid="inline-sc-form" action={inlineFormAction}>
        <input type="hidden" name="inlineField" value={itemId} />
      </form>
    </div>
  );
}

