"use client";

import { useRouter } from "./dinou";

export default function ClientWidget() {
  const router = useRouter();
  return (
    <button type="button" onClick={() => router.push("/")}>
      Parked Client Widget
    </button>
  );
}

