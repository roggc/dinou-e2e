export default async function CascadeChildPage() {
  return (
    <main>
      <h2>Cascade Child</h2>
      <div data-testid="cascade-child-timestamp">{new Date().toISOString()}</div>
    </main>
  );
}
