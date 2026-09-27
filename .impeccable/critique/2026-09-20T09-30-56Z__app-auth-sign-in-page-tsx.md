---
target: sign-in page
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\izzan\\Code\\mhr-dex\\app\\(auth)\\sign-in\\page.tsx"
target_fingerprint: "sha256:1fd55aba8ca93eabeb3d927f52553a936b85a81fa040b282119e918b6bfd7059"
target_path: "C:\\Users\\izzan\\Code\\mhr-dex\\app\\(auth)\\sign-in\\page.tsx"
timestamp: 2026-09-20T09-30-56Z
slug: app-auth-sign-in-page-tsx
---
⚠️ DEGRADED: single-context (no sub-agent/Task tool exposed in this session)

**Design Health Score**

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Pending sign-in, loading, and error states are visible. |
| 2 | Match System / Real World | 3 | Familiar auth flow, but micro-labels and `MHR DEX / 00` are not user-facing language. |
| 3 | User Control and Freedom | 2 | No clear route back to the public card library; recovery is unavailable. |
| 4 | Consistency and Standards | 3 | Strong visual consistency, with disabled actions still styled like live options. |
| 5 | Error Prevention | 3 | Required fields, autocomplete, and disabled unavailable providers help. |
| 6 | Recognition Rather Than Recall | 3 | Labels and placeholders are visible, but recovery guidance is missing. |
| 7 | Flexibility and Efficiency | 2 | Autofill works, but there is no password recovery or password visibility control. |
| 8 | Aesthetic and Minimalist Design | 3 | Focused and restrained, though the 720px form and deferred actions add weight. |
| 9 | Error Recovery | 3 | Errors are plain and values remain in the form, but recovery is only a generic retry. |
| 10 | Help and Documentation | 1 | No contextual help or support path is available on an auth failure. |
| **Total** |  | **26/40** | **Acceptable, significant improvements needed** |

**Design Specificity Verdict**

The page has an authored visual language: near-black canvas, orange action color, Plus Jakarta Sans for reading, Fira Mono for product metadata, and the small orange brand mark. It is more deliberate than a generic shadcn auth screen.

The underlying composition is still interchangeable with many dark-mode sign-in pages. Product character is mostly confined to `MHR Dex`, the accent square, and the footer code. A real route back to the card library would make the page feel more connected to the product without adding decoration.

The deterministic detector returned `[]`, so it found no automated design-rule violations. Browser inspection and overlay injection were skipped because no browser automation tool is exposed in this session.

**Overall Impression**

Quiet and competent. The credential task is easy to understand, but the most stressful moments, forgetting a password, failing authentication, or wanting to leave, are treated as unfinished states. The biggest opportunity is to make recovery and escape first-class while preserving the current restraint.

**What's Working**

- The hierarchy is immediate: brand, `Welcome back`, supporting copy, two fields, then one dominant `Sign in` action (`components/auth-preview-screen.tsx:389-410`).
- The form has real async feedback: `aria-busy`, a spinner, preserved values, and a live error region (`components/auth-preview-screen.tsx:158-168`, `217-245`).
- Deferred functionality is labeled honestly instead of pretending Apple sign-in or password reset works (`components/auth-preview-screen.tsx:202-215`, `420-443`).

**Priority Issues**

**[P1] No clear exit to the public product**

**Why it matters:** MHR Dex has a public card library, but the auth header is plain text and the page offers no visible path back to it. A visitor who changes their mind must use browser history.

**Fix:** Make the `MHR Dex` mark link to `/`, or add a clearly labeled `Back to card library` link. Keep one escape path visible on mobile too.

**Suggested command:** `$impeccable clarify`

**[P1] Password recovery looks like a broken control**

**Why it matters:** `Forgot password?` is rendered as a disabled link with a separate `Coming soon` label. It resembles an action precisely when users are most likely to need one, then fails silently if they try it.

**Fix:** Either implement the reset flow, or replace the disabled button with plain explanatory text. Do not present an unavailable recovery path as a button.

**Suggested command:** `$impeccable harden`

**[P2] Three visible auth choices compete with one working path**

**Why it matters:** The screen presents credential sign-in, Google, Apple, password reset, and account creation, while two options are disabled. The page remains usable, but users must parse availability instead of seeing a clean primary path.

**Fix:** Keep Google as the only secondary action until Apple is ready. Move unavailable providers and password reset into a concise status note, or visually subordinate them while associating the status directly with the control.

**Suggested command:** `$impeccable distill`

**[P2] The desktop form is wide and the mobile gutters are expensive**

**Why it matters:** `max-w-[720px]` creates a large reading and scanning span for a two-field form. On a 320px viewport, `px-10` leaves about 240px for content, while social buttons use `whitespace-nowrap`, leaving little room at narrower widths (`components/auth-preview-screen.tsx:391-402`, `425-439`).

**Fix:** Cap the auth column closer to 440-480px on desktop, use smaller mobile gutters, and allow secondary button labels to wrap or reflow at very narrow widths. Verify at 320px and 280px.

**Suggested command:** `$impeccable adapt`

**Cognitive Load**

Seven of eight checklist items pass. The single failure is minimal choices: the user sees several auth-related actions, including disabled ones, at one decision point. The core form itself is well chunked and has a clear focal action.

**Emotional Journey**

- **Entry:** `Welcome back` is reassuring and immediately establishes the task.
- **Middle:** The compact form and visible labels reduce uncertainty.
- **Valley:** A failed login has no recovery route, and the user cannot clearly return to card browsing.
- **End:** `Sign up` is a clear next step, but successful sign-in redirects immediately without a visible confirmation. That is acceptable if the destination loads reliably.

**Persona Red Flags**

**Jordan, first-timer:** The first action is clear, but `Coming soon` beside disabled controls does not explain what is available now. There is no visible help or route back to browsing.

**Sam, accessibility-dependent user:** Focus styling exists and the form is keyboard-operable. The generic live error is not associated with either field through `aria-describedby` or `aria-invalid`, and the 9px labels are unnecessarily small for low-vision users.

**Casey, distracted mobile user:** The 48px controls are thumb-friendly, but 40px mobile gutters make the usable column narrow. The no-wrap social buttons should be checked at narrow widths to avoid cramped labels or overflow.

**Minor Observations**

- `html lang="en"` and English-only auth copy may be a mismatch for an Indonesian community product if English is not the deliberate product language (`app/layout.tsx:38-45`).
- The browser title is only `MHR Dex`; `Sign in | MHR Dex` would improve orientation and history scanning.
- The 9px mono labels are distinctive, but increasing them slightly would improve legibility without changing the visual language.
- `MHR DEX / 00` reads as decorative metadata rather than useful information. Remove it or give it a clear purpose.
- The error alert is form-level and preserves input values, which is good; field-level invalid state would make credential and validation failures easier to diagnose.

**Questions to Consider**

- Should the sign-in screen prioritize a visible `Back to card library` escape route, or should the brand mark itself be the only navigation?
- Until password reset and Apple sign-in exist, should those controls be removed from the primary flow or remain as labeled roadmap notes?
- Is the intended auth tone quiet and editorial, or should the page carry a stronger card-library connection?
