import { Server } from "node:net";

const listen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  if (args[0] === 4001) args[0] = Number(process.env.AEGIS_TEST_API_PORT);
  return listen.apply(this, args);
};
