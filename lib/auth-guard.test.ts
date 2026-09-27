import assert from "node:assert/strict";
import test from "node:test";

import { requireAuthSession } from "./auth-guard";

test("redirects unauthenticated users to sign in", async () => {
  let redirectPath: string | null = null;

  await assert.rejects(
    requireAuthSession(
      async () => null,
      () => {
        redirectPath = "/sign-in";
        throw new Error("redirected");
      },
    ),
    /redirected/,
  );

  assert.equal(redirectPath, "/sign-in");
});
