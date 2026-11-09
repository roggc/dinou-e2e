export default function ValidateSegmentsOrgPage({
  params,
}: {
  params: { org: string };
}) {
  return <div data-testid="vs-org-page">Org Overview: {params?.org}</div>;
}

