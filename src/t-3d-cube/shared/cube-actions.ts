"use server";

import {
  revalidateLayout,
  revalidatePage,
  revalidatePath,
  revalidateTag,
} from "dinou/server";
import {
  readCubeState,
  writeCubeState,
  resetCubeState,
  type Cube3DState,
} from "./cube-state";

export async function cubeResetState() {
  return resetCubeState();
}

export async function cubeMutateState(patch: Partial<Cube3DState>) {
  return writeCubeState(patch);
}

export async function cubeRevalidateTag(tag: string) {
  await revalidateTag(tag);
  return { ok: true, tag, state: readCubeState() };
}

export async function cubeRevalidatePage(targetPath: string) {
  const ok = await revalidatePage(targetPath);
  return { ok, targetPath, state: readCubeState() };
}

export async function cubeRevalidateLayout(targetPath: string) {
  const ok = await revalidateLayout(targetPath);
  return { ok, targetPath, state: readCubeState() };
}

export async function cubeRevalidatePath(targetPath: string) {
  await revalidatePath(targetPath);
  return { ok: true, targetPath, state: readCubeState() };
}

export async function cubePingAction(label: string) {
  return { ok: true, reply: `pong:${label}`, at: Date.now() };
}
