export async function getProps() {
  await new Promise((r) => setTimeout(r, 100)); // Delay
  return { page: { msg: "ASYNC_DATA" } };
}
