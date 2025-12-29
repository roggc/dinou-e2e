"use client";

export default function Page() {
  return (
    <>
      <a href="../page-b" data-testid="sibling">
        go to page b
      </a>
      <a href="nested" data-testid="nested">
        go to nested page
      </a>
    </>
  );
}
