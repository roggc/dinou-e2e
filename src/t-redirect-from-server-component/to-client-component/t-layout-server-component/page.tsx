import { getContext } from "dinou";

export default async function Page() {
  const ctx = getContext();
  if (!ctx?.res) return;
  ctx.res.redirect("/docs");
  return <div>hello from layout server component</div>;
}
