// Dinou page_functions defining PPR via async function
export async function ppr() {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return true;
}
