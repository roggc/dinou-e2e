import Suspense from "react-enhanced-suspense";
import { quoteCard } from "./server-functions/quote-card";

export default async function Page() {
  return (
    <div>
      hello!
      <Suspense fallback="pepito...">{quoteCard()}</Suspense>
    </div>
  );
}
