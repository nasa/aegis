export const NEWTON_POLL_BACKOFF_MS = [2_000, 4_000, 8_000, 10_000] as const;

export const newtonPollDelayMs = vi.fn(
  (attempt: number): number =>
    NEWTON_POLL_BACKOFF_MS[Math.min(Math.max(0, attempt), NEWTON_POLL_BACKOFF_MS.length - 1)]
);

export const isNewtonTraverseFinished = vi.fn(
  (row: Pick<NewtonTraverseRow, "status">): boolean =>
    row.status === "succeeded" || row.status === "failed" || row.status === "cancelled"
);

export const postNewtonTraverses = vi.fn(
  async (_missionId: number, traverses: NewtonTraversePostData[]) =>
    traverses.map((): NewtonTraverseResponse => ({
      status: "error",
      message: "Newton is not configured",
      httpStatus: 503,
    }))
);

export const postNewtonTraverse = vi.fn(async (): Promise<NewtonTraverseResponse> => ({
  status: "error",
  message: "Newton is not configured",
  httpStatus: 503,
}));

export const getNewtonHealth = vi.fn(async (): Promise<WrappedResponse<NewtonHealthReport>> => ({
  status: "success",
  message: "Newton health",
  data: { enabled: false, newton: null, newtonError: null, maxInFlight: 1, counts: {} },
}));
