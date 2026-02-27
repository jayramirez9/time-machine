/**
 * Timezone Utilities
 * Zero-dependency timezone handling using built-in Intl.DateTimeFormat
 *
 * The core problem: when a user says "July 4, 1978 at 3pm in Baton Rouge",
 * they mean 3pm Central Time — not 3pm UTC or 3pm in the server's timezone.
 * These utilities convert between "wall clock time at a location" and UTC.
 */

/**
 * Get the UTC offset in minutes for a given IANA timezone at a specific UTC instant.
 * Uses Intl.DateTimeFormat to determine what local time it is at that timezone,
 * then compares to derive the offset.
 *
 * @param {Date} utcDate - A UTC Date object
 * @param {string} timezone - IANA timezone string (e.g., "America/Chicago")
 * @returns {number} Offset in minutes (positive = ahead of UTC, e.g., UTC+5 = 300)
 */
function getUtcOffset(utcDate, timezone) {
  // Format the UTC date as parts in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = {};
  for (const { type, value } of formatter.formatToParts(utcDate)) {
    parts[type] = value;
  }

  // Reconstruct as a "fake UTC" date from the local parts
  const localYear = parseInt(parts.year);
  const localMonth = parseInt(parts.month) - 1;
  const localDay = parseInt(parts.day);
  let localHour = parseInt(parts.hour);
  if (localHour === 24) localHour = 0; // midnight edge case
  const localMinute = parseInt(parts.minute);
  const localSecond = parseInt(parts.second);

  const fakeUtc = Date.UTC(localYear, localMonth, localDay, localHour, localMinute, localSecond);
  const realUtc = utcDate.getTime();

  // Offset = local - UTC (in minutes)
  return Math.round((fakeUtc - realUtc) / 60000);
}

/**
 * Convert a wall-clock time in a specific timezone to a UTC Date.
 *
 * Example: localToUtc(1978, 7, 4, 15, 0, "America/Chicago")
 * → a Date representing 1978-07-04T20:00:00Z (3pm CDT = UTC-5 in summer)
 *
 * @param {number} year
 * @param {number} month - 1-indexed (1=January)
 * @param {number} day
 * @param {number} hour - 0-23
 * @param {number} minute - 0-59
 * @param {string} timezone - IANA timezone string
 * @returns {Date} UTC Date
 */
export function localToUtc(year, month, day, hour, minute, timezone) {
  if (!timezone) {
    // Fallback: machine-local time (legacy behavior)
    return new Date(year, month - 1, day, hour, minute, 0);
  }

  // Start with a rough UTC guess (pretend the local time IS UTC)
  const guessUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  // Find offset at that guess
  const offset = getUtcOffset(guessUtc, timezone);

  // Adjust: if timezone is UTC+X, UTC time is earlier by X
  const correctedUtc = new Date(guessUtc.getTime() - offset * 60000);

  // Verify: the offset might differ at the corrected time (DST edge case)
  const verifyOffset = getUtcOffset(correctedUtc, timezone);
  if (verifyOffset !== offset) {
    // Re-correct with the verified offset
    return new Date(guessUtc.getTime() - verifyOffset * 60000);
  }

  return correctedUtc;
}

/**
 * Get the local hour (0-23) at a given timezone for a UTC Date.
 *
 * @param {Date} utcDate - A UTC Date
 * @param {string} timezone - IANA timezone string
 * @returns {number} Hour 0-23 in the target timezone
 */
export function getLocalHour(utcDate, timezone) {
  if (!timezone) {
    return utcDate.getHours(); // Fallback: machine-local
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false
  });

  const hourStr = formatter.format(utcDate);
  let hour = parseInt(hourStr);
  if (hour === 24) hour = 0;
  return hour;
}

/**
 * Get the local minutes (0-59) at a given timezone for a UTC Date.
 *
 * @param {Date} utcDate - A UTC Date
 * @param {string} timezone - IANA timezone string
 * @returns {number} Minutes 0-59 in the target timezone
 */
export function getLocalMinutes(utcDate, timezone) {
  if (!timezone) {
    return utcDate.getMinutes();
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    minute: '2-digit'
  });

  return parseInt(formatter.format(utcDate));
}

/**
 * Format a UTC Date as an ISO-like local time string in a given timezone.
 *
 * Example: formatLocalISO(new Date('1978-07-04T20:00:00Z'), 'America/Chicago')
 * → "1978-07-04T15:00:00"
 *
 * @param {Date} utcDate - A UTC Date
 * @param {string} timezone - IANA timezone string
 * @returns {string} ISO-like string in local time (no offset suffix)
 */
export function formatLocalISO(utcDate, timezone) {
  if (!timezone) {
    // Fallback: machine-local (legacy behavior)
    const d = utcDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = {};
  for (const { type, value } of formatter.formatToParts(utcDate)) {
    parts[type] = value;
  }

  let hour = parts.hour;
  if (hour === '24') hour = '00';

  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}`;
}

/**
 * Get the local date string (YYYY-MM-DD) at a given timezone for a UTC Date.
 *
 * @param {Date} utcDate - A UTC Date
 * @param {string} timezone - IANA timezone string
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function getLocalDateStr(utcDate, timezone) {
  if (!timezone) {
    return utcDate.toISOString().split('T')[0];
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  return formatter.format(utcDate);
}
