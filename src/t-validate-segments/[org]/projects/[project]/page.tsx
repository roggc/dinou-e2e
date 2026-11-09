export default function ValidateSegmentsProjectPage({
  params,
}: {
  params: { org: string; project: string };
}) {
  return (
    <div data-testid="vs-project-page">
      Project Overview: {params?.org}/{params?.project}
    </div>
  );
}

