const PH_TIMEZONE = "Asia/Manila";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: PH_TIMEZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  timeZone: PH_TIMEZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function parseSystemDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value !== "string") return null;

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const isoLike = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`;
  const d = new Date(isoLike);
  if (!Number.isNaN(d.getTime())) return d;

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function formatDateTime(value) {
  const d = parseSystemDate(value);
  return d ? DATE_TIME_FORMATTER.format(d) : "-";
}

export function formatDateOnly(value) {
  const d = parseSystemDate(value);
  return d ? DATE_FORMATTER.format(d) : "-";
}
