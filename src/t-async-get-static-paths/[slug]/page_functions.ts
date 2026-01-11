export async function getStaticPaths() {
  return await new Promise((r) =>
    setTimeout(() => r(["slug1", "slug2"]), 1000)
  );
}
