import dotenv from "dotenv";
import { pool } from "@/services/pg.js";
import konsole from "@/services/konsole.js";

dotenv.config();

export async function main(
  baseDir: string = "./db/migrations",
  migrationTable = "_migrations"
) {
  konsole.debug([], "Args", { baseDir, migrationTable });

  const client = await pool.connect();

  let result = await client.query(
    `SELECT EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename = '${migrationTable}'
    )`
  );

  if (!result.rows[0].exists) {
    return -1;
  }

  // TODO: `-h` flag to enable human-readable output.
  result = await client.query(
    `SELECT * FROM "${migrationTable}" ORDER BY id DESC LIMIT 1`
  );

  if (result.rows.length === 0) {
    return 0;
  } else {
    return result.rows[0].id;
  }
}

try {
  const id = await main(...process.argv.slice(2));
  konsole.log([], id);
  process.exit(0);
} catch (e: any) {
  konsole.error([], e.toString());
  process.exit(1);
}
