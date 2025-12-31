"use client";

export default function Page({
  params: { slug },
}: {
  params: { slug: string };
}) {
  return <h1 data-testid="res">Slug: {slug}</h1>;
}
