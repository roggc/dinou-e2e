// import { getContext } from "dinou";
import { redirect } from "dinou";

export default async function Page() {
  //   const ctx = getContext();
  //   if (ctx?.res) {
  //     // Redirigimos a la página "Target"
  //     ctx.res.redirect(
  //       "/t-redirect-from-server-component/to-server-component/t-layout-server-component/redirect-to/redirect-soft/target"
  //     );
  //     return <div>a</div>;
  //   }
  //   return <div>Si ves esto, el redirect ha fallado</div>;
  return redirect(
    "/t-redirect-from-server-component/to-server-component/t-layout-server-component/redirect-to/redirect-soft/target"
  );
}
