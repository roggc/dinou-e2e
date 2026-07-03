export function revalidate() {
  return 3000;
}

export function allowISG() {
  return false;
}

export async function getStaticPaths() {
  return [
    { slug: "allowed-slug" }
  ];
}
