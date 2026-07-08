"use server";

import { getContext } from "dinou";

export async function setCookieAction() {
  const ctx = getContext();
  if (ctx && ctx.res) {
    // Set a session cookie via IPC response proxy
    ctx.res.cookie("dinou_test_cookie", "active-session-token", {
      httpOnly: true,
      maxAge: 60 * 1000, // 1 minute
      path: "/",
    });
  }
}

export async function clearCookieAction() {
  const ctx = getContext();
  if (ctx && ctx.res) {
    // Clear the session cookie via IPC response proxy
    ctx.res.clearCookie("dinou_test_cookie", { path: "/" });
  }
}
