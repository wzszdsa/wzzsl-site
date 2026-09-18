import { describe, expect, test } from 'vitest';

import { formatShanghaiDateTime, getTomorrowMorningAppointmentTime } from '../lib/appointment-time';

describe('Shanghai appointment time formatting', () => {
  test('formats a fixed instant in Shanghai time regardless of the host timezone', () => {
    expect(formatShanghaiDateTime(new Date('2026-08-21T16:30:00.000Z'))).toBe('2026-08-22T00:30');
  });

  test('calculates tomorrow morning from the Shanghai calendar date', () => {
    expect(getTomorrowMorningAppointmentTime(new Date('2026-08-21T16:30:00.000Z'))).toBe('2026-08-23T09:30');
  });
});
