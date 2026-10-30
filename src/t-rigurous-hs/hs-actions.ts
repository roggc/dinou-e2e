"use server";

import {
  revalidatePage,
  revalidateLayout,
  revalidatePath,
  revalidateTag,
} from "dinou/server";
import { readHsState, writeHsState, resetHsState } from "./hs-state";

export async function hsResetAllState() {
  const next = resetHsState();
  await revalidatePath("/t-rigurous-hs");
  await Promise.all([
    revalidatePage("/t-rigurous-hs/sibling-a"),
    revalidatePage("/t-rigurous-hs/sibling-b"),
  ]);
  return next;
}

export async function hsMutateSiblingAOnly(note: string) {
  const cur = readHsState();
  const next = writeHsState({
    siblingASeq: cur.siblingASeq + 1,
    siblingANote: note,
  });
  await revalidatePage("/t-rigurous-hs/sibling-a");
  return next;
}

export async function hsMutateAndRevalidatePage(note: string) {
  const cur = readHsState();
  writeHsState({
    indexPageSeq: cur.indexPageSeq + 1,
    indexPageNote: note,
  });
  await revalidatePage("/t-rigurous-hs");
  return readHsState();
}

export async function hsMutateAndRevalidateLayout(note: string) {
  const cur = readHsState();
  writeHsState({
    sectionLayoutSeq: cur.sectionLayoutSeq + 1,
    sectionLayoutNote: note,
  });
  await revalidateLayout("/t-rigurous-hs");
  return readHsState();
}

export async function hsMutateAndRevalidatePath(
  layoutNote: string,
  indexNote: string
) {
  const cur = readHsState();
  writeHsState({
    sectionLayoutSeq: cur.sectionLayoutSeq + 1,
    sectionLayoutNote: layoutNote,
    indexPageSeq: cur.indexPageSeq + 1,
    indexPageNote: indexNote,
  });
  await revalidatePath("/t-rigurous-hs");
  return readHsState();
}

export async function hsMutateAndRevalidatePageTag(note: string) {
  const cur = readHsState();
  writeHsState({
    indexPageSeq: cur.indexPageSeq + 1,
    indexPageNote: note,
  });
  await revalidateTag("hs-index-page-tag");
  return readHsState();
}

export async function hsMutateAndRevalidateLayoutTagSurgical(note: string) {
  const cur = readHsState();
  writeHsState({
    sectionLayoutSeq: cur.sectionLayoutSeq + 1,
    sectionLayoutNote: note,
  });
  await revalidateTag("hs-section-layout-tag");
  return readHsState();
}
