interface DisposablePlaywrightApi {
  origin: string;
  restart(): Promise<void>;
  close(): Promise<void>;
}
