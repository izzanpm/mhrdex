---
target: sign up page
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\izzan\\Code\\mhr-dex\\app\\(auth)\\sign-up\\page.tsx"
target_fingerprint: "sha256:83af75d934ef5786db28962bb66d0e635c0f4e4ec0158e25eb1558cefe8343f7"
target_path: "C:\\Users\\izzan\\Code\\mhr-dex\\app\\(auth)\\sign-up\\page.tsx"
timestamp: 2026-09-20T09-52-53Z
slug: app-auth-sign-up-page-tsx
---
## Design Health Score

Source reviewed: `app/(auth)/sign-up/page.tsx` and its rendered surface in `components/auth-preview-screen.tsx`. Browser inspection was unavailable, so visual findings are source-based.

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Loading and errors exist, but registration has no `aria-busy` or success confirmation. |
| 2 | Match System / Real World | 4 | Familiar sign-up order, labels, and terminology. |
| 3 | User Control and Freedom | 3 | Back-to-library and sign-in exits are clear. |
| 4 | Consistency and Standards | 3 | Strong shared auth styling, with inconsistent loading semantics between sign-in and sign-up. |
| 5 | Error Prevention | 3 | Required fields, native email validation, minimum password length, and confirmation checks exist. |
| 6 | Recognition Rather Than Recall | 3 | Labels and placeholders are visible, but password expectations are not explained before submission. |
| 7 | Flexibility and Efficiency | 2 | Standard sequential flow, limited shortcuts, no password visibility toggle. |
| 8 | Aesthetic and Minimalist Design | 4 | Restrained dark canvas, one accent, and no decorative clutter. |
| 9 | Error Recovery | 2 | One alert appears below the submit button without field association or focus recovery. |
| 10 | Help and Documentation | 1 | No contextual password guidance or account-creation help. |
| **Total** | | **28/40** | **Good, with several pre-release fixes** |

## Design Specificity Verdict

The page is specific to MHR Dex, but understated. The charcoal/orange palette, Plus Jakarta Sans plus Fira Mono pairing, deck-focused subtitle, and `MHR DEX / 00B` page marker give it a product voice. The central form structure is still recognizable as a generic dark auth page if the branding is removed.

The deterministic detector found **0 findings** in `components/auth-preview-screen.tsx`. No browser overlay is available because browser automation is not exposed in this session.

## Overall Impression

The primary task is easy to understand and visually focused. The largest opportunity is not adding more visual treatment. It is making the form states and post-submit handoff feel deliberate, especially for users who fail validation or arrive on sign-in after registration.

## What's Working

- The hierarchy is immediate: brand, `Create account`, one-sentence purpose, fields, primary action, alternatives.
- The product identity is carried by the orange accent, dark surfaces, mono field labels, and page-code motif rather than decoration.
- Inputs have associated labels, autocomplete values, required constraints, visible focus styling, loading feedback, and preserved values after errors.

## Priority Issues

1. **[P1] Successful registration has a silent handoff.** `submitRegistration` redirects directly to `/sign-in` in `lib/auth-submit.ts:84-88`, with no success message or query state. The user can land on a fresh sign-in form and wonder whether the account was created. Fix the handoff with a visible `Account created` confirmation on sign-in, or authenticate the user immediately if that is the intended flow. Suggested command: `$impeccable clarify`.

2. **[P1] Validation feedback is detached from the fields.** Registration errors are rendered in one alert after the button in `components/auth-preview-screen.tsx:341-353`; the validation path is `components/auth-preview-screen.tsx:256-269`. The mismatch or short-password message does not mark the relevant input, explain the requirement beside it, or move focus to the problem. Add field-level `aria-invalid` and `aria-describedby`, inline guidance for password rules, and focus the first invalid field while preserving entered values. Suggested command: `$impeccable harden`.

3. **[P2] The pending state is not fully announced for assistive technology.** `LoginForm` sets `aria-busy`, but `RegisterForm` does not. The disabled button and spinner communicate the state visually, but a screen reader user gets no equivalent status announcement. Add `aria-busy={isPending}` to the registration form and ensure the live message identifies the operation. Suggested command: `$impeccable harden`.

4. **[P2] The account-switch link is visually small and likely below the mobile touch target.** The `Sign in` link uses `h-auto p-0` at `components/auth-preview-screen.tsx:461-469`, while the main controls are 48px tall. Give the link a minimum 44px hit area without changing its quiet visual treatment. Suggested command: `$impeccable adapt`.

5. **[P2] Apple is presented as a full CTA even though it cannot be used.** The disabled button and separate `Coming soon` label are honest, but they still add a second high-weight choice directly below the working Google action. Make it a clearly secondary unavailable row, or omit it until Apple Sign-In is ready. Suggested command: `$impeccable distill`.

## Persona Red Flags

**Jordan, confused first-timer**

- The heading and field labels are clear.
- Jordan gets no explanation of password requirements before submitting.
- A successful submission sends Jordan to a new sign-in screen without confirmation.
- The disabled Apple button looks like an available registration path until the small `Coming soon` note is noticed.

**Sam, accessibility-dependent user**

- The form has real labels, IDs, keyboard-focus styling, and an `aria-live` error region.
- Registration does not expose `aria-busy` during account creation.
- Errors are not tied to `password` or `confirmPassword` with `aria-describedby` and `aria-invalid`.
- The small account-switch link is a weak touch target and needs an explicit minimum hit area.

**Casey, distracted mobile user**

- The main fields and buttons are large enough for thumb use.
- The long linear form is reasonable, but the small bottom account-switch action is easy to miss or hit inaccurately.
- The silent redirect after success is risky if Casey is interrupted and returns to the sign-in page later.

## Minor Observations

- The desktop `max-w-[720px]` form is generous for four fields; a narrower measure could reduce eye travel without changing the composition.
- The entire surface is English while the product serves Indonesian players, and the root document declares `lang="en"`. Confirm whether English is intentional before localizing.
- The `MHR DEX / 00B` motif is distinctive, but its purpose is not documented in a `DESIGN.md`.
- Contrast appears intentionally strong from the source tokens, but it still needs rendered browser verification.

## Questions to Consider

- Should registration end with a visible `Account created` confirmation on sign-in, or should a successful registration authenticate the user immediately?
- Is English intentional for this Indonesian audience, or should the auth copy and document language be Indonesian?
- Should Apple remain visible as `Coming soon`, or should unavailable providers be removed until they work?
