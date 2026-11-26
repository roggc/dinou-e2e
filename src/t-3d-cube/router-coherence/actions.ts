"use server";

import {
  getContext,
  revalidateLayout,
  revalidatePage,
  revalidatePath,
  revalidateTag,
} from "dinou/server";
import { writeCubeState, type Cube3DState } from "../shared/cube-state";

export async function rcMutateAndRevalPage(
  targetPath: string,
  patch: Partial<Cube3DState>
) {
  const next = writeCubeState(patch);
  await revalidatePage(targetPath);
  return { ok: true, targetPath, state: next };
}

export async function rcMutateRevalAndRedirect(
  targetPath: string,
  patch: Partial<Cube3DState>
) {
  writeCubeState(patch);
  await revalidatePage(targetPath);
  getContext()?.res?.redirect(targetPath);
  return { ok: true, targetPath };
}

export async function rcMutateAndRevalTag(
  tag: string,
  patch: Partial<Cube3DState>
) {
  const next = writeCubeState(patch);
  await revalidateTag(tag);
  return { ok: true, tag, state: next };
}

export async function rcMutateAndRevalLayout(
  layoutPath: string,
  patch: Partial<Cube3DState>
) {
  const next = writeCubeState(patch);
  await revalidateLayout(layoutPath);
  return { ok: true, layoutPath, state: next };
}

export async function rcMutateAndRevalPath(
  targetPath: string,
  patch: Partial<Cube3DState>
) {
  const next = writeCubeState(patch);
  await revalidatePath(targetPath);
  return { ok: true, targetPath, state: next };
}
