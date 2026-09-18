import type { AppointmentStatus } from './appointment-contract';

export type AppointmentSubmitResult =
  | { ok: true; id: string; status: AppointmentStatus; createdAt: string }
  | { ok: false; message: string };

const appointmentFieldNames = [
  'customerName',
  'phone',
  'petName',
  'petType',
  'service',
  'appointmentTime',
  'note'
] as const;

const fallbackMessage = '预约提交失败，请稍后再试';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAppointmentStatus(value: unknown): value is AppointmentStatus {
  return value === 'pending' || value === 'confirmed' || value === 'cancelled' || value === 'completed';
}

export function buildAppointmentPayload(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    appointmentFieldNames.map((name) => [name, String(formData.get(name) ?? '')])
  );
}

export async function submitAppointmentForm(
  formData: FormData,
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = fetch
): Promise<AppointmentSubmitResult> {
  let response: Response;

  try {
    response = await fetcher('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildAppointmentPayload(formData))
    });
  } catch {
    return { ok: false, message: fallbackMessage };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    if (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim()) {
      return { ok: false, message: payload.error };
    }
    return { ok: false, message: fallbackMessage };
  }

  if (
    isRecord(payload) &&
    typeof payload.id === 'string' &&
    isAppointmentStatus(payload.status) &&
    typeof payload.createdAt === 'string'
  ) {
    return {
      ok: true,
      id: payload.id,
      status: payload.status,
      createdAt: payload.createdAt
    };
  }

  return { ok: false, message: fallbackMessage };
}
