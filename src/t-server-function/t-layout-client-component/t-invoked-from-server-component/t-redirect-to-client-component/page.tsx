import { redirectSF } from "./redirect-sf";
import Suspense from "react-enhanced-suspense";
import { ClientRedirect } from "@/components/client-redirect";

export default async function Page() {
  return (
    <div>
      This page will be redirected!
      <Suspense fallback="Redirecting...">{redirectSF()}</Suspense>
      {/* <Suspense fallback="Redirecting...">
        <ClientRedirect to="/" />
      </Suspense> */}
    </div>
  );
}
