import assert from "node:assert/strict";
import { test } from "node:test";
import { saveRecipe } from "../src/recipe-repository.js";

test("recipe edits batch deletes and ordered replacements into one Neon transaction", async () => {
  const transactions = [];
  const sql = (strings, ...values) => ({
    text: strings.join("?"),
    values,
  });
  sql.transaction = async (queries) => {
    transactions.push(queries);
  };
  const id = "00000000-0000-4000-8000-000000000001";

  await saveRecipe(
    {
      existing: true,
      name: "김치찌개",
      ingredients: [{ name: "양파", amount: "1개", prepMethod: "채 썰기" }],
      seasonings: [],
      tools: ["냄비"],
      sections: [
        {
          name: "준비",
          steps: [
            { instruction: "재료를 썬다.", heatLevel: null },
            { instruction: "불을 끈다.", heatLevel: 0 },
          ],
        },
        { name: "마무리", steps: [{ instruction: "담는다.", heatLevel: 3 }] },
      ],
    },
    id,
    sql,
  );

  assert.equal(transactions.length, 1);
  const queries = transactions[0];
  const statements = queries.map((query) => query.text);
  assert.match(statements[0], /INSERT INTO recipes/);
  assert.ok(statements.indexOf("DELETE FROM recipe_sections WHERE recipe_id = ?") > 0);
  assert.ok(
    statements.indexOf("DELETE FROM recipe_sections WHERE recipe_id = ?") <
      statements.findIndex((statement) => statement.includes("INSERT INTO recipe_sections")),
  );
  assert.equal(
    statements.filter((statement) => statement.includes("INSERT INTO recipe_items")).length,
    1,
  );
  assert.equal(
    statements.filter((statement) => statement.includes("INSERT INTO recipe_steps")).length,
    1,
  );

  const items = queries.find((query) => query.text.includes("INSERT INTO recipe_items"));
  const steps = queries.find((query) => query.text.includes("INSERT INTO recipe_steps"));
  assert.equal(JSON.parse(items.values[0])[0].prep_method, "채 썰기");
  assert.deepEqual(
    JSON.parse(steps.values[0]).map((step) => step.heat_level),
    [null, 0, 3],
  );
  assert.deepEqual(
    JSON.parse(steps.values[0]).map((step) => step.position),
    [0, 1, 0],
  );
});
