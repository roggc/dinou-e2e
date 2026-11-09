export default function ValidateSegmentsTaskPage({
  params,
}: {
  params: { org: string; project: string; task: string };
}) {
  return (
    <div data-testid="vs-task-page">
      Task Detail: {params?.org}/{params?.project}/{params?.task}
    </div>
  );
}

