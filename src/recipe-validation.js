const MAX_COLLECTION_SIZE = 200;
const MAX_TEXT_LENGTH = 10000;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value, field, { required = false, max = MAX_TEXT_LENGTH } = {}) {
  if (typeof value !== "string") {
    return { error: `${field}은(는) 문자열이어야 합니다.` };
  }
  const normalized = value.trim();
  if (required && !normalized) return { error: `${field}을(를) 입력해 주세요.` };
  if (normalized.length > max) {
    return { error: `${field}은(는) ${max}자 이내로 입력해 주세요.` };
  }
  return { value: normalized };
}

function list(value, field) {
  if (!Array.isArray(value)) return { error: `${field} 형식이 올바르지 않습니다.` };
  if (value.length > MAX_COLLECTION_SIZE) {
    return { error: `${field}은(는) 최대 ${MAX_COLLECTION_SIZE}개까지 입력할 수 있습니다.` };
  }
  return { value };
}

function normalizeItems(value, field, includePrep) {
  const result = list(value, field);
  if (result.error) return result;
  const normalized = [];
  for (const item of result.value) {
    if (!isRecord(item)) return { error: `${field} 항목 형식이 올바르지 않습니다.` };
    const name = text(item.name, `${field} 이름`);
    const amount = text(item.amount, `${field} 분량`);
    const prepMethod = includePrep
      ? item.prepMethod === undefined
        ? { value: "" }
        : text(item.prepMethod, "손질 방법")
      : { value: "" };
    if (name.error || amount.error || prepMethod.error) {
      return { error: name.error || amount.error || prepMethod.error };
    }
    if (!name.value && amount.value) {
      return { error: `${field} 분량을 입력한 항목의 이름을 입력해 주세요.` };
    }
    if (name.value || amount.value) {
      normalized.push({
        name: name.value,
        amount: amount.value,
        prepMethod: prepMethod.value,
      });
    }
  }
  return { value: normalized };
}

export function validateRecipe(body) {
  if (!isRecord(body)) return { error: "요청 본문은 객체여야 합니다." };
  const name = text(body.name, "요리 이름", { required: true, max: 120 });
  if (name.error) return { error: name.error };

  const ingredients = normalizeItems(body.ingredients, "식재료", true);
  const seasonings = normalizeItems(body.seasonings, "양념", false);
  if (ingredients.error || seasonings.error) {
    return { error: ingredients.error || seasonings.error };
  }

  const toolsResult = list(body.tools, "필요한 도구");
  if (toolsResult.error) return { error: toolsResult.error };
  const tools = [];
  for (const tool of toolsResult.value) {
    const normalized = text(tool, "도구 이름");
    if (normalized.error) return { error: normalized.error };
    if (normalized.value) tools.push(normalized.value);
  }

  const sectionsResult = list(body.sections, "조리 섹션");
  if (sectionsResult.error) return { error: sectionsResult.error };
  const sections = [];
  for (const section of sectionsResult.value) {
    if (!isRecord(section)) return { error: "조리 섹션 형식이 올바르지 않습니다." };
    const sectionName = text(section.name, "섹션 이름");
    const stepsResult = list(section.steps, "조리 단계");
    if (sectionName.error || stepsResult.error) {
      return { error: sectionName.error || stepsResult.error };
    }
    const steps = [];
    for (const step of stepsResult.value) {
      if (!isRecord(step)) return { error: "조리 단계 형식이 올바르지 않습니다." };
      const instruction = text(step.instruction, "조리 단계", { required: false });
      if (instruction.error) return { error: instruction.error };
      const heatLevel = step.heatLevel;
      if (
        heatLevel !== null &&
        (!Number.isInteger(heatLevel) || heatLevel < 0 || heatLevel > 5)
      ) {
        return { error: "불 세기는 해당 없음 또는 0부터 5까지의 정수여야 합니다." };
      }
      if (instruction.value) steps.push({ instruction: instruction.value, heatLevel });
    }
    sections.push({
      name: sectionName.value || "조리 과정",
      steps,
    });
  }

  return {
    value: {
      name: name.value,
      ingredients: ingredients.value,
      seasonings: seasonings.value,
      tools,
      sections,
    },
  };
}
