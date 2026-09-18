import { describe, expect, test, vi } from 'vitest';

import { DatabaseConfigurationError } from '../lib/db';
import type { AppointmentStore } from '../lib/appointments';
import { createAppointmentsPostHandler } from '../app/api/appointments/route';

const validPayload = {
  customerName: '  林女士  ',
  phone: '138-0000-0000',
  petName: '雪球',
  petType: '猫咪',
  service: '基础洗护',
  appointmentTime: '2026-08-22T09:30',
  note: '  怕吹风  '
};

const fixedNow = () => new Date('2026-08-21T00:00:00.000Z');

function makeRequest(body: BodyInit): Request {
  return new Request('http://localhost/api/appointments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body
  });
}

async function readJson(response: Response) {
  return response.json();
}

describe('appointments POST route handler', () => {
  test('invalid JSON returns a 400 response', async () => {
    const handler = createAppointmentsPostHandler(() => ({
      insert: vi.fn()
    }));

    const response = await handler(makeRequest('{'));

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({ error: '请求 JSON 格式无效' });
  });

  test('missing required value returns the contract validation message', async () => {
    const insert = vi.fn();
    const handler = createAppointmentsPostHandler(() => ({ insert }));

    const response = await handler(makeRequest(JSON.stringify({ ...validPayload, customerName: '' })));

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({ error: '家长姓名不能为空' });
    expect(insert).not.toHaveBeenCalled();
  });

  test('valid JSON returns the created appointment and receives normalized ISO time', async () => {
    const insert = vi.fn<AppointmentStore['insert']>().mockResolvedValue({
      id: 'appointment-1',
      status: 'pending',
      createdAt: '2026-08-21T01:00:00.000Z'
    });
    const handler = createAppointmentsPostHandler(() => ({ insert }), fixedNow);

    const response = await handler(makeRequest(JSON.stringify(validPayload)));

    expect(response.status).toBe(201);
    expect(await readJson(response)).toEqual({
      id: 'appointment-1',
      status: 'pending',
      createdAt: '2026-08-21T01:00:00.000Z'
    });
    expect(insert).toHaveBeenCalledWith({
      customerName: '林女士',
      phone: '138-0000-0000',
      petName: '雪球',
      petType: '猫咪',
      service: '基础洗护',
      appointmentTime: '2026-08-22T01:30:00.000Z',
      note: '怕吹风'
    });
  });

  test('uses the injected clock when checking whether an appointment is in the future', async () => {
    const insert = vi.fn<AppointmentStore['insert']>().mockResolvedValue({
      id: 'appointment-clock',
      status: 'pending',
      createdAt: '2026-08-21T01:00:00.000Z'
    });
    const handler = createAppointmentsPostHandler(() => ({ insert }), fixedNow);

    const response = await handler(
      makeRequest(JSON.stringify({ ...validPayload, appointmentTime: '2026-08-21T09:30' }))
    );

    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith({
      customerName: '林女士',
      phone: '138-0000-0000',
      petName: '雪球',
      petType: '猫咪',
      service: '基础洗护',
      appointmentTime: '2026-08-21T01:30:00.000Z',
      note: '怕吹风'
    });
  });

  test('database configuration failure returns a 503 response', async () => {
    const handler = createAppointmentsPostHandler(() => {
      throw new DatabaseConfigurationError();
    }, fixedNow);

    const response = await handler(makeRequest(JSON.stringify(validPayload)));

    expect(response.status).toBe(503);
    expect(await readJson(response)).toEqual({ error: '服务端未配置 DATABASE_URL' });
  });

  test('store rejection returns a generic 500 response without exposing the original error', async () => {
    const originalMessage = 'secret database password';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = createAppointmentsPostHandler(() => ({
      insert: vi.fn().mockRejectedValue(new Error(originalMessage))
    }), fixedNow);

    const response = await handler(makeRequest(JSON.stringify(validPayload)));
    const responseText = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(responseText)).toEqual({ error: '预约保存失败，请稍后再试' });
    expect(responseText).not.toContain(originalMessage);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
