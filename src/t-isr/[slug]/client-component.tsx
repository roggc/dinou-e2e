"use client";

export default function ClientComponent({ timestamp }: { timestamp?: string }) {
  return <div data-testid="timestamp">{timestamp}</div>;
}
