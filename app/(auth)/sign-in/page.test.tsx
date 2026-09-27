import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import SignInPage from "./page";

test("passes the account-created query state to the sign-in screen", async () => {
  const markup = renderToStaticMarkup(
    await SignInPage({
      searchParams: Promise.resolve({ created: "1" }),
    }),
  );

  assert.match(markup, /Account created\. Sign in to continue\./);
});
