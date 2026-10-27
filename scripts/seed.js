import "dotenv/config";
import { getSql } from "../src/database.js";
import { saveRecipe } from "../src/recipe-repository.js";

const sample = {
  name: "예시 된장찌개",
  ingredients: [
    { name: "애호박", amount: "1/2개", prepMethod: "반달 모양으로 썰기" },
    { name: "두부", amount: "1/2모", prepMethod: "한입 크기로 썰기" },
  ],
  seasonings: [{ name: "된장", amount: "1큰술", prepMethod: "" }],
  tools: ["냄비", "도마"],
  sections: [
    {
      name: "재료 준비",
      steps: [{ instruction: "재료를 먹기 좋은 크기로 썬다.", heatLevel: null }],
    },
    {
      name: "끓이기",
      steps: [{ instruction: "재료를 넣고 끓인다.", heatLevel: 3 }],
    },
  ],
};

const sql = getSql();
const existing = await sql`SELECT id FROM recipes WHERE name = ${sample.name} LIMIT 1`;
if (existing.length) {
  console.log("예시 레시피가 이미 있어 추가하지 않았습니다.");
} else {
  await saveRecipe(sample, undefined, sql);
  console.log("예시 레시피를 추가했습니다.");
}
