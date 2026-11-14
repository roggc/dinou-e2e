import { CompilerHarness } from "./compiler-harness";

export default function ReactCompilerE2EPage() {
  return (
    <main data-testid="react-compiler-e2e-page">
      <h1 data-testid="react-compiler-heading">React Compiler E2E</h1>
      <CompilerHarness />
    </main>
  );
}

