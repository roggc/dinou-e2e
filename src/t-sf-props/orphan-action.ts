"use server";

export async function secretOrphanAction() {
  return "secret-should-never-be-in-manifest";
}
