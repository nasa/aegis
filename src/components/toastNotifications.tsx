import type { FunctionComponent } from "react";
import { type ToastContentProps, type ToastOptions, toast } from "react-toastify";
import styles from "./toast-notifications.module.css";

type DisplayToastOptions = {
  message: string;
  title?: string;
  showCancel?: boolean;
  onOk?: () => void;
  onCancel?: () => void;
} & ToastOptions;

const WithActions: FunctionComponent<ToastContentProps<DisplayToastOptions>> = ({
  data,
  closeToast,
}) => {
  const handleOk = () => {
    data.onOk?.();
    closeToast();
  };
  const handleCancel = () => {
    data.onCancel?.();
    closeToast();
  };

  return (
    <div className={styles.toastContainer}>
      {data.title && <h3 className={styles.toastTitle}>{data.title}</h3>}
      <div className={styles.toastContent}>
        <p className={styles.toastMessage}>{data.message}</p>
        <div className={`${styles.toastActions}`}>
          {data.showCancel && (
            <button onClick={handleCancel} className={styles.cancelButton}>
              Cancel
            </button>
          )}
          <button onClick={handleOk} className={styles.confirmBtn}>
            OK
          </button>
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
}: DisplayToastOptions): Promise<boolean> => {
  return new Promise((resolve) => {
    toast(WithActions, {
      ...toastProps,
      closeButton: false,
      data: {
        title,
        message,
        showCancel,
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      },
    });
  });
};
