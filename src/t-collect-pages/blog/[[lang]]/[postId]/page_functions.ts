export function getStaticPaths() {
  return [
    // Post en Inglés (Idioma por defecto/Omitido)
    { lang: undefined, postId: "hello-world" },
    // Post en Español
    { lang: "es", postId: "hello-world" },
    // Post en Francés
    { lang: "fr", postId: "le-monde" },
  ];
}
