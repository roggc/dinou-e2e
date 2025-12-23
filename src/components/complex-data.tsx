"use client";
import { use, useEffect } from "react";

export default function ComplexData({
  date,
  map,
  set,
  bigint,
}: //   bigint,
{
  date: Date;
  map: Map<string, number>;
  set: Set<number>;
  bigint: bigint;
}) {
  useEffect(() => {
    console.log({ date, map, set, bigint });
  }, []);

  return (
    <div>
      <h2>Complex Data</h2>
      <pre>{JSON.stringify({ date, map, set }, null, 2)}</pre>
    </div>
  );
}
