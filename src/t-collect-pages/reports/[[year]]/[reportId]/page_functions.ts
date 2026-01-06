export function getStaticPaths() {
  return [
    // Caso 1: Todo completo -> /reports/2024/r-001/
    { year: "2024", reportId: "r-001" },

    // Caso 2: GAP (Hueco) -> undefined en medio.
    // Con tu lógica actual, esto debería eliminar 'year' y pegar 'reportId' a 'reports'.
    // Resultado esperado según tu código: /reports/r-002/
    // (Esto es lo que llamamos "ruta ambigua", pero queremos ver si tu código la genera).
    { year: undefined, reportId: "r-002" },
  ];
}
