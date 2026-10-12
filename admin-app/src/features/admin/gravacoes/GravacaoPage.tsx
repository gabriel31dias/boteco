import type { Evento, Gravacao } from "@/features/admin/types";
import { duracao } from "@/features/admin/gravacoes/GravacoesPage";
import { Carregando, Erro, MiniCard, Panel, pillCls, StatusBadge } from "@/shared/components/admin";
import { api } from "@/shared/lib/api";
import { brl, dataHora } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  MonitorPlay,
  AlertTriangle, ArrowLeft, Bug, ChevronLeft, ChevronRight, Clock, Coins, Eye, EyeOff, Flag, Hand, LogOut, MessageSquareWarning,
  MousePointerClick, Pause, Play, PlayCircle, SkipBack, SkipForward, Target, Trophy, Users, Wifi, XCircle,
} from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { TelasDaPartida } from "./Telas";

// ------------------------------------------------------------------ cartas

const NAIPE: Record<string, [string, boolean]> = { c: ["♣", false], d: ["♦", true], h: ["♥", true], s: ["♠", false] };
const TRUCO_RANK = ["4", "5", "6", "7", "Q", "J", "K", "A", "2", "3"];
const TRUCO_NAIPE: [string, boolean][] = [["♦", true], ["♠", false], ["♥", true], ["♣", false]];

/** "9c", "Ad1" (buraco/cacheta: o dígito é o baralho), {r,s} do truco, {a,b} do dominó → texto e cor. */
function carta(v: unknown): { txt: string; vermelha: boolean } | null {
  if (typeof v === "string") {
    const m = /^([2-9TJQKA])([cdhs])\d?$/.exec(v);
    if (m) return { txt: `${m[1] === "T" ? "10" : m[1]}${NAIPE[m[2]][0]}`, vermelha: NAIPE[m[2]][1] };
    return null;
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const k = Object.keys(o);
    if (k.length === 2 && typeof o.r === "number" && typeof o.s === "number") {
      const [n, vermelha] = TRUCO_NAIPE[o.s] ?? ["?", false];
      return { txt: `${TRUCO_RANK[o.r] ?? "?"}${n}`, vermelha };
    }
    if (typeof o.id === "string" && typeof o.a === "number" && typeof o.b === "number") return { txt: `${o.a}|${o.b}`, vermelha: false };
  }
  return null;
}

const Carta = ({ c }: { c: { txt: string; vermelha: boolean } }) => (
  <span className={cn("inline-flex min-w-[30px] justify-center rounded-md border px-1.5 py-0.5 font-mono text-[13px] font-semibold shadow-sm bg-white dark:bg-zinc-100",
    c.vermelha ? "text-[#CC0854] border-[#CC0854]/30" : "text-zinc-900 border-zinc-300")}>{c.txt}</span>
);

/** Cartas em texto, pras frases da linha do tempo. */
const cartaTxt = (v: unknown): string => {
  if (Array.isArray(v)) return v.map(cartaTxt).join(" ");
  return carta(v)?.txt ?? (typeof v === "object" ? JSON.stringify(v) : String(v));
};

// ------------------------------------------------------------- valor genérico

/** Nome de quem está em cada assento e quantos são: os valores da mesa citam assento por número. */
const Mesa = createContext<{ nome: (a: number) => string; n: number }>({ nome: (a) => `Assento ${a + 1}`, n: 0 });

/** Listas com um valor por assento (ou por time, nas duplas): mostradas com o nome de cada um. */
const POR_ASSENTO = new Set(["fichas", "apostas", "investido", "ativos", "foldou", "saiu", "naMao", "maos", "hands", "cartas", "ganhos",
  "placar", "scores", "pontos", "pips", "ausencias", "pegouMorto", "jogos"]);
const CITA_ASSENTO = new Set(["vez", "botao", "relogioDe", "onzeDe", "posSb", "posBb", "carteador", "winner", "matchWinner", "vencedor", "comeca"]);

function Valor({ v, campo, nivel = 0 }: { v: unknown; campo?: string; nivel?: number }): ReactNode {
  const { nome, n } = useContext(Mesa);
  if (v == null) return <span className="text-muted-foreground">—</span>;
  if (typeof v === "boolean") return <span>{v ? "sim" : "não"}</span>;
  const c = carta(v);
  if (c) return <Carta c={c} />;
  if (typeof v === "number" && campo && CITA_ASSENTO.has(campo) && Number.isInteger(v) && v >= 0 && v < n) return <span className="font-medium">{nome(v)}</span>;
  if (campo === "lado" && (v === 1 || v === -1)) return <span>{v === 1 ? "brancas" : "pretas"}</span>;
  if (typeof v !== "object") return <span className="break-all">{String(v)}</span>;
  if (Array.isArray(v)) {
    if (!v.length) return <span className="text-muted-foreground">vazio</span>;
    // Um por assento (ou por time nas duplas, quando a lista tem 2 e a mesa 4).
    if (campo && POR_ASSENTO.has(campo) && (v.length === n || (v.length === 2 && n === 4))) {
      const rotulo = (i: number) => (v.length === n ? nome(i) : `Time ${i + 1}`);
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {v.map((x, i) => (
            <span key={i} className="inline-flex items-center gap-1.5"><span className="text-[11px] text-muted-foreground">{rotulo(i)}</span><Valor v={x} nivel={nivel + 1} /></span>
          ))}
        </div>
      );
    }
    if (v.every((x) => x == null || typeof x !== "object" || carta(x))) {
      return <span className="inline-flex flex-wrap items-center gap-1">{v.map((x, i) => <Valor key={i} v={x} nivel={nivel + 1} />)}</span>;
    }
    if (nivel > 1) return <code className="text-[11px] break-all">{JSON.stringify(v)}</code>;
    return (
      <div className="space-y-1">
        {v.map((x, i) => (
          <div key={i} className="flex gap-2"><span className="text-[11px] text-muted-foreground w-5 shrink-0">{i + 1}.</span><Valor v={x} nivel={nivel + 1} /></div>
        ))}
      </div>
    );
  }
  if (nivel > 1) return <code className="text-[11px] break-all">{JSON.stringify(v)}</code>;
  return (
    <div className="space-y-0.5">
      {Object.entries(v as Record<string, unknown>).map(([k, x]) => (
        <div key={k} className="flex gap-2 text-xs"><span className="text-muted-foreground shrink-0">{k}:</span><Valor v={x} campo={k} nivel={nivel + 1} /></div>
      ))}
    </div>
  );
}

/** Campos que só fazem barulho no player (relógio, listas de lances possíveis). Ficam no JSON bruto. */
const OCULTOS = new Set(["assento", "prazo", "tempo", "proximoNivelEm", "legais", "lances", "podeJogar", "eventos", "tamanho", "inicial", "tabuleiro"]);
const ROTULO: Record<string, string> = {
  mao: "Mão", minhas: "Cartas", minhaMao: "Jogo", board: "Mesa", mesa: "Mesa", placar: "Placar", vez: "Vez", fase: "Fase", pote: "Pote", potes: "Potes",
  fichas: "Fichas", apostas: "Apostas", investido: "Investido", vira: "Vira", manilha: "Manilha", lixo: "Lixo", monte: "Monte", jogos: "Jogos baixados",
  naMao: "Cartas na mão", corrente: "Corrente", pontas: "Pontas", rodada: "Rodada", resultado: "Resultado", fim: "Fim", comprada: "Comprada",
  valor: "Valor da mão", vazas: "Vazas", time: "Time", maoDoParceiro: "Mão do parceiro", pontos: "Pontos", colocacao: "Eliminados (ordem)",
  ativos: "Ativos", foldou: "Correu", saiu: "Saiu", maoNum: "Mão nº", nivel: "Nível", cartas: "Cartas mostradas", ganhos: "Ganhos", maos: "Mãos",
  botao: "Botão (dealer)", posSb: "Small blind", posBb: "Big blind", sb: "Valor do SB", bb: "Valor do BB", proximoNivel: "Próximo nível",
  jogadores: "Jogadores", duplas: "Duplas", alvo: "Joga até", ativosNaRodada: "Na rodada", naRodada: "Na rodada", carteador: "Carteador",
  precisaComprar: "Precisa comprar", pecas: "Peças", ultimo: "Último lance", empateEm: "Lances até o empate", lado: "Lado", mortos: "Mortos",
  pegouMorto: "Pegou o morto", lixoQtd: "Cartas no lixo", doLixo: "Pegou do lixo", semAumento: "Sem aumento", podeAumentar: "Pode aumentar",
  proximoValor: "Próximo valor", pedido: "Pedido de truco", naMaoDoOutro: "Cartas do adversário", comeca: "Começa", ultima: "Última",
};

// ------------------------------------------------------------------ mesas

const CORES_BOLA = ["#f8fafc", "#facc15", "#2563eb", "#dc2626", "#7c3aed", "#f97316", "#16a34a", "#7f1d1d", "#111827"];

/** Sinuca: as bolas como o atirador relatou depois da tacada (e a direção da tacada atual). */
function MesaSinuca({ bolas, tacada }: { bolas: { x: number; z: number; pocketed: boolean }[] | null; tacada: any }) {
  const W = 1.98, D = 0.99, R = 0.028575, B = 0.07;
  const cacapas = [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]].map(([sx, sz]) => [sx * W / 2, sz * D / 2]);
  return (
    <svg viewBox={`${-W / 2 - B} ${-D / 2 - B} ${W + 2 * B} ${D + 2 * B}`} className="w-full max-w-[640px] mx-auto rounded-xl" role="img" aria-label="Mesa de sinuca">
      <rect x={-W / 2 - B} y={-D / 2 - B} width={W + 2 * B} height={D + 2 * B} rx={0.05} fill="#5b3714" />
      <rect x={-W / 2} y={-D / 2} width={W} height={D} fill="#0f7a3d" />
      {cacapas.map(([x, z], i) => <circle key={i} cx={x} cy={z} r={0.045} fill="#0b0b0b" />)}
      {tacada?.cue && (
        <line x1={tacada.cue.x} y1={tacada.cue.z} x2={tacada.cue.x + Math.sin(tacada.angle) * 0.25 * (0.4 + tacada.power)} y2={tacada.cue.z + Math.cos(tacada.angle) * 0.25 * (0.4 + tacada.power)}
          stroke="#fde047" strokeWidth={0.008} strokeDasharray="0.02 0.012" />
      )}
      {bolas?.map((b, n) => !b.pocketed && (
        <g key={n}>
          {/* lisa: cheia; listrada (9–15): branca com o anel da cor */}
          {n > 8
            ? <circle cx={b.x} cy={b.z} r={R * 0.8} fill="#f8fafc" stroke={CORES_BOLA[n - 8]} strokeWidth={R * 0.4} />
            : <circle cx={b.x} cy={b.z} r={R} fill={CORES_BOLA[n]} stroke="#0006" strokeWidth={0.003} />}
          {n > 0 && <text x={b.x} y={b.z + 0.009} textAnchor="middle" fontSize={0.026} fontWeight={700} fill={n === 8 || n === 7 ? "#fff" : "#111"}>{n}</text>}
        </g>
      ))}
      {!bolas && <text x={0} y={0} textAnchor="middle" fontSize={0.06} fill="#fff9">posição inicial (antes da 1ª tacada)</text>}
    </svg>
  );
}

function MesaVelha({ board }: { board: (string | null)[] }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 w-48 mx-auto">
      {board.map((c, i) => (
        <div key={i} className={cn("aspect-square rounded-lg grid place-items-center text-3xl font-black bg-muted", c === "X" ? "text-[#9B5BF8]" : "text-[#F59E0B]")}>{c}</div>
      ))}
    </div>
  );
}

function MesaDamas({ tab, n, ultimo }: { tab: number[]; n: number; ultimo?: any }) {
  const marcadas = new Set<number>([ultimo?.from, ultimo?.to, ...(ultimo?.path ?? [])].filter((x) => typeof x === "number"));
  return (
    <div className="grid gap-0 w-72 mx-auto rounded-lg overflow-hidden border border-border" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
      {tab.map((p, i) => {
        const escura = (Math.floor(i / n) + (i % n)) % 2 === 1;
        return (
          <div key={i} className={cn("aspect-square grid place-items-center", escura ? "bg-[#7c4a21]" : "bg-[#f1d9b5]", marcadas.has(i) && "ring-2 ring-inset ring-yellow-300")}>
            {p !== 0 && (
              <span className={cn("w-[78%] h-[78%] rounded-full grid place-items-center text-[10px] font-bold shadow",
                p > 0 ? "bg-zinc-50 text-zinc-800 border border-zinc-300" : "bg-zinc-900 text-zinc-100 border border-black")}>{Math.abs(p) === 2 ? "♛" : ""}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** O que cada assento via: campos iguais pra todos uma vez só; o que muda (a mão) por jogador. */
function Estado({ visoes, ver, nome }: { visoes: Record<string, any>[]; ver: number | "todos"; nome: (a: number) => string }) {
  const lista = ver === "todos" || visoes.length === 1 ? visoes : [visoes[ver] ?? visoes[0]];
  const velha = Array.isArray(lista[0].board) && lista[0].board.length === 9 && lista[0].board.every((x: unknown) => x === null || x === "X" || x === "O");
  const chaves = [...new Set(lista.flatMap((v) => Object.keys(v)))].filter((k) => !OCULTOS.has(k) && !(velha && k === "board"));
  const iguais = chaves.filter((k) => lista.every((v) => JSON.stringify(v[k]) === JSON.stringify(lista[0][k])));
  const diferentes = chaves.filter((k) => !iguais.includes(k));
  const v0 = lista[0];

  return (
    <div className="space-y-4">
      {velha && <MesaVelha board={v0.board} />}
      {Array.isArray(v0.tabuleiro) && v0.tamanho && <MesaDamas tab={v0.tabuleiro} n={v0.tamanho} ultimo={v0.ultimo} />}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        {iguais.map((k) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground text-xs pt-0.5">{ROTULO[k] ?? k}</dt>
            <dd className="min-w-0"><Valor v={v0[k]} campo={k} /></dd>
          </div>
        ))}
      </dl>
      {diferentes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {lista.map((v, i) => (
            <div key={i} className="rounded-xl border border-border/60 p-3">
              <p className="mb-2 text-xs font-semibold text-[#9B5BF8]">Tela de {nome(typeof v.assento === "number" ? v.assento : i)}</p>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-sm">
                {diferentes.map((k) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground text-xs pt-0.5">{ROTULO[k] ?? k}</dt>
                    <dd className="min-w-0"><Valor v={v[k]} campo={k} /></dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------- linha do tempo

const ICONE: Record<string, ReactNode> = {
  inicio: <PlayCircle className="h-4 w-4" />, jogada: <MousePointerClick className="h-4 w-4" />, recusada: <XCircle className="h-4 w-4" />,
  relogio: <Clock className="h-4 w-4" />, tacada: <Target className="h-4 w-4" />, resolvido: <Eye className="h-4 w-4" />,
  relato: <Flag className="h-4 w-4" />, ausente: <EyeOff className="h-4 w-4" />, voltou: <Wifi className="h-4 w-4" />,
  saiu: <LogOut className="h-4 w-4" />, erro: <Bug className="h-4 w-4" />, fim: <Trophy className="h-4 w-4" />,
};

const SAIDA: Record<string, string> = { saiu: "saiu da partida", desconectou: "desconectou (caiu a conexão ou fechou o app)", ausencia: "ficou fora do app tempo demais" };
const MOTIVO_FIM: Record<string, string> = { placar: "placar", tempo: "tempo", empate: "empate", fichas: "fichas", abandono: "abandono", lances: "lances" };

const VERBO: Record<string, string> = {
  jogar: "jogou", comprar: "comprou", passar: "passou", fold: "correu (fold)", check: "mesa (check)", call: "pagou (call)", raise: "aumentou para",
  bet: "apostou", allin: "all-in", descartar: "descartou", baixar: "baixou o jogo", adicionar: "adicionou ao jogo", bater: "bateu", lixo: "pegou o lixo",
  aumentar: "pediu aumento (truco/seis/nove/doze)", responder: "respondeu ao pedido:", onze: "mão de onze:",
};
const LADO: Record<string, string> = { left: "na ponta esquerda", right: "na ponta direita" };

function acaoTxt(acao: any): string {
  if (!acao || typeof acao !== "object") return "jogada vazia";
  if (typeof acao.casa !== "undefined" && Object.keys(acao).length === 1) return `marcou a casa ${Number(acao.casa) + 1}`;
  if (typeof acao.indice !== "undefined" && Object.keys(acao).length === 1) return `fez o lance nº ${Number(acao.indice) + 1} da lista`;
  const { tipo, ...resto } = acao;
  const partes = Object.entries(resto).map(([k, v]) => {
    if (k === "id" && typeof v === "string" && /^\d-\d$/.test(v)) return `[${v.replace("-", "|")}]`;
    if (k === "side") return LADO[String(v)] ?? String(v);
    if (k === "valor" || k === "acao") return String(v);
    if (k === "indice") return `a carta nº ${Number(v) + 1} da mão`;
    if (k === "aceita") return v ? "jogou" : "correu";
    return `${k} ${cartaTxt(v)}`;
  });
  return [VERBO[tipo] ?? tipo ?? "jogada", ...partes].join(" ");
}

function descrever(e: Evento, nome: (a: number) => string, nomeId: (id: number) => string): string {
  const quem = e.assento != null && e.assento >= 0 ? nome(e.assento) : "Alguém fora da mesa";
  const d = e.dados ?? {};
  switch (e.tipo) {
    case "inicio": return `Partida começou · ${d.jogadores?.length ?? "?"} jogadores · entrada ${brl((d.aposta ?? 0) / 100)}`;
    case "jogada": {
      // Damas: a ação é o índice na lista de lances; o lance de verdade está no estado depois dela.
      const u = e.visoes?.[0]?.ultimo;
      if (u && typeof u.from === "number" && typeof u.to === "number") {
        const cap = u.captures?.length ? ` capturando ${u.captures.length}` : "";
        return `${quem}: moveu da casa ${u.from} para ${u.to}${cap}${u.promote ? " · virou dama" : ""}`;
      }
      return `${quem}: ${acaoTxt(d.acao)}`;
    }
    case "recusada":
      if (d.acao !== undefined) return `${quem}: servidor recusou (${acaoTxt(d.acao)})`;
      return `${quem}: servidor recusou o envio`;
    // Sem assento é o fim da pausa entre mãos/rodadas (pôquer, buraco, cacheta), não estouro de alguém.
    case "relogio": return e.assento != null ? `Tempo esgotado na vez de ${quem}` : "Pausa acabou: começa a próxima mão/rodada";
    case "tacada": return `${quem} tacou · força ${Math.round((d.power ?? 0) * 100)}% · ângulo ${Math.round(((d.angle ?? 0) * 180) / Math.PI)}°`;
    case "resolvido": {
      const s = d.result?.shot;
      const bolas = s?.pocketed?.length ? `encaçapou ${s.pocketed.join(", ")}` : "nenhuma bola caiu";
      return `Resultado da tacada de ${quem}: ${bolas}${s?.cueScratched ? " · branca caiu" : ""}${d.result?.foul ? ` · falta (${d.result.reason ?? "?"})` : ""}`;
    }
    case "relato": return `${quem} relatou: ${nome(d.winner)} venceu`;
    case "ausente": return `${quem} saiu da tela do app`;
    case "voltou": return `${quem} voltou pro app`;
    case "saiu": return `${quem} ${SAIDA[d.motivo] ?? d.motivo}${d.eliminado ? " · eliminado, a mesa seguiu" : ""}`;
    case "erro": return `Erro do servidor${d.evento ? ` em '${d.evento}'` : ""}: ${d.erro}`;
    case "fim":
      if (d.estorno) return "Interrompida: o servidor reiniciou · entradas devolvidas";
      if (d.wo) return `W.O.: ${nome(d.saiu)} ${SAIDA[d.motivo] ?? "saiu"} · ${d.vencedorId ? `${nomeId(d.vencedorId)} levou` : "estornada"}`;
      if (d.relatos) return d.resultado?.disputed ? "Contestada: cada lado disse um vencedor · estornada" : `Fim: ${nome(e.assento ?? 0)} venceu`;
      if (d.fim?.vencedor === null) return "Empate · entradas devolvidas";
      return `Fim: ${quem} venceu${d.fim?.motivo ? ` (${MOTIVO_FIM[d.fim.motivo] ?? d.fim.motivo})` : ""}`;
    default: return e.tipo;
  }
}

const relogio = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};

const VELOCIDADES = [1, 2, 4, 8];

// ------------------------------------------------------------------ página

export function GravacaoPage() {
  const { id } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["gravacao", id],
    queryFn: () => api<Gravacao>(`/admin/gravacoes/${id}`),
  });
  const [idx, setIdx] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [vel, setVel] = useState(2);
  const [ver, setVer] = useState<number | "todos">("todos");
  const [bruto, setBruto] = useState(false);
  const atual = useRef<HTMLLIElement>(null);

  const ev = data?.eventos ?? [];
  const p = data?.partida;
  const nome = (a: number) => p?.jogadores.find((j) => j.assento === a)?.nome ?? `Assento ${a + 1}`;
  const nomeId = (uid: number) => p?.jogadores.find((j) => j.id === uid)?.nome ?? `#${uid}`;
  const e = ev[idx];
  const t0 = ev[0]?.t ?? 0;

  // Toca no ritmo de verdade, acelerado; espera longa (jogador pensando) é encurtada.
  useEffect(() => {
    if (!tocando) return;
    if (idx >= ev.length - 1) { setTocando(false); return; }
    const gap = (ev[idx + 1].t - ev[idx].t) / vel;
    const h = setTimeout(() => setIdx((i) => i + 1), Math.min(2500, Math.max(120, gap)));
    return () => clearTimeout(h);
  }, [tocando, idx, vel, ev]);

  useEffect(() => { atual.current?.scrollIntoView({ block: "nearest" }); }, [idx]);

  useEffect(() => {
    const tecla = (k: KeyboardEvent) => {
      if ((k.target as HTMLElement)?.tagName === "INPUT") return;
      if (k.key === " ") { k.preventDefault(); setTocando((x) => !x); }
      if (k.key === "ArrowRight") { setTocando(false); setIdx((i) => Math.min(ev.length - 1, i + 1)); }
      if (k.key === "ArrowLeft") { setTocando(false); setIdx((i) => Math.max(0, i - 1)); }
    };
    addEventListener("keydown", tecla);
    return () => removeEventListener("keydown", tecla);
  }, [ev.length]);

  // O estado na tela é o do último passo que gravou visões (ou a última tacada resolvida, na sinuca).
  const visoes = useMemo(() => { for (let i = idx; i >= 0; i--) if (ev[i]?.visoes) return ev[i].visoes; return null; }, [idx, ev]);
  const sinuca = p?.jogo === "sinuca";
  const bolas = useMemo(() => { for (let i = idx; i >= 0; i--) if (ev[i]?.tipo === "resolvido") return ev[i].dados?.balls ?? null; return null; }, [idx, ev]);

  if (isLoading) return <Carregando h="h-80" />;
  if (error || !data || !p) return <div className="space-y-4"><Voltar /><Erro error={error} /></div>;

  const ir = (i: number) => { setTocando(false); setIdx(Math.max(0, Math.min(ev.length - 1, i))); };
  const total = ev.length ? ev[ev.length - 1].t - t0 : 0;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Voltar />
        <p className="text-xs text-muted-foreground">Espaço toca/pausa · ← → passo a passo</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniCard title={`Partida #${p.id}`} value={p.nomeJogo} icon={<PlayCircle className="h-5 w-5" />} hint={dataHora(p.criadoEm)} />
        <MiniCard title="Entrada / prêmio" value={`${brl(p.aposta)} / ${brl(p.premio)}`} icon={<Coins className="h-5 w-5" />} hint={`taxa ${brl(p.taxa)}`} />
        <MiniCard title="Duração" value={duracao(total)} icon={<Clock className="h-5 w-5" />} hint={`${ev.length} eventos gravados`} />
        <div className="dark-card rounded-2xl p-5 border border-border/30 flex flex-col justify-center gap-2">
          <StatusBadge status={p.status} />
          <div className="flex flex-wrap gap-1.5">
            {p.jogadores.map((j) => (
              <span key={j.id} title={j.username} className={cn("inline-flex items-center gap-1 text-xs", j.venceu ? "font-semibold text-[#45BC56]" : "text-muted-foreground")}>
                {j.venceu && <Trophy className="h-3 w-3" />}{j.nome}{j.time != null && <span className="text-[10px] opacity-70">(time {j.time + 1})</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      {data.alertas.length > 0 && (
        <section className="rounded-2xl border border-[#CC0854]/30 bg-[rgba(204,8,84,0.06)] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#CC0854]"><AlertTriangle className="h-4 w-4" />{data.alertas.length} alerta{data.alertas.length > 1 ? "s" : ""} nesta partida</p>
          <ul className="space-y-1">
            {data.alertas.map((a, i) => (
              <li key={i}>
                <button disabled={a.seq == null} onClick={() => a.seq != null && ir(ev.findIndex((x) => x.seq === a.seq))}
                  className="text-left text-sm text-[#54052D] dark:text-foreground hover:underline disabled:no-underline disabled:cursor-default">
                  {a.t != null && <span className="font-mono text-xs text-muted-foreground mr-2">{relogio(a.t - t0)}</span>}
                  {a.assento != null && a.assento >= 0 && <span className="font-medium">{nome(a.assento)}: </span>}{a.texto}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Panel title={p.status === "playing" ? "Tela dos jogadores · ao vivo" : "Tela dos jogadores"} icon={<MonitorPlay className="h-5 w-5" />}>
        <TelasDaPartida id={p.id} />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Mesa" icon={<Users className="h-5 w-5" />}
          actions={!sinuca && visoes && visoes.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {(["todos", ...p.jogadores.map((j) => j.assento)] as (number | "todos")[]).map((a) => (
                <button key={a} onClick={() => setVer(a)} className={cn(pillCls, "h-8 text-xs", ver === a && "!border-primary !text-primary")}>
                  {a === "todos" ? "Todos" : `Tela de ${nome(a)}`}
                </button>
              ))}
            </div>
          )}>
          {/* controles */}
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => ir(0)} className={pillCls} aria-label="Início"><SkipBack className="h-4 w-4" /></button>
              <button onClick={() => ir(idx - 1)} className={pillCls} aria-label="Voltar um passo"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => { if (idx >= ev.length - 1) setIdx(0); setTocando(!tocando); }}
                className={cn(pillCls, "inline-flex items-center !bg-primary !text-white !border-primary px-5")}>
                {tocando ? <><Pause className="h-4 w-4" />Pausar</> : <><Play className="h-4 w-4" />Tocar</>}
              </button>
              <button onClick={() => ir(idx + 1)} className={pillCls} aria-label="Avançar um passo"><ChevronRight className="h-4 w-4" /></button>
              <button onClick={() => ir(ev.length - 1)} className={pillCls} aria-label="Fim"><SkipForward className="h-4 w-4" /></button>
              <div className="flex gap-1 ml-auto">
                {VELOCIDADES.map((v) => (
                  <button key={v} onClick={() => setVel(v)} className={cn(pillCls, "h-8 text-xs", vel === v && "!border-primary !text-primary")}>{v}×</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted-foreground w-14">{relogio((e?.t ?? t0) - t0)}</span>
              <input type="range" min={0} max={Math.max(0, ev.length - 1)} value={idx} onChange={(x) => ir(Number(x.target.value))}
                className="flex-1 accent-[#9B5BF8]" aria-label="Posição na gravação" />
              <span className="font-mono text-xs text-muted-foreground w-14 text-right">{relogio(total)}</span>
            </div>
            {e && (
              <div className={cn("rounded-xl px-4 py-3 text-sm flex items-start gap-2", e.alerta ? "bg-[rgba(204,8,84,0.08)] text-[#CC0854]" : "bg-muted/60")}>
                <span className="mt-0.5">{ICONE[e.tipo]}</span>
                <div>
                  <p className="font-medium">{descrever(e, nome, nomeId)}</p>
                  {e.alerta && <p className="text-xs mt-0.5 flex items-center gap-1"><MessageSquareWarning className="h-3 w-3" />{e.alerta}</p>}
                </div>
              </div>
            )}
          </div>

          <Mesa.Provider value={{ nome, n: p.jogadores.length }}>
          {sinuca
            ? <MesaSinuca bolas={bolas} tacada={e?.tipo === "tacada" ? e.dados : null} />
            : visoes ? <Estado visoes={visoes} ver={ver} nome={nome} />
              : <p className="py-10 text-center text-sm text-muted-foreground">Sem estado da mesa neste ponto.</p>}
          </Mesa.Provider>

          <div className="mt-5">
            <button onClick={() => setBruto(!bruto)} className="text-xs text-primary hover:underline">{bruto ? "Esconder" : "Ver"} dados brutos deste passo</button>
            {bruto && e && (
              <pre className="mt-2 max-h-[420px] overflow-auto rounded-xl bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-200">
                {JSON.stringify({ ...e, visoes: e.visoes ?? "(sem mudança de estado neste passo)" }, null, 2)}
              </pre>
            )}
          </div>
        </Panel>

        <Panel title="Linha do tempo" icon={<Hand className="h-5 w-5" />} className="xl:max-h-[calc(100vh-140px)] xl:sticky xl:top-6 flex flex-col">
          <ol className="-mx-2 overflow-y-auto max-h-[60vh] xl:max-h-none xl:flex-1 space-y-0.5">
            {ev.map((x, i) => (
              <li key={x.seq} ref={i === idx ? atual : undefined}>
                <button onClick={() => ir(i)} className={cn("w-full text-left rounded-lg px-2 py-1.5 flex gap-2 text-xs transition-colors",
                  i === idx ? "bg-primary/15 text-foreground" : "hover:bg-muted", i > idx && "opacity-55",
                  x.alerta && "text-[#CC0854]", x.tipo === "recusada" && !x.alerta && "text-[#F59E0B]")}>
                  <span className="font-mono text-muted-foreground shrink-0 w-11">{relogio(x.t - t0)}</span>
                  <span className="shrink-0 mt-px">{x.alerta ? <AlertTriangle className="h-3.5 w-3.5" /> : ICONE[x.tipo]}</span>
                  <span className="min-w-0">{descrever(x, nome, nomeId)}</span>
                </button>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}

const Voltar = () => (
  <Link to="/gravacoes" className={cn(pillCls, "inline-flex items-center text-primary")}><ArrowLeft className="h-4 w-4" />Gravações</Link>
);
