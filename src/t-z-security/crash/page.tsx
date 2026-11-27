export default function Z2CrashPage() {
  const err = new Error("Z2_SSR_SECRET_LEAK_TOKEN") as Error & { digest?: string };
  err.digest = "Z2_SSR_DIGEST_OK";
  throw err;
}
