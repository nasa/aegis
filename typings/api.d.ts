declare module "iron-session" {
  interface IronSessionData {
    user?: {
      username: string;
      id: number;
      permission: string;
    };
  }
}

export type EditResponse = {
  status: "success" | "failure";
  message: string;
  body: any;
};
