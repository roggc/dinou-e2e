import React from "react";

export default function DefaultConfigSubPage({
  pageTitle,
  page,
}: {
  pageTitle?: string;
  page?: number;
}) {
  return (
    <div id="default-subpage-content">
      <h2 id="default-page-title">{pageTitle ?? "NO_SUBPAGE_TITLE"}</h2>
      <p id="default-page-prop">Current Page: {page}</p>
      <a id="default-back-to-parent" href="/t-page-config-default">
        Back to Parent
      </a>
    </div>
  );
}
