"use client";

export default function Z2CrashError({
  error,
}: {
  error: { message?: string; digest?: string; stack?: string };
}) {
  return (
    <section data-testid="z2-crash-error-boundary">
      <p data-testid="z2-crash-err-msg">{error?.message || "no-msg"}</p>
      <p data-testid="z2-crash-err-digest">{error?.digest || "no-digest"}</p>
      <p data-testid="z2-crash-err-stack">{error?.stack || "no-stack"}</p>
    </section>
  );
}
