import { useJogos, type Pagina } from "@/features/admin/types";
import { Carregando, copiar, Erro, MiniCard, Pagination, Panel, StatusBadge, Table } from "@/shared/components/admin";
import { api, post, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Copy, Link2, Loader2, Percent, UserPlus, Users, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Painel = {
  nome: string; codigo: string; link: string; chavePix: string | null;
  regras: { percentual: number; saqueMinimo: number };
  inscritos: number; depositaram: number; totalDepositado: number; taxaGerada: number;
  ganho: number; sacado: number; saquePendente: number; disponivel: number;
  comissoes: { id: number; indicado: string; base: number; valor: number; jogo: string; criadoEm: number }[];
  saques: { id: number; valor: number; chavePix: string; status: "pendente" | "pago" | "cancelado"; motivo: string | null; criadoEm: number; decididoEm: number | null }[];
};
type Inscrito = { nome: string; criadoEm: number; depositou: boolean; partidas: number; comissao: number };

const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** o que o influencer vê ao entrar: link, regra, comissões, inscritos e saques */
export function InfluencerDashboardPage() {
  const qc = useQueryClient();
  const jogos = useJogos();
  const [pagina, setPagina] = useState(1);
  const [valor, setValor] = useState("");
  const { data: p, isLoading, error } = useQuery({ queryKey: ["influencer-me"], queryFn: () => api<Painel>("/influencer/me"), refetchInterval: 60_000 });
  const { data: insc } = useQuery({
    queryKey: ["influencer-inscritos", pagina],
    queryFn: () => api<Pagina<Inscrito, number>>(`/influencer/inscritos${qs({ pagina, porPagina: 20 })}`),
    placeholderData: keepPreviousData,
  });

  const v = Number(valor.replace(",", "."));
  const sacar = useMutation({
    mutationFn: () => post("/influencer/saques", { valor: v }),
    onSuccess: () => {
      toast.success("Saque pedido!", { description: "Assim que o Pix for feito, ele aparece como pago aqui." });
      setValor("");
      qc.invalidateQueries({ queryKey: ["influencer-me"] });
    },
    onError: (e) => toast.error("Não deu pra pedir o saque", { description: (e as Error).message }),
  });

  if (isLoading) return <Carregando />;
  if (error || !p) return <Erro error={error ?? new Error("Não carregou o painel")} />;

  const link = p.link || `https://joggpix.com/?inf=${p.codigo}`;
  const podeSacar = v >= p.regras.saqueMinimo && v <= p.disponivel && !!p.chavePix;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <Panel title={`Olá, ${p.nome.split(" ")[0]}! Seu link`} icon={<Link2 className="h-5 w-5" />}>
        <div className="flex flex-wrap items-center gap-2">
          <code className="flex-1 min-w-0 basis-[240px] truncate rounded-full border border-border bg-muted/40 px-4 py-2 text-sm">{link}</code>
          <button onClick={() => copiar(link, "Link copiado")} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold"><Copy className="h-4 w-4" />Copiar link</button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Quem cria conta pelo seu link fica ligado a você. Em toda partida paga que essa pessoa jogar, o Boteco fica com uma taxa do pote, e
          <b className="text-foreground"> {pct(p.regras.percentual)} dessa taxa</b> é sua.
        </p>
      </Panel>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MiniCard title="Inscritos" value={num(p.inscritos)} icon={<Users className="h-5 w-5" />} hint={`${num(p.depositaram)} já depositaram`} />
        <MiniCard title="Taxa gerada" value={brl(p.taxaGerada)} icon={<Percent className="h-5 w-5" />} hint={`${pct(p.regras.percentual)} vira comissão`} />
        <MiniCard title="Total ganho" value={brl(p.ganho)} icon={<Wallet className="h-5 w-5" />} hint={`${brl(p.totalDepositado)} depositados pelos inscritos`} />
        <MiniCard title="Disponível pra saque" value={brl(p.disponivel)} icon={<Banknote className="h-5 w-5" />} hint={`${brl(p.sacado)} recebidos${p.saquePendente ? ` · ${brl(p.saquePendente)} a caminho` : ""}`} />
      </div>

      <Panel title="Pedir saque" icon={<Banknote className="h-5 w-5" />}>
        <form className="flex flex-wrap items-center gap-3" onSubmit={(e) => { e.preventDefault(); if (podeSacar) sacar.mutate(); }}>
          <div className="flex items-center rounded-full border border-border bg-white dark:bg-transparent h-9 px-3 focus-within:border-primary">
            <span className="text-sm text-muted-foreground mr-1">R$</span>
            <input type="number" min={p.regras.saqueMinimo} max={p.disponivel} step="0.01" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className="w-28 bg-transparent text-sm outline-none tabular-nums" aria-label="Valor do saque" />
          </div>
          <button type="button" onClick={() => setValor(String(p.disponivel))} className="text-sm text-primary hover:underline">Sacar tudo</button>
          <button type="submit" disabled={sacar.isPending || !podeSacar} className="h-9 px-5 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold disabled:opacity-50">
            {sacar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pedir saque"}
          </button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Mínimo {brl(p.regras.saqueMinimo)}.{" "}
          {p.chavePix ? <>O Pix vai pra chave <b>{p.chavePix}</b> depois que a equipe aprovar. Pra trocar a chave, fale com o suporte.</> : <b className="text-[#CC0854]">Você ainda não tem chave Pix cadastrada: fale com o suporte.</b>}
        </p>
        {p.saques.length > 0 && (
          <div className="mt-4">
            <Table head={["Pedido", "Valor", "Status"]}>
              {p.saques.map((s) => (
                <tr key={s.id}>
                  <td className="!text-muted-foreground">{dataHora(s.criadoEm)}</td>
                  <td className="font-semibold tabular-nums">{brl(s.valor)}</td>
                  <td>
                    <StatusBadge status={s.status} />
                    {s.status === "cancelado" && s.motivo && <span className="ml-2 text-xs !text-muted-foreground">{s.motivo}</span>}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Últimas comissões" icon={<Wallet className="h-5 w-5" />}>
          <Table head={["Data", "Inscrito", "Jogo", "Comissão"]} empty={p.comissoes.length === 0 ? "Nenhuma comissão ainda." : false}>
            {p.comissoes.map((c) => (
              <tr key={c.id}>
                <td className="!text-muted-foreground">{dataHora(c.criadoEm)}</td>
                <td>{c.indicado}</td>
                <td>{jogos[c.jogo] ?? c.jogo}<span className="text-xs !text-muted-foreground"> · taxa {brl(c.base)}</span></td>
                <td className="font-semibold !text-[#45BC56] tabular-nums">+{brl(c.valor)}</td>
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel title="Seus inscritos" icon={<UserPlus className="h-5 w-5" />}>
          <Table head={["Inscrição", "Nome", "Depositou", "Partidas", "Rendeu"]} empty={insc?.itens.length === 0 ? "Ninguém entrou pelo seu link ainda." : false}>
            {insc?.itens.map((i, k) => (
              <tr key={`${i.criadoEm}-${k}`}>
                <td className="!text-muted-foreground">{dataHora(i.criadoEm)}</td>
                <td>{i.nome}</td>
                <td className={cn(!i.depositou && "!text-muted-foreground")}>{i.depositou ? "Sim" : "Ainda não"}</td>
                <td className="tabular-nums">{num(i.partidas)}</td>
                <td className="font-semibold tabular-nums">{brl(i.comissao)}</td>
              </tr>
            ))}
          </Table>
          <Pagination currentPage={pagina} totalPages={insc ? Math.ceil(insc.total / 20) : 0} onPageChange={setPagina} />
        </Panel>
      </div>
    </div>
  );
}
