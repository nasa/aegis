import dotenv from "dotenv";
dotenv.config({ override: true });

import { Client } from "pg";

/**
 * DB class to handle direct database operations and bypass mikro orm
 * Used for playwright testing
 */
export default class DB {
  private DBConfig = {
    user: "postgres",
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: parseInt(process.env.DB_PORT),
  };

  async executeQuery(query: string): Promise<void> {
    const client = new Client(this.DBConfig);
    try {
      await client.connect();
      await client.query(query);
    } catch (error) {
      console.error("Error in connection/executing query:", error);
    } finally {
      await client.end().catch((error) => {
        console.error("Error ending client connection:", error);
      });
    }
  }
}
