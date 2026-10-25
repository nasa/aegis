import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import supertest from "supertest";

vi.mock("utils/loadEnv", () => ({}));

test("serves uploaded bytes from an absolute STATIC_DIR outside the repository", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "aegis-static-"));
  const bytes = Buffer.from("uploaded mission asset");
  try {
    await mkdir(path.join(directory, "missionFiles", "1", "Data"), { recursive: true });
    await writeFile(path.join(directory, "missionFiles", "1", "Data", "asset.txt"), bytes);
    vi.stubEnv("STATIC_DIR", directory);
    const { default: app } = await import("server/express/restApi");

    const response = await supertest(app).get("/static/missionFiles/1/Data/asset.txt");
    expect(response.status).toBe(200);
    expect(response.text).toBe(bytes.toString());
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
