"use client";
import Suspense from "react-enhanced-suspense";
// import { quoteCard } from "./server-functions/quote-card";
import { redirect } from "./server-functions/redirect";
import { complexData } from "./server-functions/complex-data";
import { useEffect } from "react";

export default function Page() {
  useEffect(() => {
    redirect().then((data) => {
      console.log("redirect data", data);
    });
  }, []);

  return (
    <div>
      hello!
      {/* <Suspense fallback="pepito..." resourceId="foo">
        {() => redirect()}
      </Suspense> */}
      <Suspense fallback="pepito...">{() => complexData()}</Suspense>
    </div>
  );
}
