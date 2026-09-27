import assert from "node:assert/strict";
import test from "node:test";

import {
  submitAuthRequest,
  submitGoogleSignIn,
  submitLogin,
  submitRegistration,
  submitSignOut,
} from "./auth-submit";

type Credentials = {
  email: string;
  password: string;
};

test("passes auth input and redirects after a successful request", async () => {
  const input: Credentials = {
    email: "player@example.com",
    password: "secret-password",
  };
  let received: Credentials | null = null;
  let redirected = false;

  const error = await submitAuthRequest({
    fallbackMessage: "Request failed.",
    input,
    onSuccess: () => {
      redirected = true;
    },
    request: async (requestInput) => {
      received = requestInput;
      return { error: null };
    },
  });

  assert.equal(error, null);
  assert.deepEqual(received, input);
  assert.equal(redirected, true);
});

test("returns the provider error without redirecting", async () => {
  let redirected = false;

  const error = await submitAuthRequest({
    fallbackMessage: "Request failed.",
    input: { email: "player@example.com", password: "wrong-password" },
    onSuccess: () => {
      redirected = true;
    },
    request: async () => ({ error: { message: "Invalid email or password" } }),
  });

  assert.equal(error, "Invalid email or password");
  assert.equal(redirected, false);
});

test("returns the fallback error when the request throws", async () => {
  const error = await submitAuthRequest({
    fallbackMessage: "Request failed.",
    input: { email: "player@example.com", password: "secret-password" },
    onSuccess: () => {},
    request: async () => {
      throw new Error("network failure");
    },
  });

  assert.equal(error, "Request failed.");
});

test("submits trimmed sign-in credentials and redirects home", async () => {
  let received: Credentials | null = null;
  let redirectPath: string | null = null;

  const error = await submitLogin(
    { email: " player@example.com ", password: "secret-password" },
    async (input) => {
      received = input;
      return { error: null };
    },
    (path) => {
      redirectPath = path;
    },
  );

  assert.equal(error, null);
  assert.deepEqual(received, {
    email: "player@example.com",
    password: "secret-password",
  });
  assert.equal(redirectPath, "/");
});

test("uses a retry message when sign-in cannot reach the auth service", async () => {
  const error = await submitLogin(
    { email: "player@example.com", password: "secret-password" },
    async () => {
      throw new Error("network failure");
    },
    () => {},
  );

  assert.equal(error, "Unable to sign in. Please try again.");
});

test("submits sign-up fields without confirmation password", async () => {
  let received: Record<string, string> | null = null;
  let redirectPath: string | null = null;

  const error = await submitRegistration(
    {
      confirmPassword: "secret-password",
      email: " player@example.com ",
      name: " Player One ",
      password: "secret-password",
    },
    async (input) => {
      received = input;
      return { error: null };
    },
    (path) => {
      redirectPath = path;
    },
  );

  assert.equal(error, null);
  assert.deepEqual(received, {
    email: "player@example.com",
    name: "Player One",
    password: "secret-password",
  });
  assert.equal(redirectPath, "/sign-in?created=1");
});

test("starts Google sign-in without returning an error", async () => {
  let requested = false;

  const error = await submitGoogleSignIn(async () => {
    requested = true;
    return { error: null };
  });

  assert.equal(error, null);
  assert.equal(requested, true);
});

test("returns Google sign-in provider errors", async () => {
  const error = await submitGoogleSignIn(async () => ({
    error: { message: "Google sign-in failed" },
  }));

  assert.equal(error, "Google sign-in failed");
});

test("signs out and redirects home after a successful request", async () => {
  let redirectPath: string | null = null;

  const error = await submitSignOut(
    async () => ({ error: null }),
    (path) => {
      redirectPath = path;
    },
  );

  assert.equal(error, null);
  assert.equal(redirectPath, "/");
});

test("returns a sign-out error without redirecting", async () => {
  let redirected = false;

  const error = await submitSignOut(
    async () => ({ error: { message: "Unable to end session" } }),
    () => {
      redirected = true;
    },
  );

  assert.equal(error, "Unable to end session");
  assert.equal(redirected, false);
});
