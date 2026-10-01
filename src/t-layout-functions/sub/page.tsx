import React from "react";

export default function SubPage({
  pageTitle,
  page,
}: {
  pageTitle?: string;
  page?: number;
}) {
  return (
    <div id="subpage-content">
      <h2 id="page-title">{pageTitle ?? "NO_SUBPAGE_TITLE"}</h2>
      <p id="page-prop">Current Page: {page}</p>
      <a id="back-to-parent" href="/t-layout-functions">
        Back to Parent
      </a>
    </div>
  );
}
