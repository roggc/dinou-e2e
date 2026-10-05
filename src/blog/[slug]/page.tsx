"use client";

import type { PageProps } from "dinou";

export default function Page({ params }: PageProps<"/blog/[slug]">) {
  return <h1>{`Ver Post: ${params.slug}`}</h1>;
}
