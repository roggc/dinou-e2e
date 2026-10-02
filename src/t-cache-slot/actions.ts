"use server";

import { revalidateTag } from "dinou/server";

export async function revalidateTagAlpha() {
  await revalidateTag("tag-alpha");
}

export async function revalidateTagBeta() {
  await revalidateTag("tag-beta");
}
