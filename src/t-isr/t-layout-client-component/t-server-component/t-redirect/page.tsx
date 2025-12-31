import * as fs from "fs";
import * as path from "path";
// Asumo que tienes una forma de lanzar 404 en tu framework,
// si no, usa context.res.status(404) o similar.
import { redirect } from "dinou"; // O tu equivalente

export default async function IsrStatusPage() {
  //   // Usamos un archivo bandera. Si existe = 200. Si no existe = 404.
  //   const flagFile = path.resolve(process.cwd(), "exists.flag");
  //   const exists = fs.existsSync(flagFile);

  //   if (!exists) {
  //     // Esto debería setear el status 404 y renderizar la página de Not Found
  //     return redirect("/non-existent-page");
  //   }

  return (
    <div>
      <h1>Producto Disponible</h1>
      <small>{Date.now()}</small>
    </div>
  );
}
