"use client";

export default function Page() {
  return <div data-testid="timestamp">{new Date().toISOString()}</div>;
}
