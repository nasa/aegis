import type { ReactElement, MouseEvent } from "react";
import { type ToastContentProps, type ToastOptions, toast } from "react-toastify";
import styles from "./toast-notifications.module.css";
import { createPortal } from "react-dom";

type ToastType = "alert" | "confirm";

export type DisplayToastOptions = {
  message: string;
  title?: string;
  toastType?: ToastType;
  onOk?: () => void;
  onCancel?: () => void;
} & ToastOptions;

const ToastContent = ({
  data,
  closeToast,
}: ToastContentProps<DisplayToastOptions>): ReactElement => {
  const isConfirm = data.toastType === "confirm";

  const handleCancel = (e: MouseEvent) => {
    e.stopPropagation();
    data.onCancel?.();
    closeToast();
  };

  const handleOk = (e: MouseEvent) => {
    e.stopPropagation();
    data.onOk?.();
    closeToast();
  };

  return (
    <>
      {createPortal(<div className={styles.toastBackdrop} />, document.body)}
      <div className={styles.toastContainer}>
        {data.title && <h3 className={styles.toastTitle}>{data.title}</h3>}
        <div className={styles.toastContent}>
          <p className={styles.toastMessage}>{data.message}</p>
          <div className={styles.toastActions}>
            {isConfirm && (
              <button type="button" onClick={handleCancel} className={styles.cancelButton}>
                Cancel
              </button>
            )}
            <button type="button" onClick={handleOk} className={styles.confirmBtn}>
              OK
            </button>
          </div>
        </div>
      </div>
    </>
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
      draggable: false,
      closeOnClick: false,
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
