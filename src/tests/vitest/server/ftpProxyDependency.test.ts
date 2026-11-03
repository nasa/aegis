// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server, type Socket } from "node:net";
import { once } from "node:events";
import { getUri } from "get-uri";

// This exercises the real get-uri -> basic-ftp contract behind the Box SDK's
// proxy support. Keep it while the scoped security override is needed.
const content = 'function FindProxyForURL() { return "DIRECT"; }';
let closeFixture: (() => Promise<void>) | undefined;
afterEach(async () => {
  await closeFixture?.();
  closeFixture = undefined;
});

async function startFtp(mdtmSupported = true, separateTransferHost = false) {
  const commands: string[] = [];
  const servers = new Set<Server>();
  const sockets = new Set<Socket>();
  const controls = new Set<Socket>();
  const socketErrors: Error[] = [];
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", (error: NodeJS.ErrnoException) => {
      // basic-ftp closes its control socket after transfer/rejection; Windows
      // may deliver that disconnect as a reset to the fixture server.
      if (error.code !== "ECONNRESET") socketErrors.push(error);
    });
  };
  closeFixture = async () => {
    for (const socket of sockets) socket.destroy();
    await Promise.all(
      [...servers].map(
        (server) =>
          new Promise<void>((resolve) => {
            if (server.listening) server.close(() => resolve());
            else resolve();
          })
      )
    );
    expect(socketErrors).toEqual([]);
  };
  const server = createServer((control) => {
    track(control);
    controls.add(control);
    control.on("close", () => controls.delete(control));
    control.write("220 Local upgrade test\r\n");
    let buffered = "";
    let dataConnection: Promise<Socket>;
    const handleCommand = async (line: string) => {
      commands.push(line);
      const command = line.split(" ")[0];
      switch (command) {
        case "USER":
          control.write("331 Password required\r\n");
          break;
        case "PASS":
          control.write("230 Logged in\r\n");
          break;
        case "FEAT":
          control.write("211-Features\r\n MLST type*;size*;modify*;\r\n211 End\r\n");
          break;
        case "MDTM":
          control.write(mdtmSupported ? "213 20260101000000\r\n" : "500 MDTM unavailable\r\n");
          break;
        case "PWD":
          control.write('257 "/"\r\n');
          break;
        case "EPSV": {
          if (separateTransferHost) {
            control.write("500 EPSV unavailable\r\n");
            break;
          }
          const dataServer = createServer();
          servers.add(dataServer);
          dataConnection = new Promise<Socket>((resolve) =>
            dataServer.once("connection", (socket) => {
              track(socket);
              dataServer.close();
              resolve(socket);
            })
          );
          dataServer.listen(0, "127.0.0.1");
          await once(dataServer, "listening");
          const address = dataServer.address();
          if (!address || typeof address === "string") throw new Error("Missing data listener");
          control.write(`229 Entering Extended Passive Mode (|||${address.port}|)\r\n`);
          break;
        }
        case "PASV":
          control.write("227 Entering Passive Mode (192,0,2,1,200,1)\r\n");
          break;
        case "MLSD":
        case "RETR": {
          control.write("150 Opening data connection\r\n");
          const socket = await dataConnection;
          const payload =
            command === "MLSD"
              ? `type=file;size=${content.length};modify=20260101000000; proxy.pac\r\n`
              : content;
          socket.end(payload, () => control.write("226 Transfer complete\r\n"));
          break;
        }
        case "QUIT":
          control.end("221 Goodbye\r\n");
          break;
        default:
          control.write("200 OK\r\n");
      }
    };
    control.on("data", (chunk) => {
      buffered += chunk.toString();
      let end: number;
      while ((end = buffered.indexOf("\r\n")) >= 0) {
        const line = buffered.slice(0, end);
        buffered = buffered.slice(end + 2);
        handleCommand(line).catch((error: Error) => control.destroy(error));
      }
    });
  });
  servers.add(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing control listener");
  return { url: `ftp://127.0.0.1:${address.port}/proxy.pac`, commands, controls };
}

describe("Box proxy FTP dependency compatibility", () => {
  it.each([true, false])(
    "downloads and closes the connection (MDTM supported: %s)",
    async (mdtm) => {
      const fixture = await startFtp(mdtm);
      const stream = await getUri(fixture.url);
      expect(stream).toHaveProperty("lastModified", new Date("2026-01-01T00:00:00Z"));
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString()).toBe(content);
      expect(fixture.commands).toContain("MDTM /proxy.pac");
      expect(fixture.commands).toContain("RETR /proxy.pac");
      if (!mdtm) expect(fixture.commands.some((command) => command.startsWith("MLSD"))).toBe(true);
      await expect.poll(() => fixture.controls.size).toBe(0);
    }
  );

  it("rejects a PASV data host different from the control host", async () => {
    const fixture = await startFtp(false, true);
    await expect(getUri(fixture.url)).rejects.toThrow(/host|address/i);
    expect(fixture.commands).toContain("PASV");
    expect(fixture.commands.some((command) => command.startsWith("RETR"))).toBe(false);
    await expect.poll(() => fixture.controls.size).toBe(0);
  });
});
