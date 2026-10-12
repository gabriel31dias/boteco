import { format } from "date-fns";

export const brl = (v: number | null | undefined) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
/** fração 0..1 → "12,5%" */
export const pct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`);
export const num = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR");
/** datas da API vêm em ms epoch */
export const dataHora = (v: number | string | null | undefined) => (v ? format(new Date(v), "dd/MM/yyyy HH:mm") : "—");
export const ymd = (d: Date) => format(d, "yyyy-MM-dd");
