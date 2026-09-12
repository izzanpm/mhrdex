import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const projectPath = (...segments: string[]) => path.join(process.cwd(), ...segments);

test("keeps implemented features in the documented architecture folders", () => {
  const expectedFiles = [
    ["app", "(dashboard)", "page.tsx"],
    ["app", "(dashboard)", "loading.tsx"],
    ["components", "app-icon.tsx"],
    ["components", "card-grid-item.tsx"],
    ["components", "card-library.tsx"],
    ["components", "sidebar.tsx"],
    ["lib", "cards.ts"],
    ["src", "db", "client.ts"],
    ["src", "db", "schema.ts"],
    ["types", "card.ts"],
  ];

  expectedFiles.forEach((segments) => {
    assert.ok(
      existsSync(projectPath(...segments)),
      `${segments.join("/")} must exist`,
    );
  });

  assert.equal(existsSync(projectPath("app", "page.tsx")), false);
  assert.equal(
    existsSync(projectPath("app", "(dashboard)", "cards", "page.tsx")),
    false,
  );
  assert.equal(existsSync(projectPath("app", "cards", "page.tsx")), false);
  assert.equal(
    existsSync(projectPath("components", "home", "home-preview.tsx")),
    false,
  );
  assert.equal(existsSync(projectPath("src", "index.ts")), false);
});
