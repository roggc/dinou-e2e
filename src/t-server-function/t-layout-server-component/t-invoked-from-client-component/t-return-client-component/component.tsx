"use client";

export default function Component({ header }: { header?: string }) {
  return (
    <div>
      bye!
      {header && <div>Helper accessed User-Agent: {header}</div>}
    </div>
  );
}
