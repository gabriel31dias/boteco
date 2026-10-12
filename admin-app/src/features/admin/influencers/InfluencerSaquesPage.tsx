import type { InfSaque, Pagina, Qtd } from "@/features/admin/types";
import { Carregando, copiar, Erro, MiniCard, Pagination, Panel, pillCls, StatusBadge, Table } from "@/shared/components/admin";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api, post, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, Clock, Copy, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Lista = Pagina<InfSaque, number> & { pendentes: Qtd };

/** saques pedidos pelos influencers no dashboard deles: o admin faz o Pix na mão e aprova, ou cancela (o valor volta pro disponível) */
export function InfluencerSaquesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pendente");
  const [pagina, setPagina] = useState(1);
  const [aprovar, setAprovar] = useState<InfSaque | null>(null);
  const [cancelar, setCancelar] = useState<InfSaque | null>(null);
  const [motivo, setMotivo] = useState("");
  useEffect(() => setPagina(1), [status]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["influencer-saques", status, pagina],
    queryFn: () => api<Lista>(`/admin/influencers/saques${qs({ status, pagina, porPagina: 20 })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const decidir = useMutation({
    mutationFn: ({ s, acao }: { s: InfSaque; acao: "aprovar" | "cancelar" }) => post(`/admin/influencers/saques/${s.id}/${acao}`, acao === "cancelar" ? { motivo: motivo.trim() } : {}),
    onSuccess: (_, { s, acao }) => {
      toast.success(acao === "aprovar" ? `Saque de ${brl(s.valor)} marcado como pago` : "Saque cancelado", {
        description: acao === "cancelar" ? "O valor voltou pro disponível do influencer." : undefined,
      });
      setAprovar(null); setCancelar(null); setMotivo("");
      qc.invalidateQueries({ queryKey: ["influencer-saques"] });
      qc.invalidateQueries({ queryKey: ["influencers"] });
    },
    onError: (e) => {
      toast.error("Não deu certo", { description: (e as Error).message });
      qc.invalidateQueries({ queryKey: ["influencer-saques"] });
    },
  });

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniCard title="Pendentes" value={num(data?.pendentes?.quantidade)} icon={<Clock className="h-5 w-5" />} hint="esperando o Pix" />
        <MiniCard title="Valor pendente" value={brl(data?.pendentes?.valor)} icon={<Banknote className="h-5 w-5" />} hint="a pagar se aprovar tudo" />
        <MiniCard title="Valor no filtro" value={brl(data?.soma)} icon={<Banknote className="h-5 w-5" />} hint={`${num(data?.total)} saques`} />
      </div>

      <Panel title="Saques de influencers" icon={<Banknote className="h-5 w-5" />}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className={cn(pillCls, "w-[170px]")} aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="pago">Pagos</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        <Erro error={error} />
        {isLoading ? <Carregando /> : (
          <Table head={["Pedido", "Influencer", "Chave Pix", "Valor", "Status"]} empty={data?.itens.length === 0 ? (status === "pendente" ? "Nenhum saque esperando." : true) : false}>
            {data?.itens.map((s) => (
              <tr key={s.id} className="align-top">
                <td className="!text-muted-foreground">{dataHora(s.criadoEm)}</td>
                <td><p className="font-medium">{s.influencer}</p><p className="text-xs !text-muted-foreground">{s.email}</p></td>
                <td>
                  <button onClick={() => copiar(s.chavePix, "Chave Pix copiada")} className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-primary" title="Copiar chave Pix">
                    {s.chavePix}<Copy className="h-3.5 w-3.5" />
                  </button>
                </td>
                <td className="font-bold text-base">{brl(s.valor)}</td>
                <td>
                  <StatusBadge status={s.status} />
                  {s.decididoPor && <p className="mt-1 text-[11px] !text-muted-foreground">{s.decididoPor}<br />{dataHora(s.decididoEm)}</p>}
                  {s.status === "cancelado" && s.motivo && <p className="text-[11px] !text-muted-foreground max-w-[180px] !whitespace-normal">{s.motivo}</p>}
                  {s.status === "pendente" && (
                    <div className="mt-2 flex flex-col gap-2 max-w-[130px]">
                      <button onClick={() => setAprovar(s)} className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full bg-[#45BC56] hover:bg-[#3aa84a] text-white text-xs font-semibold"><Check className="h-3.5 w-3.5" />Aprovar</button>
                      <button onClick={() => setCancelar(s)} className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-full border border-[#CC0854]/40 text-[#CC0854] hover:bg-[#CC0854]/10 text-xs font-semibold"><X className="h-3.5 w-3.5" />Cancelar</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
        <Pagination currentPage={pagina} totalPages={data ? Math.ceil(data.total / 20) : 0} onPageChange={setPagina} />
        <p className="text-xs text-muted-foreground">O saque é manual: faça o Pix pra chave do influencer e depois clique em Aprovar. Cancelado, o valor volta pro disponível dele.</p>
      </Panel>

      <AlertDialog open={!!aprovar} onOpenChange={(o) => !o && setAprovar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar saque de {aprovar && brl(aprovar.valor)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirme que você <b>já fez o Pix</b> de {aprovar && brl(aprovar.valor)} para a chave <b className="font-mono">{aprovar?.chavePix}</b> ({aprovar?.influencer}). Depois de aprovado não dá pra cancelar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button disabled={decidir.isPending} onClick={() => aprovar && decidir.mutate({ s: aprovar, acao: "aprovar" })} className="bg-[#45BC56] hover:bg-[#3aa84a] text-white">Já fiz o Pix, aprovar</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelar} onOpenChange={(o) => { if (!o) { setCancelar(null); setMotivo(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar saque de {cancelar && brl(cancelar.valor)}?</AlertDialogTitle>
            <AlertDialogDescription>O valor volta pro disponível de {cancelar?.influencer}, que vê o motivo no dashboard.</AlertDialogDescription>
          </AlertDialogHeader>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={300} placeholder="Motivo (ex.: chave Pix não confere)" aria-label="Motivo do cancelamento"
            className="w-full rounded-xl border border-border bg-transparent p-3 text-sm outline-none focus:border-primary" />
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button disabled={decidir.isPending || motivo.trim().length < 3} onClick={() => cancelar && decidir.mutate({ s: cancelar, acao: "cancelar" })} className="bg-[#CC0854] hover:bg-[#a80645] text-white">Cancelar saque</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
