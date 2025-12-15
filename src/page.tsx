import Suspense from "react-enhanced-suspense";
// import { quoteCard } from "./server-functions/quote-card";
import { redirect } from "./server-functions/redirect";

export default async function Page() {
  return (
    <div>
      hello!
      <Suspense fallback="pepito...">{redirect()}</Suspense>
    </div>
  );
}
