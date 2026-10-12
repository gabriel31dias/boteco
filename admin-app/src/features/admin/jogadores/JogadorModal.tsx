import { SALAS, TIPOS_BONUS, useJogos, type Deposito, type Qtd, type TipoBonus } from "@/features/admin/types";
import { fieldCls, Pagination, StatusBadge, Table } from "@/shared/components/admin";
import { api, post, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Coins, Gift, Handshake, Loader2, MinusCircle, Percent, ShieldCheck, Swords, Trophy, Wallet, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

type Ficha = {
  conta: { id: number; nome: string; username: string; email: string; verificado: boolean; criadoEm: number; saldo: number; bonus: number; travado: number; pontos: number; nivel: number; avatarUrl: string | null };
  origem: { indicadoPor: { id: number; nome: string } | null; influencer: { id: number; nome: string; codigo: string } | null };
  depositos: { pagos: Qtd; pendentes: Qtd; primeiroEm: number | null; ultimoEm: number | null };
  saques: { aprovados: Qtd; pendentes: Qtd; cancelados: Qtd };
  partidas: {
    quantidade: number; vitorias: number; apostado: number; ganho: number; resultado: number; taxaGerada: number;
    porJogo: { jogo: string; nome: string; partidas: number; vitorias: number; apostado: number; ganho: number; resultado: number }[];
  };
  bonus: { quantidade: number; valor: number; porTipo: Partial<Record<TipoBonus, Qtd>> };
  indicacoes: { codigo: string | null; indicados: number; ganho: number };
  bloqueio: { em: number; por: string | null; motivo: string | null } | null;
};

type Aba = "partidas" | "depositos" | "saques" | "bonus" | "transacoes" | "indicados";
const ABAS: { k: Aba; label: string }[] = [
  { k: "partidas", label: "Partidas" },
  { k: "depositos", label: "Depósitos" },
  { k: "saques", label: "Saques" },
  { k: "bonus", label: "Bônus" },
  { k: "transacoes", label: "Extrato" },
  { k: "indicados", label: "Indicados" },
];

type ItemPartida = { id: number; jogo: string; sala: string; aposta: number; premio: number; venceu: boolean; status: string; adversarios: string | string[] | { nome: string }[]; criadoEm: number };
type ItemSaque = { id: number; valor: number; chavePix: string; status: string; motivo: string | null; criadoEm: number; decididoEm: number | null };
type ItemBonus = { id: number; tipo: string; valor: number; motivo: string | null; criadoPor: string | null; criadoEm: number };
type ItemTransacao = { id: number; tipo: string; titulo: string; valor: number; criadoEm: number };
type ItemIndicado = { id: number; nome: string; email: string; status: string; depositou: boolean; partidas: number; criadoEm: number };
type Historico = { itens: unknown[]; total: number; pagina: number; porPagina: number };

/** adversarios pode vir como texto, lista de nomes ou lista de jogadores */
const nomes = (a: ItemPartida["adversarios"]) =>
  Array.isArray(a) ? a.map((x) => (typeof x === "string" ? x : x?.nome)).filter(Boolean).join(", ") : a || "—";

/** ficha completa do jogador: conta, origem, dinheiro, partidas, ações e os históricos paginados */
export function JogadorModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [aba, setAba] = useState<Aba>("partidas");
  const [pagina, setPagina] = useState(1);
  const [darBonus, setDarBonus] = useState(false);
  const [remover, setRemover] = useState(false);
  const [bloquear, setBloquear] = useState(false);
  const porPagina = 10;
  const url = `/admin/jogadores/${id}`;

  useEffect(() => setPagina(1), [aba]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !darBonus && !remover && !bloquear && onClose(); // com um diálogo aberto, o Esc fecha só ele
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, darBonus, remover, bloquear]);

  const ficha = useQuery({ queryKey: ["jogador-ficha", id], queryFn: () => api<Ficha>(url), refetchInterval: 30_000 });
  const hist = useQuery({
    queryKey: ["jogador-ficha", id, aba, pagina],
    queryFn: () => api<Historico>(`${url}/historico${qs({ tipo: aba, pagina, porPagina })}`),
    placeholderData: keepPreviousData,
  });
  const f = ficha.data;
  const nome = f?.conta.nome ?? "Jogador";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-5xl max-h-[94vh] sm:max-h-[90vh] overflow-hidden rounded-2xl bg-background border border-border shadow-2xl flex flex-col">
        <div className="p-4 sm:p-5 border-b border-border flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-[#54052D] dark:text-foreground truncate flex items-center gap-2">
              <span className="truncate">{nome}</span>
              {f?.bloqueio && <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#CC0854] text-white text-xs font-semibold px-2.5 py-0.5"><Ban className="h-3 w-3" />bloqueado</span>}
            </h2>
            <p className="text-sm text-muted-foreground truncate">{f ? `${f.conta.username ? `@${f.conta.username.replace(/^@/, "")} · ` : ""}${f.conta.email}` : `#${id}`}</p>
          </div>
          <button onClick={onClose} className="sm:order-last shrink-0 rounded-full p-2 hover:bg-muted" aria-label="Fechar"><X className="h-5 w-5" /></button>
          <div className="order-last sm:order-none flex w-full sm:w-auto flex-wrap items-center gap-2">
            <button onClick={() => setDarBonus(true)} disabled={!f} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold disabled:opacity-50">
              <Gift className="h-4 w-4" />Dar bônus
            </button>
            <button onClick={() => setRemover(true)} disabled={!f} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#CC0854]/10 text-[#CC0854] hover:bg-[#CC0854]/20 text-sm font-semibold disabled:opacity-50">
              <MinusCircle className="h-4 w-4" />Remover saldo
            </button>
            {f && (
              <button onClick={() => setBloquear(true)} className={cn("inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-semibold", f.bloqueio ? "bg-[#14cd5e]/10 text-[#0f9d48] hover:bg-[#14cd5e]/20" : "bg-[#CC0854] hover:bg-[#B00748] text-white")}>
                {f.bloqueio ? <><ShieldCheck className="h-4 w-4" />Desbloquear</> : <><Ban className="h-4 w-4" />Bloquear</>}
              </button>
            )}
          </div>
        </div>
        {f?.bloqueio && (
          <div className="px-5 py-3 border-b border-border bg-[#CC0854]/10 text-sm text-[#CC0854]">
            Conta bloqueada em {dataHora(f.bloqueio.em)}{f.bloqueio.por && ` por ${f.bloqueio.por}`}{f.bloqueio.motivo && ` · motivo: ${f.bloqueio.motivo}`}. Não entra mais no app.
          </div>
        )}

        <div className="p-4 sm:p-5 overflow-auto space-y-5">
          {ficha.isLoading && <div className="h-40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
          {ficha.error && <p className="text-sm text-destructive">{(ficha.error as Error).message}</p>}
          {f && <Resumo f={f} />}

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2" role="tablist">
              {ABAS.map((a) => (
                <button key={a.k} role="tab" aria-selected={aba === a.k} onClick={() => setAba(a.k)}
                  className={cn("h-8 px-4 rounded-full text-sm border transition-colors", aba === a.k ? "bg-[#9B5BF8] border-[#9B5BF8] text-white font-semibold" : "border-border text-foreground/80 hover:bg-muted")}>
                  {a.label}
                </button>
              ))}
              {hist.isFetching && !hist.isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            </div>
            {hist.error && <p className="text-sm text-destructive">{(hist.error as Error).message}</p>}
            {hist.isLoading ? (
              <div className="h-32 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : (
              <HistoricoTabela aba={aba} itens={hist.data?.itens ?? []} />
            )}
            <Pagination currentPage={pagina} totalPages={hist.data ? Math.ceil(hist.data.total / porPagina) : 0} onPageChange={setPagina} />
          </div>
        </div>
      </div>
      <DarBonusDialog id={id} nome={nome} aberto={darBonus} onClose={() => setDarBonus(false)} onDado={() => setAba("bonus")} />
      <BloqueioDialog id={id} nome={nome} bloqueado={!!f?.bloqueio} aberto={bloquear} onClose={() => setBloquear(false)} />
      <RemoverSaldoDialog id={id} nome={nome} saldo={f?.conta.saldo} bonus={f?.conta.bonus} aberto={remover} onClose={() => setRemover(false)} onFeito={() => setAba("transacoes")} />
    </div>
  );
}

function Resumo({ f }: { f: Ficha }) {
  const jogos = useJogos();
  const porTipo = Object.entries(f.bonus.porTipo ?? {}).filter(([, v]) => v && v.quantidade > 0);
  return (
    <>
      <Secao titulo="Conta">
        <Campo label="Nome" valor={f.conta.nome} />
        <Campo label="E-mail" valor={f.conta.email} extra={f.conta.verificado ? "verificado" : "não verificado"} />
        <Campo label="Cadastro" valor={dataHora(f.conta.criadoEm)} extra={`nível ${num(f.conta.nivel)} · ${num(f.conta.pontos)} pontos`} />
        <Campo label="Veio por" valor={
          [f.origem.indicadoPor && `indicação de ${f.origem.indicadoPor.nome}`, f.origem.influencer && `influencer ${f.origem.influencer.nome} (${f.origem.influencer.codigo})`].filter(Boolean).join(" · ") || "acesso direto"
        } />
        <Campo label="Saldo" valor={<b>{brl(f.conta.saldo)}</b>} extra="sacável" />
        <Campo label="Bônus" valor={brl(f.conta.bonus)} extra="só pra jogar, não saca" />
        <Campo label="Travado" valor={brl(f.conta.travado)} extra="preso em partidas em andamento" />
        <Campo label="Código de indicação" valor={f.indicacoes.codigo} extra={f.indicacoes.indicados ? `${num(f.indicacoes.indicados)} indicados · ${brl(f.indicacoes.ganho)} ganhos` : undefined} />
      </Secao>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Cartao icon={<Wallet className="h-4 w-4" />} titulo="Depositado" valor={brl(f.depositos.pagos.valor)}
          dica={`${num(f.depositos.pagos.quantidade)} pagos${f.depositos.pendentes.quantidade ? ` · ${num(f.depositos.pendentes.quantidade)} pendentes` : ""}`} />
        <Cartao icon={<Wallet className="h-4 w-4" />} titulo="Sacado" valor={brl(f.saques.aprovados.valor)}
          dica={`${num(f.saques.aprovados.quantidade)} aprovados${f.saques.pendentes.quantidade ? ` · ${brl(f.saques.pendentes.valor)} pendente` : ""}${f.saques.cancelados.quantidade ? ` · ${num(f.saques.cancelados.quantidade)} cancelados` : ""}`} />
        <Cartao icon={<Swords className="h-4 w-4" />} titulo="Partidas" valor={num(f.partidas.quantidade)}
          dica={`${num(f.partidas.vitorias)} vitórias · apostou ${brl(f.partidas.apostado)}`} />
        <Cartao icon={<Trophy className="h-4 w-4" />} titulo="Resultado nas partidas" valor={brl(f.partidas.resultado)} destaque={f.partidas.resultado > 0 ? "verde" : f.partidas.resultado < 0 ? "vermelho" : undefined}
          dica={`ganhou ${brl(f.partidas.ganho)} em prêmios`} />
        <Cartao icon={<Percent className="h-4 w-4" />} titulo="Taxa gerada" valor={brl(f.partidas.taxaGerada)} dica="o que a casa ficou das partidas dele" />
        <Cartao icon={<Gift className="h-4 w-4" />} titulo="Bônus recebidos" valor={brl(f.bonus.valor)}
          dica={porTipo.length ? porTipo.map(([t, v]) => `${TIPOS_BONUS[t as TipoBonus] ?? t} ${brl(v!.valor)}`).join(" · ") : `${num(f.bonus.quantidade)} bônus`} />
        <Cartao icon={<Handshake className="h-4 w-4" />} titulo="Ganho com indicações" valor={brl(f.indicacoes.ganho)} dica={`${num(f.indicacoes.indicados)} amigos indicados`} />
        <Cartao icon={<Coins className="h-4 w-4" />} titulo="Depositado − sacado" valor={brl(f.depositos.pagos.valor - f.saques.aprovados.valor)}
          dica={f.depositos.primeiroEm ? `1º depósito ${dataHora(f.depositos.primeiroEm).split(" ")[0]}` : "nunca depositou"} />
      </div>

      {f.partidas.porJogo.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#54052D] dark:text-foreground mb-1">Por jogo</h3>
          <Table head={["Jogo", "Partidas", "Vitórias", "Apostado", "Ganho", "Resultado"]}>
            {f.partidas.porJogo.map((g) => (
              <tr key={g.jogo}>
                <td className="font-medium">{g.nome || jogos[g.jogo] || g.jogo}</td>
                <td className="tabular-nums">{num(g.partidas)}</td>
                <td className="tabular-nums">{num(g.vitorias)}</td>
                <td className="tabular-nums">{brl(g.apostado)}</td>
                <td className="tabular-nums">{brl(g.ganho)}</td>
                <td className={cn("tabular-nums font-semibold", g.resultado > 0 && "!text-[#45BC56]", g.resultado < 0 && "!text-[#CC0854]")}>{brl(g.resultado)}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </>
  );
}

const invalidarJogador = (qc: ReturnType<typeof useQueryClient>, id: number) => {
  qc.invalidateQueries({ queryKey: ["jogador-ficha", id] });
  qc.invalidateQueries({ queryKey: ["jogadores"] });
};

/** o mesmo "Dar bônus" da tela Bônus, direto na conta do jogador */
function DarBonusDialog({ id, nome, aberto, onClose, onDado }: { id: number; nome: string; aberto: boolean; onClose: () => void; onDado: () => void }) {
  const qc = useQueryClient();
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const n = Number(valor.replace(",", "."));
  const dar = useMutation({
    mutationFn: () => post(`/admin/jogadores/${id}/bonus`, { valor: n, motivo: motivo.trim() }),
    onSuccess: () => {
      toast.success(`${brl(n)} de bônus pra ${nome}`, { description: "Já está na carteira de bônus dele (não é sacável)." });
      setValor(""); setMotivo("");
      onClose(); onDado();
      invalidarJogador(qc, id);
      qc.invalidateQueries({ queryKey: ["bonus"] });
    },
    onError: (e) => toast.error("Não deu pra dar o bônus", { description: (e as Error).message }),
  });

  return (
    <AlertDialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Dar bônus pra {nome}</AlertDialogTitle>
          <AlertDialogDescription>O valor entra na hora no <b>bônus</b> do jogador: serve pra jogar, mas não dá pra sacar. Entra nos custos do dashboard. Máximo R$ 10.000.</AlertDialogDescription>
        </AlertDialogHeader>
        <form id="form-bonus-jogador" className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (n > 0 && motivo.trim().length >= 3) dar.mutate(); }}>
          <ValorInput valor={valor} onChange={setValor} max={10000} />
          <input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (o jogador vê)" aria-label="Motivo" className={fieldCls} />
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <Button type="submit" form="form-bonus-jogador" disabled={dar.isPending || !(n > 0) || n > 10000 || motivo.trim().length < 3} className="bg-[#9B5BF8] hover:bg-[#884BE0] text-white">
            {dar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Dar bônus"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** bloqueia a conta (derruba as sessões) ou tira o bloqueio */
function BloqueioDialog({ id, nome, bloqueado, aberto, onClose }: { id: number; nome: string; bloqueado: boolean; aberto: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const mudar = useMutation({
    mutationFn: () => (bloqueado ? post(`/admin/jogadores/${id}/desbloquear`) : post(`/admin/jogadores/${id}/bloquear`, { motivo: motivo.trim() })),
    onSuccess: () => {
      if (bloqueado) toast.success(`${nome} desbloqueado`, { description: "Já pode entrar na conta de novo." });
      else toast.success(`${nome} bloqueado`, { description: "As sessões foram derrubadas e a conta não entra mais." });
      setMotivo("");
      onClose();
      invalidarJogador(qc, id);
    },
    onError: (e) => toast.error(bloqueado ? "Não deu pra desbloquear" : "Não deu pra bloquear", { description: (e as Error).message }),
  });

  return (
    <AlertDialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{bloqueado ? `Desbloquear ${nome}?` : `Bloquear ${nome}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {bloqueado
              ? "A conta volta a entrar no app, jogar, depositar e sacar."
              : "O jogador sai do app na hora e não consegue mais entrar. Saques que já estão pendentes continuam na tela Saques pra você decidir."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!bloqueado && (
          <form id="form-bloqueio" onSubmit={(e) => { e.preventDefault(); if (motivo.trim().length >= 3) mudar.mutate(); }}>
            <input autoFocus value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (só o admin vê)" aria-label="Motivo" className={fieldCls} />
          </form>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <Button onClick={() => mudar.mutate()} disabled={mudar.isPending || (!bloqueado && motivo.trim().length < 3)} className={bloqueado ? "bg-[#14cd5e] hover:bg-[#0f9d48] text-white" : "bg-[#CC0854] hover:bg-[#B00748] text-white"}>
            {mudar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : bloqueado ? "Desbloquear" : "Bloquear"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** tira dinheiro do saldo ou do bônus do jogador (nunca deixa negativo) */
function RemoverSaldoDialog({ id, nome, saldo, bonus, aberto, onClose, onFeito }: { id: number; nome: string; saldo?: number; bonus?: number; aberto: boolean; onClose: () => void; onFeito: () => void }) {
  const qc = useQueryClient();
  const [carteira, setCarteira] = useState<"saldo" | "bonus">("saldo");
  const [tudo, setTudo] = useState(false);
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const n = Number(valor.replace(",", "."));
  const pode = (tudo || n > 0) && motivo.trim().length >= 3;
  const atual = carteira === "saldo" ? saldo : bonus;
  const remover = useMutation({
    mutationFn: () => post<{ ok: boolean; removido: number }>(`/admin/jogadores/${id}/remover`, tudo ? { carteira, tudo: true, motivo: motivo.trim() } : { carteira, valor: n, motivo: motivo.trim() }),
    onSuccess: (r) => {
      toast.success(`${brl(r.removido)} removidos do ${carteira === "saldo" ? "saldo" : "bônus"} de ${nome}`);
      setValor(""); setMotivo(""); setTudo(false);
      onClose(); onFeito();
      invalidarJogador(qc, id);
    },
    onError: (e) => toast.error("Não deu pra remover", { description: (e as Error).message }),
  });

  return (
    <AlertDialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover dinheiro de {nome}</AlertDialogTitle>
          <AlertDialogDescription>
            Sai na hora da carteira escolhida. Se ele tiver menos que o valor, fica em zero. O dinheiro travado em partidas e saques não é mexido.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form id="form-remover-saldo" className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (pode) remover.mutate(); }}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Carteira">
            {(["saldo", "bonus"] as const).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={carteira === c} onClick={() => setCarteira(c)}
                className={cn("rounded-xl border p-3 text-left transition-colors", carteira === c ? "border-[#CC0854] bg-[#CC0854]/5" : "border-border hover:bg-muted")}>
                <p className="text-sm font-semibold text-foreground">{c === "saldo" ? "Saldo" : "Bônus"}</p>
                <p className="text-xs text-muted-foreground">{(c === "saldo" ? saldo : bonus) != null ? brl(c === "saldo" ? saldo : bonus) : "—"}</p>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={tudo} onChange={(e) => setTudo(e.target.checked)} className="accent-[#CC0854]" />
            Zerar {carteira === "saldo" ? "o saldo" : "o bônus"} todo{atual != null && ` (${brl(atual)})`}
          </label>
          {!tudo && <ValorInput valor={valor} onChange={setValor} />}
          <input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (obrigatório, o jogador vê)" aria-label="Motivo" className={fieldCls} />
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <Button type="submit" form="form-remover-saldo" disabled={remover.isPending || !pode} className="bg-[#CC0854] hover:bg-[#B00748] text-white">
            {remover.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : tudo ? `Zerar ${carteira === "saldo" ? "saldo" : "bônus"}` : "Remover"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ValorInput({ valor, onChange, max }: { valor: string; onChange: (v: string) => void; max?: number }) {
  return (
    <div className="flex items-center rounded-xl border border-border bg-white dark:bg-transparent h-10 px-3 focus-within:border-primary">
      <span className="text-sm text-muted-foreground mr-1">R$</span>
      <input autoFocus type="number" required min={0.01} max={max} step="0.01" inputMode="decimal" value={valor} onChange={(e) => onChange(e.target.value)} placeholder="20,00" aria-label="Valor" className="w-full bg-transparent text-sm outline-none tabular-nums" />
    </div>
  );
}

function HistoricoTabela({ aba, itens }: { aba: Aba; itens: unknown[] }) {
  const jogos = useJogos();
  const vazio = itens.length === 0 ? "Nada por aqui ainda." : false;
  const quando = (v: number | null) => <td className="!text-muted-foreground">{dataHora(v)}</td>;
  if (aba === "partidas") return (
    <Table head={["Data", "Jogo", "Sala", "Adversários", "Entrada", "Prêmio", "Resultado", "Status"]} empty={vazio}>
      {(itens as ItemPartida[]).map((r) => (
        <tr key={r.id}>{quando(r.criadoEm)}<td className="font-medium">{jogos[r.jogo] ?? r.jogo}</td><td className="!text-muted-foreground">{SALAS[r.sala] ?? r.sala}</td>
          <td className="!text-muted-foreground max-w-[200px] truncate">{nomes(r.adversarios)}</td>
          <td className="tabular-nums">{brl(r.aposta)}</td><td className="tabular-nums">{brl(r.premio)}</td>
          <td>{r.status === "settled" ? <span className={cn("text-xs font-semibold", r.venceu ? "!text-[#45BC56]" : "!text-[#CC0854]")}>{r.venceu ? "Venceu" : "Perdeu"}</span> : <span className="text-xs !text-muted-foreground">—</span>}</td>
          <td><StatusBadge status={r.status} /></td></tr>
      ))}
    </Table>
  );
  if (aba === "depositos") return (
    <Table head={["Data", "ID", "Valor", "Status", "Pago em"]} empty={vazio}>
      {(itens as Deposito[]).map((d) => (
        <tr key={d.id}>{quando(d.criadoEm)}<td className="font-mono text-xs !text-muted-foreground">{d.id}</td><td className="tabular-nums font-semibold">{brl(d.valor)}</td><td><StatusBadge status={d.status} /></td><td className="!text-muted-foreground">{dataHora(d.pagoEm)}</td></tr>
      ))}
    </Table>
  );
  if (aba === "saques") return (
    <Table head={["Data", "Valor", "Status", "Chave Pix", "Decidido"]} empty={vazio}>
      {(itens as ItemSaque[]).map((s) => (
        <tr key={s.id}>{quando(s.criadoEm)}<td className="tabular-nums font-semibold">{brl(s.valor)}</td><td><StatusBadge status={s.status} /></td><td className="!text-muted-foreground font-mono text-xs">{s.chavePix}</td>
          <td className="!text-muted-foreground">{dataHora(s.decididoEm)}{s.motivo && <p className="text-[11px]">{s.motivo}</p>}</td></tr>
      ))}
    </Table>
  );
  if (aba === "bonus") return (
    <Table head={["Data", "Tipo", "Valor", "Detalhe"]} empty={vazio}>
      {(itens as ItemBonus[]).map((b) => (
        <tr key={b.id}>{quando(b.criadoEm)}<td><StatusBadge status={b.tipo} /></td><td className="tabular-nums font-semibold">{brl(b.valor)}</td>
          <td className="!text-muted-foreground">{[b.motivo, b.criadoPor && `por ${b.criadoPor}`].filter(Boolean).join(" · ") || "—"}</td></tr>
      ))}
    </Table>
  );
  if (aba === "transacoes") return (
    <Table head={["Data", "Movimento", "Valor"]} empty={vazio}>
      {(itens as ItemTransacao[]).map((t) => (
        <tr key={t.id}>{quando(t.criadoEm)}<td className="font-medium">{t.titulo}<span className="ml-2 text-[11px] !text-muted-foreground">{t.tipo}</span></td>
          <td className={cn("tabular-nums font-semibold", t.valor > 0 && "!text-[#45BC56]", t.valor < 0 && "!text-[#CC0854]")}>{t.valor > 0 ? "+" : ""}{brl(t.valor)}</td></tr>
      ))}
    </Table>
  );
  return (
    <Table head={["Data", "Amigo", "E-mail", "Depositou", "Partidas", "Status"]} empty={vazio}>
      {(itens as ItemIndicado[]).map((i) => (
        <tr key={i.id}>{quando(i.criadoEm)}<td className="font-medium">{i.nome}</td><td className="!text-muted-foreground">{i.email}</td><td>{i.depositou ? "sim" : "não"}</td><td className="tabular-nums">{num(i.partidas)}</td><td><StatusBadge status={i.status} /></td></tr>
      ))}
    </Table>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[#54052D] dark:text-foreground mb-2">{titulo}</h3>
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 rounded-2xl border border-border/60 p-4">{children}</dl>
    </div>
  );
}

function Campo({ label, valor, extra }: { label: string; valor: ReactNode; extra?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-[#54052D] dark:text-foreground break-words">{valor ?? <span className="text-muted-foreground">não informado</span>}</dd>
      {extra && <dd className="text-[11px] text-muted-foreground">{extra}</dd>}
    </div>
  );
}

function Cartao({ icon, titulo, valor, dica, destaque }: { icon: ReactNode; titulo: string; valor: string; dica?: string; destaque?: "verde" | "vermelho" }) {
  return (
    <div className="rounded-2xl border border-border/60 p-4 min-w-0">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="text-[#9B5BF8]">{icon}</span>{titulo}</p>
      <p className={cn("mt-1 text-lg font-bold tabular-nums text-[#54052D] dark:text-foreground truncate", destaque === "vermelho" && "!text-[#CC0854]", destaque === "verde" && "!text-[#45BC56]")}>{valor}</p>
      {dica && <p className="text-[11px] text-muted-foreground">{dica}</p>}
    </div>
  );
}
