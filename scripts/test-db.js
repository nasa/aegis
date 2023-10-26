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
      user: "postgres", //default user
      password: process.env.AEGIS_DB_PASS,
      port: 5432, //default port
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
