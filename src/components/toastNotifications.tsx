import type { FunctionComponent } from "react";
import { type Id, type ToastContentProps, type ToastOptions, toast } from "react-toastify";
import styles from "./toast-notifications.module.css";

type DisplayToastOptions = {
  message: string;
  title?: string;
  showCancel?: boolean;
} & ToastOptions;

const WithActions: FunctionComponent<ToastContentProps<DisplayToastOptions>> = ({
  data,
  closeToast,
}) => {
  return (
    <div className={styles.toastContainer}>
      <h3 className={styles.toastTitle}>{data.title}</h3>

      <div className={styles.toastContent}>
        <p className={styles.toastMessage}>{data.message}</p>

        <div className={styles.toastActions}>
          <button onClick={closeToast} className={styles.toastBtnConfirm}>
            OK
          </button>
          {data.showCancel && (
            <button onClick={closeToast} className={styles.toastBtnCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const displayToast = ({
  title,
  message,
  showCancel,
  ...toastProps
}: DisplayToastOptions): Id => {
  return toast(WithActions, {
    ...toastProps,
    data: { title, message, showCancel },
  });
};
