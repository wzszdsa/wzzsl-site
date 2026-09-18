# Appointments Session Pool Final Fix Report

## Scope

- Branch: `codex/appointments-session-pool`
- Base: `802ba2a455776f1a663432c0e1349e7fbe854ee7`
- Fix starting HEAD: `7d6da73ea792be5b45eff70ef4f2749f0a1c83e5`
- Date: 2026-08-21
- Supabase MCP and real database smoke were intentionally not run.

## Fixed findings

### I-1: Deterministic Route Handler clock

- `createAppointmentsPostHandler` now accepts an optional second `nowProvider` argument.
- Existing zero-argument and one-argument `storeFactory` call sites remain valid.
- Production defaults to `() => new Date()`.
- The handler passes the provider result into `validateAppointmentRequest`.
- API tests use `2026-08-21T00:00:00.000Z`; the new regression test uses an appointment that is past relative to the real current time but future relative to the injected clock.
- The 201, 503, and 500 tests all use the fixed provider so they remain independent of the calendar date.

### I-2: Shanghai-local client time formatting

- Added `lib/appointment-time.ts`.
- `formatShanghaiDateTime` uses `Intl.DateTimeFormat` with `timeZone: 'Asia/Shanghai'` and returns `YYYY-MM-DDTHH:mm`.
- `getTomorrowMorningAppointmentTime` derives the next calendar day from Shanghai date parts and returns `09:30`.
- `BookingSection` now calculates both `min` and the initial appointment value from the same instant using the Shanghai utilities.
- The server-side `+08:00` parsing contract was not changed.

## TDD evidence

### RED

Command:

```text
npm test -- tests/appointments-api.test.ts tests/appointment-time.test.ts
```

Observed expected failures:

- Clock-injection regression test received `400` instead of `201` because the old Route Handler ignored the second argument.
- `tests/appointment-time.test.ts` failed because `lib/appointment-time.ts` did not exist.

### GREEN focused verification

Command:

```text
npm test -- tests/appointments-api.test.ts tests/appointment-time.test.ts tests/booking-section.test.tsx
```

Result: 3 test files passed, 13 tests passed.

## Full verification

- `npm test`: 9 test files passed, 31 tests passed.
- `npm run lint`: exit code 0.
- `npm run typecheck`: exit code 0.
- `npm run build`: exit code 0; Next.js 16.3.1 production build completed and `/api/appointments` was identified as a dynamic Node route.
- `TZ=America/New_York npm test -- tests/appointment-time.test.ts`: 2 tests passed.
- `TZ=UTC npm test -- tests/appointment-time.test.ts`: 2 tests passed.
- `git diff --check`: passed.
- The build changed generated `next-env.d.ts` imports from `.next/dev/types` to `.next/types`; that unrelated generated change was restored before commit.

## Database and secret boundary

- Supabase MCP was not executed, as requested; the schema had already been externally verified.
- No real Session Pool smoke test was run because the worktree has no `DATABASE_URL` or `.env.local`, and the user explicitly prohibited a real database smoke test for this fix round.
- No database credentials, tokens, or other secrets were added.

## Changed files

- `app/api/appointments/route.ts`
- `components/booking-section.tsx`
- `lib/appointment-time.ts`
- `tests/appointments-api.test.ts`
- `tests/appointment-time.test.ts`
- `.superpowers/sdd/2026-08-21-appointments-session-pool/final-fix-report.md`

## Remaining items

- Real Session Pool connectivity and insert/cleanup behavior remain unverified until a separately authorized environment with `DATABASE_URL` is available.
- No other Critical or Important findings from the whole-branch review remain in the requested scope.
