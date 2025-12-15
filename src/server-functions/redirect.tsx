"use server";

import { getContext } from "dinou";

export async function redirect() {
  const ctx = getContext();
  if (!ctx) return;

  //   await new Promise((resolve) => setTimeout(resolve, 2000));
  ctx.res.redirect("/docs");
}
