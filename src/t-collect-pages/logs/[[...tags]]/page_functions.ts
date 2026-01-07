export function getStaticPaths() {
  return [
    // // Caso 1: Array vacío -> Debería generar /logs/
    // { tags: [] },
    // // Caso 2: Undefined -> Debería generar /logs/
    // { tags: undefined },
    // Caso 3: Array simple -> /logs/error/
    { tags: ["error"] },
    // Caso 4: Array múltiple -> /logs/sys/critical/
    { tags: ["sys", "critical"] },
  ];
}
