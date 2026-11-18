import BundlerParityClient from "@/t-bundlers/BundlerParityClient";

export default function TBundlersPage() {
  const ssgBuildTool = process.env.DINOU_BUILD_TOOL || "unset";

  return (
    <main data-testid="t-bundlers-page">
      <h1 data-testid="bundlers-heading" data-build-tool={ssgBuildTool}>
        Bundler Parity E2E
      </h1>
      <p data-testid="bundlers-ssg-tool">{ssgBuildTool}</p>
      <BundlerParityClient />
    </main>
  );
}

