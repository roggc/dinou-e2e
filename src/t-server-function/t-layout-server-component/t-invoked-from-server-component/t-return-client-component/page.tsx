import Suspense from "react-enhanced-suspense";
import { serverFunction } from "./server-function";
import { getUserSF } from "./get-user-sf";

export default async function Page() {
  return (
    <div>
      hello!
      <Suspense fallback="loading...">{serverFunction()}</Suspense>
      <Suspense fallback="loading user...">{getUserSF()}</Suspense>
    </div>
  );
}
