import RevalidateTestButtons from "./RevalidateTestButtons";

export default async function Page() {
  return (
    <main className="p-8">
      <h2>Revalidation API Test Lab</h2>
      <div data-testid="timestamp">{new Date().toISOString()}</div>
      <RevalidateTestButtons />
    </main>
  );
}
