export default async function CascadeParentPage() {
  return (
    <main>
      <h1>Cascade Parent</h1>
      <div data-testid="cascade-parent-timestamp">{new Date().toISOString()}</div>
    </main>
  );
}
