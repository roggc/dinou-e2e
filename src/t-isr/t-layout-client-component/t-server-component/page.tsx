export default async function Page() {
  return <div data-testid="timestamp">{new Date().toISOString()}</div>;
}
