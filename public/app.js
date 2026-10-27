const app = document.querySelector("#app");
const notice = document.querySelector("#notice");
const headerAction = document.querySelector(".header-action");

const HEAT_LEVELS = [
  [null, "해당 없음"],
  [0, "0: 불 끔"],
  [1, "1: 아주 약불"],
  [2, "2: 약불"],
  [3, "3: 중불"],
  [4, "4: 중강불"],
  [5, "5: 강불"],
];

let pendingNotice = "";
let renderSequence = 0;

function element(tag, className = "", text = "") {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text) result.textContent = text;
  return result;
}

function button(text, className, action, label = text) {
  const result = element("button", className, text);
  result.type = "button";
  result.dataset.action = action;
  result.setAttribute("aria-label", label);
  return result;
}

function setNotice(message = "", kind = "success") {
  notice.hidden = !message;
  notice.textContent = message;
  notice.className = message ? `notice notice-${kind}` : "notice";
}

function showLoading(message = "화면을 불러오는 중입니다.") {
  app.replaceChildren(element("section", "empty-state", message));
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    throw new Error("서버에 연결할 수 없습니다. 실행 상태를 확인해 주세요.");
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("서버 응답을 읽을 수 없습니다.");
  }
  if (!response.ok) {
    const message = result?.error?.message || "요청을 처리하지 못했습니다.";
    const requestId = result?.error?.requestId;
    throw new Error(requestId ? `${message} (요청 번호: ${requestId})` : message);
  }
  return result;
}

function pageHeading(eyebrow, title, description = "") {
  const section = element("section", "page-heading");
  section.append(element("p", "eyebrow", eyebrow), element("h1", "", title));
  if (description) section.append(element("p", "muted", description));
  return section;
}

function backLink(href, label) {
  const link = element("a", "back-link", `← ${label}`);
  link.href = href;
  return link;
}

function appendActionLink(parent, href, text, className = "button") {
  const link = element("a", className, text);
  link.href = href;
  parent.append(link);
  return link;
}

function renderList(recipes) {
  app.className = "page";
  headerAction.hidden = false;
  app.replaceChildren(
    pageHeading("나의 요리 기록", "나만의 요리 기록", "소중한 레시피를 한곳에 차곡차곡 모아보세요."),
  );
  if (!recipes.length) {
    const empty = element("section", "empty-state");
    empty.append(
      element("div", "empty-icon", "♨"),
      element("h2", "", "아직 저장한 레시피가 없어요"),
      element("p", "muted", "첫 번째 레시피를 기록해 볼까요?"),
    );
    appendActionLink(empty, "#/recipes/new", "레시피 등록");
    app.append(empty);
    return;
  }
  const grid = element("section", "recipe-grid");
  grid.setAttribute("aria-label", "저장한 레시피 목록");
  for (const recipe of recipes) {
    const card = element("a", "recipe-card");
    card.href = `#/recipes/${encodeURIComponent(recipe.id)}`;
    card.append(
      element("span", "card-icon", "♡"),
      element("h2", "", recipe.name),
      element("p", "card-meta", `재료 ${recipe.item_count}개 · 조리 ${recipe.step_count}단계`),
      element("span", "card-link", "레시피 보기 →"),
    );
    grid.append(card);
  }
  app.append(grid);
}

function renderItems(section, title, items, type) {
  const list = element("ul", "item-list");
  for (const item of items) {
    const row = element("li");
    const description = element("span", "item-description");
    description.append(element("span", "", item.name));
    if (type === "ingredient" && item.prepMethod) {
      description.append(element("span", "prep-method", item.prepMethod));
    }
    row.append(description, element("span", "amount", item.amount));
    list.append(row);
  }
  if (items.length) section.append(list);
  else {
    const particle = title === "양념" ? "이" : "가";
    section.append(element("p", "muted", `등록한 ${title}${particle} 없어요.`));
  }
}

function renderDetail(recipe) {
  app.className = "page narrow";
  headerAction.hidden = false;
  headerAction.href = `#/recipes/${encodeURIComponent(recipe.id)}/edit`;
  headerAction.textContent = "수정";
  const heading = pageHeading("나의 레시피", recipe.name);
  heading.className = "detail-heading";
  app.replaceChildren(backLink("#/", "레시피 목록"), heading);

  const ingredients = element("section", "detail-section");
  ingredients.append(detailSectionHeading("식재료", "ingredient-mark"));
  renderItems(ingredients, "식재료", recipe.ingredients, "ingredient");
  app.append(ingredients);

  const seasonings = element("section", "detail-section");
  seasonings.append(detailSectionHeading("양념", "seasoning-mark"));
  renderItems(seasonings, "양념", recipe.seasonings, "seasoning");
  app.append(seasonings);

  if (recipe.tools.length) {
    const tools = element("section", "detail-section");
    tools.append(detailSectionHeading("필요한 도구", "tool-mark"));
    const list = element("ul", "tool-list");
    recipe.tools.forEach((tool) => list.append(element("li", "", tool)));
    tools.append(list);
    app.append(tools);
  }

  const cooking = element("section", "detail-section");
  cooking.append(detailSectionHeading("조리 과정", "step-mark"));
  if (!recipe.sections.length) {
    cooking.append(element("p", "muted", "등록한 조리 과정이 없어요."));
  } else {
    const sectionList = element("div", "detail-sections");
    recipe.sections.forEach((section) => {
      const details = element("details", "detail-step-section");
      details.open = true;
      details.append(element("summary", "", section.name));
      if (!section.steps.length) {
        details.append(element("p", "muted section-empty", "등록한 세부 단계가 없어요."));
      } else {
        const steps = element("ol", "step-list");
        section.steps.forEach((step, index) => {
          const row = element("li");
          const content = element("div", "step-content");
          content.append(element("p", "", step.instruction));
          if (step.heatLevel !== null) {
            content.append(
              element(
                "span",
                "heat-badge",
                `불 세기 ${step.heatLevel}/5 · ${HEAT_LEVELS[step.heatLevel + 1][1].split(": ")[1]}`,
              ),
            );
          }
          row.append(element("span", "step-number", String(index + 1)), content);
          steps.append(row);
        });
        details.append(steps);
      }
      sectionList.append(details);
    });
    cooking.append(sectionList);
  }
  app.append(cooking);

  const actions = element("div", "detail-actions");
  appendActionLink(actions, "#/", "목록으로", "button button-light");
  appendActionLink(actions, `#/recipes/${encodeURIComponent(recipe.id)}/edit`, "수정");
  app.append(actions);
}

function detailSectionHeading(title, markClass) {
  const heading = element("h2");
  heading.append(
    element("span", `section-mark ${markClass}`),
    document.createTextNode(title),
  );
  return heading;
}

function textInput(name, value, placeholder, label) {
  const input = element("input");
  input.type = "text";
  input.name = name;
  input.value = value ?? "";
  input.placeholder = placeholder;
  input.setAttribute("aria-label", label);
  return input;
}

function sectionBox(title, markClass, addText, addAction) {
  const section = element("section", "form-section");
  const heading = element("div", "section-title-row");
  const headingText = element("h2");
  const mark = element("span", `section-mark ${markClass}`);
  headingText.append(mark, document.createTextNode(title));
  heading.append(
    headingText,
    button(addText, "button button-small button-light", addAction),
  );
  section.append(heading);
  return section;
}

function makeIngredientRow(item = {}, kind = "ingredient") {
  const ingredient = kind === "ingredient";
  const row = element("div", `ingredient-row${ingredient ? " ingredient-row-prep" : ""}`);
  row.append(
    textInput(
      `${kind}_name`,
      item.name,
      ingredient ? "이름 (예: 양파)" : "이름 (예: 고춧가루)",
      `${ingredient ? "식재료" : "양념"} 이름`,
    ),
    textInput(
      `${kind}_amount`,
      item.amount,
      ingredient ? "분량 (예: 1개)" : "분량 (예: 1큰술)",
      `${ingredient ? "식재료" : "양념"} 분량`,
    ),
  );
  if (ingredient) {
    row.append(
      textInput("ingredient_prep", item.prepMethod, "손질 방법 (선택)", "식재료 손질 방법"),
    );
  }
  row.append(button("삭제", "remove-row", "remove-row", `${ingredient ? "식재료" : "양념"} 항목 삭제`));
  return row;
}

function makeStepRow(step = {}) {
  const row = element("div", "step-row");
  row.dataset.step = "";
  row.append(element("span", "step-number"));
  const fields = element("div", "step-fields");
  const textarea = element("textarea");
  textarea.dataset.stepText = "";
  textarea.rows = 2;
  textarea.value = step.instruction ?? "";
  textarea.placeholder = "조리 과정을 입력해 주세요.";
  const heat = element("label", "heat-field");
  heat.append(element("span", "", "불 세기"));
  const select = element("select");
  select.dataset.stepHeat = "";
  select.setAttribute("aria-label", "불 세기");
  HEAT_LEVELS.forEach(([value, label]) => {
    const option = element("option", "", label);
    option.value = value === null ? "" : String(value);
    if ((step.heatLevel ?? null) === value) option.selected = true;
    select.append(option);
  });
  heat.append(select);
  fields.append(textarea, heat);
  row.append(fields, makeReorderControls("step"));
  return row;
}

function makeReorderControls(kind) {
  const label = kind === "step" ? "단계" : "섹션";
  const controls = element("div", `reorder-controls${kind === "step" ? " step-controls" : ""}`);
  controls.append(
    button("↑", "icon-button", `move-${kind}-up`, `${label} 위로 이동`),
    button("↓", "icon-button", `move-${kind}-down`, `${label} 아래로 이동`),
    button("삭제", `remove-row remove-${kind}`, `remove-${kind}`, `${label} 삭제`),
  );
  return controls;
}

function makeSectionEditor(section = {}) {
  const editor = element("article", "section-editor");
  editor.dataset.section = "";
  const heading = element("div", "section-editor-heading");
  const name = textInput("section_name", section.name, "섹션 이름 (비우면 ‘조리 과정’)", "조리 섹션 이름");
  const steps = element("div", "section-steps");
  steps.dataset.steps = "";
  (section.steps?.length ? section.steps : []).forEach((step) => steps.append(makeStepRow(step)));
  const addStep = button("+ 세부 단계 추가", "button button-small button-light", "add-step");
  editor.append(heading, steps, addStep);
  heading.append(name, makeReorderControls("section"));
  return editor;
}

function makeToolRow(value = "") {
  const row = element("div", "tool-row");
  row.append(
    textInput("tool_name", value, "예: 프라이팬", "필요한 도구"),
    button("삭제", "remove-row", "remove-row", "도구 삭제"),
  );
  return row;
}

function makeForm(recipe, editing) {
  const form = element("form", "recipe-form");
  form.noValidate = true;
  const nameSection = element("section", "form-section name-section");
  const nameLabel = element("label", "field-label", "요리 이름 필수");
  nameLabel.htmlFor = "recipe-name";
  const nameInput = textInput("name", recipe.name, "예: 엄마표 김치찌개", "요리 이름");
  nameInput.id = "recipe-name";
  nameSection.append(nameLabel, nameInput);
  form.append(nameSection);

  const ingredientSection = sectionBox("식재료", "ingredient-mark", "+ 항목 추가", "add-ingredient");
  const ingredientRows = element("div", "ingredient-rows");
  ingredientRows.dataset.list = "ingredients";
  (recipe.ingredients?.length ? recipe.ingredients : [{}]).forEach((item) =>
    ingredientRows.append(makeIngredientRow(item)),
  );
  ingredientSection.append(ingredientRows);
  form.append(ingredientSection);

  const seasoningSection = sectionBox("양념", "seasoning-mark", "+ 항목 추가", "add-seasoning");
  const seasoningRows = element("div", "ingredient-rows");
  seasoningRows.dataset.list = "seasonings";
  (recipe.seasonings?.length ? recipe.seasonings : [{}]).forEach((item) =>
    seasoningRows.append(makeIngredientRow(item, "seasoning")),
  );
  seasoningSection.append(seasoningRows);
  form.append(seasoningSection);

  const toolsSection = sectionBox("필요한 도구", "tool-mark", "+ 도구 추가", "add-tool");
  const toolsRows = element("div", "tools-rows");
  toolsRows.dataset.list = "tools";
  (recipe.tools?.length ? recipe.tools : [""]).forEach((tool) =>
    toolsRows.append(makeToolRow(tool)),
  );
  toolsSection.append(toolsRows);
  form.append(toolsSection);

  const cookingSection = element("section", "form-section");
  const heading = element("div", "section-title-row");
  const titleGroup = element("div");
  const cookingHeading = element("h2");
  cookingHeading.append(
    element("span", "section-mark step-mark"),
    document.createTextNode("조리 과정"),
  );
  titleGroup.append(
    cookingHeading,
    element("p", "helper-text", "불 세기는 앱에서 사용하는 상대적인 조리 기준입니다."),
  );
  heading.append(titleGroup, button("+ 섹션 추가", "button button-small button-light", "add-section"));
  const sections = element("div", "sections-rows");
  sections.dataset.list = "sections";
  (recipe.sections?.length ? recipe.sections : [{ steps: [{}] }]).forEach((section) =>
    sections.append(makeSectionEditor(section)),
  );
  cookingSection.append(heading, sections);
  form.append(cookingSection);

  const actions = element("div", "form-actions");
  appendActionLink(
    actions,
    editing ? `#/recipes/${encodeURIComponent(recipe.id)}` : "#/",
    "취소",
    "button button-light",
  );
  const saveButton = element("button", "button", "저장");
  saveButton.type = "submit";
  actions.append(saveButton);
  form.append(actions);
  form.addEventListener("click", (event) => handleFormClick(event, form));
  form.addEventListener("submit", (event) => submitForm(event, form, recipe.id, editing));
  renumberSections(form);
  return form;
}

function renumberSections(form) {
  form.querySelectorAll(".section-editor").forEach((section, sectionIndex) => {
    section.querySelectorAll("[data-step]").forEach((step, stepIndex) => {
      step.querySelector(".step-number").textContent = String(stepIndex + 1);
      step.querySelector("[data-step-text]").name = `step_text_${sectionIndex}`;
      step.querySelector("[data-step-text]").setAttribute(
        "aria-label",
        `섹션 ${sectionIndex + 1} 조리 단계 ${stepIndex + 1}`,
      );
      step.querySelector("[data-step-heat]").name = `step_heat_${sectionIndex}`;
    });
  });
}

function handleFormClick(event, form) {
  const actionButton = event.target.closest("button[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  const sections = form.querySelector("[data-list='sections']");

  if (action === "add-ingredient" || action === "add-seasoning") {
    const kind = action === "add-ingredient" ? "ingredient" : "seasoning";
    form.querySelector(`[data-list='${kind === "ingredient" ? "ingredients" : "seasonings"}']`)
      .append(makeIngredientRow({}, kind));
    return;
  }
  if (action === "add-tool") {
    form.querySelector("[data-list='tools']").append(makeToolRow());
    return;
  }
  if (action === "add-section") {
    const section = makeSectionEditor({ steps: [{}] });
    sections.append(section);
    renumberSections(form);
    section.querySelector("[name='section_name']").focus();
    return;
  }

  const section = actionButton.closest(".section-editor");
  if (action === "add-step") {
    const step = makeStepRow();
    section.querySelector("[data-steps]").append(step);
    renumberSections(form);
    step.querySelector("[data-step-text]").focus();
  } else if (action === "move-section-up" && section.previousElementSibling) {
    sections.insertBefore(section, section.previousElementSibling);
  } else if (action === "move-section-down" && section.nextElementSibling) {
    sections.insertBefore(section.nextElementSibling, section);
  } else if (action === "move-step-up" || action === "move-step-down") {
    const step = actionButton.closest("[data-step]");
    const sibling = action === "move-step-up" ? step.previousElementSibling : step.nextElementSibling;
    if (sibling) {
      if (action === "move-step-up") step.parentElement.insertBefore(step, sibling);
      else step.parentElement.insertBefore(sibling, step);
    }
  } else if (action === "remove-section") {
    if (
      section.querySelectorAll("[data-step]").length &&
      !window.confirm("이 섹션과 포함된 조리 단계를 모두 삭제할까요?")
    ) return;
    section.remove();
  } else if (action === "remove-step") {
    actionButton.closest("[data-step]").remove();
  } else if (action === "remove-row") {
    const row = actionButton.closest(".ingredient-row, .tool-row");
    const container = row.parentElement;
    row.remove();
    if (
      container.classList.contains("ingredient-rows") &&
      !container.children.length
    ) {
      const ingredient = container.dataset.list === "ingredients";
      container.append(makeIngredientRow({}, ingredient ? "ingredient" : "seasoning"));
    }
  }
  renumberSections(form);
}

function formPayload(form) {
  return {
    name: form.elements.namedItem("name").value,
    ingredients: [...form.querySelectorAll("[data-list='ingredients'] .ingredient-row")].map((row) => ({
      name: row.querySelector("[name='ingredient_name']").value,
      amount: row.querySelector("[name='ingredient_amount']").value,
      prepMethod: row.querySelector("[name='ingredient_prep']").value,
    })),
    seasonings: [...form.querySelectorAll("[data-list='seasonings'] .ingredient-row")].map((row) => ({
      name: row.querySelector("[name='seasoning_name']").value,
      amount: row.querySelector("[name='seasoning_amount']").value,
    })),
    tools: [...form.querySelectorAll("[data-list='tools'] [name='tool_name']")].map((input) => input.value),
    sections: [...form.querySelectorAll(".section-editor")].map((section) => ({
      name: section.querySelector("[name='section_name']").value,
      steps: [...section.querySelectorAll("[data-step]")].map((step) => ({
        instruction: step.querySelector("[data-step-text]").value,
        heatLevel: step.querySelector("[data-step-heat]").value === ""
          ? null
          : Number(step.querySelector("[data-step-heat]").value),
      })),
    })),
  };
}

async function submitForm(event, form, id, editing) {
  event.preventDefault();
  const name = form.elements.namedItem("name");
  if (!name.value.trim()) {
    setNotice("요리 이름을 입력해 주세요.", "error");
    name.focus();
    return;
  }
  const saveButton = form.querySelector("button[type='submit']");
  saveButton.disabled = true;
  saveButton.textContent = "저장 중...";
  setNotice("레시피를 저장하고 있습니다.", "loading");
  try {
    const result = await api(
      editing ? `/api/recipes/${encodeURIComponent(id)}` : "/api/recipes",
      {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(formPayload(form)),
      },
    );
    pendingNotice = result.message;
    location.hash = `#/recipes/${encodeURIComponent(result.data.id)}`;
  } catch (error) {
    setNotice(error.message, "error");
    saveButton.disabled = false;
    saveButton.textContent = "저장";
  }
}

async function renderForm(id = null) {
  app.className = "page narrow";
  headerAction.hidden = true;
  let recipe = {
    name: "",
    ingredients: [{}],
    seasonings: [{}],
    tools: [""],
    sections: [{ name: "", steps: [{}] }],
  };
  if (id) {
    try {
      recipe = (await api(`/api/recipes/${encodeURIComponent(id)}`)).data;
    } catch (error) {
      setNotice(error.message, "error");
      app.replaceChildren(backLink("#/", "레시피 목록"));
      return;
    }
  }
  app.replaceChildren(
    backLink(id ? `#/recipes/${encodeURIComponent(id)}` : "#/", "돌아가기"),
    pageHeading(id ? "레시피 수정" : "새 레시피", id ? "레시피 수정" : "새 레시피 등록", "나중에 다시 봐도 알기 쉽게 기록해 보세요."),
    makeForm(recipe, Boolean(id)),
  );
}

async function render() {
  const sequence = ++renderSequence;
  setNotice(pendingNotice);
  pendingNotice = "";
  const route = location.hash.slice(1) || "/";
  const editMatch = route.match(/^\/recipes\/([0-9a-f-]+)\/edit$/i);
  const detailMatch = route.match(/^\/recipes\/([0-9a-f-]+)$/i);
  if (route === "/recipes/new") {
    await renderForm();
    return;
  }
  if (editMatch) {
    showLoading("저장한 레시피를 불러오는 중입니다.");
    await renderForm(decodeURIComponent(editMatch[1]));
    return;
  }
  if (detailMatch) {
    headerAction.hidden = true;
    showLoading("레시피 상세 내용을 불러오는 중입니다.");
    try {
      const recipe = (await api(`/api/recipes/${encodeURIComponent(detailMatch[1])}`)).data;
      if (sequence !== renderSequence) return;
      renderDetail(recipe);
      if (pendingNotice) setNotice(pendingNotice);
    } catch (error) {
      if (sequence !== renderSequence) return;
      setNotice(error.message, "error");
      app.replaceChildren(backLink("#/", "레시피 목록"));
    }
    return;
  }
  headerAction.hidden = false;
  headerAction.href = "#/recipes/new";
  headerAction.textContent = "레시피 등록";
  showLoading("저장한 레시피 목록을 불러오는 중입니다.");
  try {
    const recipes = (await api("/api/recipes")).data;
    if (sequence !== renderSequence) return;
    renderList(recipes);
  } catch (error) {
    if (sequence !== renderSequence) return;
    app.replaceChildren(
      pageHeading("나의 요리 기록", "나만의 요리 기록"),
      element("section", "empty-state", error.message),
    );
    setNotice(error.message, "error");
  }
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href^='#/']");
  if (!link) return;
  event.preventDefault();
  if (location.hash === link.getAttribute("href")) render();
  else location.hash = link.getAttribute("href").slice(1);
});
window.addEventListener("hashchange", render);
render();
