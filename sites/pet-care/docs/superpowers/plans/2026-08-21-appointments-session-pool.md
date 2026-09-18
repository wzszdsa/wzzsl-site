# 预约表单 Session Pool 持久化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有预约表单通过 Next.js 后端和 PostgreSQL `pg.Pool` 写入 Supabase Session Pool，并通过 Supabase MCP 创建和验证 `public.appointments` 表。

**Architecture:** 浏览器端 `BookingSection` 将表单数据 POST 到 `/api/appointments`；Route Handler 使用纯函数契约校验后调用 PostgreSQL store。store 通过服务端唯一的 `DATABASE_URL` 获取可复用的 `pg.Pool`，执行参数化 `INSERT`；表结构由幂等 SQL migration 定义，并通过 Supabase MCP 执行。

**Tech Stack:** Next.js 16.3.1 App Router、React 19、TypeScript 6、Node.js runtime、`pg`、Vitest 4、Supabase MCP。

**Spec:** `docs/superpowers/specs/2026-08-21-appointments-session-pool-design.md`

## Global Constraints

- “Session Pool”使用 Supabase Session Pooler 连接模式，通常为 `5432` 端口；不使用 Transaction Pooler 的 `6543` 端口。
- 数据库连接串只放在服务端环境变量 `DATABASE_URL`，不使用 `NEXT_PUBLIC_` 前缀。
- `datetime-local` 值按门店 `Asia/Shanghai`（UTC+08:00）解释后写入 `timestamptz`。
- 所有数据库写入使用参数化查询，不把用户输入拼接进 SQL。
- 保留现有中文文案和视觉风格，不实现登录、后台、通知、查询、改期或取消功能。
- 每个实现任务都必须先写失败测试、观察预期失败，再写最小实现并观察通过。
- 不打印 `DATABASE_URL`、密码、Supabase token 或其他秘密。

---

### Task 1: 定义预约请求契约的失败测试

**Files:**
- Create: `tests/appointment-contract.test.ts`
- Modify: none

**Interfaces:**
- Consumes: the existing form field vocabulary: `customerName`, `phone`, `petName`, `petType`, `service`, `appointmentTime`, `note`.
- Produces: the test-defined contract for `validateAppointmentRequest(input, now)`.

- [ ] **Step 1: Write the failing tests**

Create tests covering valid normalization, unsupported select values, malformed/past time, and missing/oversized fields:

```ts
import { describe, expect, it } from 'vitest';
import { validateAppointmentRequest } from '../lib/appointment-contract';

const now = new Date('2026-08-21T00:00:00.000Z');

const validRequest = {
  customerName: '  林女士  ',
  phone: '138-0000-0000',
  petName: '雪球',
  petType: '猫咪',
  service: '基础洗护',
  appointmentTime: '2026-08-22T09:30',
  note: '  怕吹风  '
};

describe('validateAppointmentRequest', () => {
  it('trims fields and converts the Shanghai appointment time to ISO', () => {
    const result = validateAppointmentRequest(validRequest, now);

    expect(result).toEqual({
      ok: true,
      value: {
        customerName: '林女士',
        phone: '138-0000-0000',
        petName: '雪球',
        petType: '猫咪',
        service: '基础洗护',
        appointmentTime: '2026-08-22T01:30:00.000Z',
        note: '怕吹风'
      }
    });
  });

  it('rejects missing required fields and unsupported options', () => {
    const result = validateAppointmentRequest({ ...validRequest, customerName: '', service: '寄养' }, now);

    expect(result).toEqual({ ok: false, message: '家长姓名不能为空' });
    expect(validateAppointmentRequest({ ...validRequest, service: '寄养' }, now)).toEqual({
      ok: false,
      message: '服务项目无效'
    });
  });

  it('rejects a malformed or past appointment time', () => {
    expect(validateAppointmentRequest({ ...validRequest, appointmentTime: 'not-a-date' }, now)).toEqual({
      ok: false,
      message: '期望到店时间格式无效'
    });

    expect(validateAppointmentRequest({ ...validRequest, appointmentTime: '2026-08-20T09:30' }, now)).toEqual({
      ok: false,
      message: '期望到店时间必须晚于当前时间'
    });
  });

  it('turns a blank note into null and rejects overlong text', () => {
    expect(validateAppointmentRequest({ ...validRequest, note: '   ' }, now)).toMatchObject({
      ok: true,
      value: { note: null }
    });

    expect(validateAppointmentRequest({ ...validRequest, note: 'a'.repeat(1001) }, now)).toEqual({
      ok: false,
      message: '补充说明不能超过 1000 个字符'
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify the failure**

Run: `npm test -- tests/appointment-contract.test.ts`

Expected: FAIL because `lib/appointment-contract.ts` and `validateAppointmentRequest` do not exist yet. Do not treat a passing test or an unrelated syntax error as the expected red state.

- [ ] **Step 3: Commit the test-only red state**

```powershell
git add -- tests/appointment-contract.test.ts
git commit -m "test: define appointment input contract"
```

### Task 2: Implement and verify the pure appointment contract

**Files:**
- Create: `lib/appointment-contract.ts`
- Test: `tests/appointment-contract.test.ts`

**Interfaces:**
- Consumes: unknown JSON input and an optional injected `Date` for deterministic tests.
- Produces:

```ts
export const appointmentPetTypes = ['狗狗', '猫咪', '其他'] as const;
export type AppointmentPetType = (typeof appointmentPetTypes)[number];
export const appointmentServices = ['基础洗护', '美容修剪', '耳道护理', '深度护理'] as const;
export type AppointmentService = (typeof appointmentServices)[number];
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface AppointmentInsert {
  customerName: string;
  phone: string;
  petName: string;
  petType: AppointmentPetType;
  service: AppointmentService;
  appointmentTime: string;
  note: string | null;
}

export type AppointmentValidationResult =
  | { ok: true; value: AppointmentInsert }
  | { ok: false; message: string };

export function validateAppointmentRequest(input: unknown, now?: Date): AppointmentValidationResult;
```

- [ ] **Step 1: Implement the smallest passing validator**

Use `isRecord` plus field-specific helpers. Trim `customerName`, `phone`, `petName` and `note`; accept phone strings matching `/^[0-9+\-\s]{6,20}$/`; enforce name/pet/note lengths of 1-100/1-80/0-1000; check the two literal option arrays; require `YYYY-MM-DDTHH:mm`; parse time as `${value}:00+08:00`; reject invalid or non-future dates; return the exact error messages asserted by Task 1.

- [ ] **Step 2: Run the focused test and verify it passes**

Run: `npm test -- tests/appointment-contract.test.ts`

Expected: PASS with all contract tests passing and no unhandled warnings.

- [ ] **Step 3: Commit the green contract implementation**

```powershell
git add -- lib/appointment-contract.ts tests/appointment-contract.test.ts
git commit -m "feat: validate appointment requests"
```

### Task 3: Define the PostgreSQL store behavior with a failing test

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `tests/appointments-store.test.ts`
- Modify: none under `lib/` in the red step

**Interfaces:**
- Consumes: `AppointmentInsert` from `lib/appointment-contract.ts`.
- Produces the expected store interfaces:

```ts
export interface AppointmentRecord {
  id: string;
  status: AppointmentStatus;
  createdAt: string;
}

export type AppointmentQuery = (
  text: string,
  values: unknown[]
) => Promise<{ rows: Array<{ id: string; status: AppointmentStatus; created_at: string | Date }> }>;

export interface AppointmentStore {
  insert(input: AppointmentInsert): Promise<AppointmentRecord>;
}

export function createAppointmentStore(query?: AppointmentQuery): AppointmentStore;
```

- [ ] **Step 1: Install the server-only PostgreSQL driver and its types**

Run: `npm install pg` and `npm install --save-dev @types/pg`

Expected: `package.json` contains `pg` in `dependencies`, `@types/pg` in `devDependencies`, and `package-lock.json` is updated without unrelated package removals.

- [ ] **Step 2: Write the failing store test**

Create a fake query function that records the SQL and values, returns `{ rows: [{ id: '...', status: 'pending', created_at: new Date('2026-08-21T01:00:00.000Z') }] }`, and assert:

```ts
const store = createAppointmentStore(async (text, values) => {
  captured = { text, values };
  return { rows: [{ id: 'appointment-1', status: 'pending', created_at: new Date('2026-08-21T01:00:00.000Z') }] };
});

const result = await store.insert(input);

expect(result).toEqual({
  id: 'appointment-1',
  status: 'pending',
  createdAt: '2026-08-21T01:00:00.000Z'
});
expect(captured.text).toContain('INSERT INTO public.appointments');
expect(captured.text).toContain('VALUES ($1, $2, $3, $4, $5, $6, $7)');
expect(captured.values).toEqual([
  input.customerName,
  input.phone,
  input.petName,
  input.petType,
  input.service,
  input.appointmentTime,
  input.note
]);
expect(captured.text).not.toContain(input.customerName);
```

- [ ] **Step 3: Run the focused test and verify the failure**

Run: `npm test -- tests/appointments-store.test.ts`

Expected: FAIL because `lib/appointments.ts` and `createAppointmentStore` do not exist yet.

- [ ] **Step 4: Commit the dependency and red store test**

```powershell
git add -- package.json package-lock.json tests/appointments-store.test.ts
git commit -m "test: define appointment postgres store behavior"
```

### Task 4: Implement the Session Pool database boundary and migration

**Files:**
- Create: `lib/db.ts`
- Create: `lib/appointments.ts`
- Create: `supabase/migrations/20260821000000_create_appointments.sql`
- Test: `tests/appointments-store.test.ts`

**Interfaces:**
- Consumes: `AppointmentInsert`, `AppointmentStatus`, `AppointmentQuery` and `AppointmentStore` from the prior tasks.
- Produces: `getDbPool(): Pool`, `DatabaseConfigurationError`, and `createAppointmentStore(query?)`.

- [ ] **Step 1: Implement lazy, reusable `pg.Pool` creation**

In `lib/db.ts`, export:

```ts
export class DatabaseConfigurationError extends Error {
  constructor() {
    super('DATABASE_URL is not configured');
    this.name = 'DatabaseConfigurationError';
  }
}

export function getDbPool(): Pool;
```

Read `process.env.DATABASE_URL` only inside `getDbPool()`. Throw `DatabaseConfigurationError` when it is blank. Store one pool on a `globalThis` holder so Next.js development reloads do not create an unbounded number of pools. Configure a small server pool (`max: 5`) with connection/idle timeouts and let the Supabase connection string control TLS parameters.

- [ ] **Step 2: Implement the parameterized appointment store**

In `lib/appointments.ts`, use this SQL shape and never interpolate values. When `query` is omitted, lazily call `getDbPool().query(text, values)` only when `insert()` runs so a missing `DATABASE_URL` becomes the route's `503` configuration path:

```sql
INSERT INTO public.appointments
  (customer_name, phone, pet_name, pet_type, service, appointment_time, note)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, status, created_at
```

Pass the seven values in the order defined by Task 3. Convert `created_at` with `new Date(row.created_at).toISOString()` and return `{ id, status, createdAt }`. Throw a descriptive server-side error if `RETURNING` produces no row.

- [ ] **Step 3: Add the idempotent migration SQL**

Create `supabase/migrations/20260821000000_create_appointments.sql` with:

```sql
create extension if not exists pgcrypto;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(trim(customer_name)) between 1 and 100),
  phone text not null check (char_length(trim(phone)) between 6 and 32),
  pet_name text not null check (char_length(trim(pet_name)) between 1 and 80),
  pet_type text not null,
  service text not null,
  appointment_time timestamptz not null,
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at timestamptz not null default now()
);

create index if not exists appointments_appointment_time_idx
  on public.appointments (appointment_time);
create index if not exists appointments_status_idx
  on public.appointments (status);
create index if not exists appointments_created_at_idx
  on public.appointments (created_at);

alter table public.appointments enable row level security;
```

- [ ] **Step 4: Run store tests and verify they pass**

Run: `npm test -- tests/appointments-store.test.ts`

Expected: PASS; assertions must prove the SQL is parameterized and the returned row is mapped to the public record shape.

- [ ] **Step 5: Commit the database boundary and migration**

```powershell
git add -- lib/db.ts lib/appointments.ts supabase/migrations/20260821000000_create_appointments.sql tests/appointments-store.test.ts
git commit -m "feat: add postgres appointment store"
```

### Task 5: Add the appointment API route with red-green tests

**Files:**
- Create: `app/api/appointments/route.ts`
- Create: `tests/appointments-api.test.ts`
- Modify: none in the red step

**Interfaces:**
- Consumes: `validateAppointmentRequest`, `AppointmentStore`, `createAppointmentStore`, and `DatabaseConfigurationError`.
- Produces:

```ts
export function createAppointmentsPostHandler(
  storeFactory?: () => AppointmentStore
): (request: Request) => Promise<Response>;

export const POST: (request: Request) => Promise<Response>;
```

- [ ] **Step 1: Write route tests before implementing the route**

Cover these exact cases:

1. Invalid JSON returns `400` with `{ error: '请求 JSON 格式无效' }`.
2. Valid JSON with a missing required value returns `400` and the contract message.
3. A fake store returns `201` with `{ id, status, createdAt }` and receives the normalized ISO time.
4. A store factory throwing `DatabaseConfigurationError` returns `503` with `{ error: '服务端未配置 DATABASE_URL' }`.
5. A store rejection returns `500` with `{ error: '预约保存失败，请稍后再试' }` and does not expose the original error message.

Use `createAppointmentsPostHandler(() => fakeStore)` for tests; do not mock the entire Next.js module or connect to a real database in unit tests.

- [ ] **Step 2: Run the route tests and verify the red state**

Run: `npm test -- tests/appointments-api.test.ts`

Expected: FAIL because `app/api/appointments/route.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal Node.js Route Handler**

Set `export const runtime = 'nodejs'`. Parse `request.json()` inside a `try/catch`; run `validateAppointmentRequest`; call the injected/default store only after validation; map status codes exactly as defined in Step 1; log database failures with `console.error` without returning the error object.

- [ ] **Step 4: Run the route tests and verify green**

Run: `npm test -- tests/appointments-api.test.ts`

Expected: PASS for all five response cases.

- [ ] **Step 5: Commit the API route**

```powershell
git add -- app/api/appointments/route.ts tests/appointments-api.test.ts
git commit -m "feat: add appointment submission api"
```

### Task 6: Extract and test the client submission boundary

**Files:**
- Create: `lib/appointment-form.ts`
- Create: `tests/appointment-form.test.ts`

**Interfaces:**
- Consumes: browser `FormData` with the seven existing field names and a fetch-like function.
- Produces:

```ts
export type AppointmentSubmitResult =
  | { ok: true; id: string; status: AppointmentStatus; createdAt: string }
  | { ok: false; message: string };

export function buildAppointmentPayload(formData: FormData): Record<string, string>;
export function submitAppointmentForm(
  formData: FormData,
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): Promise<AppointmentSubmitResult>;
```

- [ ] **Step 1: Write failing form-boundary tests**

Assert that `buildAppointmentPayload` maps exactly `customerName`, `phone`, `petName`, `petType`, `service`, `appointmentTime`, and `note`; assert that `submitAppointmentForm` sends `POST /api/appointments` with `Content-Type: application/json`, returns the `201` payload on success, and returns the API `error` text on a non-2xx response.

- [ ] **Step 2: Run the focused form-boundary tests and verify red**

Run: `npm test -- tests/appointment-form.test.ts`

Expected: FAIL because `lib/appointment-form.ts` does not exist yet.

- [ ] **Step 3: Implement the pure mapping and fetch helper**

Read values with `String(formData.get(name) ?? '')`, send `JSON.stringify(buildAppointmentPayload(formData))`, parse JSON defensively, and use `预约提交失败，请稍后再试` only when the response has no usable server error message.

- [ ] **Step 4: Run the focused tests and verify green**

Run: `npm test -- tests/appointment-form.test.ts`

Expected: PASS with no real network request.

- [ ] **Step 5: Commit the client submission boundary**

```powershell
git add -- lib/appointment-form.ts tests/appointment-form.test.ts
git commit -m "feat: add appointment form submission helper"
```

### Task 7: Connect the existing form without changing its visual design

**Files:**
- Modify: `components/booking-section.tsx`
- Modify: `tests/booking-section.test.tsx`

**Interfaces:**
- Consumes: `submitAppointmentForm` and the existing form layout/styles.
- Produces: a client component that submits the seven named fields and renders submitting/success/error feedback.

- [ ] **Step 1: Extend the existing static form test to the new contract**

Add assertions for `name="customerName"`, `name="phone"`, `name="petName"`, `name="petType"`, `name="service"`, `name="appointmentTime"`, `name="note"`; required attributes on the five required fields; `type="submit"` on the primary button; and `aria-live="polite"` on the feedback region. Keep the existing appointment-time `min` and default-value assertions.

- [ ] **Step 2: Run the focused component test and verify red**

Run: `npm test -- tests/booking-section.test.tsx`

Expected: FAIL on the newly asserted names/submit/feedback attributes because the current component does not provide them.

- [ ] **Step 3: Implement the form interaction**

Add `'use client'`, `useState`, and an `onSubmit` handler. Use `event.preventDefault()`, set `submitting`, call `submitAppointmentForm(new FormData(event.currentTarget))`, then:

- disable the primary submit button while submitting;
- on success call `event.currentTarget.reset()`, set the success text `预约提交成功，我们会尽快与您确认时间。`, and render it in a polite live region;
- on failure keep the form values, set the error text returned by the helper, and render it with `role="alert"`;
- keep the existing secondary “联系门店” button as `type="button"`;
- preserve the existing Chinese labels, field order, classes and layout.

Add `name` attributes and `required` to the fields, plus `maxLength={100}`, `maxLength={20}`, `maxLength={80}`, and `maxLength={1000}` for the text inputs/textarea as appropriate.

- [ ] **Step 4: Run the focused component and form tests**

Run: `npm test -- tests/booking-section.test.tsx tests/appointment-form.test.ts`

Expected: PASS with the original date-time contract and the new submission contract both covered.

- [ ] **Step 5: Commit the form integration**

```powershell
git add -- components/booking-section.tsx tests/booking-section.test.tsx
git commit -m "feat: connect booking form to appointment api"
```

### Task 8: Configure environment, execute Supabase MCP DDL, and run full verification

**Files:**
- Modify: `.env.example`
- Modify: `.env.local.example`
- Test/verify: all project tests, lint, typecheck, build, Supabase MCP schema queries

**Interfaces:**
- Consumes: the completed route/store/migration and the user-provided `supabase` MCP configuration.
- Produces: a configured, schema-verified appointment write path; no committed secrets.

- [ ] **Step 1: Add non-secret environment examples**

Add this line to both example files without editing the real secret value in `.env.local`:

```env
DATABASE_URL=postgresql://session-pool-user:password@session-pool-host:5432/postgres?sslmode=require
```

Run: `rg -n '^DATABASE_URL=' .env.example .env.local.example`

Expected: exactly one example line in each file, with no real password or token.

- [ ] **Step 2: Verify the focused implementation suite**

Run: `npm test -- tests/appointment-contract.test.ts tests/appointments-store.test.ts tests/appointments-api.test.ts tests/appointment-form.test.ts tests/booking-section.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 3: Check whether the current session exposes Supabase MCP**

Inspect the current tool inventory for names/descriptions containing `supabase` or database SQL execution. If the configured server is still absent, report that the current session requires a refresh and stop before claiming database creation; do not substitute an unapproved direct `psql` or Supabase JS operation.

- [ ] **Step 4: Execute the migration through Supabase MCP when available**

Send the exact contents of `supabase/migrations/20260821000000_create_appointments.sql` to the Supabase MCP SQL/database execution tool. Then query:

```sql
select
  to_regclass('public.appointments') as table_name,
  (select count(*) from pg_indexes where schemaname = 'public' and tablename = 'appointments') as index_count,
  (select relrowsecurity from pg_class where oid = 'public.appointments'::regclass) as rls_enabled;
```

Expected: `table_name = public.appointments`, `index_count >= 3`, and `rls_enabled = true`. Query `information_schema.columns` and `pg_constraint` to confirm all listed columns and the four-value status check exist.

- [ ] **Step 5: Verify database write behavior and clean up the smoke row**

If a real `DATABASE_URL` is present in the local environment, start the app on `127.0.0.1:4173`, POST one uniquely tagged payload to `/api/appointments`, read the returned `id`, query that row through the same Session Pool, and assert that `appointment_time` for `2026-08-22T09:30` is `2026-08-22T01:30:00.000Z` when read as UTC. Delete only that returned `id` with a parameterized `DELETE ... WHERE id = $1 RETURNING id`, verify one row was deleted, and never print the connection string. If any assertion or cleanup fails, report the remaining row id instead of claiming a clean smoke test.

- [ ] **Step 6: Run the complete project verification**

Run each command separately and record exit code/output:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: all commands exit with code `0`; no test failures, lint errors, type errors or build errors. If `next-env.d.ts` receives an unrelated generated change, inspect it and restore only that generated change without touching user code.

- [ ] **Step 7: Add environment documentation and commit the final implementation batch**

```powershell
git add -- .env.example .env.local.example
git commit -m "docs: document appointment database connection"
```

Before reporting completion, run `git status --short`, confirm no secret files are staged, and report separately whether Supabase MCP DDL and real database write verification were actually completed.
