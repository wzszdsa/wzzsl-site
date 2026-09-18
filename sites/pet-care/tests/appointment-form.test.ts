import { describe, expect, test, vi } from 'vitest';

import { buildAppointmentPayload, submitAppointmentForm } from '../lib/appointment-form';

function makeFormData(): FormData {
  const formData = new FormData();
  formData.set('customerName', '林女士');
  formData.set('phone', '138-0000-0000');
  formData.set('petName', '雪球');
  formData.set('petType', '猫咪');
  formData.set('service', '基础洗护');
  formData.set('appointmentTime', '2026-08-22T09:30');
  formData.set('note', '怕吹风');
  return formData;
}

describe('appointment form submission boundary', () => {
  test('maps the seven appointment fields exactly', () => {
    expect(buildAppointmentPayload(makeFormData())).toEqual({
      customerName: '林女士',
      phone: '138-0000-0000',
      petName: '雪球',
      petType: '猫咪',
      service: '基础洗护',
      appointmentTime: '2026-08-22T09:30',
      note: '怕吹风'
    });
  });

  test('posts JSON to the appointments API and returns the created appointment', async () => {
    const responsePayload = {
      id: 'appointment-1',
      status: 'pending',
      createdAt: '2026-08-21T01:00:00.000Z'
    } as const;
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responsePayload), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      })
    );

    const result = await submitAppointmentForm(makeFormData(), fetcher);

    expect(result).toEqual({ ok: true, ...responsePayload });
    expect(fetcher).toHaveBeenCalledWith('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: '林女士',
        phone: '138-0000-0000',
        petName: '雪球',
        petType: '猫咪',
        service: '基础洗护',
        appointmentTime: '2026-08-22T09:30',
        note: '怕吹风'
      })
    });
  });

  test('returns the API error text for a non-2xx response', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: '联系电话格式无效' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      })
    );

    await expect(submitAppointmentForm(makeFormData(), fetcher)).resolves.toEqual({
      ok: false,
      message: '联系电话格式无效'
    });
  });
});
