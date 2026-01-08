"use client";

export default function Page({ params }: any) {
  return <div>{JSON.stringify(params, null, 2)}</div>;
}
