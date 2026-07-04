"use client";
import { useSearchParams } from "dinou";
import { useState, useEffect } from "react";

export default function Page({ params }: any) {
  const rawSearchParams = useSearchParams();
  const [searchParams, setSearchParams] = useState(new URLSearchParams());

  useEffect(() => {
    setSearchParams(rawSearchParams);
  }, [rawSearchParams]);

  return (
    <>
      <div>page params: {JSON.stringify(params, null, 2)}</div>
      <div>
        page searchParams:
        {JSON.stringify(Object.fromEntries(searchParams), null, 2)}
      </div>
    </>
  );
}
