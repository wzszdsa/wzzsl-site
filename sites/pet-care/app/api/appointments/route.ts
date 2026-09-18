import { validateAppointmentRequest } from '../../../lib/appointment-contract';
import { DatabaseConfigurationError } from '../../../lib/db';
import { createAppointmentStore, type AppointmentStore } from '../../../lib/appointments';

export const runtime = 'nodejs';

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

export type AppointmentNowProvider = () => Date;

export function createAppointmentsPostHandler(
  storeFactory: () => AppointmentStore = createAppointmentStore,
  nowProvider: AppointmentNowProvider = () => new Date()
): (request: Request) => Promise<Response> {
  return async function handleAppointmentsPost(request: Request): Promise<Response> {
    let input: unknown;

    try {
      input = await request.json();
    } catch {
      return jsonError('请求 JSON 格式无效', 400);
    }

    const validation = validateAppointmentRequest(input, nowProvider());
    if (!validation.ok) {
      return jsonError(validation.message, 400);
    }

    try {
      const appointment = await storeFactory().insert(validation.value);
      return Response.json(appointment, { status: 201 });
    } catch (error) {
      if (error instanceof DatabaseConfigurationError) {
        return jsonError('服务端未配置 DATABASE_URL', 503);
      }

      console.error('Appointment save failed', error);
      return jsonError('预约保存失败，请稍后再试', 500);
    }
  };
}

export const POST = createAppointmentsPostHandler();
