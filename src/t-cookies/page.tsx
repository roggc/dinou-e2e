import CookieClientPage from "./CookieClientPage";
import { StreamClearComponent } from "./StreamClear";
import Suspense from "react-enhanced-suspense";
import { getContext } from "dinou";

export default async function Page() {
  const ctx = getContext();
  const streamClear = ctx?.req?.query?.streamClear === "true";

  return (
    <div style={{ padding: 20 }}>
      <h1>Cookie Test Page</h1>
      <CookieClientPage />
      {streamClear && (
        <Suspense fallback={<div id="loading-stream">Loading stream...</div>} resourceId="stream-clear">
          {/* @ts-ignore */}
          {() => <StreamClearComponent />}
        </Suspense>
      )}
    </div>
  );
}
