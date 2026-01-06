"use client";

export default function Page({ params: { slug, id } }: { params: any }) {
  return (
    <h1 data-testid="res">
      Slug2: {slug} {id}
    </h1>
  );
}
