"use client";

import { useState } from "react";

export default function Header() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <h1>Header Component</h1>
      <p data-testid="counter">{count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}
