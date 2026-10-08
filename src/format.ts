const DAY = 86_400_000;

/** "Rp 189.000", or "Free" for 0. */
export function rupiah(n: number): string {
  if (n === 0) return "Free";
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Mar 2024" from "2024-03-14". */
export function date(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** "today", "yesterday", "3 weeks ago"… for a timestamp in the past. */
export function ago(timestamp: string, now = new Date()): string {
  const then = new Date(timestamp);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"} ago`;
  if (days < 7) return unit(days, "day");
  if (days < 30) return unit(Math.floor(days / 7), "week");
  if (days < 365) return unit(Math.floor(days / 30), "month");
  return unit(Math.floor(days / 365), "year");
}

/** "42 h", "6.5 h". */
export function hours(h: number): string {
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

/** "21:14". */
export function clock(d = new Date()): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Escapes text for HTML. */
export function esc(s: string | number): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
