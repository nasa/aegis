import type { Loggable } from "@emss/logger/types";
import { ConsoleLogger } from "../../../utils/logging/consoleLogger";

describe("ConsoleLogger", () => {
  beforeEach(() => {
    // Reset state before each test
    ConsoleLogger.setConsoleLogLevel("off");
    vi.restoreAllMocks();
  });

  describe("setLevel / getLevel", () => {
    test("defaults to 'off'", () => {
      expect(ConsoleLogger.getConsoleLogLevel()).toBe("off");
    });

    test("can set and get level", () => {
      ConsoleLogger.setConsoleLogLevel("debug");
      expect(ConsoleLogger.getConsoleLogLevel()).toBe("debug");
    });
  });

  describe("log level filtering", () => {
    // Helper: call every log method once
    const logEntry: Loggable = { logId: "test", logValue: "e" };
    const err = new Error("e");
    const callAllLevels = () => {
      ConsoleLogger.emergency(logEntry);
      ConsoleLogger.alert(logEntry);
      ConsoleLogger.critical(logEntry, err);
      ConsoleLogger.error(logEntry, err);
      ConsoleLogger.warning(logEntry);
      ConsoleLogger.notice(logEntry);
      ConsoleLogger.info(logEntry);
      ConsoleLogger.debug(logEntry);
    };

    test("logs nothing when level is 'off'", () => {
      ConsoleLogger.setConsoleLogLevel("off");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      callAllLevels();

      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();
    });

    // emergency(1) — only most severe logs
    test("only logs emergency when level is 'emergency'", () => {
      ConsoleLogger.setConsoleLogLevel("emergency");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      callAllLevels();

      expect(errorSpy).toHaveBeenCalledTimes(1); // emergency only
      expect(warnSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();
    });

    // critical(3) — emergency + alert + critical all use console.error
    test("logs emergency, alert, and critical when level is 'critical'", () => {
      ConsoleLogger.setConsoleLogLevel("critical");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      callAllLevels();

      expect(errorSpy).toHaveBeenCalledTimes(3); // emergency + alert + critical
      expect(warnSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();
    });

    // error(4) — emergency + alert + critical + error (all console.error)
    test("logs emergency through error when level is 'error'", () => {
      ConsoleLogger.setConsoleLogLevel("error");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      callAllLevels();

      expect(errorSpy).toHaveBeenCalledTimes(4); // emergency + alert + critical + error
      expect(warnSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();
    });

    // warning(5)
    test("logs emergency through warning when level is 'warning'", () => {
      ConsoleLogger.setConsoleLogLevel("warning");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      callAllLevels();

      expect(errorSpy).toHaveBeenCalledTimes(4); // emergency + alert + critical + error
      expect(warnSpy).toHaveBeenCalledTimes(1); // warning
      expect(logSpy).not.toHaveBeenCalled();
      expect(debugSpy).not.toHaveBeenCalled();
    });

    // notice(6)
    test("logs emergency through notice when level is 'notice'", () => {
      ConsoleLogger.setConsoleLogLevel("notice");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      callAllLevels();

      expect(errorSpy).toHaveBeenCalledTimes(4);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledTimes(1); // notice
      expect(debugSpy).not.toHaveBeenCalled();
    });

    // info(7)
    test("logs emergency through info when level is 'info'", () => {
      ConsoleLogger.setConsoleLogLevel("info");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      callAllLevels();

      expect(errorSpy).toHaveBeenCalledTimes(4);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledTimes(2); // notice + info
      expect(debugSpy).not.toHaveBeenCalled();
    });

    // debug(8) — all levels
    test("logs all levels when level is 'debug'", () => {
      ConsoleLogger.setConsoleLogLevel("debug");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      callAllLevels();

      expect(errorSpy).toHaveBeenCalledTimes(4); // emergency + alert + critical + error
      expect(warnSpy).toHaveBeenCalledTimes(1); // warning
      expect(logSpy).toHaveBeenCalledTimes(2); // notice + info
      expect(debugSpy).toHaveBeenCalledTimes(1); // debug
    });
  });

  describe("output format", () => {
    test("emergency output includes [EMERGENCY] tag and uses console.error", () => {
      ConsoleLogger.setConsoleLogLevel("emergency");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logEntry = { logId: "test", logValue: "emergency test" };

      ConsoleLogger.emergency(logEntry);

      const firstArg = errorSpy.mock.calls[0][0] as string;
      expect(firstArg).toContain("[EMERGENCY]");
      expect(errorSpy.mock.calls[0][1]).toBe(logEntry);
    });

    test("alert output includes [ALERT] tag and uses console.error", () => {
      ConsoleLogger.setConsoleLogLevel("alert");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logEntry = { logId: "test", logValue: "alert test" };

      ConsoleLogger.alert(logEntry);

      const alertCalls = errorSpy.mock.calls.filter((call) =>
        (call[0] as string).includes("[ALERT]")
      );
      expect(alertCalls).toHaveLength(1);
      expect(alertCalls[0][1]).toBe(logEntry);
    });

    test("critical output includes [CRITICAL] tag and uses console.error", () => {
      ConsoleLogger.setConsoleLogLevel("critical");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const err = new Error("critical test");
      const logEntry = { logId: "test", logValue: "critical test" };

      ConsoleLogger.critical(logEntry, err);

      const criticalCalls = errorSpy.mock.calls.filter((call) =>
        (call[0] as string).includes("[CRITICAL]")
      );
      expect(criticalCalls).toHaveLength(1);
      expect(criticalCalls[0][1]).toBe(err);
      expect(criticalCalls[0][2]).toBe(logEntry);
    });

    test("error output includes [ERROR] tag and timestamp", () => {
      ConsoleLogger.setConsoleLogLevel("error");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const err = new Error("test");
      const logEntry = { logId: "test", logValue: "test message" };

      ConsoleLogger.error(logEntry, err);

      const errorCalls = errorSpy.mock.calls.filter((call) =>
        (call[0] as string).includes("[ERROR]")
      );
      expect(errorCalls).toHaveLength(1);
      expect(errorCalls[0][0]).toContain("[ERROR]");
      expect(errorCalls[0][1]).toBe(err);
      expect(errorCalls[0][2]).toBe(logEntry);
    });

    test("warning output includes [WARNING] tag", () => {
      ConsoleLogger.setConsoleLogLevel("warning");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const logEntry = { logId: "test", logValue: "warn test" };

      ConsoleLogger.warning(logEntry);

      const firstArg = warnSpy.mock.calls[0][0] as string;
      expect(firstArg).toContain("[WARNING]");
      expect(warnSpy.mock.calls[0][1]).toBe(logEntry);
    });

    test("notice output includes [NOTICE] tag", () => {
      ConsoleLogger.setConsoleLogLevel("notice");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logEntry = { logId: "test", logValue: "notice test" };

      ConsoleLogger.notice(logEntry);

      const firstArg = logSpy.mock.calls[0][0] as string;
      expect(firstArg).toContain("[NOTICE]");
      expect(logSpy.mock.calls[0][1]).toBe(logEntry);
    });

    test("info output includes [INFO] tag", () => {
      ConsoleLogger.setConsoleLogLevel("info");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logEntry = { logId: "test", logValue: "info test" };

      ConsoleLogger.info(logEntry);

      // info uses console.log, but notice also uses console.log — get the info call
      const infoCalls = logSpy.mock.calls.filter((call) => (call[0] as string).includes("[INFO]"));
      expect(infoCalls).toHaveLength(1);
      expect(infoCalls[0][1]).toBe(logEntry);
    });

    test("debug output includes [DEBUG] tag", () => {
      ConsoleLogger.setConsoleLogLevel("debug");
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const logEntry = { logId: "test", logValue: "debug test" };

      ConsoleLogger.debug(logEntry);

      const firstArg = debugSpy.mock.calls[0][0] as string;
      expect(firstArg).toContain("[DEBUG]");
      expect(debugSpy.mock.calls[0][1]).toBe(logEntry);
    });

    test("timestamp format matches [MM-DD HH:MM:SS.mmm]", () => {
      ConsoleLogger.setConsoleLogLevel("error");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      ConsoleLogger.error({ logId: "test", logValue: "test" }, new Error("test"));

      const firstArg = errorSpy.mock.calls[0][0] as string;
      // Timestamp pattern: [MM-DD HH:MM:SS.mmm]
      expect(firstArg).toMatch(/\[\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/);
    });
  });

  describe("level transitions", () => {
    test("can change level dynamically", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logEntry = { logId: "test", logValue: "test" };

      ConsoleLogger.setConsoleLogLevel("error");
      ConsoleLogger.info(logEntry);
      expect(logSpy).not.toHaveBeenCalled();

      ConsoleLogger.setConsoleLogLevel("info");
      ConsoleLogger.info(logEntry);
      const infoCalls = logSpy.mock.calls.filter((call) => (call[0] as string).includes("[INFO]"));
      expect(infoCalls).toHaveLength(1);

      // error should always work at both levels
      ConsoleLogger.error(logEntry, new Error("test"));
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("LogLevel type", () => {
    test("all valid levels can be set", () => {
      const levels: LogLevel[] = [
        "off",
        "emergency",
        "alert",
        "critical",
        "error",
        "warning",
        "notice",
        "info",
        "debug",
      ];
      for (const level of levels) {
        ConsoleLogger.setConsoleLogLevel(level);
        expect(ConsoleLogger.getConsoleLogLevel()).toBe(level);
      }
    });
  });

  describe("remote logging", () => {
    let mockRemoteLogger: RemoteLogger;

    beforeEach(() => {
      ConsoleLogger.setRemoteLogLevel("off");
      mockRemoteLogger = {
        emergency: vi.fn().mockResolvedValue(undefined),
        alert: vi.fn().mockResolvedValue(undefined),
        critical: vi.fn().mockResolvedValue(undefined),
        error: vi.fn().mockResolvedValue(undefined),
        warning: vi.fn().mockResolvedValue(undefined),
        notice: vi.fn().mockResolvedValue(undefined),
        info: vi.fn().mockResolvedValue(undefined),
        debug: vi.fn().mockResolvedValue(undefined),
      } as unknown as RemoteLogger;
    });

    describe("setRemoteLogLevel / getRemoteLogLevel", () => {
      test("defaults to 'off' (inner beforeEach resets it)", () => {
        expect(ConsoleLogger.getRemoteLogLevel()).toBe("off");
      });

      test("can set and get remote level", () => {
        ConsoleLogger.setRemoteLogLevel("info");
        expect(ConsoleLogger.getRemoteLogLevel()).toBe("info");
      });

      test("all valid levels can be set", () => {
        const levels: LogLevel[] = [
          "off",
          "emergency",
          "alert",
          "critical",
          "error",
          "warning",
          "notice",
          "info",
          "debug",
        ];
        for (const level of levels) {
          ConsoleLogger.setRemoteLogLevel(level);
          expect(ConsoleLogger.getRemoteLogLevel()).toBe(level);
        }
      });
    });

    describe("forwarding to remote logger", () => {
      const logEntry = { logId: "test", logValue: "test value" };

      beforeEach(() => {
        ConsoleLogger.setRemoteLogger(mockRemoteLogger);
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "debug").mockImplementation(() => {});
      });

      test("does not forward when remoteLogLevel is 'off'", () => {
        ConsoleLogger.setRemoteLogLevel("off");
        ConsoleLogger.info(logEntry);
        expect(mockRemoteLogger.info).not.toHaveBeenCalled();
      });

      test("does not forward when message level is below remote level", () => {
        ConsoleLogger.setRemoteLogLevel("error"); // only error and above
        ConsoleLogger.info(logEntry);
        expect(mockRemoteLogger.info).not.toHaveBeenCalled();
      });

      test("forwards Loggable to remote for emergency", () => {
        ConsoleLogger.setRemoteLogLevel("emergency");
        ConsoleLogger.emergency(logEntry);
        expect(mockRemoteLogger.emergency).toHaveBeenCalledWith(logEntry);
      });

      test("forwards Loggable to remote for alert", () => {
        ConsoleLogger.setRemoteLogLevel("alert");
        ConsoleLogger.alert(logEntry);
        expect(mockRemoteLogger.alert).toHaveBeenCalledWith(logEntry);
      });

      test("forwards Loggable to remote for warning", () => {
        ConsoleLogger.setRemoteLogLevel("warning");
        ConsoleLogger.warning(logEntry);
        expect(mockRemoteLogger.warning).toHaveBeenCalledWith(logEntry);
      });

      test("forwards Loggable to remote for notice", () => {
        ConsoleLogger.setRemoteLogLevel("notice");
        ConsoleLogger.notice(logEntry);
        expect(mockRemoteLogger.notice).toHaveBeenCalledWith(logEntry);
      });

      test("forwards Loggable to remote for info", () => {
        ConsoleLogger.setRemoteLogLevel("info");
        ConsoleLogger.info(logEntry);
        expect(mockRemoteLogger.info).toHaveBeenCalledWith(logEntry);
      });

      test("forwards Loggable to remote for debug", () => {
        ConsoleLogger.setRemoteLogLevel("debug");
        ConsoleLogger.debug(logEntry);
        expect(mockRemoteLogger.debug).toHaveBeenCalledWith(logEntry);
      });

      test("forwards Error + Loggable to remote.error", () => {
        ConsoleLogger.setRemoteLogLevel("error");
        const err = new Error("test error");
        ConsoleLogger.error(logEntry, err);
        expect(mockRemoteLogger.error).toHaveBeenCalledWith(err, logEntry);
      });

      test("forwards Error + Loggable to remote.critical", () => {
        ConsoleLogger.setRemoteLogLevel("critical");
        const err = new Error("critical failure");
        ConsoleLogger.critical(logEntry, err);
        expect(mockRemoteLogger.critical).toHaveBeenCalledWith(err, logEntry);
      });

      test("respects remote level filtering (warning active, debug not forwarded)", () => {
        ConsoleLogger.setRemoteLogLevel("warning");
        ConsoleLogger.debug(logEntry);
        ConsoleLogger.info(logEntry);
        ConsoleLogger.notice(logEntry);
        expect(mockRemoteLogger.debug).not.toHaveBeenCalled();
        expect(mockRemoteLogger.info).not.toHaveBeenCalled();
        expect(mockRemoteLogger.notice).not.toHaveBeenCalled();
      });
    });
  });

  describe("apiRoute", () => {
    beforeEach(() => {
      ConsoleLogger.setConsoleLogLevel("debug");
      ConsoleLogger.setRemoteLogLevel("off");
    });

    test("logs at info level with correct logId and logValue", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      ConsoleLogger.apiRoute({
        logLevel: "info",
        httpMethod: "GET",
        responseStatus: 200,
        routeName: "/api/test",
      });
      const infoCalls = logSpy.mock.calls.filter((call) => (call[0] as string).includes("[INFO]"));
      expect(infoCalls).toHaveLength(1);
      const logEntry = infoCalls[0][1] as { logId: string; logValue: string };
      expect(logEntry.logId).toBe("API Route");
      expect(logEntry.logValue).toBe("GET 200 /api/test");
    });

    test("appends message to logValue when provided", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      ConsoleLogger.apiRoute({
        logLevel: "info",
        httpMethod: "POST",
        responseStatus: 201,
        routeName: "/api/items",
        message: "created successfully",
      });
      const infoCalls = logSpy.mock.calls.filter((call) => (call[0] as string).includes("[INFO]"));
      const logEntry = infoCalls[0][1] as { logValue: string };
      expect(logEntry.logValue).toBe("POST 201 /api/items created successfully");
    });

    test("omits message from logValue when not provided (no trailing space)", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      ConsoleLogger.apiRoute({
        logLevel: "info",
        httpMethod: "GET",
        responseStatus: 200,
        routeName: "/api/test",
      });
      const infoCalls = logSpy.mock.calls.filter((call) => (call[0] as string).includes("[INFO]"));
      const logEntry = infoCalls[0][1] as { logValue: string };
      expect(logEntry.logValue).toBe("GET 200 /api/test");
    });

    test("includes appUsername in the loggable", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      ConsoleLogger.apiRoute({
        logLevel: "notice",
        httpMethod: "GET",
        responseStatus: 200,
        routeName: "/api/missions",
        appUsername: "user1",
      });
      const noticeCalls = logSpy.mock.calls.filter((call) =>
        (call[0] as string).includes("[NOTICE]")
      );
      const logEntry = noticeCalls[0][1] as { appUsername?: string };
      expect(logEntry.appUsername).toBe("user1");
    });

    test("includes missionId in the loggable", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      ConsoleLogger.apiRoute({
        logLevel: "info",
        httpMethod: "GET",
        responseStatus: 200,
        routeName: "/api/missions",
        missionId: 42,
      });
      const infoCalls = logSpy.mock.calls.filter((call) => (call[0] as string).includes("[INFO]"));
      const logEntry = infoCalls[0][1] as { missionId?: number };
      expect(logEntry.missionId).toBe(42);
    });

    test("includes uuids in the loggable", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      ConsoleLogger.apiRoute({
        logLevel: "info",
        httpMethod: "DELETE",
        responseStatus: 204,
        routeName: "/api/items/:id",
        uuids: ["uuid-1", "uuid-2"],
      });
      const infoCalls = logSpy.mock.calls.filter((call) => (call[0] as string).includes("[INFO]"));
      const logEntry = infoCalls[0][1] as { uuids?: string[] };
      expect(logEntry.uuids).toEqual(["uuid-1", "uuid-2"]);
    });

    test("logs at error level: passes Error then Loggable to console.error", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const err = new Error("request failed");
      ConsoleLogger.apiRoute({
        logLevel: "error",
        httpMethod: "POST",
        responseStatus: 500,
        routeName: "/api/fail",
        error: err,
      });
      const errorCalls = errorSpy.mock.calls.filter((call) =>
        (call[0] as string).includes("[ERROR]")
      );
      expect(errorCalls).toHaveLength(1);
      expect(errorCalls[0][1]).toBe(err);
      const logEntry = errorCalls[0][2] as { logId: string; logValue: string };
      expect(logEntry.logId).toBe("API Route");
      expect(logEntry.logValue).toBe("POST 500 /api/fail");
    });

    test("logs at critical level: passes Error then Loggable to console.error", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const err = new Error("critical failure");
      ConsoleLogger.apiRoute({
        logLevel: "critical",
        httpMethod: "GET",
        responseStatus: 500,
        routeName: "/api/critical",
        error: err,
      });
      const criticalCalls = errorSpy.mock.calls.filter((call) =>
        (call[0] as string).includes("[CRITICAL]")
      );
      expect(criticalCalls).toHaveLength(1);
      expect(criticalCalls[0][1]).toBe(err);
      const logEntry = criticalCalls[0][2] as { logId: string; logValue: string };
      expect(logEntry.logId).toBe("API Route");
      expect(logEntry.logValue).toBe("GET 500 /api/critical");
    });

    test("logs at warning level using console.warn", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      ConsoleLogger.apiRoute({
        logLevel: "warning",
        httpMethod: "GET",
        responseStatus: 400,
        routeName: "/api/badrequest",
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const firstArg = warnSpy.mock.calls[0][0] as string;
      expect(firstArg).toContain("[WARNING]");
      const logEntry = warnSpy.mock.calls[0][1] as { logId: string; logValue: string };
      expect(logEntry.logId).toBe("API Route");
      expect(logEntry.logValue).toBe("GET 400 /api/badrequest");
    });

    test("logs at debug level using console.debug", () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      ConsoleLogger.apiRoute({
        logLevel: "debug",
        httpMethod: "GET",
        responseStatus: 200,
        routeName: "/api/verbose",
      });
      expect(debugSpy).toHaveBeenCalledTimes(1);
      const firstArg = debugSpy.mock.calls[0][0] as string;
      expect(firstArg).toContain("[DEBUG]");
      const logEntry = debugSpy.mock.calls[0][1] as { logId: string; logValue: string };
      expect(logEntry.logId).toBe("API Route");
    });
  });

  describe("string input shorthand", () => {
    beforeEach(() => {
      ConsoleLogger.setConsoleLogLevel("debug");
    });

    test("info accepts a plain string and converts to Loggable", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      ConsoleLogger.info("hello world");
      const infoCalls = logSpy.mock.calls.filter((call) => (call[0] as string).includes("[INFO]"));
      expect(infoCalls).toHaveLength(1);
      expect(infoCalls[0][1]).toEqual({ logId: "aegis", logValue: "hello world" });
    });

    test("emergency accepts a plain string", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      ConsoleLogger.emergency("urgent");
      const calls = errorSpy.mock.calls.filter((call) =>
        (call[0] as string).includes("[EMERGENCY]")
      );
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toEqual({ logId: "aegis", logValue: "urgent" });
    });

    test("alert accepts a plain string", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      ConsoleLogger.alert("alert msg");
      const calls = errorSpy.mock.calls.filter((call) => (call[0] as string).includes("[ALERT]"));
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toEqual({ logId: "aegis", logValue: "alert msg" });
    });

    test("warning accepts a plain string", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      ConsoleLogger.warning("watch out");
      expect(warnSpy.mock.calls[0][1]).toEqual({ logId: "aegis", logValue: "watch out" });
    });

    test("notice accepts a plain string", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      ConsoleLogger.notice("fyi");
      const calls = logSpy.mock.calls.filter((call) => (call[0] as string).includes("[NOTICE]"));
      expect(calls[0][1]).toEqual({ logId: "aegis", logValue: "fyi" });
    });

    test("debug accepts a plain string", () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      ConsoleLogger.debug("trace info");
      expect(debugSpy.mock.calls[0][1]).toEqual({ logId: "aegis", logValue: "trace info" });
    });

    test("error accepts a plain string with Error", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const err = new Error("boom");
      ConsoleLogger.error("something broke", err);
      const calls = errorSpy.mock.calls.filter((call) => (call[0] as string).includes("[ERROR]"));
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toBe(err);
      expect(calls[0][2]).toEqual({ logId: "aegis", logValue: "something broke" });
    });

    test("critical accepts a plain string with Error", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const err = new Error("critical failure");
      ConsoleLogger.critical("system down", err);
      const calls = errorSpy.mock.calls.filter((call) =>
        (call[0] as string).includes("[CRITICAL]")
      );
      expect(calls).toHaveLength(1);
      expect(calls[0][1]).toBe(err);
      expect(calls[0][2]).toEqual({ logId: "aegis", logValue: "system down" });
    });

    test("Loggable input still works unchanged", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const logEntry = { logId: "custom", logValue: "custom value" };
      ConsoleLogger.info(logEntry);
      const infoCalls = logSpy.mock.calls.filter((call) => (call[0] as string).includes("[INFO]"));
      expect(infoCalls[0][1]).toBe(logEntry);
    });

    test("string input is forwarded to remote logger as Loggable", () => {
      const mockRemoteLogger = {
        emergency: vi.fn().mockResolvedValue(undefined),
        alert: vi.fn().mockResolvedValue(undefined),
        critical: vi.fn().mockResolvedValue(undefined),
        error: vi.fn().mockResolvedValue(undefined),
        warning: vi.fn().mockResolvedValue(undefined),
        notice: vi.fn().mockResolvedValue(undefined),
        info: vi.fn().mockResolvedValue(undefined),
        debug: vi.fn().mockResolvedValue(undefined),
      } as unknown as RemoteLogger;
      ConsoleLogger.setRemoteLogger(mockRemoteLogger);
      ConsoleLogger.setRemoteLogLevel("debug");
      vi.spyOn(console, "log").mockImplementation(() => {});

      ConsoleLogger.info("remote string test");
      expect(mockRemoteLogger.info).toHaveBeenCalledWith({
        logId: "aegis",
        logValue: "remote string test",
      });
    });
  });

  describe("output format - ANSI color codes", () => {
    test("output includes an ANSI escape sequence", () => {
      ConsoleLogger.setConsoleLogLevel("error");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      ConsoleLogger.error({ logId: "test", logValue: "test" }, new Error("test"));
      // Filter to just the [ERROR] call in case level leaks trigger others
      const errorCalls = errorSpy.mock.calls.filter((call) =>
        (call[0] as string).includes("[ERROR]")
      );
      expect(errorCalls[0][0]).toMatch(/\x1b\[/);
    });

    test("output ends with ANSI reset code", () => {
      ConsoleLogger.setConsoleLogLevel("info");
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      ConsoleLogger.info({ logId: "test", logValue: "test" });
      const infoCalls = logSpy.mock.calls.filter((call) => (call[0] as string).includes("[INFO]"));
      expect(infoCalls[0][0]).toContain("\x1b[0m");
    });

    test("each severity level uses a distinct color prefix", () => {
      ConsoleLogger.setConsoleLogLevel("debug");
      const prefixes: string[] = [];
      vi.spyOn(console, "error").mockImplementation((...args) => prefixes.push(args[0] as string));
      vi.spyOn(console, "warn").mockImplementation((...args) => prefixes.push(args[0] as string));
      vi.spyOn(console, "log").mockImplementation((...args) => prefixes.push(args[0] as string));
      vi.spyOn(console, "debug").mockImplementation((...args) => prefixes.push(args[0] as string));

      const logEntry = { logId: "test", logValue: "e" };
      const err = new Error("e");
      ConsoleLogger.emergency(logEntry);
      ConsoleLogger.alert(logEntry);
      ConsoleLogger.critical(logEntry, err);
      ConsoleLogger.error(logEntry, err);
      ConsoleLogger.warning(logEntry);
      ConsoleLogger.notice(logEntry);
      ConsoleLogger.info(logEntry);
      ConsoleLogger.debug(logEntry);

      // All 8 levels should have been logged
      expect(prefixes).toHaveLength(8);
      // Extract the full ANSI color sequence at the start (e.g. "\x1b[31m" or "\x1b[1;35m")
      const colors = prefixes.map((p) => {
        const match = p.match(/^(\x1b\[[\d;]+m)/);
        return match ? match[1] : "";
      });
      // All 8 severity colors are distinct strings
      expect(new Set(colors).size).toBe(8);
    });
  });
});
