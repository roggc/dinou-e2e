export function getStaticPaths() {
  return [
    // Caso normal
    { department: "electronics", product: "macbook-pro" },
    // Caso con claves invertidas (¡Tu lógica debe arreglar esto!)
    { product: "air-jordan", department: "clothing" },
  ];
}
