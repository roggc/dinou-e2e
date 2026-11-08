export function allowISG() {
  return true;
}

export function getStaticPaths() {
  return [{ id: "prerendered", postId: "post-1" }];
}

