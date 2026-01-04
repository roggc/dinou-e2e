import ClientPage from "./client-page";

export default async function RandomPage() {
  const num = Math.floor(Math.random() * 10000);
  return <ClientPage num={num} />;
}
