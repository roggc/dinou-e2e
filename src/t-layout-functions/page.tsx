import React from "react";

export default function Page({
  pageTitle,
  page,
}: {
  pageTitle?: string;
  page?: number;
}) {
  return (
    <div id="page-content">
      <h2 id="page-title">{pageTitle ?? "NO_PAGE_TITLE"}</h2>
      <p id="page-prop">Current Page: {page}</p>
      <a id="go-to-sub" href="/t-layout-functions/sub">
        Go to Subpage
      </a>
    </div>
  );
}
