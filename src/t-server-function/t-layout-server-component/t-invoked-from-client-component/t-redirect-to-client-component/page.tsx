"use client";

import { redirectSF } from "./redirect-sf";
import Suspense from "react-enhanced-suspense";

export default function Page() {
  return (
    <div>
      This page will be redirected!
      <Suspense fallback="Redirecting..." resourceId="redirect">
        {() => redirectSF()}
      </Suspense>
    </div>
  );
}
