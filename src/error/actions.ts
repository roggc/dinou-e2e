"use server";

export async function throwServerFunctionError() {
  throw new Error("💥 Rejection from 'use server' Server Function action!");
}
