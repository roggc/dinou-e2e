import { getContext } from "dinou";

export default async function Page() {
  const ctx = getContext();
  if (ctx?.res) {
    // Redirigimos a la página "Target"
    ctx.res.redirect(
      "/t-redirect-from-server-component/to-server-component/t-layout-server-component/redirect-to"
    );
    return null; // O un div, aunque no se debería ver
  }
  return <div>Si ves esto, el redirect ha fallado</div>;
}
