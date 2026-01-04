"use client";

export default function Page({ params, searchParams }: any) {
  return (
    <>
      <div>page params: {JSON.stringify(params, null, 2)}</div>
      <div>page searchParams: {JSON.stringify(searchParams, null, 2)}</div>
    </>
  );
}
