export type MaestroAccessControl = "public" | "private";

export type MaestroCreateDocRequest = {
  missionId: number;
  missionName: string;
  owners?: LaunchpadUser[];
  accessControl?: MaestroAccessControl;
};

export type MaestroCreateDocResponse =
  | {
      status: "success";
      data: {
        documentId: string;
        alteredInitialState?: unknown;
        error?: string;
      };
    }
  | { status: "error"; message: string };
