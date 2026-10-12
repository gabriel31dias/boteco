import type { Influencer, Pagina } from "@/features/admin/types";
import { Pagination, Table } from "@/shared/components/admin";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, Users, X } from "lucide-react";
import { useEffect, useState } from "react";

type Inscrito = { id: number; nome: string; email: string; criadoEm: number; depositou: boolean; depositado: number; partidas: number; taxaGerada: number; comissao: number };

/** quem criou conta pelo link do influencer, mais recente primeiro, com o que cada um rendeu pra ele */
export function InscritosModal({ influencer: i, onClose }: { influencer: Influencer; onClose: () => void }) {
  const [pagina, setPagina] = useState(1);
  const porPagina = 20;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["influencer-inscritos", i.id, pagina],
    queryFn: () => api<Pagina<Inscrito, number>>(`/admin/influencers/${i.id}/inscritos${qs({ pagina, porPagina })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-background border border-border shadow-2xl flex flex-col">
        <div className="p-5 border-b border-border flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-[#54052D] dark:text-foreground truncate">Inscritos de {i.nome}</h2>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">?inf={i.codigo}</span> · {num(i.inscritos)} inscrito{i.inscritos === 1 ? "" : "s"} · {num(i.depositaram)} depositaram · {brl(data?.soma ?? i.ganho)} em comissões
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            <button onClick={onClose} className="rounded-full p-2 hover:bg-muted" aria-label="Fechar"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="p-5 overflow-auto">
          {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
          {isLoading ? (
            <div className="h-40 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : data?.total === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Ninguém criou conta pelo link ainda.</p>
            </div>
          ) : (
            <>
              <Table head={["Jogador", "E-mail", "Entrou em", "Depositou", "Partidas", "Taxa gerada", "Comissão"]}>
                {data?.itens.map((x) => (
                  <tr key={x.id}>
                    <td className="font-medium">{x.nome}</td>
                    <td className="!text-muted-foreground">{x.email}</td>
                    <td className="!text-muted-foreground">{dataHora(x.criadoEm)}</td>
                    <td>
                      <span className={cn("rounded-full px-3 py-1 text-[11px] font-medium", x.depositou ? "bg-[#45BC56]/10 text-[#45BC56]" : "bg-muted text-muted-foreground")}>
                        {x.depositou ? brl(x.depositado) : "ainda não"}
                      </span>
                    </td>
                    <td className="tabular-nums">{num(x.partidas)}</td>
                    <td className="tabular-nums">{brl(x.taxaGerada)}</td>
                    <td className="tabular-nums font-semibold">{brl(x.comissao)}</td>
                  </tr>
                ))}
              </Table>
              <Pagination currentPage={pagina} totalPages={data ? Math.ceil(data.total / porPagina) : 0} onPageChange={setPagina} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
