import { SERVER_VAULT_SECRET } from "../../lib/server-only-guard";
import InlineActionClient from "./InlineActionClient";

export default function InlineServerRefIsolationPage({
  params,
}: {
  params: { itemId: string };
}) {
  const currentItemId = params.itemId;

  if (!SERVER_VAULT_SECRET.startsWith("sk_live_")) {
    throw new Error("Server vault guard missing in Pass A");
  }

  async function verifyInlineClosureAction(note: string): Promise<string> {
    "use server";
    const trimmed = (note ?? "").trim();
    if (trimmed.length < 2) {
      const err = new Error("Inline note too short.") as Error & {
        digest?: string;
      };
      err.digest = "INLINE_NOTE_SHORT";
      throw err;
    }
    return `InlineOK:${currentItemId}:${trimmed}:len=${SERVER_VAULT_SECRET.length}`;
  }

  async function inlineFormAction(formData: FormData): Promise<void> {
    "use server";
    void currentItemId;
    void formData.get("inlineField");
  }

  return (
    <main data-testid="inline-sc-page">
      <h1 data-testid="inline-sc-heading">{`InlineSC:${currentItemId}`}</h1>
      <InlineActionClient
        itemId={currentItemId}
        inlineClosureAction={verifyInlineClosureAction}
        inlineFormAction={inlineFormAction}
      />
    </main>
  );
}

