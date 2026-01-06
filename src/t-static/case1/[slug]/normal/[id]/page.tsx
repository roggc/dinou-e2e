"use client";

export default function Page({ params: { slug, id } }: { params: any }) {
  return (
    <h1 data-testid="res">
      {slug} {id}
    </h1>
  );
}
