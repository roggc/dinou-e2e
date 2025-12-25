"use client";

import Suspense from "react-enhanced-suspense";
import { serverFunction } from "./server-function";

export default function Page() {
  return (
    <div>
      hello!
      <Suspense fallback="loading..." resourceId="foo">
        {() => serverFunction()}
      </Suspense>
    </div>
  );
}
