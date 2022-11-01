interface WrappedResponse<T> {
  status: "success" | "failure" | "error";
  message: string;
  data?: T;
}

interface WrappedArrayResponse<T> {
  status: "success" | "failure" | "error";
  message: string;
  data?: T[];
}
