import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { getAuthRedirectPath } from "../lib/auth-submit";
import { LoginScreen } from "./sign-in-screen";

test("renders the approved sign-in screen", () => {
  const markup = renderToStaticMarkup(<LoginScreen />);

  assert.match(markup, /MHR Dex/);
  assert.match(markup, /Welcome back/);
  assert.match(markup, /Sign in to keep your deck work moving\./);
  assert.match(markup, /aria-label="Back to card library"/);
  assert.match(markup, /href="\/"/);
  assert.match(markup, /name="email"/);
  assert.match(markup, /name="password"/);
  assert.match(markup, /Password reset is coming soon\./);
  assert.doesNotMatch(markup, /Forgot password\?/);
  assert.match(markup, /Continue with Google/);
  assert.match(markup, /Continue with Apple/);
  assert.match(markup, /src="\/icons\/google\.svg"/);
  assert.match(markup, /alt="Google"/);
  assert.match(markup, /src="\/icons\/apple\.svg"/);
  assert.match(markup, /alt="Apple"/);
  assert.equal((markup.match(/>Coming soon</g) ?? []).length, 1);
  assert.equal(
    (markup.match(/flex h-12 w-full items-center gap-3 rounded-\[8px\]/g) ?? [])
      .length,
    2,
  );
  const googleButton = markup
    .split("<button")
    .find((segment) => segment.includes('img alt="Google"'));
  const appleButton = markup
    .split("<button")
    .find((segment) => segment.includes('img alt="Apple"'));

  assert.ok(googleButton);
  assert.ok(appleButton);
  assert.doesNotMatch(googleButton, /\sdisabled(?:=|>)/);
  assert.match(appleButton, /\sdisabled(?:=|>)/);
  assert.match(markup, /aria-disabled="true"/);
  assert.match(markup, /Coming soon/);
  assert.equal((markup.match(/data-slot="input"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-slot="button"/g) ?? []).length, 4);
  assert.equal((markup.match(/data-slot="separator"/g) ?? []).length, 2);
  assert.match(markup, /data-slot="field-label"/);
  assert.match(markup, /max-w-\[720px\]/);
  assert.match(markup, /md:px-\[86px\]/);
});

test("renders an actionable email and password sign-in form", () => {
  const markup = renderToStaticMarkup(<LoginScreen />);

  assert.match(markup, /<form[^>]*aria-label="Sign in form"/);
  assert.match(markup, /placeholder="you@example.com"/);
  assert.match(markup, /placeholder="Your password"/);
  assert.match(markup, /type="submit"[^>]*>Sign in/);
  assert.match(markup, /href="\/sign-up">Sign up/);
  assert.doesNotMatch(markup, /name="email"[^>]*readOnly/);
  assert.doesNotMatch(markup, /name="password"[^>]*readOnly/);
});

test("shows an account-created confirmation after sign-up", () => {
  const markup = renderToStaticMarkup(<LoginScreen accountCreated />);

  assert.match(markup, /Account created\. Sign in to continue\./);
});

test("uses the home page after sign-in and the sign-in page after sign-up", () => {
  assert.equal(getAuthRedirectPath("login"), "/");
  assert.equal(getAuthRedirectPath("register"), "/sign-in?created=1");
});
