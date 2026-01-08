"use client";

import { getContext } from "dinou";

export default function Page() {
  const ctx = getContext();
  return <div>hello {JSON.stringify(ctx, null, 2)}</div>;
}
