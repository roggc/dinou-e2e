"use client";

export function ClientComponent({ timestamp }: { timestamp?: string }) {
  return <div data-testid="timestamp">{timestamp}</div>;
}
