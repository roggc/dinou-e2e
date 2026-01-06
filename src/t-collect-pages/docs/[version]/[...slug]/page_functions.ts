export function getStaticPaths() {
  return [
    // v1.0: Intro (Array de 1 elemento)
    { version: "v1.0", slug: ["intro"] },
    // v1.0: Advanced -> Installation (Array de 2 elementos)
    { version: "v1.0", slug: ["advanced", "installation"] },
    // v2.0: Migration (Array de 1 elemento)
    { version: "v2.0", slug: ["migration"] },
  ];
}
