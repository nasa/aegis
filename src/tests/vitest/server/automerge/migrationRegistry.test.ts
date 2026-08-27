import { AUTOMERGE_MIGRATIONS, getPendingAutomergeMigrations } from "server/automerge/migrations";

describe("getPendingAutomergeMigrations", () => {
  test("returns only migrations that have not completed", () => {
    const completed = AUTOMERGE_MIGRATIONS.slice(0, 2);

    expect(getPendingAutomergeMigrations(AUTOMERGE_MIGRATIONS, completed)).toEqual(
      AUTOMERGE_MIGRATIONS.slice(2)
    );
  });

  test("returns no work when all migrations have completed", () => {
    expect(getPendingAutomergeMigrations(AUTOMERGE_MIGRATIONS, AUTOMERGE_MIGRATIONS)).toEqual([]);
  });

  test("rejects changed names for completed versions", () => {
    expect(() =>
      getPendingAutomergeMigrations(AUTOMERGE_MIGRATIONS, [
        { version: AUTOMERGE_MIGRATIONS[0].version, name: "changed-migration" },
      ])
    ).toThrow(/was recorded as/);
  });

  test("rejects completed migrations missing from the registry", () => {
    expect(() =>
      getPendingAutomergeMigrations(AUTOMERGE_MIGRATIONS, [
        { version: 20000101, name: "unknown-migration" },
      ])
    ).toThrow(/unknown automerge migration/);
  });

  test("rejects duplicate or unordered versions", () => {
    const migrate = vi.fn();
    expect(() =>
      getPendingAutomergeMigrations(
        [
          { version: 2, name: "second", migrate },
          { version: 1, name: "first", migrate },
        ],
        []
      )
    ).toThrow(/unique, ascending versions/);
  });
});
