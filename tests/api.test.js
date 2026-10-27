import assert from "node:assert/strict";
import { once } from "node:events";
import { afterEach, test } from "node:test";
import { createApp } from "../src/app.js";

const recipeId = "00000000-0000-4000-8000-000000000001";

function createMemoryRepository() {
  const recipes = new Map();
  return {
    recipes,
    async listRecipes() {
      return [...recipes.values()].map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        item_count: recipe.ingredients.length + recipe.seasonings.length,
        step_count: recipe.sections.reduce((sum, section) => sum + section.steps.length, 0),
      }));
    },
    async findRecipe(id) {
      const recipe = recipes.get(id);
      return recipe ? structuredClone(recipe) : null;
    },
    async saveRecipe(recipe, id = recipeId) {
      recipes.set(id, { ...structuredClone(recipe), id });
      return id;
    },
  };
}

async function listen(app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

const servers = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

const validRecipe = () => ({
  name: "김치찌개",
  ingredients: [
    { name: "양파", amount: "1개", prepMethod: "채 썰기" },
    { name: "두부", amount: "1/2모", prepMethod: "" },
  ],
  seasonings: [{ name: "고춧가루", amount: "1큰술" }],
  tools: ["냄비"],
  sections: [
    {
      name: "재료 준비",
      steps: [
        { instruction: "양파를 썬다.", heatLevel: null },
        { instruction: "팬을 달군다.", heatLevel: 0 },
      ],
    },
    {
      name: "마무리",
      steps: [{ instruction: "재료를 넣는다.", heatLevel: 3 }],
    },
  ],
});

test("recipe create, list, detail, update and reload preserve order and heat values", async () => {
  const repository = createMemoryRepository();
  const { server, baseUrl } = await listen(createApp(repository));
  servers.push(server);

  const created = await fetch(`${baseUrl}/api/recipes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validRecipe()),
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.data.id, recipeId);

  const listing = await fetch(`${baseUrl}/api/recipes`);
  assert.equal(listing.headers.get("cache-control"), "no-store");
  assert.equal((await listing.json()).data.length, 1);
  const detail = await fetch(`${baseUrl}/api/recipes/${recipeId}`);
  const original = (await detail.json()).data;
  assert.deepEqual(original.sections.map((section) => section.name), ["재료 준비", "마무리"]);
  assert.deepEqual(
    original.sections[0].steps.map((step) => step.heatLevel),
    [null, 0],
  );
  assert.equal(original.ingredients[0].prepMethod, "채 썰기");

  const edited = validRecipe();
  edited.name = "얼큰한 김치찌개";
  edited.sections.reverse();
  edited.sections[1].steps.reverse();
  edited.sections[1].steps[0].heatLevel = 5;
  const update = await fetch(`${baseUrl}/api/recipes/${recipeId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(edited),
  });
  assert.equal(update.status, 200);

  const reloaded = (await (await fetch(`${baseUrl}/api/recipes/${recipeId}`)).json()).data;
  assert.equal(reloaded.name, "얼큰한 김치찌개");
  assert.deepEqual(reloaded.sections.map((section) => section.name), ["마무리", "재료 준비"]);
  assert.deepEqual(
    reloaded.sections[1].steps.map((step) => step.instruction),
    ["팬을 달군다.", "양파를 썬다."],
  );
  assert.equal(reloaded.sections[1].steps[0].heatLevel, 5);
  assert.equal(reloaded.sections[1].steps.length, 2);
  assert.equal(reloaded.ingredients.length, 2);
});

test("API rejects invalid fields and unknown recipes with a consistent error shape", async () => {
  const repository = createMemoryRepository();
  const { server, baseUrl } = await listen(createApp(repository));
  servers.push(server);

  const invalid = validRecipe();
  invalid.sections[0].steps[0].heatLevel = "0";
  const response = await fetch(`${baseUrl}/api/recipes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(invalid),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "VALIDATION_ERROR");

  const missing = await fetch(`${baseUrl}/api/recipes/00000000-0000-4000-8000-000000000002`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validRecipe()),
  });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "NOT_FOUND");
});

test("malformed JSON and missing optional ingredient prep method are handled", async () => {
  const repository = createMemoryRepository();
  const { server, baseUrl } = await listen(createApp(repository));
  servers.push(server);

  const malformed = await fetch(`${baseUrl}/api/recipes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, "INVALID_JSON");

  const recipe = validRecipe();
  delete recipe.ingredients[0].prepMethod;
  const created = await fetch(`${baseUrl}/api/recipes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(recipe),
  });
  assert.equal(created.status, 201);
  assert.equal(
    repository.recipes.get(recipeId).ingredients[0].prepMethod,
    "",
  );
});

test("database failures return generic Korean errors without leaking driver details", async () => {
  const repository = createMemoryRepository();
  repository.listRecipes = async () => {
    const error = new Error("postgres://private-user:secret@internal-host");
    error.code = "08006";
    throw error;
  };
  const { server, baseUrl } = await listen(createApp(repository));
  servers.push(server);

  const response = await fetch(`${baseUrl}/api/recipes`);
  const body = await response.text();
  assert.equal(response.status, 500);
  assert.match(body, /요청을 처리하지 못했습니다/);
  assert.doesNotMatch(body, /private-user|secret|internal-host/);
  assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
});

test("missing database configuration is reported as service unavailable", async () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const { server, baseUrl } = await listen(createApp());
    servers.push(server);
    const response = await fetch(`${baseUrl}/api/recipes`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "DATABASE_UNAVAILABLE");
  } finally {
    if (original !== undefined) process.env.DATABASE_URL = original;
  }
});

test("static app is served as plain HTML", async () => {
  const { server, baseUrl } = await listen(createApp(createMemoryRepository()));
  servers.push(server);
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /lang="ko"/);
  assert.doesNotMatch(html, /\{\{/);
});
