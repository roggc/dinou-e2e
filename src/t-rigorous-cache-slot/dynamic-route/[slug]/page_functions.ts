export function getStaticPaths() {
  return ["alpha", "beta"];
}

export function revalidate() {
  return 0;
}

