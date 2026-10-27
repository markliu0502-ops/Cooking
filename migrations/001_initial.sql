CREATE TABLE recipes (
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recipe_items (
    id uuid PRIMARY KEY,
    recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    category text NOT NULL CHECK (category IN ('ingredient', 'seasoning')),
    name text NOT NULL,
    amount text NOT NULL DEFAULT '',
    prep_method text NOT NULL DEFAULT '',
    position integer NOT NULL CHECK (position >= 0),
    UNIQUE (recipe_id, category, position)
);

CREATE TABLE recipe_tools (
    id uuid PRIMARY KEY,
    recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (char_length(btrim(name)) > 0),
    position integer NOT NULL CHECK (position >= 0),
    UNIQUE (recipe_id, position)
);

CREATE TABLE recipe_sections (
    id uuid PRIMARY KEY,
    recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name text NOT NULL,
    position integer NOT NULL CHECK (position >= 0),
    UNIQUE (recipe_id, position),
    UNIQUE (id, recipe_id)
);

CREATE TABLE recipe_steps (
    id uuid PRIMARY KEY,
    recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    section_id uuid NOT NULL,
    instruction text NOT NULL CHECK (char_length(btrim(instruction)) > 0),
    position integer NOT NULL CHECK (position >= 0),
    heat_level smallint CHECK (heat_level BETWEEN 0 AND 5),
    FOREIGN KEY (section_id, recipe_id)
        REFERENCES recipe_sections(id, recipe_id) ON DELETE CASCADE,
    UNIQUE (section_id, position)
);

CREATE INDEX IF NOT EXISTS recipe_items_recipe_category_order
    ON recipe_items (recipe_id, category, position);
CREATE INDEX IF NOT EXISTS recipe_tools_recipe_order
    ON recipe_tools (recipe_id, position);
CREATE INDEX IF NOT EXISTS recipe_sections_recipe_order
    ON recipe_sections (recipe_id, position);
CREATE INDEX IF NOT EXISTS recipe_steps_recipe_section_order
    ON recipe_steps (recipe_id, section_id, position);
