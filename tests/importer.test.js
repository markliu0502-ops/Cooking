import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { readLegacyDatabase, stableId } from "../scripts/import-sqlite.js";

test("SQLite reader preserves explicit section and step order with stable IDs", () => {
  const directory = mkdtempSync(join(tmpdir(), "ongi-import-"));
  const path = join(directory, "source.sqlite3");
  const database = new DatabaseSync(path);
  try {
    database.exec(`
      CREATE TABLE recipes (
        id INTEGER PRIMARY KEY, name TEXT, created_at TEXT, updated_at TEXT
      );
      CREATE TABLE recipe_items (
        id INTEGER PRIMARY KEY, recipe_id INTEGER, category TEXT, name TEXT,
        amount TEXT, prep_method TEXT, position INTEGER
      );
      CREATE TABLE recipe_tools (
        id INTEGER PRIMARY KEY, recipe_id INTEGER, name TEXT, position INTEGER
      );
      CREATE TABLE recipe_sections (
        id INTEGER PRIMARY KEY, recipe_id INTEGER, name TEXT, position INTEGER
      );
      CREATE TABLE recipe_steps (
        id INTEGER PRIMARY KEY, recipe_id INTEGER, section_id INTEGER,
        instruction TEXT, position INTEGER, heat_level TEXT
      );
      INSERT INTO recipes VALUES (1, '테스트 요리', '2026-01-01', '2026-01-01');
      INSERT INTO recipe_items VALUES (1, 1, 'ingredient', '양파', '1개', '채 썰기', 0);
      INSERT INTO recipe_tools VALUES (1, 1, '냄비', 0);
      INSERT INTO recipe_sections VALUES (20, 1, '먼저', 0);
      INSERT INTO recipe_sections VALUES (10, 1, '다음', 1);
      INSERT INTO recipe_steps VALUES (101, 1, 20, '첫 단계', 0, 'none');
      INSERT INTO recipe_steps VALUES (102, 1, 10, '두 번째 섹션', 0, '0');
    `);

    const [recipe] = readLegacyDatabase(path);
    assert.deepEqual(
      recipe.sections.map((section) => section.name),
      ["먼저", "다음"],
    );
    assert.deepEqual(
      recipe.steps.map((step) => [step.instruction, step.heat_level]),
      [
        ["첫 단계", "none"],
        ["두 번째 섹션", "0"],
      ],
    );
    assert.equal(recipe.items[0].prep_method, "채 썰기");
    assert.equal(recipe.tools[0].name, "냄비");
    assert.equal(stableId("recipes", 1), stableId("recipes", 1));
    assert.notEqual(stableId("recipes", 1), stableId("recipe_items", 1));
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
