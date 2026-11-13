"use server";

export default async function submitDefaultModAction(
  itemId: string,
  label: string
) {
  return `ModDefault:${itemId}:${label.toUpperCase()}`;
}

export async function helperNamedAction(itemId: string) {
  return `NamedHelper:${itemId}`;
}

