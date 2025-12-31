"use client";

export default function Page({ params }: any) {
  return <div id="res">CATCH_ALL:{JSON.stringify(params.slug)}</div>;
}
