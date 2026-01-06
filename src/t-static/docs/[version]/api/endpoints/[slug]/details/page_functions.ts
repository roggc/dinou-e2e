export function getStaticPaths() {
  return [
    { version: "v1", slug: "users" },
    { version: "v2", slug: "products" },
  ];
}
