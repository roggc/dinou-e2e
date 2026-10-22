"use server";

export async function echoAction(msg: string) {
  return `echo:${msg}`;
}

export async function boundAction(prefix: string, msg: string) {
  return `${prefix}:${msg}`;
}

export async function formAction(prevState: any, formData: FormData) {
  const name = formData.get("name") || "anonymous";
  return { success: true, message: `form:${name}` };
}
