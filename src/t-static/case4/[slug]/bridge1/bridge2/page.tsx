"use client";

export default function Page({ params }: any) {
  return <div data-testid="case4-params">{JSON.stringify(params, null, 2)}</div>;
}

