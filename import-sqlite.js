import "dotenv/config";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getSql } from "../src/database.js";
import { runMigrations } from "./migrate.js";

export function stableId(table, id) {
  const bytes = createHash("sha256")
    .update(`ongi-recipe:${table}:${id}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseArguments(argv) {
  const options = { checkOnly: argv.includes("--check") };
  const sqliteIndex = argv.indexOf("--sqlite");
  if (sqliteIndex !== -1) options.sqlitePath = argv[sqliteIndex + 1];
  return options;
}

export function readLegacyDatabase(path) {
  const connection = new DatabaseSync(path, { readOnly: true });
  try {
    const recipes = connection
      .prepare("SELECT id, name, created_at, updated_at FROM recipes ORDER BY id")
      .all();
    return recipes.map((recipe) => {
      const items = connection
        .prepare(
          `SELECT id, category, name, amount, prep_method, position
           FROM recipe_items WHERE recipe_id = ? ORDER BY category, position, id`,
        )
        .all(recipe.id);
      const tools = connection
        .prepare(
          "SELECT id, name, position FROM recipe_tools WHERE recipe_id = ? ORDER BY position, id",
        )
        .all(recipe.id);
      const sections = connection
        .prepare(
          "SELECT id, name, position FROM recipe_sections WHERE recipe_id = ? ORDER BY position, id",
        )
        .all(recipe.id);
      const steps = connection
        .prepare(
          `SELECT st.id, st.section_id, st.instruction, st.position, st.heat_level
           FROM recipe_steps st
           JOIN recipe_sections s ON s.id = st.section_id
           WHERE st.recipe_id = ?
           ORDER BY s.position, st.position, st.id`,
        )
        .all(recipe.id);
      return { ...recipe, items, tools, sections, steps };
    });
  } finally {
    connection.close();
  }
}

function queriesForRecipe(sql, recipe) {
  const recipeId = stableId("recipes", recipe.id);
  const queries = [
    sql`
      INSERT INTO recipes (id, name, created_at, updated_at)
      VALUES (
        ${recipeId}, ${recipe.name}, ${recipe.created_at}, ${recipe.updated_at}
      )
      ON CONFLICT (id) DO NOTHING
    `,
  ];
  const itemRows = recipe.items.map((item) => ({
    id: stableId("recipe_items", item.id),
    recipe_id: recipeId,
    category: item.category,
    name: item.name,
    amount: item.amount,
    prep_method: item.prep_method ?? "",
    position: item.position,
  }));
  if (itemRows.length) {
    queries.push(sql`
      INSERT INTO recipe_items
        (id, recipe_id, category, name, amount, prep_method, position)
      SELECT entry.id, entry.recipe_id, entry.category, entry.name, entry.amount,
        entry.prep_method, entry.position
      FROM jsonb_to_recordset(${JSON.stringify(itemRows)}::jsonb) AS entry(
        id uuid, recipe_id uuid, category text, name text, amount text,
        prep_method text, position integer
      )
      ON CONFLICT (id) DO NOTHING
    `);
  }
  const toolRows = recipe.tools.map((tool) => ({
    id: stableId("recipe_tools", tool.id),
    recipe_id: recipeId,
    name: tool.name,
    position: tool.position,
  }));
  if (toolRows.length) {
    queries.push(sql`
      INSERT INTO recipe_tools (id, recipe_id, name, position)
      SELECT entry.id, entry.recipe_id, entry.name, entry.position
      FROM jsonb_to_recordset(${JSON.stringify(toolRows)}::jsonb) AS entry(
        id uuid, recipe_id uuid, name text, position integer
      )
      ON CONFLICT (id) DO NOTHING
    `);
  }
  const sectionRows = recipe.sections.map((section) => ({
    id: stableId("recipe_sections", section.id),
    recipe_id: recipeId,
    name: section.name,
    position: section.position,
  }));
  if (sectionRows.length) {
    queries.push(sql`
      INSERT INTO recipe_sections (id, recipe_id, name, position)
      SELECT entry.id, entry.recipe_id, entry.name, entry.position
      FROM jsonb_to_recordset(${JSON.stringify(sectionRows)}::jsonb) AS entry(
        id uuid, recipe_id uuid, name text, position integer
      )
      ON CONFLICT (id) DO NOTHING
    `);
  }
  const stepRows = [];
  for (const step of recipe.steps) {
    const heatLevel =
      step.heat_level === null || step.heat_level === "none"
        ? null
        : Number(step.heat_level);
    if (
      heatLevel !== null &&
      (!Number.isInteger(heatLevel) || heatLevel < 0 || heatLevel > 5)
    ) {
      throw new Error(`SQLite 조리 단계 ${step.id}의 불 세기 값이 올바르지 않습니다.`);
    }
    stepRows.push({
      id: stableId("recipe_steps", step.id),
      recipe_id: recipeId,
      section_id: stableId("recipe_sections", step.section_id),
      instruction: step.instruction,
      position: step.position,
      heat_level: heatLevel,
    });
  }
  if (stepRows.length) {
    queries.push(sql`
      INSERT INTO recipe_steps
        (id, recipe_id, section_id, instruction, position, heat_level)
      SELECT entry.id, entry.recipe_id, entry.section_id, entry.instruction,
        entry.position, entry.heat_level
      FROM jsonb_to_recordset(${JSON.stringify(stepRows)}::jsonb) AS entry(
        id uuid, recipe_id uuid, section_id uuid, instruction text,
        position integer, heat_level smallint
      )
      ON CONFLICT (id) DO NOTHING
    `);
  }
  return { recipeId, queries };
}

async function compareImportedData(sql, recipes) {
  const sourceCounts = {
    recipes: recipes.length,
    recipe_items: recipes.reduce((sum, recipe) => sum + recipe.items.length, 0),
    recipe_tools: recipes.reduce((sum, recipe) => sum + recipe.tools.length, 0),
    recipe_sections: recipes.reduce((sum, recipe) => sum + recipe.sections.length, 0),
    recipe_steps: recipes.reduce((sum, recipe) => sum + recipe.steps.length, 0),
  };
  const sourceIds = {
    recipes: recipes.map((recipe) => stableId("recipes", recipe.id)),
    recipe_items: recipes.flatMap((recipe) =>
      recipe.items.map((row) => stableId("recipe_items", row.id)),
    ),
    recipe_tools: recipes.flatMap((recipe) =>
      recipe.tools.map((row) => stableId("recipe_tools", row.id)),
    ),
    recipe_sections: recipes.flatMap((recipe) =>
      recipe.sections.map((row) => stableId("recipe_sections", row.id)),
    ),
    recipe_steps: recipes.flatMap((recipe) =>
      recipe.steps.map((row) => stableId("recipe_steps", row.id)),
    ),
  };
  for (const [table, expected] of Object.entries(sourceCounts)) {
    const ids = sourceIds[table];
    if (!ids.length) {
      if (expected !== 0) throw new Error(`${table} 원본 ID 확인에 실패했습니다.`);
      continue;
    }
    const result = await sql.query(
      `SELECT count(*)::int AS count FROM ${table} WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    if (result[0].count !== expected) {
      throw new Error(`${table} 개수 검증 실패: 원본 ${expected}, Neon ${result[0].count}`);
    }
  }

  for (const source of recipes) {
    const id = stableId("recipes", source.id);
    const targetRecipe = await sql`
      SELECT name FROM recipes WHERE id = ${id}
    `;
    if (targetRecipe[0]?.name !== source.name) {
      throw new Error(`레시피 ${source.id} 이름 이전 검증에 실패했습니다.`);
    }
    const [targetItems, targetTools, targetSections, targetSteps] = await Promise.all([
      sql`SELECT category, name, amount, prep_method, position FROM recipe_items WHERE recipe_id = ${id} ORDER BY category, position`,
      sql`SELECT name, position FROM recipe_tools WHERE recipe_id = ${id} ORDER BY position`,
      sql`SELECT id, name, position FROM recipe_sections WHERE recipe_id = ${id} ORDER BY position`,
      sql`
        SELECT st.section_id, st.instruction, st.position, st.heat_level
        FROM recipe_steps st
        JOIN recipe_sections s ON s.id = st.section_id
        WHERE st.recipe_id = ${id}
        ORDER BY s.position, st.position
      `,
    ]);
    const sourceItems = source.items.map((row) => ({
      category: row.category,
      name: row.name,
      amount: row.amount,
      prep_method: row.prep_method ?? "",
      position: row.position,
    }));
    const sourceTools = source.tools.map(({ name, position }) => ({ name, position }));
    const sourceSections = source.sections.map((row) => ({
      id: stableId("recipe_sections", row.id),
      name: row.name,
      position: row.position,
    }));
    const sourceSteps = source.steps.map((row) => ({
      section_id: stableId("recipe_sections", row.section_id),
      instruction: row.instruction,
      position: row.position,
      heat_level:
        row.heat_level === null || row.heat_level === "none"
          ? null
          : Number(row.heat_level),
    }));
    for (const [label, expected, actual] of [
      ["재료·양념", sourceItems, targetItems],
      ["도구", sourceTools, targetTools],
      ["섹션", sourceSections, targetSections],
      ["단계·순서·불 세기", sourceSteps, targetSteps],
    ]) {
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        throw new Error(`레시피 ${source.id}의 ${label} 데이터/순서 검증에 실패했습니다.`);
      }
    }
  }
  return sourceCounts;
}

export async function importSqlite({ sqlitePath, checkOnly = false, sql = getSql() }) {
  const sourcePath = resolve(sqlitePath ?? process.env.SQLITE_PATH ?? "recipes.db");
  const recipes = readLegacyDatabase(sourcePath);
  if (!checkOnly) {
    await runMigrations(sql);
    for (const recipe of recipes) {
      const { queries } = queriesForRecipe(sql, recipe);
      await sql.transaction(queries);
    }
  }
  const counts = await compareImportedData(sql, recipes);
  console.log(`${checkOnly ? "가져온 데이터" : "SQLite 이전"} 검증 완료`);
  for (const [table, count] of Object.entries(counts)) {
    console.log(`${table}: ${count}`);
  }
  return counts;
}

const options = parseArguments(process.argv.slice(2));
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  importSqlite(options).catch((error) => {
    console.error("SQLite 데이터 이전을 완료하지 못했습니다.", {
      code: error?.code ?? "IMPORT_FAILED",
    });
    process.exitCode = 1;
  });
}
