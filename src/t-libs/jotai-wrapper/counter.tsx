"use client";
import { useAtom } from "@/atoms";
import { usePathname } from "dinou";

export default function Counter() {
  const [count, setCount] = useAtom("counter");
  const pathname = usePathname();
  return (
    <div style={{ border: "1px solid purple", padding: "10px" }}>
      <h3 id="jotai-header">Jotai Integration</h3>
      <p>
        Count: <span id="count-val">{count}</span>
      </p>
      <button id="btn-inc" onClick={() => setCount((c: any) => c + 1)}>
        Increment
      </button>
      <div>{pathname}</div>
    </div>
  );
}
