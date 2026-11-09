export default function ValidateSegmentsResetPage({
  params,
}: {
  params: { org: string; scope: string };
}) {
  return (
    <div data-testid="vs-reset-page">
      Reset Page: {params?.org}/{params?.scope}
    </div>
  );
}

