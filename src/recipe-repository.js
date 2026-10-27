import { randomUUID } from "node:crypto";
import { getSql } from "./database.js";

function requireSql(sql) {
  return sql ?? getSql();
}

export async function listRecipes(sqlClient) {
  const sql = requireSql(sqlClient);
  return sql`
    SELECT r.id, r.name, r.updated_at,
      (SELECT count(*)::int FROM recipe_items i WHERE i.recipe_id = r.id) AS item_count,
      (SELECT count(*)::int FROM recipe_steps s WHERE s.recipe_id = r.id) AS step_count
    FROM recipes r
    ORDER BY r.updated_at DESC, r.id
  `;
}

export async function findRecipe(id, sqlClient) {
  const sql = requireSql(sqlClient);
  const [recipes, items, tools, sections, steps] = await Promise.all([
    sql`SELECT id, name, created_at, updated_at FROM recipes WHERE id = ${id}`,
    sql`
      SELECT category, name, amount, prep_method
      FROM recipe_items WHERE recipe_id = ${id}
      ORDER BY category, position
    `,
    sql`SELECT name FROM recipe_tools WHERE recipe_id = ${id} ORDER BY position`,
    sql`
      SELECT id, name, position FROM recipe_sections
      WHERE recipe_id = ${id} ORDER BY position
    `,
    sql`
      SELECT section_id, instruction, position, heat_level
      FROM recipe_steps WHERE recipe_id = ${id}
      ORDER BY section_id, position
    `,
  ]);
  if (!recipes[0]) return null;

  const stepsBySection = new Map();
  for (const step of steps) {
    const sectionSteps = stepsBySection.get(step.section_id) ?? [];
    sectionSteps.push({
      instruction: step.instruction,
      heatLevel: step.heat_level,
    });
    stepsBySection.set(step.section_id, sectionSteps);
  }

  return {
    id: recipes[0].id,
    name: recipes[0].name,
    createdAt: recipes[0].created_at,
    updatedAt: recipes[0].updated_at,
    ingredients: items
      .filter((item) => item.category === "ingredient")
      .map(({ name, amount, prep_method }) => ({
        name,
        amount,
        prepMethod: prep_method,
      })),
    seasonings: items
      .filter((item) => item.category === "seasoning")
      .map(({ name, amount }) => ({ name, amount })),
    tools: tools.map((tool) => tool.name),
    sections: sections.map((section) => ({
      name: section.name,
      steps: stepsBySection.get(section.id) ?? [],
    })),
  };
}

export async function saveRecipe(recipe, id = randomUUID(), sqlClient) {
  const sql = requireSql(sqlClient);
  const queries = [
    sql`
      INSERT INTO recipes (id, name)
      VALUES (${id}, ${recipe.name})
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, updated_at = now()
    `,
  ];

  if (recipe.existing) {
    queries.push(
      sql`DELETE FROM recipe_sections WHERE recipe_id = ${id}`,
      sql`DELETE FROM recipe_items WHERE recipe_id = ${id}`,
      sql`DELETE FROM recipe_tools WHERE recipe_id = ${id}`,
    );
  }

  const itemRows = [];
  for (const [category, items] of [
    ["ingredient", recipe.ingredients],
    ["seasoning", recipe.seasonings],
  ]) {
    items.forEach((item, position) => {
      if (!item.name && !item.amount) return;
      itemRows.push({
        id: randomUUID(),
        recipe_id: id,
        category,
        name: item.name,
        amount: item.amount,
        prep_method: item.prepMethod ?? "",
        position,
      });
    });
  }
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
    `);
  }

  const toolRows = [];
  recipe.tools.forEach((name, position) => {
    if (!name) return;
    toolRows.push({ id: randomUUID(), recipe_id: id, name, position });
  });
  if (toolRows.length) {
    queries.push(sql`
      INSERT INTO recipe_tools (id, recipe_id, name, position)
      SELECT entry.id, entry.recipe_id, entry.name, entry.position
      FROM jsonb_to_recordset(${JSON.stringify(toolRows)}::jsonb) AS entry(
        id uuid, recipe_id uuid, name text, position integer
      )
    `);
  }

  const sectionRows = [];
  const stepRows = [];
  recipe.sections.forEach((section, sectionPosition) => {
    const sectionId = randomUUID();
    sectionRows.push({
      id: sectionId,
      recipe_id: id,
      name: section.name || "조리 과정",
      position: sectionPosition,
    });
    let stepPosition = 0;
    for (const step of section.steps) {
      if (!step.instruction) continue;
      stepRows.push({
        id: randomUUID(),
        recipe_id: id,
        section_id: sectionId,
        instruction: step.instruction,
        position: stepPosition,
        heat_level: step.heatLevel,
      });
      stepPosition += 1;
    }
  });
  if (sectionRows.length) {
    queries.push(sql`
      INSERT INTO recipe_sections (id, recipe_id, name, position)
      SELECT entry.id, entry.recipe_id, entry.name, entry.position
      FROM jsonb_to_recordset(${JSON.stringify(sectionRows)}::jsonb) AS entry(
        id uuid, recipe_id uuid, name text, position integer
      )
    `);
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
    `);
  }

  await sql.transaction(queries);
  return id;
}
