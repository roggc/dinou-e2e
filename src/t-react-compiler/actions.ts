"use server";

const COMPILER_SERVER_SECRET = "sk_live_RC_ACTION_VAULT_2026";

export async function echoCompiledAction(
  prefix: string,
  count: number
): Promise<string> {
  return `ack:${prefix}:${count}:len=${COMPILER_SERVER_SECRET.length}`;
}

