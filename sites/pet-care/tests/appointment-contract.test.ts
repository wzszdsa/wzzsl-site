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

  it('rejects invalid calendar and clock components', () => {
    for (const appointmentTime of ['2026-02-30T09:30', '2026-08-22T24:00', '2026-08-22T09:60']) {
      expect(validateAppointmentRequest({ ...validRequest, appointmentTime }, now)).toEqual({
        ok: false,
        message: '期望到店时间格式无效'
      });
    }
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
