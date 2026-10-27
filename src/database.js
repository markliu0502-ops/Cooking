import { neon } from "@neondatabase/serverless";

let cachedUrl;
let cachedSql;

export function getSql() {
  const { DATABASE_URL } = process.env;
  if (!DATABASE_URL) {
    const error = new Error("DATABASE_URL is not configured");
    error.code = "DATABASE_URL_MISSING";
    throw error;
  }
  if (cachedSql && cachedUrl === DATABASE_URL) return cachedSql;
  cachedUrl = DATABASE_URL;
  cachedSql = neon(DATABASE_URL);
  return cachedSql;
}

export function resetSqlForTests() {
  cachedUrl = undefined;
  cachedSql = undefined;
}
