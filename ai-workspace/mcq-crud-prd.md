Date created: September 3, 2026
Date last modified: September 3, 2026

# Multiple-Choice Question CRUD - Technical PRD

## Overview/Problem

QuizMaker already lets a teacher register, log in, and land on `/mcqs`, but that page is still a stub. Teachers have no way to store a shared bank of multiple-choice questions: no tables, no authoring form, and no list. This feature replaces the stub with create, edit, preview, and delete for MCQs, persisted in D1 with a choices table and an attempts table so a later quiz-taking flow has somewhere to record a selected answer.

---

## Hypothesis

We believe that a shadcn table of questions plus a single create/edit page, backed by an MCQ service and HTTP routes, will let teachers start building the shared question bank without waiting for a full quiz-player product.

---

## Scope

### In Scope

- Three D1 tables: `mcqs`, `mcq_choices`, and `mcq_attempts`, created by a Wrangler migration applied locally
- MCQ fields: primary key, name, description, timestamps
- Choices: foreign key to `mcqs`, label, whether the choice is correct, display position; 2 required on the form, maximum 6
- Attempts: foreign key to the question and to the selected choice, plus a stored correct/incorrect flag
- An MCQ service in `src/lib/services/` as the only module that talks to these three tables
- HTTP endpoints for listing, creating, reading, updating, and deleting MCQs, and for recording an attempt
- `/mcqs` becomes a Question Bank table (shadcn Table + Button) with a Create control and a row-actions menu
- Row actions use a three-vertical-ellipses trigger and a dropdown: Edit, Preview, Delete
- A shared create/edit page with Save and Cancel
- Preview of a question (stem + choices) that can submit an attempt
- Test-driven implementation with **Vitest**: each phase starts with failing tests, then production code until those tests pass

### Out of Scope

- Sessions, cookies, tokens, or protecting `/mcqs` and the MCQ APIs (same as the auth sprint)
- Storing `user_id` on questions or attempts (no session means we cannot honestly attribute authorship)
- A student-facing quiz runner, scoring dashboard, or attempt history page
- Multiple correct answers, shuffled choices, images, rich text, tags, or folders
- Import/export, search, pagination, and bulk delete
- AI-generated questions

### Cut

- **Server Actions for mutations** — the auth sprint set the convention of App Router route handlers plus a service layer; this feature keeps that shape so the MCQ routes match register/login
- **`user_id` on `mcqs` / `mcq_attempts`** — there is still no login session to bind; adding a column we cannot populate would be theater
- **`@cloudflare/vitest-pool-workers`** — unit tests continue to mock D1 and `getCloudflareContext()`
- **`react-hook-form`** — not needed; client state + Zod on the server is enough, same as auth forms
- **Hiding `isCorrect` from GET-by-id** — teachers are previewing their own items; a separate “student” payload can wait for a quiz-player sprint

---

## Technical Requirements

### Database Schema

Cloudflare D1 (SQLite). Same database as users: binding `DB`, database name `quizmaker-2026`. Apply this migration with `--local` during development. Do not apply `--remote` unless the user explicitly wants production D1 updated.

SQLite stores booleans as integers `0` / `1`. Foreign keys use `ON DELETE CASCADE` so deleting a question removes its choices and attempts.

```sql
CREATE TABLE mcqs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE mcq_choices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  label TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE
);

CREATE INDEX idx_mcq_choices_mcq_id ON mcq_choices (mcq_id);

CREATE TABLE mcq_attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  choice_id TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE,
  FOREIGN KEY (choice_id) REFERENCES mcq_choices(id) ON DELETE CASCADE
);

CREATE INDEX idx_mcq_attempts_mcq_id ON mcq_attempts (mcq_id);
CREATE INDEX idx_mcq_attempts_choice_id ON mcq_attempts (choice_id);
```

| Table | Column | Type | Rules |
|---|---|---|---|
| `mcqs` | `id` | TEXT PK | Random UUID generated in the service (`crypto.randomUUID()`), same pattern as users |
| `mcqs` | `name` | TEXT NOT NULL | Trimmed; 1–200 characters; the title shown in the table |
| `mcqs` | `description` | TEXT NOT NULL | Trimmed; may be empty; max 2000 characters; longer prompt / notes |
| `mcqs` | `created_at` / `updated_at` | DATETIME | Set on insert; `updated_at` bumped on update |
| `mcq_choices` | `id` | TEXT PK | Random UUID |
| `mcq_choices` | `mcq_id` | TEXT NOT NULL | FK to `mcqs.id` |
| `mcq_choices` | `label` | TEXT NOT NULL | Trimmed; 1–500 characters |
| `mcq_choices` | `is_correct` | INTEGER NOT NULL | `0` or `1`; **exactly one** choice per question must be `1` |
| `mcq_choices` | `position` | INTEGER NOT NULL | 0-based display order matching the form |
| `mcq_attempts` | `id` | TEXT PK | Random UUID |
| `mcq_attempts` | `mcq_id` | TEXT NOT NULL | FK to `mcqs.id` |
| `mcq_attempts` | `choice_id` | TEXT NOT NULL | FK to `mcq_choices.id`; the selected answer |
| `mcq_attempts` | `is_correct` | INTEGER NOT NULL | Snapshot of whether that choice was correct **at attempt time** |

JSON and TypeScript use camelCase (`isCorrect`, `mcqId`, `choiceId`). SQL stays snake_case.

### API Endpoints

All MCQ routes are App Router route handlers under `src/app/api/mcqs/`. They are server-only. They must not import client components. Validate every body with a Zod schema before calling the MCQ service. Reuse `jsonError` / `readJsonBody` from `src/lib/auth/http.ts`.

There is still no session. These endpoints are reachable without login, matching `/mcqs` from the auth sprint.

#### GET /api/mcqs

**Request Body:** none

**Response:**
- Success (200): `{ "items": [ { "id", "name", "description", "createdAt", "updatedAt" } ] }` — list rows do **not** include choices
- Error (500): unexpected server error

Order: `created_at DESC` (newest first).

#### POST /api/mcqs

**Request Body:**
```json
{
  "name": "What is 2 + 2?",
  "description": "Basic arithmetic",
  "choices": [
    { "label": "3", "isCorrect": false },
    { "label": "4", "isCorrect": true }
  ]
}
```

`description` may be omitted or `""`. `choices` length must be 2–6. Exactly one choice must have `isCorrect: true`. Every `label` must be a non-empty string after trim.

**Response:**
- Success (201): the created MCQ including `choices` (each with `id`, `label`, `isCorrect`, `position`)
- Error (400): validation failure
- Error (500): unexpected server error

#### GET /api/mcqs/:id

**Response:**
- Success (200): one MCQ including `choices` ordered by `position`
- Error (404): `{ "error": "Question not found" }`
- Error (500): unexpected server error

#### PUT /api/mcqs/:id

**Request Body:** same shape as POST. The client sends the full replacement set of choices (2–6). The service updates the question row, deletes existing choices for that `mcq_id`, and inserts the new set. Attempts that referenced old choice rows are removed by `ON DELETE CASCADE`.

**Response:**
- Success (200): the updated MCQ including `choices`
- Error (400): validation failure
- Error (404): question not found
- Error (500): unexpected server error

#### DELETE /api/mcqs/:id

**Request Body:** none

**Response:**
- Success (204): empty body
- Error (404): question not found
- Error (500): unexpected server error

Deleting the MCQ cascades to `mcq_choices` and `mcq_attempts`.

#### POST /api/mcqs/:id/attempts

**Request Body:**
```json
{
  "choiceId": "choice-uuid"
}
```

The service loads the choice, confirms it belongs to `:id`, copies `is_correct` onto the attempt, and inserts the row.

**Response:**
- Success (201): `{ "id", "mcqId", "choiceId", "isCorrect", "createdAt" }`
- Error (400): missing/invalid `choiceId`, or the choice does not belong to this question
- Error (404): question not found
- Error (500): unexpected server error

### User Interface Requirements

Use **shadcn/ui** already in the repo: Table, Button, Card, Field, Input, Dialog, plus a **dropdown menu** for row actions (add `@shadcn/dropdown-menu`; it is copied source, not a new runtime package). Add `@shadcn/textarea` for the description field. Do not add `react-hook-form`. Do not hand-edit files under `src/components/ui/` except by running the shadcn add command.

Interactive UI lives in client components under `src/components/`. Pages in `src/app/` stay thin wrappers. Forms `fetch` the HTTP routes above. Never import `src/lib/db.ts` or the MCQ service from a `'use client'` module.

This Button has **no** `asChild` / `render` for links. Style navigation with `buttonVariants()` on a Next.js `Link`, same as the home page.

#### Question Bank (/mcqs)

Replaces the stub. Keep the **Log out** control (POST `/api/auth/logout` then `router.push("/login")`).

- Page shell: full-width content (`max-w-5xl`), not the centered `max-w-lg` stub card
- Heading: "Question Bank"
- Primary **Create question** control navigates to `/mcqs/new`
- shadcn **Table** with columns: **Name**, **Description**, **Actions**
- Empty state when `items` is empty (copy that there are no questions yet; still show Create)
- Each row’s Actions cell: icon button with three vertical ellipses (`EllipsisVertical` from lucide), accessible name `Actions for {name}`
- Dropdown items:
  - **Edit** → `/mcqs/{id}/edit`
  - **Preview** → opens a Dialog (does not leave the list)
  - **Delete** → confirmation Dialog, then `DELETE /api/mcqs/{id}`, then refresh the list
- Load the table with `GET /api/mcqs` on mount
- Description cell may show an em dash when description is empty

#### Create / Edit (/mcqs/new and /mcqs/[id]/edit)

One shared form component. Create has no id; edit loads `GET /api/mcqs/{id}` and 404-copy if missing.

- Fields:
  - **Name** (required)
  - **Description** (optional textarea)
  - **Choices**: two rows by default on create; each row has the choice label, a radio to mark it as the correct answer, and a remove control
  - **Add choice** — disabled once there are 6 choices
  - Remove is disabled when only 2 choices remain
- **Save** — client validation first (name present, 2–6 non-empty labels, exactly one correct); then `POST /api/mcqs` or `PUT /api/mcqs/{id}`; success → `/mcqs`
- **Cancel** — navigate to `/mcqs` without saving
- Server 400/500: show the error on the form; do not navigate

#### Preview (Dialog on /mcqs)

- Shows name, description, and the choice labels as radio options (not which one is correct)
- **Submit answer** POSTs `/api/mcqs/{id}/attempts` with `choiceId`
- After success, show whether the selected choice was correct or incorrect using the attempt response
- Close returns to the table

#### Delete confirmation (Dialog)

- Title/copy that the question will be permanently deleted
- Confirm calls DELETE; Cancel dismisses

---

## Testing Approach (Vitest, TDD)

This feature is built **test-first**, same harness as the auth sprint. Vitest is already installed. Do not write production code for a phase until that phase’s tests exist and have been observed failing.

### Red → green → next phase

For **every** phase below:

1. Write the tests listed in that phase. Tests must assert observable behavior (return values, status codes, DOM the user can see, SQL that was prepared). Do not write assertions that cannot fail.
2. Run `npm test`. The new tests must be **red**.
3. Implement the minimum production code for that phase.
4. Run `npm test` again. The phase’s tests must be **green**. Existing tests from earlier phases must stay green.
5. Only then mark the phase **COMPLETED**.

If a test is skipped (`it.skip` / `xit`) to make the suite green, the phase is not done.

### Harness (already in the repo)

- Colocate tests: `src/lib/services/mcq.ts` is tested by `src/lib/services/mcq.test.ts`
- `vi.clearAllMocks()` in `beforeEach` where mocks are used
- Mock `getCloudflareContext()` and D1; never hit a real database or network in unit tests
- Query Testing Library by role and accessible name; use `userEvent` rather than `fireEvent`
- **`@testing-library/jest-dom` is not installed.** Do not use `toBeInTheDocument`, `toHaveTextContent`, or `toHaveAttribute`. Assert with `expect(el).toBeTruthy()`, `el.textContent`, and `el.getAttribute(...)`
- Route mocks must use `vi.hoisted(() => ({ ... }))`
- Do not add `import "server-only"`
- Keep `src/lib/db.ts` and `src/lib/services/mcq.ts` off the client graph

### What we do not unit-test

- Applying the migration against a live local D1 file (manual / checklist in Phase 1)
- Server Components that only compose client children
- Visual layout and the end-to-end browser pass (still required in Phase 4–5 alongside green tests)

---

## Implementation Phases

### Phase 1: MCQ tables migration - COMPLETED

**Objective**: Persist questions, choices, and attempts in local D1.

**Tests first (expect red)**:
1. Add `src/lib/mcq-tables.contract.test.ts` that reads SQL under `migrations/` and asserts:
   - `CREATE TABLE` for `mcqs`, `mcq_choices`, and `mcq_attempts`
   - `mcqs` columns: `id`, `name`, `description`, `created_at`, `updated_at`
   - `mcq_choices` columns: `id`, `mcq_id`, `label`, `is_correct`, `position`, `created_at`, `updated_at`
   - `mcq_attempts` columns: `id`, `mcq_id`, `choice_id`, `is_correct`, `created_at`
   - foreign keys from choices and attempts to `mcqs`, and from attempts to `mcq_choices`
   - `ON DELETE CASCADE`
   - indexes on `mcq_choices(mcq_id)`, `mcq_attempts(mcq_id)`, and `mcq_attempts(choice_id)`
2. Run `npm test` and confirm these tests **fail** (no MCQ migration yet).

**Then implement until green**:
1. Create a migration for the three tables and indexes (`migrations/0002_create_mcq_tables.sql` or Wrangler’s next number)
2. Apply locally only: `npx wrangler d1 migrations apply quizmaker-2026 --local`
3. Re-run `npm test` until Phase 1 tests pass (existing users contract tests must stay green)

**Phase gate**: `npm test` green for the contract tests. Local migration applied is a manual check.

**Deliverables**:
- Migration SQL under `migrations/`
- Green `mcq-tables.contract.test.ts`

### Phase 2: MCQ service - COMPLETED

**Objective**: Centralize all access to `mcqs`, `mcq_choices`, and `mcq_attempts`.

**Tests first (expect red)**:

`src/lib/services/mcq.test.ts` (mock D1 / `getCloudflareContext()`; never a real database):
- `create` inserts the question then its choices with numbered placeholders; returns the MCQ with choices; maps `is_correct` 0/1 to boolean `isCorrect`
- `create` assigns `position` from array order
- `create` and `update` write the question and choice rows through `db.batch()` so a failed choice insert rolls back
- `list` selects from `mcqs` without joining choices, newest first
- `findById` returns the question plus choices ordered by position, or `null`
- `update` updates name/description, replaces choices, bumps `updated_at`
- `delete` deletes the `mcqs` row (cascade is schema-level; the test asserts the DELETE SQL)
- `createAttempt` binds `mcq_id`, `choice_id`, and the choice’s `is_correct`; returns camelCase `isCorrect`
- `createAttempt` rejects a choice that does not belong to the question
- SQL uses numbered placeholders (`?1`, `?2`), not string-concatenated user input
- missing question on update/delete/attempt is a typed not-found error the routes can map to 404

Run `npm test` and confirm these tests **fail**.

**Then implement until green**:
1. Add `src/lib/services/mcq.ts` with `listMcqs`, `createMcq`, `findMcqById`, `updateMcq`, `deleteMcq`, `createMcqAttempt`
2. Use prepared statements with numbered placeholders
3. Batch create/update writes so a failed choice insert rolls back the question write
4. Re-run `npm test` until Phases 1–2 pass

**Phase gate**: MCQ service tests green. No HTTP routes yet.

**Deliverables**:
- MCQ service as the only module that talks to the three tables
- Green `mcq.test.ts`

### Phase 3: MCQ HTTP endpoints - COMPLETED

**Objective**: List/create/read/update/delete questions and record attempts over HTTP.

**Tests first (expect red)**:

Call the exported handlers with `Request` objects. Mock the MCQ service; do not open D1.

`src/app/api/mcqs/route.test.ts`:
- GET → 200 `{ items }` from `listMcqs`
- POST valid body → 201 with choices
- POST missing name, fewer than 2 choices, more than 6, zero or two correct flags → 400
- POST invalid JSON → 400
- unexpected throw → 500 without stack in JSON

`src/app/api/mcqs/[id]/route.test.ts`:
- GET found → 200
- GET missing → 404
- PUT valid → 200
- PUT invalid JSON or invalid body → 400
- PUT missing → 404
- DELETE found → 204
- DELETE missing → 404

`src/app/api/mcqs/[id]/attempts/route.test.ts`:
- POST valid `choiceId` → 201
- POST invalid JSON or invalid body → 400
- POST unknown question → 404
- POST choice that does not belong to the question → 400

Run `npm test` and confirm these tests **fail**.

**Then implement until green**:
1. Add Zod schemas in `src/lib/mcq/schemas.ts`
2. Implement the route handlers
3. Map not-found to 404 and validation to 400
4. Re-run `npm test` until Phases 1–3 pass

**Phase gate**: all new route-handler tests green.

**Deliverables**:
- Five handler files (collection GET/POST, item GET/PUT/DELETE, attempts POST)
- Zod schemas
- Green `route.test.ts` files

### Phase 4: Question Bank UI - PLANNED

**Objective**: Teachers can list, create, edit, preview, and delete MCQs in the browser.

Put interactive UI in client components. Pages stay thin wrappers.

**Tests first (expect red)**:

Mock `fetch` and `next/navigation` (`useRouter`, `useParams` as needed). Use `userEvent`.

Replace `question-bank-stub` tests with `src/components/question-bank.test.tsx`:
- loads `GET /api/mcqs` and renders name and description in a table
- empty list shows empty-state copy, not a broken table body of leftover rows
- Create question control is present and targets `/mcqs/new`
- row actions menu (ellipses) exposes Edit, Preview, and Delete
- Edit navigates to `/mcqs/{id}/edit`
- Delete confirm calls `DELETE /api/mcqs/{id}`
- Log out still POSTs `/api/auth/logout` then `router.push("/login")`
- Preview dialog shows the question and can POST an attempt

`src/components/mcq-form.test.tsx`:
- create mode: name, description, **two** choice inputs, Save, Cancel
- cannot remove below 2 choices; can add up to 6
- client validation: empty name, empty choice label, no correct choice — no `fetch`
- valid create POSTs `/api/mcqs` with `name`, `description`, and `choices` (`label`, `isCorrect`); no extra fields required
- 201 → `router.push("/mcqs")`
- 400 → error text, no navigation
- Cancel → `/mcqs` without POST
- edit mode: fetches GET `/api/mcqs/{id}` and PUTs on save

Run `npm test` and confirm these tests **fail**.

**Then implement until green**:
1. Add shadcn `dropdown-menu` and `textarea` via `npx shadcn@latest add @shadcn/dropdown-menu @shadcn/textarea`
2. Build `QuestionBank` (table, menus, preview/delete dialogs, logout) and `McqForm`
3. Wire `/mcqs`, `/mcqs/new`, `/mcqs/[id]/edit`
4. Remove the stub-only copy; keep logout
5. Re-run `npm test` until Phases 1–4 pass
6. Exercise the flow in the browser: create, edit, preview (correct and incorrect), delete, cancel, validation errors (manual; complements tests)

**Phase gate**: component tests green **and** the browser pass above.

**Deliverables**:
- Working list and form pages
- Green Question Bank and form tests
- Manual verification of happy path and error path

### Phase 5: Lint, full test suite, and build - PLANNED

**Objective**: The feature is actually complete, not just visually present.

There are no new red tests in this phase.

**Tasks**:
1. Run `npm test` — **all** tests must pass; zero skipped tests used to hide failures
2. Run `npm run lint` and fix issues
3. Run `npm run build` and report the actual result
4. Prefer `npm run preview` for D1/runtime checks when credentials exist
5. Re-run `npm test` after any lint/build fixes

**Phase gate**: `npm test`, `npm run lint`, and `npm run build` all succeed.

**Deliverables**:
- Lint, test, and build results recorded in Current Status

---

## Technical Implementation Details

### Key Files

- `migrations/0002_create_mcq_tables.sql` - D1 migration for `mcqs`, `mcq_choices`, and `mcq_attempts` plus FK indexes
- `src/lib/mcq-tables.contract.test.ts` - reads migration SQL and asserts tables, columns, cascading FKs, and indexes
- `src/lib/services/mcq.ts` - only module that queries the three MCQ tables
- `src/lib/services/mcq.test.ts` - mocked D1 coverage for list/create/read/update/delete/attempt
- `src/lib/mcq/schemas.ts` - Zod bodies for MCQ create/update and attempt submit
- `src/app/api/mcqs/route.ts` - collection GET/POST
- `src/app/api/mcqs/[id]/route.ts` - item GET/PUT/DELETE
- `src/app/api/mcqs/[id]/attempts/route.ts` - attempt POST

### Implementation Patterns

D1 access stays in `src/lib/`, not in components. Create and update send the question and choice statements through `db.batch()` so D1 treats them as one transaction:

```typescript
const batchResults = await db.batch([mcqStatement, ...choiceStatements]);
```

Reads still use a single prepared statement:

```typescript
const { results } = await db
  .prepare("SELECT id, name, description, created_at, updated_at FROM mcqs ORDER BY created_at DESC")
  .all();
```

Route-handler mock pattern (same as auth):

```typescript
const { createMcq } = vi.hoisted(() => ({
  createMcq: vi.fn(),
}));

vi.mock("@/lib/services/mcq", () => ({
  createMcq,
  McqNotFoundError,
}));
```

### Important Notes

- **No sessions.** List/create/edit/delete/attempt work without a logged-in cookie, same as the stub page.
- **D1 is server-only.** Client pages only `fetch` HTTP routes.
- **TDD is mandatory for Phases 1–4.**
- **Ask before adding npm dependencies.** shadcn components copied into `src/components/ui/` are not npm packages.
- **Migrations default to `--local`.** Do not apply `--remote` or deploy unless asked.
- **Exactly one correct choice** per question (classic single-answer MCQ).
- **Choice replace on update** is intentional and simple; attempt history for that question’s old choice rows is discarded.
- **Create/update are batched.** `createMcq` and `updateMcq` use D1 `batch()` so a failed choice insert rolls back the question write.
- **Approved test dependencies:** already installed. **Approved production dependency:** Zod (already installed).

---

## Acceptance Criteria

- [x] Local D1 has `mcqs`, `mcq_choices`, and `mcq_attempts` from a migration applied with `--local`
- [ ] A teacher can open `/mcqs` and see a table of questions (empty state when none)
- [ ] Create question opens a form with two choice rows, Save, and Cancel
- [ ] The teacher can add choices up to six and cannot go below two
- [ ] Save creates a question with name, description, and choices via `POST /api/mcqs`
- [ ] Edit loads the question and saves via `PUT /api/mcqs/:id`
- [ ] Cancel returns to `/mcqs` without writing
- [ ] Row actions menu offers Edit, Preview, and Delete
- [ ] Preview lets the teacher pick a choice and records an attempt (`isCorrect` true or false)
- [ ] Delete removes the question (and cascaded choices/attempts) after confirmation
- [x] Invalid payloads return 400; missing ids return 404
- [ ] Logout from `/mcqs` still works
- [ ] Each of Phases 1–4 was implemented test-first: tests were red, then turned green
- [ ] `npm test` passes with no skipped tests used to hide failures
- [ ] `npm run lint` and `npm run build` succeed

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Author a question | A teacher can create an MCQ with two or more choices and see it in the table | Manual pass on create happy path |
| Edit round-trip | Changing name, description, or choices persists after reload | GET after PUT |
| Delete | Deleted row disappears from the list | GET after DELETE |
| Attempt recorded | Preview submit inserts `mcq_attempts` with the selected `choice_id` and `is_correct` | 201 from POST attempts + D1 row |
| Unit tests | `npm test` exits 0 | Vitest in CI/local |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — persistence (same `DB` binding as users)

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` — D1 access via `getDb()`
- shadcn/ui `table`, `button`, `card`, `field`, `input`, `dialog` — already installed
- shadcn/ui `dropdown-menu`, `textarea` — to be added with the shadcn CLI
- Zod — validate MCQ and attempt bodies
- Vitest — already installed
- User logout endpoint from the previous sprint

### Environment / config

- No new secrets
- No new Wrangler bindings

---

## Risks and Mitigation

### Technical Risks

- **Risk**: Updating an MCQ by deleting and re-inserting choices wipes related attempts.
- **Mitigation**: Documented; acceptable for this sprint. A later sprint can version choices if attempt history must survive edits.

- **Risk**: Importing the MCQ service into a client component breaks D1 access.
- **Mitigation**: Client pages only `fetch` HTTP routes.

- **Risk**: `npm run dev` (Node) does not behave like Workers.
- **Mitigation**: Prefer `npm run preview` for runtime-sensitive checks when Wrangler works on the machine.

- **Risk**: Implementing UI first and retrofitting tests skips the red signal.
- **Mitigation**: Phase gate is “tests were observed failing, then passing.”

### User Experience Risks

- **Risk**: Teachers expect questions to be private to their account.
- **Mitigation**: Copy can stay neutral. Authorship is out of scope until sessions exist. All questions in this D1 are a single shared bank.

- **Risk**: Accidental delete.
- **Mitigation**: Confirmation dialog before DELETE.

---

## Troubleshooting Guide

### Local apply reports no pending migrations
**Problem**: `npx wrangler d1 migrations apply quizmaker-2026 --local` prints `No migrations to apply!` even after creating `0002_create_mcq_tables.sql`.
**Cause**: The local D1 already recorded `0002_create_mcq_tables.sql` in `d1_migrations` from an earlier apply of the same filename.
**Solution**: Confirm tables exist with `npx wrangler d1 execute quizmaker-2026 --local --command "SELECT name FROM sqlite_master WHERE name LIKE 'mcq%';"`. Do not apply `--remote`.
**Code Reference**: `migrations/0002_create_mcq_tables.sql:1`

---

## Notes for AI Agents

When working with this PRD:

1. Start by reading the Problem and Hypothesis to understand intent
2. Use Scope (In/Out/Cut) to determine boundaries — do not build out-of-scope items
3. Update phase status markers as work progresses
4. Add implementation details under "Technical Implementation Details" as code is written
5. Mark acceptance criteria as complete when features work
6. Add troubleshooting entries when bugs are found and fixed
7. Keep all sections current — remove outdated information
8. Use code references format: `filepath:line-number` when citing code
9. Follow TDD per phase: write tests, run `npm test` (red), implement, run `npm test` (green). Do not skip the red run.
10. Do not add npm packages without asking. shadcn `add @shadcn/...` is allowed for dropdown-menu and textarea.
11. Do not run `npm run deploy` or `d1 migrations apply --remote` unless the user explicitly asks.
12. Do not edit `cloudflare-env.d.ts` or `package-lock.json` by hand
13. Verify with `npm test`, `npm run lint`, and `npm run build` before calling the feature done.
14. Do not add jest-dom. Use `vi.hoisted` for route mocks.
15. shadcn Button here has no `asChild` / `render` for links. Style links with `buttonVariants()`.
16. Exactly one correct choice. Two to six choices. No `user_id` columns.

---

## Current Status

**Last Updated**: September 3, 2026
**Current Phase**: Phase 3 - MCQ HTTP endpoints
**Status**: COMPLETED
**Evidence**:
- Route tests were red (`Failed to resolve import "./route"`) before the handlers existed
- Then green: Phases 1–3 tests → 37 passed
- Full suite: `npm test` → 82 passed
**Next Steps**: Phase 4 — write failing Question Bank and form tests, then replace the `/mcqs` stub
