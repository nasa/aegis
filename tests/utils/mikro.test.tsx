import { getEM } from "utils/mikro";

describe("Mikro ORM", () => {
  test("Entity Manager Error", async () => {
    expect(() => getEM()).toThrow("Run Mikro.getORM() first");
  });
});
