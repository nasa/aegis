import styles from "./asyncStatus.module.css";

/** Shared feedback for admin requests, including failures that would otherwise leave a blank view. */
export default function AsyncStatus({
  pending,
  error,
}: {
  pending?: string | null;
  error?: string | null;
}): JSX.Element {
  return (
    <>
      {pending && (
        <span className={styles.status} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          {pending}
        </span>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
