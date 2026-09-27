"use server";

import { getContext } from "dinou";

export async function getPluginUser() {
  const ctx = getContext();
  return (ctx as any)?.user || null;
}
