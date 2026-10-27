import express from "express";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { findRecipe, listRecipes, saveRecipe } from "./recipe-repository.js";
import { validateRecipe } from "./recipe-validation.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeDiagnosticMessage(error) {
  const message = error?.cause?.message ?? error?.message;
  if (typeof message !== "string") return undefined;
  const databaseUrl = process.env.DATABASE_URL;
  return message
    .replaceAll(databaseUrl ?? "\u0000", "[데이터베이스 연결 정보]")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[데이터베이스 연결 정보]")
    .slice(0, 300);
}

export function createApp(repository = { findRecipe, listRecipes, saveRecipe }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.use("/api", (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (request, response, next) => {
    request.requestId = randomUUID();
    response.set("X-Request-Id", request.requestId);
    next();
  });
  app.use(express.static(fileURLToPath(new URL("../public/", import.meta.url))));

  app.get("/api/health", async (_request, response) => {
    await repository.listRecipes();
    response.json({ data: { status: "ok" } });
  });

  app.get("/api/recipes", async (_request, response) => {
    const recipes = await repository.listRecipes();
    response.json({ data: recipes });
  });

  app.get("/api/recipes/:id", async (request, response) => {
    if (!UUID_PATTERN.test(request.params.id)) {
      return response.status(400).json({
        error: { code: "INVALID_ID", message: "레시피 번호 형식이 올바르지 않습니다." },
      });
    }
    const recipe = await repository.findRecipe(request.params.id);
    if (!recipe) {
      return response.status(404).json({
        error: { code: "NOT_FOUND", message: "레시피를 찾을 수 없습니다." },
      });
    }
    return response.json({ data: recipe });
  });

  app.post("/api/recipes", async (request, response) => {
    const result = validateRecipe(request.body);
    if (result.error) {
      return response.status(400).json({
        error: { code: "VALIDATION_ERROR", message: result.error },
      });
    }
    const id = await repository.saveRecipe(result.value);
    return response.status(201).json({
      data: { id },
      message: "레시피를 저장했습니다.",
    });
  });

  app.put("/api/recipes/:id", async (request, response) => {
    if (!UUID_PATTERN.test(request.params.id)) {
      return response.status(400).json({
        error: { code: "INVALID_ID", message: "레시피 번호 형식이 올바르지 않습니다." },
      });
    }
    const result = validateRecipe(request.body);
    if (result.error) {
      return response.status(400).json({
        error: { code: "VALIDATION_ERROR", message: result.error },
      });
    }
    const existing = await repository.findRecipe(request.params.id);
    if (!existing) {
      return response.status(404).json({
        error: { code: "NOT_FOUND", message: "레시피를 찾을 수 없습니다." },
      });
    }
    await repository.saveRecipe(
      { ...result.value, existing: true },
      request.params.id,
    );
    return response.json({
      data: { id: request.params.id },
      message: "레시피를 수정했습니다.",
    });
  });

  app.use("/api", (_request, response) => {
    response.status(404).json({
      error: { code: "NOT_FOUND", message: "요청한 API를 찾을 수 없습니다." },
    });
  });

  app.use((error, _request, response, _next) => {
    if (error?.type === "entity.parse.failed") {
      return response.status(400).json({
        error: { code: "INVALID_JSON", message: "요청 데이터 형식이 올바르지 않습니다." },
      });
    }
    if (error?.type === "entity.too.large") {
      return response.status(413).json({
        error: { code: "PAYLOAD_TOO_LARGE", message: "요청 데이터가 너무 큽니다." },
      });
    }
    console.error("API request failed", {
      requestId: _request.requestId,
      code: error?.code ?? "INTERNAL_ERROR",
      databaseCode: error?.cause?.code,
      name: error?.name ?? "Error",
      message: safeDiagnosticMessage(error),
    });
    const unavailable = error?.code === "DATABASE_URL_MISSING";
    return response.status(unavailable ? 503 : 500).json({
      error: {
        code: unavailable ? "DATABASE_UNAVAILABLE" : "INTERNAL_ERROR",
        message: unavailable
          ? "데이터베이스 연결이 설정되지 않았습니다."
          : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        requestId: _request.requestId,
      },
    });
  });

  return app;
}

export const app = createApp();
