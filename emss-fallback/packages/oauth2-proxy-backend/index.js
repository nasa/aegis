/**
 * Decode the access token forwarded by the trusted authentication gateway.
 * Session validation and token issuance belong to the gateway. The API
 * must only be reachable through nginx, which replaces incoming token headers.
 */

export const getUserFromJWT = (req) => {
  const token = req.headers?.["x-access-token"];
  if (!token) return new Error("X-Access-Token not found in headers");
  try {
    if (typeof token !== "string" || token.split(".").length !== 3) {
      throw new Error("Invalid access token");
    }
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    for (const key of ["iss", "nasa_employeenumber", "nasa_auid", "nasa_displayname"]) {
      if (typeof claims[key] !== "string" || !claims[key].trim()) {
        throw new Error(`Missing or invalid ${key} claim`);
      }
    }
    if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) {
      throw new Error("Expired or invalid access token");
    }
    const roles = claims.nasa_role ?? [];
    if (
      typeof roles !== "string" &&
      !(Array.isArray(roles) && roles.every((role) => typeof role === "string"))
    ) {
      throw new Error("Invalid nasa_role claim");
    }
    const realIp = req.headers["x-real-ip"];
    return {
      // The issuer and immutable user id keep identities distinct across providers.
      uupic: `oidc:${claims.iss}:${claims.nasa_employeenumber}`,
      email: claims.nasa_email ?? "",
      auid: claims.nasa_auid,
      givenname: claims.nasa_givenname ?? "",
      surname: claims.nasa_surname ?? "",
      display_name: claims.nasa_displayname,
      roles,
      uscitizen: claims.nasa_uscitizen === "us_citizen",
      legal_permanent_resident: claims.nasa_uslpr === "us_lpr",
      usperson: claims.nasa_usperson === "us_person",
      ip_address: Array.isArray(realIp) ? realIp[0] || "" : realIp || "",
    };
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
};

// Mirrors the real package: a missing header is a 401, anything else is a 500,
// both with a bare `msg` body rather than the WrappedResponse envelope.
export const handleUnableToDecodeJWT = (err, res) => {
  if (err.message === "X-Access-Token not found in headers") {
    res.status(401).json({ msg: "Missing auth token" });
    return;
  }
  const msg = "Unable to decode JWT";
  console.error(msg, err);
  res.status(500).json({ msg });
};
