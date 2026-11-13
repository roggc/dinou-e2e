"use server";

export default async (itemId: string, tag: string) => {
  return `AnonModDefault:${itemId}:${tag}`;
};

