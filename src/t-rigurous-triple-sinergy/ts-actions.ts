"use server";

import {
  revalidatePage,
  revalidateLayout,
  revalidatePath,
  revalidateTag,
} from "dinou/server";
import { readTsState, writeTsState, resetTsState, type TsState } from "./ts-state";

export async function tsGetState() {
  return readTsState();
}

export async function tsMutateOnly(patch: Partial<TsState>) {
  return writeTsState(patch);
}

export async function tsBumpKeys(keys: (keyof TsState)[]) {
  const cur = readTsState();
  const patch: Partial<TsState> = {};
  for (const k of keys) {
    const val = cur[k];
    if (typeof val === "number") {
      (patch as any)[k] = val + 1;
    }
  }
  return writeTsState(patch);
}

export async function tsResetAllAndRevalidate() {
  const state = resetTsState();
  await revalidateTag("ts-layout-shell-slot-tag");
  await revalidateTag("ts-nested-layout-slot-tag");
  await revalidateTag("ts-ppr-a-shell-slot-tag");
  await revalidateTag("ts-ppr-a-hole-slot-tag");
  await revalidateTag("ts-hole-nested-outer-tag");
  await revalidateTag("ts-hole-nested-inner-tag");
  await revalidateTag("ts-ppr-b-shell-slot-tag");
  await revalidateTag("ts-ppr-b-hole-slot-tag");
  await revalidateTag("ts-static-a-slot-tag");
  await revalidateTag("ts-static-b-slot-tag");

  await revalidateLayout("/t-rigurous-triple-sinergy");
  await revalidateLayout("/t-rigurous-triple-sinergy/nested");
  await revalidatePage("/t-rigurous-triple-sinergy");
  await revalidatePage("/t-rigurous-triple-sinergy/ppr-b");
  await revalidatePage("/t-rigurous-triple-sinergy/static-a");
  await revalidatePage("/t-rigurous-triple-sinergy/static-b");
  await revalidatePage("/t-rigurous-triple-sinergy/nested");
  await revalidatePage("/t-rigurous-triple-sinergy/nested/static-child");
  return state;
}

export async function tsRunRevalidateTag(tag: string) {
  await revalidateTag(tag);
  return { ok: true, tag, state: readTsState() };
}

export async function tsRunRevalidatePage(targetPath: string) {
  await revalidatePage(targetPath);
  return { ok: true, targetPath, state: readTsState() };
}

export async function tsRunRevalidateLayout(targetPath: string) {
  await revalidateLayout(targetPath);
  return { ok: true, targetPath, state: readTsState() };
}

export async function tsRunRevalidatePath(targetPath: string) {
  await revalidatePath(targetPath);
  return { ok: true, targetPath, state: readTsState() };
}

export async function tsEchoAction(msg: string) {
  return {
    ok: true,
    echo: `ts-ack:${msg}`,
    at: Date.now(),
  };
}

