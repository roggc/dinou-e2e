import CookieClientPage from "./CookieClientPage";
import { StreamClearComponent } from "./StreamClear";
import Suspense from "react-enhanced-suspense";

export default function Page({ query }: { query?: any }) {
  const streamClear = query?.streamClear === "true";

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
