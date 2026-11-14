const INLINE_RC_SECRET = "sk_live_RC_INLINE_VAULT_2026";

export async function echoInlineCompiledAction(tag: string): Promise<string> {
  "use server";
  return `inline-ack:${tag}:len=${INLINE_RC_SECRET.length}`;
}

