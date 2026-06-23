type MaestroAccessControl = "public" | "private";

type MaestroCreateDocRequest = {
  missionId: number;
  missionName: string;
  owners?: LaunchpadUser[];
  accessControl?: MaestroAccessControl;
};

type MaestroCreateDocResponse =
  | {
      status: "success";
      data: {
        documentId: string;
        alteredInitialState?: unknown;
        error?: string;
      };
    }
  | { status: "error"; message: string };
