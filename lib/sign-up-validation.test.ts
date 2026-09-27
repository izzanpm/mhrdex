import assert from "node:assert/strict";
import test from "node:test";

import { validateRegistration } from "./sign-up-validation";

test("requires a name before signing up", () => {
  assert.equal(
    validateRegistration({
      name: " ",
      email: "player@example.com",
      password: "password123",
      confirmPassword: "password123",
    }),
    "Enter your name.",
  );
});

test("requires a valid password confirmation", () => {
  assert.equal(
    validateRegistration({
      name: "Player One",
      email: "player@example.com",
      password: "short",
      confirmPassword: "different",
    }),
    "Password must be at least 8 characters.",
  );

  assert.equal(
    validateRegistration({
      name: "Player One",
      email: "player@example.com",
      password: "password123",
      confirmPassword: "different",
    }),
    "Passwords do not match.",
  );
});

test("accepts a complete registration payload", () => {
  assert.equal(
    validateRegistration({
      name: "Player One",
      email: "player@example.com",
      password: "password123",
      confirmPassword: "password123",
    }),
    null,
  );
});
