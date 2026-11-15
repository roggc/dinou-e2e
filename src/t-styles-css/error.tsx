import "./error-only.css";
import styles from "./card.module.css";

export default function StylesCssError({
  error,
}: {
  error?: { message?: string };
}) {
  return (
    <div
      data-testid="styles-server-error"
      className={`t-styles-error-only-sentinel ${styles.serverCard}`}
    >
      Server Error Boundary: {error?.message ?? "unknown"}
    </div>
  );
}

