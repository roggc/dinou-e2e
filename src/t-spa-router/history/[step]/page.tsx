import Controls from "./controls";

export default async function Page({ params }: any) {
  // params.step vendrá de la URL
  const step = params.step || "1";

  return (
    <div>
      <h1>History Test Page</h1>
      <Controls currentStep={step} />
    </div>
  );
}
