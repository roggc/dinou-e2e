"use client";

export default function Page({ params: { sub } }: { params: { sub: string } }) {
  return <div id="res">DYNAMIC_SUB:{sub}</div>;
}
