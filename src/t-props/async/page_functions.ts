export async function getProps() {
  await new Promise((r) => setTimeout(r, 100)); // Delay
  return { msg: "ASYNC_DATA" };
}
