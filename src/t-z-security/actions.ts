"use server";
import { getContext } from "dinou";

export async function z2ThrowInternalSecret() {
  throw new Error("Z2_BROWSER_SECRET_DB_PASS: postgres://admin:secret@db/prod");
}

export async function z2ThrowDigestError() {
  const err = new Error("Z2 intentional domain validation error") as Error & {
    digest?: string;
  };
  err.digest = "Z2_DIGEST_OK";
  throw err;
}

export async function z2SafeRedirect(target: string) {
  const { res } = getContext();
  res.redirect(target);
}
