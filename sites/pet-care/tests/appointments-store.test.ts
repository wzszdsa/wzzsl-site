import { describe, expect, test } from 'vitest';

import type { AppointmentInsert } from '../lib/appointment-contract';
import { createAppointmentStore } from '../lib/appointments';

describe('appointment PostgreSQL store', () => {
  test('inserts an appointment with parameterized SQL and maps the returned record', async () => {
    const input: AppointmentInsert = {
      customerName: '张三',
      phone: '13800138000',
      petName: '豆豆',
      petType: '狗狗',
      service: '基础洗护',
      appointmentTime: '2026-08-21T09:00:00.000Z',
      note: '请温柔一点'
    };
    let captured: { text: string; values: unknown[] } | undefined;
    const store = createAppointmentStore(async (text, values) => {
      captured = { text, values };
      return {
        rows: [
          {
            id: 'appointment-1',
            status: 'pending',
            created_at: new Date('2026-08-21T01:00:00.000Z')
          }
        ]
      };
    });

    const result = await store.insert(input);

    expect(result).toEqual({
      id: 'appointment-1',
      status: 'pending',
      createdAt: '2026-08-21T01:00:00.000Z'
    });
    expect(captured?.text).toContain('INSERT INTO public.appointments');
    expect(captured?.text).toContain('VALUES ($1, $2, $3, $4, $5, $6, $7)');
    expect(captured?.values).toEqual([
      input.customerName,
      input.phone,
      input.petName,
      input.petType,
      input.service,
      input.appointmentTime,
      input.note
    ]);
    expect(captured?.text).not.toContain(input.customerName);
  });
});
