export function getStaticPaths() {
  return [
    // 1. Todo undefined -> /inventory/
    // { warehouse: undefined, aisle: undefined },

    // 2. Primer nivel definido, segundo undefined -> /inventory/main/
    { warehouse: "main", aisle: undefined },

    // 3. Todo definido -> /inventory/main/A1/
    { warehouse: "main", aisle: "A1" },

    // 4. GAP (Hueco) -> Primer nivel undefined, segundo definido.
    // Según tu lógica: elimina warehouse, mantiene aisle.
    // Resultado posible: /inventory/B2/
    { warehouse: undefined, aisle: "B2" },
  ];
}
