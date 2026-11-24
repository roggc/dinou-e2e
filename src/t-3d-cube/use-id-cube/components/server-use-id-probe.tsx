import { useId } from "react";

export function ServerUseIdProbe({
  owner,
  seq,
}: {
  owner: string;
  seq: number;
}) {
  const id = useId();
  return (
    <div
      data-uid-server={owner}
      data-uid-sval={id}
      style={{ display: "inline-flex", gap: 4, margin: 2 }}
    >
      <label data-uid-slabel={owner} htmlFor={id}>
        {`srv-${owner}`}
      </label>
      <input
        id={id}
        data-uid-sinput={owner}
        value={`srv-${owner}:${seq}`}
        readOnly
      />
      <code data-uid-stext={owner}>{id}</code>
    </div>
  );
}
