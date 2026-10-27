import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getSql } from "../src/database.js";

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

export async function runMigrations(sql = getSql()) {
  await sql.query(MIGRATIONS_TABLE);
  const directory = fileURLToPath(new URL("../migrations/", import.meta.url));
  const files = (await readdir(directory))
    .filter((file) => /^\d+_[\w-]+\.sql$/.test(file))
    .sort();
  let appliedCount = 0;
  for (const file of files) {
    const name = basename(file, ".sql");
    const applied = await sql`
      SELECT name FROM schema_migrations WHERE name = ${name}
    `;
    if (applied.length) continue;

    const contents = await readFile(join(directory, file), "utf8");
    const statements = contents
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    await sql.transaction([
      ...statements.map((statement) => sql.query(statement)),
      sql`
        INSERT INTO schema_migrations (name) VALUES (${name})
        ON CONFLICT (name) DO NOTHING
      `,
    ]);
    appliedCount += 1;
  }
  console.log(
    appliedCount
      ? `데이터베이스 스키마 마이그레이션 ${appliedCount}개를 적용했습니다.`
      : "데이터베이스 스키마가 최신 상태입니다.",
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runMigrations().catch((error) => {
    console.error("데이터베이스 마이그레이션을 완료하지 못했습니다.", {
      code: error?.code ?? "MIGRATION_FAILED",
    });
    process.exitCode = 1;
  });
}
