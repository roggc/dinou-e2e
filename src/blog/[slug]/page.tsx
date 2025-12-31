"use client";

export default function Page({
  params: { slug },
}: {
  params: { slug: string };
}) {
  return <h1>{`Ver Post: ${slug}`}</h1>;
}
