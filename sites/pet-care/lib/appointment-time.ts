const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

function getDateParts(formatter: Intl.DateTimeFormat, date: Date): Record<string, string> {
  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value])
  );
}

function getRequiredPart(parts: Record<string, string>, name: string): string {
  const value = parts[name];
  if (!value) {
    throw new Error(`Missing ${name} from Shanghai date formatter`);
  }
  return value;
}

export function formatShanghaiDateTime(date: Date): string {
  const parts = getDateParts(dateTimeFormatter, date);

  return [
    `${getRequiredPart(parts, 'year')}-${getRequiredPart(parts, 'month')}-${getRequiredPart(parts, 'day')}`,
    `${getRequiredPart(parts, 'hour')}:${getRequiredPart(parts, 'minute')}`
  ].join('T');
}

export function getTomorrowMorningAppointmentTime(now = new Date()): string {
  const parts = getDateParts(dateFormatter, now);
  const year = Number(getRequiredPart(parts, 'year'));
  const month = Number(getRequiredPart(parts, 'month'));
  const day = Number(getRequiredPart(parts, 'day'));
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
  const tomorrowParts = getDateParts(dateFormatter, tomorrow);

  return `${getRequiredPart(tomorrowParts, 'year')}-${getRequiredPart(tomorrowParts, 'month')}-${getRequiredPart(tomorrowParts, 'day')}T09:30`;
}
