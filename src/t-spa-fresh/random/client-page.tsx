"use client";

import { useRouter } from "dinou";

export default function ClientPage({ num }: any) {
  const { back } = useRouter();
  return (
    <div>
      <h1>
        Random:
        <span id="rnd-val" suppressHydrationWarning>
          {num}
        </span>
      </h1>
      <button onClick={back} id="go-back">
        go back
      </button>
    </div>
  );
}
