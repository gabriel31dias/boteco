import { SALAS, useJogos } from "@/features/admin/types";
import { JogadorModal } from "@/features/admin/jogadores/JogadorModal";
import { Carregando, Erro, Panel, StatusBadge, Table } from "@/shared/components/admin";
import { api, post } from "@/shared/lib/api";
import { brl, dataHora } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// GET /api/admin/resumo é o mesmo da tela de moderação do app: valores em CENTAVOS e nomes em inglês (name, balance...)
type Pessoa = { id: number; name: string; username: string };
type Denuncia = { id: number; motivo: string; texto: string | null; em: number; de: Pessoa; alvo: Pessoa; silenciadoAte: number | null; total: number };
type PartidaMod = { id: number; jogo: string; sala: string; code: string | null; status: string; stake: number; em: number; jogadores: Pessoa[] };
type Problema = { id: number; name: string; email: string; balance: number; bonus: number; locked: number; tipo: string; deveria?: number };
type Resumo = { denuncias: Denuncia[]; partidas: PartidaMod[]; auditoria: Problema[]; agora: number };

const reais = (c: number | null | undefined) => brl((c ?? 0) / 100);
const MOTIVO: Record<string, string> = { ofensa: "Ofensa", spam: "Spam", golpe: "Golpe", outro: "Outro" };

/** denúncias do chat, partidas contestadas ou interrompidas (estornadas) e a conferência do dinheiro */
export function ModeracaoPage() {
  const qc = useQueryClient();
  const jogos = useJogos();
  const [ficha, setFicha] = useState<number | null>(null);
  const { data: r, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["moderacao"],
    queryFn: () => api<Resumo>("/admin/resumo"),
    refetchInterval: 30_000,
  });

  const decidir = useMutation({
    mutationFn: ({ id, acao }: { id: number; acao: "descartar" | "silenciar" }) => post<Resumo>("/admin/denuncia", { id, acao }),
    onSuccess: (novo, { acao }) => {
      if (novo && Array.isArray(novo.denuncias)) qc.setQueryData(["moderacao"], novo);
      else qc.invalidateQueries({ queryKey: ["moderacao"] });
      toast.success(acao === "silenciar" ? "Silenciado no chat geral por 24h" : "Denúncias descartadas");
    },
    onError: (e) => toast.error("Não deu certo", { description: (e as Error).message }),
  });

  const pessoa = (p: Pessoa) => (
    <button onClick={() => setFicha(p.id)} className="font-medium hover:text-primary hover:underline" title={p.username}>{p.name}</button>
  );

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex justify-end">
        <button onClick={() => refetch()} disabled={isFetching} aria-label="Atualizar"
          className="w-10 h-10 rounded-lg border border-border bg-white dark:bg-transparent hover:bg-muted flex items-center justify-center text-[#9B5BF8] transition-colors">
          <RefreshCw size={18} className={isFetching ? "animate-spin" : ""} />
        </button>
      </div>
      <Erro error={error} />
      {isLoading && <Carregando />}

      {r && (
        <>
          {/* dinheiro primeiro: é o que não pode esperar */}
          <section className={cn("rounded-2xl p-6 border", r.auditoria.length ? "bg-[#CC0854]/10 border-[#CC0854]/40" : "bg-[#45BC56]/10 border-[#45BC56]/30")}>
            <h2 className="flex items-center gap-2 text-base font-semibold text-[#54052D] dark:text-foreground">
              {r.auditoria.length ? <AlertTriangle className="h-5 w-5 text-[#CC0854]" /> : <CheckCircle2 className="h-5 w-5 text-[#45BC56]" />}
              Conferência do dinheiro
            </h2>
            {r.auditoria.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Tudo certo: o travado de cada conta bate com as partidas abertas e ninguém está negativo.</p>
            ) : (
              <div className="mt-3">
                <Table head={["Conta", "Problema", "Saldo", "Bônus", "Travado"]}>
                  {r.auditoria.map((p, i) => (
                    <tr key={i}>
                      <td><button onClick={() => setFicha(p.id)} className="font-medium hover:text-primary hover:underline text-left">{p.name}</button><p className="text-xs !text-muted-foreground">{p.email}</p></td>
                      <td className="!text-[#CC0854] font-medium !whitespace-normal">{p.tipo === "travado" ? `travado ${reais(p.locked)}, deveria ser ${reais(p.deveria)}` : "valor negativo"}</td>
                      <td className="tabular-nums">{reais(p.balance)}</td>
                      <td className="tabular-nums">{reais(p.bonus)}</td>
                      <td className="tabular-nums">{reais(p.locked)}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </section>

          <Panel title={`Denúncias abertas (${r.denuncias.length})`} icon={<ShieldAlert className="h-5 w-5" />}>
            {r.denuncias.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma denúncia esperando.</p>}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {r.denuncias.map((d) => (
                <div key={d.id} className="rounded-2xl border border-border/60 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-[#54052D] dark:text-foreground truncate">{pessoa(d.alvo)} <span className="text-muted-foreground">{d.alvo.username}</span></p>
                    <span className="shrink-0 px-3 py-1 rounded-full bg-[#CC0854]/10 text-[#CC0854] text-[11px] font-semibold">{MOTIVO[d.motivo] ?? d.motivo}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    por {d.de.name} · {dataHora(d.em)} · {d.total} {d.total === 1 ? "pessoa denunciou" : "pessoas denunciaram"}
                    {d.silenciadoAte && d.silenciadoAte > r.agora ? ` · silenciado até ${dataHora(d.silenciadoAte)}` : ""}
                  </p>
                  {d.texto && <p className="text-sm text-foreground mt-3 px-3 py-2 rounded-xl bg-muted/60 break-words">“{d.texto}”</p>}
                  <div className="flex gap-2 mt-3">
                    <button disabled={decidir.isPending} onClick={() => decidir.mutate({ id: d.id, acao: "descartar" })} className="flex-1 h-9 rounded-full border border-border text-sm font-semibold hover:bg-muted disabled:opacity-50">Descartar</button>
                    <button disabled={decidir.isPending} onClick={() => decidir.mutate({ id: d.id, acao: "silenciar" })} className="flex-1 h-9 rounded-full bg-[#CC0854] hover:bg-[#B00748] text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
                      {decidir.isPending && decidir.variables?.id === d.id && decidir.variables.acao === "silenciar" && <Loader2 className="h-4 w-4 animate-spin" />}Silenciar 24h
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Partidas estornadas pra conferir" icon={<RotateCcw className="h-5 w-5" />}>
            <p className="text-xs text-muted-foreground mb-2">Contestada: os dois lados da sinuca relataram vencedores diferentes. Interrompida: o servidor reiniciou com a mesa aberta. Nas duas, a entrada voltou pra cada um.</p>
            <Table head={["Data", "Partida", "Jogo", "Sala", "Jogadores", "Entrada", "Status"]} empty={r.partidas.length === 0 ? "Nenhuma." : false}>
              {r.partidas.map((p) => (
                <tr key={p.id}>
                  <td className="!text-muted-foreground">{dataHora(p.em)}</td>
                  <td className="!text-muted-foreground">#{p.id}</td>
                  <td className="font-medium">{jogos[p.jogo] ?? p.jogo}</td>
                  <td className="!text-muted-foreground">{p.code ? `sala ${p.code}` : SALAS[p.sala] ?? p.sala}</td>
                  <td className="!whitespace-normal">{p.jogadores.map((j, i) => <span key={j.id}>{i > 0 && ", "}{pessoa(j)}</span>)}</td>
                  <td className="tabular-nums">{p.stake ? reais(p.stake) : "sem valor"}</td>
                  <td><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </Table>
          </Panel>
        </>
      )}
      {ficha != null && <JogadorModal id={ficha} onClose={() => setFicha(null)} />}
    </div>
  );
}
