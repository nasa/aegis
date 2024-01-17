import { IronSessionOptions } from "iron-session";

export const ironOptions: IronSessionOptions = {
  cookieName: "aegis-session",
  password: process.env.IRON_SESSION_PASSWORD,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};
