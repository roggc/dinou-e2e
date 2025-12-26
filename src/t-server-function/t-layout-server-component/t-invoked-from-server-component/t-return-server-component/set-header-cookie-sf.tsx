"use server";

import { getContext } from "dinou";

export async function setHeaderCookieSF() {
  const ctx = getContext();
  if (!ctx || !ctx.res) return null;
  ctx.res.setHeader("x-custom-dinou", "v4-rocks");
  ctx.res.cookie("theme", "dark", { path: "/" });
  return null;
}
