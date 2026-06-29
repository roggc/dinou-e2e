"use server";

import { getContext } from "dinou";

export async function setCookieAction(name: string, value: string, options: any) {
  const ctx = getContext();
  if (ctx && ctx.res) {
    ctx.res.cookie(name, value, options);
  }
  return { success: true };
}

export async function clearCookieAction(name: string, options: any) {
  const ctx = getContext();
  if (ctx && ctx.res) {
    ctx.res.clearCookie(name, options);
  }
  return { success: true };
}
