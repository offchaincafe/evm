import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { pool } from "@/services/pg.js";
import konsole from "@/services/konsole.js";

dotenv.config();

export async function main(
  _to?: string,
  baseDir: string = "./db/migrations",
  migrationTable = "_migrations",
  upDir = "/up",
  downDir = "/down"
) {
  konsole.debug([], "Args", { _to, baseDir, migrationTable, upDir, downDir });

  const client = await pool.connect();

  let from: number;
  let to = _to ? parseInt(_to, 10) : undefined;

  konsole.debug([], "Create migration table if it doesn't exist...");
  await client.query(
    `CREATE TABLE IF NOT EXISTS public.${migrationTable} (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    )`
  );

  konsole.debug([], "Get current migration version");
  from =
    (
      await client.query(
        `SELECT id
        FROM ${migrationTable}
        ORDER BY id DESC
        LIMIT 1`
      )
    ).rows[0]?.id || 0;

  const isUp = to === undefined ? true : to > from;
  const dirPath = path.join(process.cwd(), baseDir + (isUp ? upDir : downDir));
  const fileNames = fs.readdirSync(dirPath);
  if (to === undefined) to = isUp ? fileNames.length : 0;
  konsole.debug([], "", { isUp, dirPath, fileNames, to });

  if (to == from) {
    // TODO(`${to}`): print hex.
    konsole.info([], `Already at the max version, exiting!`, { to });
    process.exit(2);
  } else {
    konsole.log([], `Migrating...`, { from, to });
  }

  migrationTable = `"${migrationTable}"`;

  let i = 0;
  for (const fileName of isUp
    ? fileNames.slice(from, to)
    : fileNames.slice(to, from).reverse()) {
    const sql = fs.readFileSync(`${dirPath}/${fileName}`, "utf8");

    await client.query("BEGIN");

    await client.query(sql);

    if (isUp) {
      await client.query(`INSERT INTO ${migrationTable} (name) VALUES ($1)`, [
        fileName,
      ]);
    } else {
      await client.query(
        `DELETE FROM ${migrationTable}
        WHERE id = (
          SELECT MAX(id)
          FROM ${migrationTable}
        )`
      );
    }

    await client.query("COMMIT");

    konsole.info([], `Migrated`, {
      fileName,
      from: isUp ? from + i : from - i,
      to: isUp ? from + i + 1 : from - i - 1,
    });

    i++;
  }

  if (to == 0) {
    await client.query(`DROP TABLE ${migrationTable}`);
  }

  return { from, to };
}

try {
  const { from, to } = await main(...process.argv.slice(2));
  konsole.info([], "Migration complete!", { from, to });
  process.exit(0);
} catch (e: any) {
  konsole.error([], e.toString());
  process.exit(1);
}
