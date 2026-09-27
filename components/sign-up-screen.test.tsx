import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { getAuthRedirectPath } from "../lib/auth-submit";
import { RegisterScreen } from "./sign-up-screen";

test("renders the approved sign-up screen", () => {
  const markup = renderToStaticMarkup(<RegisterScreen />);

  assert.match(markup, /Create account/);
  assert.match(markup, /Start building your next deck in minutes\./);
  assert.match(markup, /<form/);
  assert.match(markup, />NAME</);
  assert.match(markup, /name="name"/);
  assert.match(markup, /name="email"/);
  assert.match(markup, /name="password"/);
  assert.match(markup, /name="confirmPassword"/);
  assert.equal((markup.match(/<input/g) ?? []).length, 4);
  assert.match(markup, /placeholder="Your name"/);
  assert.match(markup, /min[Ll]ength="8"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /type="submit"[^>]*>Create account/);
  assert.doesNotMatch(markup, /id="name"[^>]*readOnly/);
  assert.equal((markup.match(/data-slot="input"/g) ?? []).length, 4);
  assert.equal((markup.match(/data-slot="button"/g) ?? []).length, 4);
  assert.equal((markup.match(/data-slot="separator"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-slot="field-label"/g) ?? []).length, 4);
  assert.match(markup, /Create account/);
  assert.match(markup, /Continue with Google/);
  assert.match(markup, /Continue with Apple/);
  assert.match(markup, /Already have an account\?/);
  assert.match(markup, /href="\/sign-in">Sign in/);
  assert.match(markup, /MHR DEX \/ 00B/);
  assert.match(markup, /aria-disabled="true"/);
  assert.match(markup, /relative mt-\[15px\] md:mt-5/);
  assert.doesNotMatch(markup, /Forgot password\?/);
});

test("redirects to sign in after sign-up succeeds", () => {
  assert.equal(getAuthRedirectPath("register"), "/sign-in?created=1");
});
