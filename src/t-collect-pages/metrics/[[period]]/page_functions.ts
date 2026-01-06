export function getStaticPaths() {
  return [
    // Caso 1: Ruta base (undefined) -> Debería generar /metrics/
    { period: undefined },
    // Caso 2: Ruta hija -> Debería generar /metrics/daily/
    { period: "daily" },
    // Caso 3: Ruta hija -> Debería generar /metrics/monthly/
    { period: "monthly" },
  ];
}
