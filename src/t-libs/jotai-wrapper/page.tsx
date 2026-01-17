"use client";

import Counter from "./counter";
import { usePathname } from "dinou";

export default function JotaiPage() {
  const pathname = usePathname();
  return (
    <div>
      <h1>Testing External Libs (ESM)</h1>
      <Counter />
      <div>pathname: {pathname}</div>
    </div>
  );
}
