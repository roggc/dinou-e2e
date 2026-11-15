import type { ReactNode } from "react";
import styles from "./card.module.css";

export default function StylesCssLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <section data-testid="styles-layout-frame" className={styles.layoutFrame}>
      {children}
    </section>
  );
}

