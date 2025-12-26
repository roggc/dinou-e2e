"use client";

import Suspense from "react-enhanced-suspense";
import { serverFunction } from "./server-function";
import { getUserSF } from "./get-user-sf";
import { setHeaderCookieSF } from "./set-header-cookie-sf";

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
      <Suspense fallback="setting cookie..." resourceId="set-cookie">
        {() => setHeaderCookieSF()}
      </Suspense>
    </div>
  );
}
