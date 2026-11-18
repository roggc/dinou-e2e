"use client";

import { useState } from "react";
import styles from "@/t-bundlers/bundlers.module.css";
import { doubleOnServer } from "@/t-bundlers/actions";

export default function BundlerParityClient() {
  const [val, setVal] = useState(3);
  const [rpcTool, setRpcTool] = useState("idle");
  const tripled = val * 3;

  return (
    <section data-testid="bundlers-client-box">
      <span
        data-testid="bundlers-val"
        data-tripled={tripled}
        className={styles.badge}
      >
        {val}
      </span>
      <span data-testid="bundlers-rpc-tool">{rpcTool}</span>
      <button
        type="button"
        data-testid="bundlers-double-btn"
        onClick={async () => {
          const res = await doubleOnServer(val);
          setVal(res.next);
          setRpcTool(res.buildTool);
        }}
      >
        Double via Server Function
      </button>
    </section>
  );
}

