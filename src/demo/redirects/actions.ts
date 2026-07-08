"use server";

import { redirect } from "dinou";

export async function triggerRedirectAction(formData: FormData) {
  const destination = formData.get("destination") as string;
  if (!destination) return;

  return redirect(destination);
}
