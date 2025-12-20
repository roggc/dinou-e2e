"use client";
import Suspense from "react-enhanced-suspense";
// import { quoteCard } from "./server-functions/quote-card";
import { redirect } from "./server-functions/redirect";

export default function Page() {
  return (
    <div>
      hello!
      <Suspense fallback="pepito..." resourceId="foo">
        {() => redirect()}
      </Suspense>
    </div>
  );
}
