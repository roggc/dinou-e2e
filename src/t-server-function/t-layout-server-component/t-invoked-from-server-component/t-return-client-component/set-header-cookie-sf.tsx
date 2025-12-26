"use server";

import { getContext } from "dinou";

export async function setHeaderCookieSF() {
  const ctx = getContext();
  // console.log(
  //   `[SF-Debug] ¿ID del Proxy?:`,
  //   ctx?.res?._proxyId || "¡NO TIENE ID!"
  // );
  // console.log("--- DEBUG START ---");
  // console.log("¿Existe ctx?:", !!ctx);
  // if (ctx && ctx.res) {
  //   console.log("Métodos disponibles en res:", Object.keys(ctx.res));
  //   console.log("¿res.cookie es función?:", typeof ctx.res.cookie);
  // }
  // console.log("--- DEBUG END ---");
  if (!ctx || !ctx.res) return null;
  ctx.res.setHeader("x-custom-dinou", "v4-rocks");
  // console.log("Setting cookie 'theme=dark'");
  ctx.res.cookie("theme", "dark", { path: "/" });
  return null;
}
