/**
 * Script used in nextjs docker container to determine when the
 * database container is fully started up.
 */

const { Client } = require("pg");
const dotenv = require("dotenv");
dotenv.config();

const run = async () => {
  try {
    const client = new Client({
      host: process.env.AEGIS_DB_HOST,
      user: process.env.AEGIS_DB_USER,
      password: process.env.AEGIS_DB_PASS,
      port: process.env.AEGIS_DB_PORT,
      database: process.env.AEGIS_DB_NAME,
    });
    await client.connect();
    client.query("select 1 as count");
    console.log("Connection successful!");
    await client.end();
    process.exit(0);
  } catch (err) {
    process.exit(1);
  }
};
run();
