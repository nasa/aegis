import { Linter } from "eslint";
import type { ESLint } from "eslint";
import tsParser from "@typescript-eslint/parser";

// A non-literal specifier keeps tsc from type-checking the ESLint config and its plugins
const eslintConfigPath: string = "../../../../eslint.config.mjs";
const { aegisLoggingPlugin } = (await import(eslintConfigPath)) as {
  aegisLoggingPlugin: ESLint.Plugin;
};

const lintConfig: Linter.Config[] = [
  {
    files: ["**/*.ts"],
    languageOptions: { parser: tsParser },
    plugins: { "aegis-logging": aegisLoggingPlugin },
    rules: { "aegis-logging/unique-log-id": "error" },
  },
];

// Each test uses its own filenames because the rule's logId registry is shared across files
const lintSource = (code: string, filename: string): Linter.LintMessage[] =>
  new Linter({ configType: "flat" }).verify(code, lintConfig, { filename });

describe("aegis-logging/unique-log-id lint rule", () => {
  it("accepts a unique string-literal logId on every logger method", () => {
    const messages = lintSource(
      `
        serverLogger.info({ logId: "unit:accepts:info", logValue: "a" });
        clientLogger.error({ logId: "unit:accepts:error", logValue: "b" }, new Error("x"));
        serverLogger.apiRoute({ logId: "unit:accepts:apiRoute", logLevel: "info" });
        serverLogger.debug({ logId: \`unit:accepts:templateWithoutSubstitutions\` });
      `,
      "src/acceptsUniqueLogIds.ts"
    );
    expect(messages).toEqual([]);
  });

  it("reports a duplicate logId in the same file", () => {
    const messages = lintSource(
      `
        serverLogger.info({ logId: "unit:sameFile:duplicate" });
        serverLogger.warning({ logId: "unit:sameFile:duplicate" });
      `,
      "src/sameFileDuplicate.ts"
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].line).toBe(3);
    expect(messages[0].message).toContain('logId "unit:sameFile:duplicate" is already used at');
  });

  it("reports a duplicate logId used in a different file", () => {
    expect(
      lintSource(`serverLogger.info({ logId: "unit:crossFile:duplicate" });`, "src/firstFile.ts")
    ).toEqual([]);

    const messages = lintSource(
      `clientLogger.info({ logId: "unit:crossFile:duplicate" });`,
      "src/secondFile.ts"
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain("src/firstFile.ts:1");
  });

  it("does not report a file against its own earlier lint run", () => {
    const code = `serverLogger.info({ logId: "unit:relint:sameFile" });`;
    expect(lintSource(code, "src/relintedFile.ts")).toEqual([]);
    expect(lintSource(code, "src/relintedFile.ts")).toEqual([]);
  });

  it("rejects string shorthand, variables, template substitutions, and missing logIds", () => {
    const messages = lintSource(
      `
        const LOG_ID = "unit:rejects:variable";
        serverLogger.info("plain string message");
        serverLogger.info({ logId: LOG_ID });
        serverLogger.info({ logId: \`unit:rejects:\${LOG_ID}\` });
        serverLogger.info({ logValue: "no logId" });
        serverLogger.info({ logId: "" });
      `,
      "src/rejectsNonLiteralLogIds.ts"
    );
    expect(messages.map((message) => message.line)).toEqual([3, 4, 5, 6, 7]);
    expect(messages.every((message) => message.ruleId === "aegis-logging/unique-log-id")).toBe(
      true
    );
  });

  it("ignores calls on objects that are not loggers", () => {
    const messages = lintSource(
      `
        console.info("not a logger");
        someOtherObject.info({ logId: "anything" });
        someOtherObject.info({ logId: "anything" });
      `,
      "src/ignoresNonLoggers.ts"
    );
    expect(messages).toEqual([]);
  });
});
