import { useJogos, type Dashboard, type Periodo } from "@/features/admin/types";
import { DateFilter } from "@/shared/components/DateFilter";
import { Erro, MiniCard, Panel, periodoPadrao, pillCls, StatCard, StatusBadge, Table } from "@/shared/components/admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, num, pct } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, Banknote, BarChart3, Clock, Coins, Gamepad2, Gift, HandCoins, Landmark, Loader2, Percent, Radio, Receipt, RefreshCw,
  RotateCcw, ShieldCheck, Swords, Trophy, TrendingUp, Users, Vault, Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const SERIES = [
  { key: "depositos", label: "Depósitos", color: "#E91E63" },
  { key: "taxa", label: "Taxa da casa", color: "#3B82F6" },
  { key: "lucroLiquido", label: "Lucro líquido (taxa − custos)", color: "#9B5BF8" },
] as const;

/** card clicável que leva pra outra tela */
const Linkado = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="block rounded-2xl transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{children}</Link>
);

export function DashboardPage() {
  const [periodo, setPeriodo] = useState<Periodo>(periodoPadrao);
  const [jogo, setJogo] = useState("todos");
  const jogos = useJogos();
  const porJogo = jogo !== "todos";
  const filtro = { de: periodo.startDate, ate: periodo.endDate, jogo: porJogo ? jogo : undefined };
  const { data: d, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ["dashboard", filtro],
    queryFn: () => api<Dashboard>(`/admin/dashboard${qs(filtro)}`),
  });

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* filtros valem pra tela toda */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select value={jogo} onValueChange={setJogo}>
          <SelectTrigger className={cn(pillCls, "w-[220px]")} aria-label="Filtrar por jogo">
            <Gamepad2 className="h-4 w-4 text-primary shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os jogos</SelectItem>
            {Object.entries(jogos).map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <DateFilter onDateRangeChange={setPeriodo} />
        <button onClick={() => refetch()} disabled={isRefetching} aria-label="Atualizar"
          className="w-10 h-10 rounded-lg border border-border bg-white dark:bg-transparent hover:bg-muted flex items-center justify-center text-[#9B5BF8] transition-colors">
          <RefreshCw size={18} className={isRefetching ? "animate-spin" : ""} />
        </button>
      </div>

      <Erro error={error} />

      {!!d?.alertas && (
        <Link to="/moderacao" className="flex items-center gap-3 rounded-2xl border border-[#CC0854]/40 bg-[#CC0854]/10 p-4 text-sm text-[#CC0854] hover:bg-[#CC0854]/15">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span><b>{num(d.alertas)} {d.alertas === 1 ? "problema" : "problemas"} na conferência do dinheiro.</b> Abra a moderação pra ver as contas.</span>
        </Link>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-4">
        <StatCard loading={isLoading} title="Depósitos pagos" value={brl(d?.depositos.valor)} icon={<Wallet className="h-6 w-6" />} up={(d?.depositos.valor ?? 0) > 0}
          hint={d && `${num(d.depositos.quantidade)} depósitos${porJogo ? " · todos os jogos" : ""}`} />
        <StatCard loading={isLoading} title={porJogo ? `Taxa · ${jogos[jogo] ?? jogo}` : "Taxa da casa"} value={brl(d?.partidas.taxa)} icon={<Percent className="h-6 w-6" />} up={(d?.partidas.taxa ?? 0) > 0}
          hint={d && `${num(d.partidas.quantidade)} partidas pagas · apostado ${brl(d.partidas.apostado)}`} />
        <StatCard loading={isLoading} title="Lucro líquido" value={brl(d?.lucroLiquido)} icon={<TrendingUp className="h-6 w-6" />} up={(d?.lucroLiquido ?? 0) >= 0}
          hint={d && (porJogo ? "taxa de todos os jogos − custos" : `taxa ${brl(d.partidas.taxa)} − custos ${brl(d.custos.total)}`)} />
        <StatCard loading={isLoading} title="Caixa" value={brl(d?.caixa)} icon={<Landmark className="h-6 w-6" />} up={(d?.caixa ?? 0) >= 0}
          hint={d && `depósitos − saques aprovados (${brl(d.saques.aprovados.valor)})`} />
      </div>

      <Grafico d={d} loading={isLoading} />

      <Bloco titulo="Depósitos (Pix)">
        <MiniCard title="Quantidade" value={num(d?.depositos.quantidade)} icon={<Receipt className="h-5 w-5" />} />
        <MiniCard title="Ticket médio" value={brl(d?.depositos.ticketMedio)} icon={<Coins className="h-5 w-5" />} />
        <MiniCard title="Clientes que depositaram" value={num(d?.depositos.clientes)} icon={<Users className="h-5 w-5" />} />
        <MiniCard title="Conversão do Pix" value={pct(d?.depositos.conversao)} icon={<Percent className="h-5 w-5" />} hint="Pix gerados que foram pagos" />
        <Linkado to="/depositos">
          <MiniCard title="Pix pendentes" value={brl(d?.depositos.pendentes.valor)} icon={<Clock className="h-5 w-5" />} hint={`${num(d?.depositos.pendentes.quantidade)} aguardando`} />
        </Linkado>
      </Bloco>

      <Bloco titulo={porJogo ? `Partidas · ${jogos[jogo] ?? jogo}` : "Partidas"}>
        <Linkado to="/partidas">
          <MiniCard title="Partidas pagas" value={num(d?.partidas.quantidade)} icon={<Swords className="h-5 w-5" />} />
        </Linkado>
        <MiniCard title="Total apostado" value={brl(d?.partidas.apostado)} icon={<Coins className="h-5 w-5" />} hint="entradas das partidas pagas" />
        <MiniCard title="Prêmios pagos" value={brl(d?.partidas.premios)} icon={<Trophy className="h-5 w-5" />} hint="o que voltou pros vencedores" />
        <MiniCard title="Jogadores" value={num(d?.partidas.jogadores)} icon={<Users className="h-5 w-5" />} hint="jogaram valendo no período" />
        <MiniCard title="Estornadas" value={num(d?.partidas.estornadas)} icon={<RotateCcw className="h-5 w-5" />} hint="entrada devolvida, sem taxa" />
      </Bloco>

      <Bloco titulo="Custos (o que a casa devolveu)">
        <Linkado to="/bonus">
          <MiniCard title="Bônus" value={brl(d?.custos.bonus)} icon={<Gift className="h-5 w-5" />} hint="cadastro, links e manuais" />
        </Linkado>
        <MiniCard title="Conversão de pontos" value={brl(d?.custos.conversao)} icon={<HandCoins className="h-5 w-5" />} hint="pontos virando saldo" />
        <Linkado to="/indicacoes">
          <MiniCard title="Indicações" value={brl(d?.custos.indicacoes)} icon={<Users className="h-5 w-5" />} hint="prêmios e % da taxa" />
        </Linkado>
        <Linkado to="/influencers">
          <MiniCard title="Influencers" value={brl(d?.custos.influencers)} icon={<Radio className="h-5 w-5" />} hint="comissão sobre a taxa" />
        </Linkado>
        <MiniCard title="Total de custos" value={brl(d?.custos.total)} icon={<TrendingUp className="h-5 w-5 rotate-180" />} />
      </Bloco>

      <Bloco titulo="Saques e saldos">
        <Linkado to="/saques">
          <MiniCard title="Saques aprovados" value={brl(d?.saques.aprovados.valor)} icon={<Banknote className="h-5 w-5" />} hint={`${num(d?.saques.aprovados.quantidade)} pagos no período`} />
        </Linkado>
        <Linkado to="/saques">
          <MiniCard title="Saques pendentes" value={brl(d?.saques.pendentes.valor)} icon={<Clock className="h-5 w-5" />} hint={`${num(d?.saques.pendentes.quantidade)} esperando o Pix`} />
        </Linkado>
        <MiniCard title="Saldo dos jogadores" value={brl(d?.saldoJogadores.saldo)} icon={<Vault className="h-5 w-5" />}
          hint={d && `bônus ${brl(d.saldoJogadores.bonus)} · travado ${brl(d.saldoJogadores.travado)}`} />
        <Linkado to="/ao-vivo">
          <MiniCard title="Jogando agora" value={num(d?.jogandoAgora)} icon={<Radio className="h-5 w-5" />} hint="partidas em andamento" />
        </Linkado>
        <Linkado to="/moderacao">
          <div className={cn("rounded-2xl", !!d?.alertas && "ring-2 ring-[#CC0854]/60")}>
            <MiniCard title="Alertas do dinheiro" value={num(d?.alertas)} icon={d?.alertas ? <AlertTriangle className="h-5 w-5 text-[#CC0854]" /> : <ShieldCheck className="h-5 w-5" />}
              hint={d?.alertas ? "confira na moderação" : "tudo batendo"} />
          </div>
        </Linkado>
      </Bloco>

      <Panel title="Taxa por jogo" icon={<Gamepad2 className="h-5 w-5" />}>
        <Table head={["Jogo", "Partidas", "Jogadores", "Apostado", "Prêmios", "Taxa da casa"]} empty={d && d.porJogo.length === 0 ? "Nenhuma partida paga no período." : false}>
          {d?.porJogo.map((j) => (
            <tr key={j.jogo}>
              <td className="font-medium">{j.nome || jogos[j.jogo] || j.jogo}</td>
              <td>{num(j.partidas)}</td>
              <td>{num(j.jogadores)}</td>
              <td>{brl(j.apostado)}</td>
              <td>{brl(j.premios)}</td>
              <td className={cn("font-semibold", j.taxa > 0 && "!text-[#45BC56]")}>{brl(j.taxa)}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title="Últimos depósitos" icon={<Wallet className="h-5 w-5" />} actions={<Link to="/depositos" className="text-sm font-semibold text-[#9B5BF8] hover:underline">Ver todos</Link>}>
        <Table head={["Jogador", "E-mail", "Valor", "Status", "Data"]} empty={d && d.ultimosDepositos.length === 0 ? "Nenhum depósito ainda." : false}>
          {d?.ultimosDepositos.map((v) => (
            <tr key={v.id}>
              <td className="font-medium">{v.nome}</td>
              <td className="!text-muted-foreground">{v.email}</td>
              <td className="font-semibold">{brl(v.valor)}</td>
              <td><StatusBadge status={v.status} /></td>
              <td className="!text-muted-foreground">{dataHora(v.criadoEm)}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">{children}</div>
    </section>
  );
}

function Grafico({ d, loading }: { d?: Dashboard; loading: boolean }) {
  const vazio = !d || d.serie.every((s) => !s.depositos && !s.taxa && !s.lucroLiquido);
  return (
    <Panel title={d?.periodo.granularidade === "hora" ? "Depósitos e taxa por hora" : "Depósitos e taxa por dia"} icon={<BarChart3 className="h-5 w-5" />}
      actions={SERIES.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground"><i className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}</span>
      ))}>
      {loading ? (
        <div className="h-[240px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="h-[240px] relative">
          {vazio && (
            <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <div className="bg-white/80 dark:bg-card/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-[rgba(84,5,45,0.08)]">
                <span className="text-[#54052D]/60 dark:text-muted-foreground text-xs font-medium">Nenhum depósito ou partida paga no período</span>
              </div>
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={d?.serie ?? []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis dataKey="rotulo" stroke="#8B7A7A" fontSize={10} tickLine={false} axisLine={false} minTickGap={8} tick={{ fill: "#8B7A7A" }} />
              <YAxis stroke="#8B7A7A" fontSize={10} tickLine={false} axisLine={false} width={56} tick={{ fill: "#8B7A7A" }} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR")}k` : String(v))} />
              <Tooltip
                cursor={{ stroke: "#9B5BF8", strokeWidth: 1, strokeDasharray: "4 4" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="bg-white dark:bg-card border border-[rgba(84,5,45,0.08)] dark:border-border rounded-2xl px-3 py-2 text-[11px] space-y-1">
                      <div className="text-[rgba(84,5,45,0.4)] dark:text-muted-foreground">{label}</div>
                      {payload.map((p) => (
                        <div key={p.dataKey as string} className="flex items-center gap-2">
                          <i className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                          <span className="text-[rgba(84,5,45,0.6)] dark:text-muted-foreground">{SERIES.find((s) => s.key === p.dataKey)?.label}</span>
                          <b className="ml-auto pl-3 text-[#54052D] dark:text-foreground font-medium">{brl(p.value as number)}</b>
                        </div>
                      ))}
                    </div>
                  ) : null
                }
              />
              {SERIES.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} fill={`url(#g-${s.key})`} dot={false} activeDot={{ r: 4, fill: s.color, stroke: "white", strokeWidth: 2 }} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
