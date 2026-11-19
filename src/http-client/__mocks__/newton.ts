export const NEWTON_POLL_BACKOFF_MS = [2_000, 4_000, 8_000, 10_000] as const;

export const newtonPollDelayMs = vi.fn(
  (attempt: number): number =>
    NEWTON_POLL_BACKOFF_MS[Math.min(Math.max(0, attempt), NEWTON_POLL_BACKOFF_MS.length - 1)]
);

export const isNewtonTraverseFinished = vi.fn(
  (result: Pick<NewtonTraverseResult, "status">): boolean =>
    result.status === "succeeded" || result.status === "failed" || result.status === "cancelled"
);

const notConfigured = {
  status: "error" as const,
  message: "Newton is not configured",
  httpStatus: 503,
};

export const getNewtonCoverage = vi.fn(async (): Promise<WrappedResponse<NewtonCoverage>> => ({
  status: "success",
  message: "Newton coverage",
  data: {
    supported: false,
    reason: "disabled",
    planet: null,
    probedBy: null,
    maps: [],
  },
}));

export const postNewtonTraverses = vi.fn(
  async (_missionId: number, traverses: NewtonTraversePostData[]) =>
    traverses.map((): NewtonTraverseSubmitResponse => notConfigured)
);

export const getNewtonTraverses = vi.fn(async (_missionId: number, traverseIds: string[]) =>
  traverseIds.map((): NewtonTraverseResultResponse => notConfigured)
);

export const deleteNewtonTraverse = vi.fn(
  async (): Promise<NewtonEntryResponse<{ status: NewtonTraverseStatus | null }>> => ({
    status: "success",
    message: "Nothing to cancel",
    data: { status: null },
  })
);

export const getNewtonHealth = vi.fn(async (): Promise<WrappedResponse<NewtonHealthReport>> => ({
  status: "success",
  message: "Newton health",
  data: { enabled: false, newton: null, newtonError: null },
}));
