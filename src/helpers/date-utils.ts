// Date utility functions for personal-finance plugin.

export type SupportedPeriod = "this_month" | "last_month" | "last_30_days" | "this_year" | "all";

export interface DateRange {
  start: string;
  end: string;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function resolvePeriodRange(period: SupportedPeriod): DateRange | null {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  switch (period) {
    case "this_month": {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return { start: toISODate(start), end: toISODate(end) };
    }
    case "last_month": {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      return { start: toISODate(start), end: toISODate(end) };
    }
    case "last_30_days": {
      const end = today;
      const start = new Date(end);
      start.setDate(start.getDate() - 30);
      return { start: toISODate(start), end: toISODate(end) };
    }
    case "this_year": {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      return { start: toISODate(start), end: toISODate(end) };
    }
    case "all":
      return null;
  }
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}
