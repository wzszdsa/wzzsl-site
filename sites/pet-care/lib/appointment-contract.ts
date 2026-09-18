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

const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === 'object' && input !== null && !Array.isArray(input);

const isOneOf = <T extends readonly string[]>(value: unknown, options: T): value is T[number] =>
  typeof value === 'string' && options.includes(value);

export function validateAppointmentRequest(input: unknown, now = new Date()): AppointmentValidationResult {
  if (!isRecord(input)) {
    return { ok: false, message: '预约信息格式无效' };
  }

  const customerName = typeof input.customerName === 'string' ? input.customerName.trim() : '';
  if (!customerName) return { ok: false, message: '家长姓名不能为空' };
  if (customerName.length > 100) return { ok: false, message: '家长姓名不能超过 100 个字符' };

  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  if (!/^[0-9+\-\s]{6,20}$/.test(phone)) return { ok: false, message: '联系电话格式无效' };

  const petName = typeof input.petName === 'string' ? input.petName.trim() : '';
  if (!petName) return { ok: false, message: '宠物名称不能为空' };
  if (petName.length > 80) return { ok: false, message: '宠物名称不能超过 80 个字符' };

  if (!isOneOf(input.petType, appointmentPetTypes)) return { ok: false, message: '宠物类型无效' };
  if (!isOneOf(input.service, appointmentServices)) return { ok: false, message: '服务项目无效' };

  const appointmentTime = typeof input.appointmentTime === 'string' ? input.appointmentTime : '';
  const appointmentParts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(appointmentTime);
  if (!appointmentParts) {
    return { ok: false, message: '期望到店时间格式无效' };
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = appointmentParts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59) {
    return { ok: false, message: '期望到店时间格式无效' };
  }

  const parsedTime = new Date(`${appointmentTime}:00+08:00`);
  if (Number.isNaN(parsedTime.getTime())) return { ok: false, message: '期望到店时间格式无效' };
  if (parsedTime.getTime() <= now.getTime()) {
    return { ok: false, message: '期望到店时间必须晚于当前时间' };
  }

  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > 1000) return { ok: false, message: '补充说明不能超过 1000 个字符' };

  return {
    ok: true,
    value: {
      customerName,
      phone,
      petName,
      petType: input.petType,
      service: input.service,
      appointmentTime: parsedTime.toISOString(),
      note: note || null
    }
  };
}
