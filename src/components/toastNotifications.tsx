import type { FunctionComponent } from "react";
import { type ToastContentProps, type ToastOptions, toast } from "react-toastify";
import styles from "./toast-notifications.module.css";

type ToastType = "alert" | "confirm";

export type DisplayToastOptions = {
  message: string;
  title?: string;
  toastType?: ToastType;
  onOk?: () => void;
  onCancel?: () => void;
} & ToastOptions;

const ToastContent: FunctionComponent<ToastContentProps<DisplayToastOptions>> = ({
  data,
  closeToast,
}) => {
  const isConfirm = data.toastType === "confirm";

  return (
    <div className={styles.toastContainer}>
      {data.title && <h3 className={styles.toastTitle}>{data.title}</h3>}
      <div className={styles.toastContent}>
        <p className={styles.toastMessage}>{data.message}</p>
        <div className={`${styles.toastActions}`}>
          {isConfirm && (
            <button
              onClick={() => {
                data.onCancel?.();
                closeToast();
              }}
              className={styles.cancelButton}
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => {
              data.onOk?.();
              closeToast();
            }}
            className={styles.confirmBtn}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Displays a toast with customizable confirmation/alert controls.
 * Returns a Promise resolving to `true` (OK) or `false` (Cancel).
 */
export const displayToast = ({
  title,
  message,
  toastType = "alert",
  onOk = () => {},
  onCancel = () => {},
  ...toastProps
}: DisplayToastOptions): Promise<boolean> => {
  return new Promise((resolve) => {
    toast(ToastContent, {
      closeButton: false,
      ...toastProps,
      data: {
        title,
        message,
        toastType,
        onOk: () => {
          onOk();
          resolve(true);
        },
        onCancel: () => {
          onCancel();
          resolve(false);
        },
      },
    });
  });
};
