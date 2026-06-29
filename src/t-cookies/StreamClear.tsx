import { getContext } from "dinou";

export async function StreamClearComponent() {
  // Ensure headers are sent / flushed
  await new Promise((resolve) => setTimeout(resolve, 300));
  const ctx = getContext();
  if (ctx && ctx.res) {
    ctx.res.clearCookie("stream_cookie", { path: "/t-cookies", sameSite: "lax" });
  }
  return <div id="stream-clear-done">Cookie stream_cookie cleared via streaming!</div>;
}
