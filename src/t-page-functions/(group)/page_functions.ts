export async function getProps(params: any) {
  await new Promise((r) => setTimeout(r, 2000));
  return { page: { name: "paquito" } };
}
