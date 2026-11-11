import ClientPage from "./client-page";

let seq = 0;

export default async function RandomPage() {
  seq += 1;
  const num = `${seq}-${Math.random().toString(36).slice(2, 10)}`;
  return <ClientPage num={num} />;
}
