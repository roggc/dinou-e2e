"use client";

export default function Page({ params: { slug, slug2 } }: { params: any }) {
  return (
    <h1 data-testid="res">
      Slug2: {slug} {slug2}
    </h1>
  );
}
