import type { AppointmentInsert, AppointmentStatus } from './appointment-contract';
import { getDbPool } from './db';

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

const insertAppointmentSql = `
INSERT INTO public.appointments
  (customer_name, phone, pet_name, pet_type, service, appointment_time, note)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, status, created_at
`;

export function createAppointmentStore(query?: AppointmentQuery): AppointmentStore {
  return {
    async insert(input) {
      const executeQuery = query ?? ((text, values) => getDbPool().query(text, values));
      const result = await executeQuery(insertAppointmentSql, [
        input.customerName,
        input.phone,
        input.petName,
        input.petType,
        input.service,
        input.appointmentTime,
        input.note
      ]);
      const row = result.rows[0];

      if (!row) {
        throw new Error('Appointment insert returned no row');
      }

      return {
        id: row.id,
        status: row.status,
        createdAt: new Date(row.created_at).toISOString()
      };
    }
  };
}
