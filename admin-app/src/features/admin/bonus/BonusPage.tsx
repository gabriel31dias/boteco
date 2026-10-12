import { TIPOS_BONUS, type Bonus, type BonusSoma, type Pagina, type TipoBonus } from "@/features/admin/types";
import { ValorInput } from "@/features/admin/jogadores/JogadorModal";
import { DateFilter } from "@/shared/components/DateFilter";
import { baixarCsv, Carregando, csvValor, Erro, fieldCls, inputCls, MiniCard, Pagination, Panel, periodoPadrao, pillCls, StatusBadge, Table, todasPaginas, useDebounced } from "@/shared/components/admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { api, post, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { Download, Gift, Handshake, HandCoins, Link2, Loader2, Plus, Search, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** bônus que a casa deu: é custo, por isso o dashboard desconta da taxa no lucro líquido */
export function BonusPage() {
  const [periodo, setPeriodo] = useState(periodoPadrao);
  const [tipo, setTipo] = useState("todos");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [exportando, setExportando] = useState(false);
  const [dar, setDar] = useState(false);
  const porPagina = 20;
  const q = useDebounced(busca.trim());

  const filtro = { de: periodo.startDate, ate: periodo.endDate, tipo: tipo === "todos" ? undefined : tipo, q };
  useEffect(() => setPagina(1), [JSON.stringify(filtro)]);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["bonus", filtro, pagina],
    queryFn: () => api<Pagina<Bonus, BonusSoma>>(`/admin/bonus${qs({ ...filtro, pagina, porPagina })}`),
    placeholderData: keepPreviousData,
  });
  const pt = (t: TipoBonus) => data?.soma.porTipo?.[t];

  const exportar = async () => {
    setExportando(true);
    try {
      const linhas = await todasPaginas((p) => api<Pagina<Bonus, BonusSoma>>(`/admin/bonus${qs({ ...filtro, pagina: p, porPagina: 100 })}`));
      baixarCsv(`bonus_${filtro.de}_${filtro.ate}.csv`, [
        ["Data", "Tipo", "Jogador", "E-mail", "Valor", "Motivo", "Dado por"],
        ...linhas.map((b) => [dataHora(b.criadoEm), TIPOS_BONUS[b.tipo] ?? b.tipo, b.nome, b.email, csvValor(b.valor), b.motivo, b.criadoPor]),
      ]);
      toast.success(`${num(linhas.length)} bônus exportados`);
    } catch (e) {
      toast.error("Não deu pra exportar", { description: (e as Error).message });
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <MiniCard title="Total em bônus" value={brl(data?.soma.valor)} icon={<Gift className="h-5 w-5" />} hint={`${num(data?.total)} bônus no filtro`} />
        <MiniCard title="Cadastro" value={brl(pt("cadastro")?.valor)} icon={<UserPlus className="h-5 w-5" />} hint={`${num(pt("cadastro")?.quantidade)} contas novas`} />
        <MiniCard title="Links e manuais" value={brl((pt("link")?.valor ?? 0) + (pt("manual")?.valor ?? 0))} icon={<Link2 className="h-5 w-5" />} hint={`${num(pt("link")?.quantidade)} por link · ${num(pt("manual")?.quantidade)} pelo admin`} />
        <MiniCard title="Indicações" value={brl(pt("indicacao")?.valor)} icon={<Handshake className="h-5 w-5" />} hint={`${num(pt("indicacao")?.quantidade)} créditos do indique e ganhe`} />
        <MiniCard title="Conversão de pontos" value={brl(pt("conversao")?.valor)} icon={<HandCoins className="h-5 w-5" />} hint={`${num(pt("conversao")?.quantidade)} conversões`} />
      </div>

      <Panel title="Bônus concedidos" icon={<Gift className="h-5 w-5" />}
        actions={<>
          <button onClick={() => setDar(true)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold"><Plus className="h-4 w-4" />Dar bônus</button>
          <DateFilter onDateRangeChange={setPeriodo} />
          <button onClick={exportar} disabled={exportando || !data?.total} className={cn(pillCls, "inline-flex items-center text-primary disabled:opacity-50")}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Exportar CSV
          </button>
        </>}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "w-full pl-9")} placeholder="Nome ou e-mail do jogador" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar jogador" />
          </label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className={cn(pillCls, "w-[200px]")} aria-label="Tipo de bônus"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {Object.entries(TIPOS_BONUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        <Erro error={error} />
        {isLoading ? <Carregando /> : (
          <Table head={["Data", "Tipo", "Jogador", "E-mail", "Valor"]} empty={data?.itens.length === 0}>
            {data?.itens.map((b) => (
              <tr key={b.id}>
                <td className="!text-muted-foreground">{dataHora(b.criadoEm)}</td>
                <td><StatusBadge status={b.tipo} /></td>
                <td className="font-medium">
                  {b.nome ?? "—"}
                  {(b.motivo || b.criadoPor) && <p className="text-[11px] font-normal !text-muted-foreground">{[b.tipo === "link" && b.motivo ? `pelo link ${b.motivo}` : b.motivo, b.criadoPor && `por ${b.criadoPor}`].filter(Boolean).join(" · ")}</p>}
                </td>
                <td className="!text-muted-foreground">{b.email}</td>
                <td className="font-semibold">{brl(b.valor)}</td>
              </tr>
            ))}
          </Table>
        )}
        <Pagination currentPage={pagina} totalPages={data ? Math.ceil(data.total / porPagina) : 0} onPageChange={setPagina} />
        <p className="text-xs text-muted-foreground">Bônus vai pra carteira de bônus do jogador: serve pra jogar, mas não dá pra sacar. Só o que ele ganhar nas partidas vira saldo.</p>
      </Panel>

      <DarBonusEmail aberto={dar} onClose={() => setDar(false)} />
    </div>
  );
}

function DarBonusEmail({ aberto, onClose }: { aberto: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const n = Number(valor.replace(",", "."));
  const ok = email.includes("@") && n > 0 && n <= 10000 && motivo.trim().length >= 3;
  const darBonus = useMutation({
    mutationFn: () => post<{ ok: boolean; userId: number; nome: string }>("/admin/bonus", { email: email.trim(), valor: n, motivo: motivo.trim() }),
    onSuccess: (r) => {
      toast.success(`${brl(n)} de bônus pra ${r.nome}`, { description: "Já está na carteira de bônus dele." });
      onClose(); setEmail(""); setValor(""); setMotivo("");
      qc.invalidateQueries({ queryKey: ["bonus"] });
    },
    onError: (e) => toast.error("Não deu pra dar o bônus", { description: (e as Error).message }),
  });

  return (
    <AlertDialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Dar bônus pra um jogador</AlertDialogTitle>
          <AlertDialogDescription>O valor entra na hora no bônus da conta (não é sacável) e conta como custo no dashboard. Máximo R$ 10.000.</AlertDialogDescription>
        </AlertDialogHeader>
        <form id="form-bonus" className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (ok) darBonus.mutate(); }}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail da conta do jogador" aria-label="E-mail do jogador" className={fieldCls} />
          <ValorInput valor={valor} onChange={setValor} max={10000} />
          <input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (o jogador vê)" aria-label="Motivo" className={fieldCls} />
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <Button type="submit" form="form-bonus" disabled={darBonus.isPending || !ok} className="bg-[#9B5BF8] hover:bg-[#884BE0] text-white">
            {darBonus.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Dar bônus"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
