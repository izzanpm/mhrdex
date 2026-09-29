import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const projectPath = (...segments: string[]) => path.join(process.cwd(), ...segments);

test("keeps implemented features in the documented architecture folders", () => {
  const expectedFiles = [
    ["app", "(dashboard)", "page.tsx"],
    ["app", "(dashboard)", "decks", "page.tsx"],
    ["app", "(dashboard)", "simulator", "page.tsx"],
    ["app", "(dashboard)", "loading.tsx"],
    ["components", "app-icon.tsx"],
    ["components", "account-controls.tsx"],
    ["components", "card-grid-item.tsx"],
    ["components", "card-library.tsx"],
    ["components", "sign-in-screen.tsx"],
    ["components", "sign-up-screen.tsx"],
    ["components", "sidebar.tsx"],
    ["app", "(auth)", "sign-in", "page.tsx"],
    ["app", "(auth)", "sign-up", "page.tsx"],
    ["lib", "cards.ts"],
    ["app", "api", "auth", "[...all]", "route.ts"],
    ["lib", "auth.ts"],
    ["lib", "auth-client.ts"],
    ["lib", "auth-guard.ts"],
    ["lib", "sign-up-validation.ts"],
    ["src", "db", "client.ts"],
    ["src", "db", "schema.ts"],
    ["types", "card.ts"],
    ["types", "user.ts"],
  ];

  expectedFiles.forEach((segments) => {
    assert.ok(
      existsSync(projectPath(...segments)),
      `${segments.join("/")} must exist`,
    );
  });

  assert.ok(
    existsSync(projectPath("lib", "simulator")),
    "lib/simulator/ must exist",
  );

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
