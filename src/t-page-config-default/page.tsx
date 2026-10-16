import React from "react";

export default function DefaultConfigPage({
  pageTitle,
  page,
}: {
  pageTitle?: string;
  page?: number;
}) {
  return (
    <div id="default-page-content">
      <h2 id="default-page-title">{pageTitle ?? "NO_PAGE_TITLE"}</h2>
      <p id="default-page-prop">Current Page: {page}</p>
      <a id="default-go-to-sub" href="/t-page-config-default/sub">
        Go to Subpage
      </a>
    </div>
  );
}
