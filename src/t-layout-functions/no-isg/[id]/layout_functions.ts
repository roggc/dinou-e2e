export function allowISG() {
  return false;
}

export function getStaticPaths() {
  return [{ id: "prerendered" }];
}
