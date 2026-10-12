import { cn } from "@/shared/lib/utils";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { subDays } from "date-fns";
import { ymd } from "@/shared/lib/format";
import { toast } from "sonner";

// peças do painel (cards, tabela, paginação, badge, CSV) reaproveitadas em todas as telas

const TrendIcon = ({ up }: { up: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className={up ? "" : "rotate-180 scale-x-[-1]"} aria-hidden>
    <path fillRule="evenodd" clipRule="evenodd" fill={up ? "#45BC56" : "#CC0854"} d="M15.6679 7C15.6679 6.58579 16.0036 6.25 16.4179 6.25H22C22.4142 6.25 22.75 6.58579 22.75 7V12.5458C22.75 12.96 22.4142 13.2958 22 13.2958C21.5858 13.2958 21.25 12.96 21.25 12.5458V8.80286L15.1142 14.9013C14.6452 15.3674 14.241 15.7692 13.8739 16.0477C13.4804 16.3462 13.0432 16.572 12.505 16.572C11.9668 16.5719 11.5297 16.346 11.1362 16.0474C10.7692 15.7688 10.3651 15.367 9.89629 14.9007L9.62203 14.628C9.10787 14.1167 8.77452 13.7875 8.49695 13.5769C8.23672 13.3794 8.11506 13.3573 8.03449 13.3574C7.95393 13.3574 7.83228 13.3795 7.57219 13.5772C7.29478 13.7881 6.96167 14.1175 6.44789 14.6292L2.52922 18.5314C2.23571 18.8237 1.76084 18.8227 1.46856 18.5292C1.17628 18.2357 1.17728 17.7608 1.47078 17.4686L5.42433 13.5315C5.89326 13.0645 6.29742 12.662 6.66452 12.383C7.05802 12.0839 7.49535 11.8576 8.03395 11.8574C8.57254 11.8572 9.01003 12.0832 9.40375 12.382C9.77105 12.6607 10.1755 13.063 10.6448 13.5296L10.919 13.8024C11.4327 14.3132 11.7658 14.6421 12.0431 14.8526C12.3031 15.0499 12.4247 15.072 12.5052 15.072C12.5857 15.072 12.7073 15.0499 12.9673 14.8527C13.2447 14.6423 13.5778 14.3134 14.0916 13.8027L20.1815 7.75H16.4179C16.0036 7.75 15.6679 7.41421 15.6679 7Z" />
  </svg>
);

/** quadradinho roxo com o ícone, igual aos cards da loja */
export const IconBox = ({ children, size = 48 }: { children: ReactNode; size?: number }) => (
  <div className="shrink-0 rounded-[12.8px] bg-[#9B5BF8]/5 flex items-center justify-center shadow-[0px_3.7px_5.9px_rgba(0,0,0,0.02)] text-[#9B5BF8]" style={{ width: size, height: size }}>
    {children}
  </div>
);

/** card grande do topo (AdminStats da loja) */
export function StatCard({ title, value, icon, up, hint, loading }: { title: string; value: string; icon: ReactNode; up?: boolean; hint?: ReactNode; loading?: boolean }) {
  if (loading)
    return (
      <div className="h-[167px] dark-card rounded-2xl p-6 animate-pulse">
        <div className="h-[23px] bg-muted rounded w-1/2 mb-4" />
        <div className="h-[58px] bg-muted rounded w-1/3" />
      </div>
    );
  return (
    <div className="min-h-[167px] dark-card rounded-2xl p-5 sm:p-6 shadow-[0px_3.5px_5.5px_rgba(0,0,0,0.02)] flex flex-col justify-center">
      <span className="font-medium text-[18px] leading-[23px] text-[rgba(84,5,45,0.5)] dark:text-muted-foreground">{title}</span>
      <div className="w-full flex justify-between items-center gap-2 mt-4">
        <div className="gap-4 flex items-center min-w-0">
          <span className="font-bold text-[22px] sm:text-[28px] leading-tight sm:leading-[48px] text-[#54052D] dark:text-foreground whitespace-nowrap min-w-0">{value}</span>
          {up !== undefined && <span className="hidden sm:block"><TrendIcon up={up} /></span>}
        </div>
        <IconBox>{icon}</IconBox>
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** card menor (SummaryCards da loja) */
export function MiniCard({ title, value, icon, hint }: { title: string; value: string; icon: ReactNode; hint?: ReactNode }) {
  return (
    <div className="dark-card rounded-2xl p-5 border border-border/30 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[rgba(84,5,45,0.5)] dark:text-muted-foreground">{title}</p>
        <p className="mt-2 text-xl font-bold text-[#54052D] dark:text-foreground truncate">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground truncate">{hint}</p>}
      </div>
      <IconBox size={44}>{icon}</IconBox>
    </div>
  );
}

/** card com título e ações (cabeçalho do SalesChart / tabelas da loja) */
export function Panel({ title, icon, actions, children, className }: { title: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("dark-card rounded-2xl p-6 border border-border/30", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          {icon && <span className="text-[#9B5BF8]">{icon}</span>}
          <h2 className="text-base font-semibold text-[#54052D] dark:text-foreground">{title}</h2>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

const VERDE = "bg-[rgba(69,188,86,0.15)] text-[#45BC56]";
const AMARELO = "bg-[rgba(245,158,11,0.15)] text-[#F59E0B]";
const VERMELHO = "bg-[rgba(204,8,84,0.1)] text-[#CC0854]";
const ROXO = "bg-[rgba(155,91,248,0.12)] text-[#9B5BF8]";
const AZUL = "bg-[rgba(59,130,246,0.12)] text-[#3B82F6]";
const CINZA = "bg-muted text-muted-foreground";

const STATUS: Record<string, { label: string; cls: string }> = {
  // depósitos e saques
  pago: { label: "Pago", cls: VERDE },
  pendente: { label: "Pendente", cls: AMARELO },
  expirado: { label: "Expirado", cls: CINZA },
  aprovado: { label: "Aprovado", cls: VERDE },
  cancelado: { label: "Cancelado", cls: VERMELHO },
  // bônus
  cadastro: { label: "Cadastro", cls: ROXO },
  indicacao: { label: "Indicação", cls: AZUL },
  manual: { label: "Dado pelo admin", cls: "bg-[rgba(236,72,153,0.12)] text-[#EC4899]" },
  link: { label: "Link de bônus", cls: "bg-[rgba(20,184,166,0.12)] text-[#14B8A6]" },
  conversao: { label: "Conversão de pontos", cls: AMARELO },
  // indicações
  liberada: { label: "Liberada", cls: VERDE },
  // partidas
  settled: { label: "Paga", cls: VERDE },
  refunded: { label: "Estornada", cls: CINZA },
  disputed: { label: "Contestada", cls: VERMELHO },
  interrupted: { label: "Interrompida", cls: AMARELO },
  playing: { label: "Jogando", cls: AZUL },
  // jogadores
  ativo: { label: "Ativo", cls: VERDE },
  bloqueado: { label: "Bloqueado", cls: VERMELHO },
  inativo: { label: "Inativo", cls: CINZA },
};

export const statusLabel = (s: string) => STATUS[s]?.label ?? s;

export const StatusBadge = ({ status, label }: { status: string; label?: string }) => (
  <span className={cn("inline-flex items-center justify-center px-4 py-1.5 rounded-full text-[11px] font-medium min-w-[100px]", STATUS[status]?.cls ?? CINZA)}>{label ?? statusLabel(status)}</span>
);

/** tabela no padrão da loja: cabeçalho discreto, linhas com borda fina */
export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean | string }) {
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm">
        <thead>
          <tr>{head.map((h, i) => <th key={i} className="px-2 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody className="[&_td]:px-2 [&_td]:py-3 [&_td]:border-t [&_td]:border-border/50 [&_td]:whitespace-nowrap [&_td]:text-[#54052D] dark:[&_td]:text-foreground">{children}</tbody>
      </table>
      {empty && <p className="py-10 text-center text-sm text-muted-foreground">{typeof empty === "string" ? empty : "Nada encontrado com esses filtros."}</p>}
    </div>
  );
}

/** paginação copiada da TransacoesTable da loja */
export function Pagination({ currentPage, totalPages, onPageChange }: { currentPage: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  const pages: (number | "…")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  const btn = "flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed";
  return (
    <div className="flex items-center justify-start gap-1.5 py-4">
      <button className={btn} onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} aria-label="Página anterior"><ArrowLeft className="h-4 w-4" strokeWidth={2} /></button>
      {pages.map((p, i) =>
        p === "…" ? <span key={`e${i}`} className="w-8 text-center text-muted-foreground text-sm">…</span> : (
          <button key={p} onClick={() => onPageChange(p)} aria-current={p === currentPage ? "page" : undefined}
            className={cn("flex items-center justify-center w-8 h-8 rounded-md text-[13px] font-medium transition-all", p === currentPage ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/30")}>{p}</button>
        )
      )}
      <button className={btn} onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Próxima página"><ArrowRight className="h-4 w-4" strokeWidth={2} /></button>
    </div>
  );
}

/** botão redondo do filtro, igual ao do DateFilter */
export const pillCls = "h-9 px-3 gap-2 rounded-full border border-border bg-white dark:bg-transparent hover:bg-muted text-sm font-normal text-foreground/80";

/** baixa as linhas como CSV (abre certo no Excel: separador ; e BOM) */
export function baixarCsv(nome: string, linhas: (string | number | null)[][]) {
  const csv = linhas.map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** campo de texto redondo dos filtros */
export const inputCls = "h-9 rounded-full border border-border bg-white dark:bg-transparent px-3 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground";

/** campo dos formulários dos diálogos */
export const fieldCls = "h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground";

/** o DateFilter abre em "7 dias" */
export const periodoPadrao = () => ({ startDate: ymd(subDays(new Date(), 6)), endDate: ymd(new Date()) });

/** espera o usuário parar de digitar antes de ir pra API */
export function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** reais com vírgula pro CSV (o Excel em pt-BR lê direito) */
export const csvValor = (v: number | null | undefined) => (v == null ? "" : v.toFixed(2).replace(".", ","));

export const copiar = (t: string, msg = "Copiado") => navigator.clipboard.writeText(t).then(() => toast.success(msg), () => toast.error("Não copiou"));

export const Carregando = ({ h = "h-40" }: { h?: string }) => (
  <div className={cn(h, "flex items-center justify-center")}><span className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
);

export const Erro = ({ error }: { error: unknown }) =>
  error ? <p className="my-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{(error as Error).message}</p> : null;

/** busca todas as páginas pra exportar */
export async function todasPaginas<T>(buscar: (pagina: number) => Promise<{ itens: T[]; total: number }>) {
  const linhas: T[] = [];
  for (let p = 1; ; p++) {
    const r = await buscar(p);
    linhas.push(...r.itens);
    if (linhas.length >= r.total || !r.itens.length) break;
  }
  return linhas;
}
