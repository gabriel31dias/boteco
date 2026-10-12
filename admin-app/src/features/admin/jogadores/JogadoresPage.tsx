import type { Jogador, Pagina } from "@/features/admin/types";
import { baixarCsv, Carregando, csvValor, Erro, inputCls, MiniCard, Pagination, Panel, pillCls, Table, todasPaginas, useDebounced } from "@/shared/components/admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDownWideNarrow, Ban, Download, Gift, Loader2, Search, Users, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { JogadorModal } from "./JogadorModal";

type Soma = { saldo: number; bonus: number };

export function JogadoresPage() {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState("recente");
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);
  const [ficha, setFicha] = useState<number | null>(null);
  const porPagina = 20;
  const q = useDebounced(busca.trim());
  useEffect(() => setPagina(1), [q, ordem]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["jogadores", q, ordem, pagina],
    queryFn: () => api<Pagina<Jogador, Soma>>(`/admin/jogadores${qs({ q, ordem, pagina, porPagina })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000, // saldo muda o tempo todo enquanto jogam
  });

  const exportar = async () => {
    setExportando(true);
    try {
      const linhas = await todasPaginas((p) => api<Pagina<Jogador, Soma>>(`/admin/jogadores${qs({ q, ordem, pagina: p, porPagina: 100 })}`));
      baixarCsv("jogadores.csv", [
        ["ID", "Nome", "Usuário", "E-mail", "Saldo", "Bônus", "Travado", "Depositado", "Sacado", "Partidas", "Vitórias", "Influencer", "Verificado", "Bloqueado", "Cadastro"],
        ...linhas.map((j) => [j.id, j.nome, j.username, j.email, csvValor(j.saldo), csvValor(j.bonus), csvValor(j.travado), csvValor(j.depositado), csvValor(j.sacado),
          j.partidas, j.vitorias, j.influencer ?? "", j.verificado ? "sim" : "não", j.bloqueado ? "sim" : "não", dataHora(j.criadoEm)]),
      ]);
      toast.success(`${num(linhas.length)} jogadores exportados`);
    } catch (e) {
      toast.error("Não deu pra exportar", { description: (e as Error).message });
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniCard title="Jogadores" value={num(data?.total)} icon={<Users className="h-5 w-5" />} hint={q ? "na busca" : "contas criadas"} />
        <MiniCard title="Saldo somado" value={brl(data?.soma.saldo)} icon={<Wallet className="h-5 w-5" />} hint="sacável" />
        <MiniCard title="Bônus somado" value={brl(data?.soma.bonus)} icon={<Gift className="h-5 w-5" />} hint="só pra jogar" />
      </div>

      <Panel title="Jogadores" icon={<Users className="h-5 w-5" />}
        actions={<button onClick={exportar} disabled={exportando || !data?.total} className={cn(pillCls, "inline-flex items-center text-primary disabled:opacity-50")}>
          {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Exportar CSV
        </button>}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "w-full pl-9")} placeholder="Buscar por nome, @ ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar jogador" />
          </label>
          <Select value={ordem} onValueChange={setOrdem}>
            <SelectTrigger className={cn(pillCls, "w-[200px]")} aria-label="Ordenar"><ArrowDownWideNarrow className="h-4 w-4 text-primary shrink-0" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recente">Mais recentes</SelectItem>
              <SelectItem value="saldo">Maior saldo</SelectItem>
              <SelectItem value="depositado">Mais depositou</SelectItem>
              <SelectItem value="nome">Nome (A–Z)</SelectItem>
            </SelectContent>
          </Select>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        <Erro error={error} />
        {isLoading ? <Carregando /> : (
          <Table head={["Jogador", "E-mail", "Saldo", "Bônus", "Travado", "Depositado", "Sacado", "Partidas", "Origem", "Cadastro"]} empty={data?.itens.length === 0}>
            {data?.itens.map((j) => (
              <tr key={j.id} onClick={() => setFicha(j.id)} className="cursor-pointer hover:bg-muted/40" title="Ver ficha do jogador">
                <td className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    {j.jogandoAgora && <span className="h-2 w-2 rounded-full bg-[#45BC56] animate-pulse" title="Jogando agora" />}
                    {j.nome}
                  </span>
                  {j.username && <p className="text-[11px] !text-muted-foreground">@{j.username.replace(/^@/, "")}</p>}
                  {j.bloqueado && <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[#CC0854]/10 text-[#CC0854] text-[11px] font-semibold px-2 py-0.5"><Ban className="h-3 w-3" />bloqueado</span>}
                </td>
                <td className="!text-muted-foreground">{j.email}{!j.verificado && <p className="text-[11px] text-[#F59E0B]">não verificado</p>}</td>
                <td className="font-semibold">{brl(j.saldo)}</td>
                <td>{brl(j.bonus)}</td>
                <td className="!text-muted-foreground">{brl(j.travado)}</td>
                <td>{brl(j.depositado)}</td>
                <td>{brl(j.sacado)}</td>
                <td className="tabular-nums">{num(j.partidas)}<span className="text-[11px] !text-muted-foreground"> · {num(j.vitorias)} V</span></td>
                <td className="!text-muted-foreground">{j.influencer ?? "—"}</td>
                <td className="!text-muted-foreground">{dataHora(j.criadoEm)}</td>
              </tr>
            ))}
          </Table>
        )}
        <Pagination currentPage={pagina} totalPages={data ? Math.ceil(data.total / porPagina) : 0} onPageChange={setPagina} />
        <p className="text-xs text-muted-foreground">Clique num jogador pra ver a ficha completa, dar bônus, remover saldo ou bloquear. A bolinha verde indica quem está numa partida agora.</p>
      </Panel>
      {ficha != null && <JogadorModal id={ficha} onClose={() => setFicha(null)} />}
    </div>
  );
}
