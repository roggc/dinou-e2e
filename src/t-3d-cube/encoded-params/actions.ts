"use server";

import {
  revalidateLayout,
  revalidatePage,
  revalidatePath,
  revalidateTag,
} from "dinou/server";
import { writeCubeState, type Cube3DState } from "../shared/cube-state";

export async function encMutateAndRevalRelativePage(
  patch: Partial<Cube3DState>
) {
  const next = writeCubeState(patch);
  await revalidatePage("./");
  return { ok: true, state: next };
}

export async function encMutateAndRevalRelativeParentLayout(
  patch: Partial<Cube3DState>
) {
  const next = writeCubeState(patch);
  await revalidateLayout("..");
  return { ok: true, state: next };
}

export async function encMutateAndRevalPage(
  targetPath: string,
  patch: Partial<Cube3DState>
) {
  const next = writeCubeState(patch);
  await revalidatePage(targetPath);
  return { ok: true, targetPath, state: next };
}

export async function encMutateAndRevalPath(
  targetPath: string,
  patch: Partial<Cube3DState>
) {
  const next = writeCubeState(patch);
  await revalidatePath(targetPath);
  return { ok: true, targetPath, state: next };
}

export async function encMutateAndRevalTag(
  tag: string,
  patch: Partial<Cube3DState>
) {
  const next = writeCubeState(patch);
  await revalidateTag(tag);
  return { ok: true, tag, state: next };
}
