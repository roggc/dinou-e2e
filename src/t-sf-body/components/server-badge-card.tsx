export interface ServerBadgeCardProps {
  topic: string;
  capturedSecret: string;
  renderCount: number;
}

export default async function ServerBadgeCard({
  topic,
  capturedSecret,
  renderCount,
}: ServerBadgeCardProps) {
  await new Promise((resolve) => setTimeout(resolve, 15));

  const executedOnServer = typeof window === "undefined";

  return (
    <div id="rsc-badge-card" style={{ padding: "12px", border: "1px solid #10b981", borderRadius: "8px" }}>
      <h4 id="rsc-badge-heading">RSC Streamed from Inline Server Function</h4>
      <p id="rsc-badge-topic">Topic:{topic}</p>
      <p id="rsc-badge-secret">Secret:{capturedSecret}</p>
      <p id="rsc-badge-count">Render:{renderCount}</p>
      <p id="rsc-badge-env">Server:{String(executedOnServer)}</p>
    </div>
  );
}

