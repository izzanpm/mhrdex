# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are Indonesian Marvel Hero Rush TCG players. They use MHR Dex to look up cards, build decks, and record matches.

## Product Purpose

MHR Dex Web is an unofficial companion for the Marvel Hero Rush TCG community in Indonesia. It helps players browse the card catalog, prepare valid decks, and keep a history of their matches. Success means that these tasks are easier to complete and that a player's saved account data remains available when they return.

## Positioning

MHR Dex combines public card browsing, guest-local deck building, authenticated cloud deck import, and account-synced match logs in one companion app.

## Operating Context

Players may browse cards without an account and build a guest deck in the browser. After login, they can explicitly import a valid local deck as a new cloud copy. Match logs and cloud deck operations use the authenticated account. Local decks are not automatically synchronized with cloud copies.

## Capabilities and Constraints

- Card browsing is public. Card search and filtering cover color, set, rarity, level, trait, and range. Card details include power, ability text, and the available catalog attributes.
- Deck building supports one or two distinct identity colors, at most three copies of a card, and at most 50 cards total.
- Guest deck persistence uses native browser IndexedDB. A local deck is stored as one atomic record containing its colors and card entries.
- Cloud deck import creates a new copy and retains the local record. It does not enable automatic two-way synchronization.
- Match logs are account-synced and retain deck name and color snapshots. The log can include opponent name and deck color, scores, result, dice roll, turn order, match format, date and time, and location.
- Match results remain an explicit required value of win, loss, or draw. Scores are optional nonnegative integers; automatic result calculation is not implemented until the related decision is resolved.
- The product does not simulate gameplay, implement the physical game digitally, or provide aggregate win-rate analytics.
- The primary designed experience is dark mode.
- Do not fabricate artwork, testimonials, statistics, security claims, or other proof that is not backed by real project data.
- Open decision D3: whether incomplete deck drafts may be persisted.
- Open decision D4: score meaning, automatic result calculation, match formats, turn-order values, and display timezone.
- Open decision D5: deck-code versioning, validation, and format.

## Brand Commitments

- Product name: MHR Dex Web.
- The product is an unofficial companion and must not imply official ownership or endorsement by Marvel Hero Rush.
- The product serves the MHR TCG community in Indonesia.

## Evidence on Hand

- The repository contains an existing Next.js home preview with sample card and deck records.
- The repository contains unit tests for home-card filtering and deck progress calculation.
- No verified card artwork, testimonials, statistics, or other proof assets are established in the repository scan. Future work must not present fabricated evidence as real.

## Product Principles

- Keep card discovery public and low-friction.
- Make deck validity visible and enforce the game rules at save and import boundaries.
- Keep guest work local until the player explicitly chooses to import it into an account.
- Preserve match context through snapshots so logs remain useful when decks change.
- Prefer simple, readable flows over unnecessary product complexity.

## Accessibility & Inclusion

- Support desktop and mobile browsers without horizontal overflow.
- Keep interactive controls keyboard accessible with visible focus states.
- Provide loading, empty, and error states for card and match-log views.
