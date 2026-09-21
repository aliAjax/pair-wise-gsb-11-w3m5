import dayjs from "dayjs";

export function fmtDateTime(iso: string): string {
  if (!iso) return "—";
  const d = dayjs(iso);
  return d.isValid() ? d.format("YYYY-MM-DD HH:mm") : "—";
}

export function fmtRange(start: string, end: string): string {
  if (!start || !end) return "时段未设置";
  const s = dayjs(start);
  const e = dayjs(end);
  if (s.isSame(e, "day")) return `${s.format("MM-DD HH:mm")} → ${e.format("HH:mm")}`;
  return `${s.format("MM-DD HH:mm")} → ${e.format("MM-DD HH:mm")}`;
}

export function fullRange(start: string, end: string): string {
  if (!start || !end) return "—";
  return `${dayjs(start).format("YYYY-MM-DD HH:mm")} 至 ${dayjs(end).format("YYYY-MM-DD HH:mm")}`;
}

// datetime-local 使用本地时间字符串
export function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = dayjs(iso);
  return d.isValid() ? d.format("YYYY-MM-DDTHH:mm") : "";
}

export function fromLocalInput(value: string): string {
  if (!value) return "";
  const d = dayjs(value);
  return d.isValid() ? d.toISOString() : "";
}
