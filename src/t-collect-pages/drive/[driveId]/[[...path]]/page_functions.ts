export function getStaticPaths() {
  return [
    // Raíz del Drive Personal (path vacío/undefined)
    { driveId: "personal-drive", path: undefined },
    // Carpeta anidada en Drive Personal
    { driveId: "personal-drive", path: ["photos", "vacation"] },
    // Raíz del Drive de Trabajo
    { driveId: "work-drive", path: [] }, // Array vacío también debería valer como root
    // Archivo profundo en Drive de Trabajo
    { driveId: "work-drive", path: ["projects", "q4", "report.pdf"] },

    { driveId: "pete", path: "foo" },
    { driveId: "pete2", path: "" },
  ];
}
