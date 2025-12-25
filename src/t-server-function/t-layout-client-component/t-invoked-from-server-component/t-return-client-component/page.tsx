import Suspense from "react-enhanced-suspense";
import { serverFunction } from "./server-function";

export default async function Page() {
  return (
    <div>
      hello!
      <Suspense fallback="loading...">{serverFunction()}</Suspense>
    </div>
  );
}
