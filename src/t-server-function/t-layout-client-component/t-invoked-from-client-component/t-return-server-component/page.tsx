"use client";

import Suspense from "react-enhanced-suspense";
import { serverFunction } from "./server-function";
import { getUserSF } from "./get-user-sf";

export default function Page() {
  return (
    <div>
      hello!
      <Suspense fallback="loading..." resourceId="header">
        {() => serverFunction()}
      </Suspense>
      <Suspense fallback="loading user..." resourceId="user">
        {() => getUserSF()}
      </Suspense>
    </div>
  );
}
