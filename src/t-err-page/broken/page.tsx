export default function BrokenPage() {
  throw new Error("Deliberate Server Page Error");
  return <div>Never reached</div>;
}
