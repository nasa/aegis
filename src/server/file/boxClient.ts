import { BoxClient, BoxCcgAuth, CcgConfig } from "box-node-sdk";

export function createBoxClient(): BoxClient {
  const auth = new BoxCcgAuth({
    config: new CcgConfig({
      clientId: process.env.BOX_CLIENT_ID,
      clientSecret: process.env.BOX_CLIENT_SECRET,
      enterpriseId: process.env.BOX_ENTERPRISE_ID,
      userId: process.env.BOX_USER_ID,
    }),
  });
  const client = new BoxClient({ auth });
  if (process.env.NODE_ENV !== "test" || !process.env.AEGIS_TEST_BOX_PROVIDER_URL) return client;
  const provider = new URL(process.env.AEGIS_TEST_BOX_PROVIDER_URL);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(provider.hostname)) {
    throw new Error("The Box test provider must use a loopback address");
  }
  return client.withCustomBaseUrls({
    baseUrl: provider.origin,
    oauth2Url: provider.origin,
  });
}
