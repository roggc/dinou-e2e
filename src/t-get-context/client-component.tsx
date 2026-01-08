"use client";

export default function ClientComponent({ req }: any) {
  return <div>{JSON.stringify(req)}</div>;
}
