import type { ReactNode } from "react";

export function ShellBox({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid="alias-ui-shellbox"
      data-shell-title={title}
      className="t-aliases-shell"
    >
      <h2>{title}</h2>
      {children}
    </section>
  );
}

