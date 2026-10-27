import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { identities } from "./identities.mjs";

const cookieName = "__Host-aegis-demo";
const sessionSeconds = 8 * 60 * 60;
const template = readFileSync(new URL("./login.html", import.meta.url), "utf8");
const escapeHtml = (value) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]
  );

export function createMockAuthServer({ origin, secret, now = Date.now }) {
  if (!origin || new URL(origin).origin !== origin)
    throw new Error("PUBLIC_ORIGIN must be an origin without a trailing slash");
  if (!secret || secret.length < 32)
    throw new Error("PUBLIC_COOKIE_SECRET must contain at least 32 characters");
  const sign = (value) => createHmac("sha256", secret).update(value).digest("base64url");
  const jwt = (claims) => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
  };
  const session = (req) => {
    const cookies = (req.headers.cookie || "").split(";").map((entry) => entry.trim());
    const matches = cookies.filter((entry) => entry.startsWith(`${cookieName}=`));
    if (matches.length !== 1) return null;
    try {
      const parts = matches[0].slice(cookieName.length + 1).split(".");
      if (parts.length !== 3) return null;
      const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
      const actual = Buffer.from(parts[2]);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
      const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      if (
        claims.purpose !== "session" ||
        !Number.isFinite(claims.exp) ||
        claims.exp * 1000 <= now()
      )
        return null;
      return Object.hasOwn(identities, claims.persona) ? identities[claims.persona] : null;
    } catch {
      return null;
    }
  };
  const redirectPath = (value) => {
    try {
      const url = new URL(value || "/", origin);
      if (
        url.origin !== origin ||
        url.pathname.startsWith("/oauth2/") ||
        url.pathname === "/logout"
      )
        return "/";
      return url.pathname + url.search;
    } catch {
      return "/";
    }
  };
  const cookie = (value, age) =>
    `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;

  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const url = new URL(req.url, origin);
    const reply = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.method === "GET" && url.pathname === "/health") return reply(200, { status: "ok" });
    if (req.method === "GET" && ["/oauth2/start", "/oauth2/sign_in"].includes(url.pathname)) {
      const rd = redirectPath(url.searchParams.get("rd") || req.headers["x-auth-request-redirect"]);
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      });
      return res.end(template.replace("{{redirect}}", escapeHtml(rd)));
    }
    if (req.method === "POST" && url.pathname === "/oauth2/sign_in") {
      if (req.headers.origin !== origin) return reply(403, { message: "Invalid sign-in origin" });
      let body = "";
      try {
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 4096) return reply(413, { message: "Request too large" });
        }
      } catch {
        return reply(400, { message: "Unable to read sign-in request" });
      }
      const form = new URLSearchParams(body);
      const persona = form.get("persona");
      if (!Object.hasOwn(identities, persona))
        return reply(400, { message: "Choose a demo identity" });
      const value = jwt({
        purpose: "session",
        persona,
        exp: Math.floor(now() / 1000) + sessionSeconds,
      });
      res.writeHead(303, {
        Location: redirectPath(form.get("rd")),
        "Set-Cookie": cookie(value, sessionSeconds),
      });
      return res.end();
    }
    if (req.method === "GET" && url.pathname === "/oauth2/sign_out") {
      res.writeHead(303, { Location: "/oauth2/start?rd=/login", "Set-Cookie": cookie("", 0) });
      return res.end();
    }
    if (req.method === "GET" && ["/oauth2/auth", "/oauth2/userinfo"].includes(url.pathname)) {
      const user = session(req);
      if (!user) return reply(401, { message: "Choose a demo identity" });
      if (url.pathname === "/oauth2/userinfo")
        return reply(200, { email: user.email, name: user.displayName });
      const issuedAt = Math.floor(now() / 1000);
      const accessToken = jwt({
        iss: `${origin}/identity`,
        sub: user.id,
        aud: "aegis",
        iat: issuedAt,
        exp: issuedAt + 300,
        nasa_employeenumber: user.id,
        nasa_auid: user.auid,
        nasa_displayname: user.displayName,
        nasa_email: user.email,
        nasa_givenname: user.givenname,
        nasa_surname: user.surname,
        nasa_role: user.roles,
        nasa_uscitizen: "us_citizen",
        nasa_uslpr: "us_lpr",
        nasa_usperson: "us_person",
      });
      res.writeHead(202, {
        "X-Auth-Request-Access-Token": accessToken,
        "X-Auth-Request-User": user.auid,
        "X-Auth-Request-Email": user.email,
      });
      return res.end();
    }
    return reply(404, { message: "Not found" });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createMockAuthServer({
    origin: process.env.PUBLIC_ORIGIN,
    secret: process.env.PUBLIC_COOKIE_SECRET,
  }).listen(4180, "0.0.0.0", () => console.log("Demo identity gateway listening on port 4180"));
}
