"use client";

import { authClient } from "@/lib/auth-client";
import type { RegistrationInput } from "@/lib/sign-up-validation";

type AuthResponse = {
  error?: { message?: string } | null;
};

type AuthRequest<Input> = (input: Input) => Promise<AuthResponse>;
type Redirect = (path: string) => void;

export type AuthRedirectMode = "login" | "register";
export type LoginCredentials = Pick<RegistrationInput, "email" | "password">;
export type RegistrationRequest = Pick<
  RegistrationInput,
  "email" | "name" | "password"
>;

export function getAuthRedirectPath(mode: AuthRedirectMode) {
  return mode === "register" ? "/sign-in?created=1" : "/";
}

export async function submitAuthRequest<Input>({
  fallbackMessage,
  input,
  onSuccess,
  requestFailureMessage,
  request,
}: {
  fallbackMessage: string;
  input: Input;
  onSuccess: () => void;
  requestFailureMessage?: string;
  request: AuthRequest<Input>;
}): Promise<string | null> {
  try {
    const { error } = await request(input);
    if (error) return error.message || fallbackMessage;

    onSuccess();
    return null;
  } catch {
    return requestFailureMessage ?? fallbackMessage;
  }
}

export function submitLogin(
  values: LoginCredentials,
  request: AuthRequest<LoginCredentials> = (input) =>
    authClient.signIn.email(input),
  redirect: Redirect = (path) => window.location.assign(path),
) {
  const input = {
    email: values.email.trim(),
    password: values.password,
  };

  if (!input.email || !input.password) {
    return Promise.resolve("Enter your email and password.");
  }

  return submitAuthRequest({
    fallbackMessage: "Unable to sign in. Check your credentials.",
    input,
    onSuccess: () => redirect(getAuthRedirectPath("login")),
    requestFailureMessage: "Unable to sign in. Please try again.",
    request,
  });
}

export function submitRegistration(
  values: RegistrationInput,
  request: AuthRequest<RegistrationRequest> = (input) =>
    authClient.signUp.email(input),
  redirect: Redirect = (path) => window.location.assign(path),
) {
  const input: RegistrationRequest = {
    email: values.email.trim(),
    name: values.name.trim(),
    password: values.password,
  };

  return submitAuthRequest({
    fallbackMessage: "Unable to create your account.",
    input,
    onSuccess: () => redirect(getAuthRedirectPath("register")),
    request,
  });
}

export function submitGoogleSignIn(
  request: () => Promise<AuthResponse> = () =>
    authClient.signIn.social({
      callbackURL: "/",
      provider: "google",
    }),
) {
  return submitAuthRequest({
    fallbackMessage: "Unable to continue with Google.",
    input: undefined,
    onSuccess: () => {},
    request: () => request(),
    requestFailureMessage: "Unable to continue with Google. Please try again.",
  });
}

export function submitSignOut(
  request: () => Promise<AuthResponse> = () => authClient.signOut(),
  redirect: Redirect = (path) => window.location.assign(path),
) {
  return submitAuthRequest({
    fallbackMessage: "Unable to log out.",
    input: undefined,
    onSuccess: () => redirect("/"),
    request: () => request(),
    requestFailureMessage: "Unable to log out. Please try again.",
  });
}
