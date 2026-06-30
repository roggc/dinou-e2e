import { getContext } from "dinou";

export async function StreamClearComponent() {
  const ctx = getContext();
  console.log("🌊 StreamClearComponent starting!", { hasCtx: !!ctx, hasRes: !!ctx?.res });
  // Ensure headers are sent / flushed
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (ctx && ctx.res) {
    console.log("🌊 Clearing stream_cookie...");
    ctx.res.clearCookie("stream_cookie", { path: "/t-cookies", sameSite: "lax" });
  } else {
    console.warn("🌊 Context/response is missing!");
  }
  return <div id="stream-clear-done">Cookie stream_cookie cleared via streaming!</div>;
}
