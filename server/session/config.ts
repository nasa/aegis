// iron-session config options

export const ironOptions = {
  cookieName: "aegis-session",
  password: "6cXV-%SMN9Pfpr6?m<ALs[XXqh=!jq_u",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};
