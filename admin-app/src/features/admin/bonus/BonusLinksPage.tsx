import type { BonusLink, Pagina } from "@/features/admin/types";
import { ValorInput } from "@/features/admin/jogadores/JogadorModal";
import { Carregando, copiar, Erro, fieldCls, MiniCard, Pagination, Panel, Table } from "@/shared/components/admin";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { api, post, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Gift, Link2, Loader2, Plus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Resgate = { userId: number; nome: string; email: string; valor: number; criadoEm: number };

const VAZIO = { nome: "", valor: "", limite: "", codigo: "" };
/** a API já manda o link pronto; sem ele, monta no site dos jogos */
const linkDe = (l: { link?: string; codigo: string }) => l.link || `https://joggpix.com/?bonus=${l.codigo}`;
const valorNum = (v: string) => Number(v.replace(",", "."));

/** links de bônus: quem abre o site pelo link e entra na conta ganha o valor em bônus, uma vez por conta */
export function BonusLinksPage() {
  const qc = useQueryClient();
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [aberto, setAberto] = useState<BonusLink | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["bonus-links"],
    queryFn: () => api<BonusLink[]>("/admin/bonus-links"),
    refetchInterval: 60_000,
  });

  const criar = useMutation({
    mutationFn: () => post<{ id: number; codigo: string }>("/admin/bonus-links", {
      nome: form.nome.trim(), valor: valorNum(form.valor), limite: form.limite ? Number(form.limite) : undefined, codigo: form.codigo.trim() || undefined,
    }),
    onSuccess: (r) => {
      const link = linkDe(r);
      navigator.clipboard?.writeText(link).catch(() => {});
      toast.success(`Link "${form.nome.trim()}" criado`, { description: `${link} (copiado)` });
      setNovo(false); setForm(VAZIO);
      qc.invalidateQueries({ queryKey: ["bonus-links"] });
    },
    onError: (e) => toast.error("Não deu pra criar o link", { description: (e as Error).message }),
  });
  const alternar = useMutation({
    mutationFn: (l: BonusLink) => post(`/admin/bonus-links/${l.id}`, { ativo: !l.ativo }),
    onSuccess: (_, l) => {
      toast.success(l.ativo ? "Link pausado: ninguém mais ganha por ele" : "Link reativado");
      qc.invalidateQueries({ queryKey: ["bonus-links"] });
    },
    onError: (e) => toast.error("Não deu certo", { description: (e as Error).message }),
  });

  const tot = (k: "resgates" | "totalPago") => (data ?? []).reduce((a, l) => a + (l[k] ?? 0), 0);
  const podeCriar = form.nome.trim().length >= 2 && valorNum(form.valor) > 0 && valorNum(form.valor) <= 1000 && (!form.codigo || /^[A-Za-z0-9]{4,16}$/.test(form.codigo));

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniCard title="Links ativos" value={num(data?.filter((l) => l.ativo && !l.esgotado).length)} icon={<Link2 className="h-5 w-5" />} hint={`${num(data?.length)} no total`} />
        <MiniCard title="Contas que ganharam" value={num(tot("resgates"))} icon={<Users className="h-5 w-5" />} hint="somando todos os links" />
        <MiniCard title="Total em bônus" value={brl(tot("totalPago"))} icon={<Gift className="h-5 w-5" />} hint="entra nos custos do dashboard" />
      </div>

      <Panel title="Links de bônus" icon={<Link2 className="h-5 w-5" />}
        actions={<button onClick={() => setNovo(true)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold"><Plus className="h-4 w-4" />Novo link</button>}>
        <Erro error={error} />
        {isLoading ? <Carregando /> : (
          <Table head={["Link", "Endereço", "Bônus", "Contas", "Total pago", "Ativo"]} empty={data?.length === 0 ? "Nenhum link criado ainda." : false}>
            {data?.map((l) => (
              <tr key={l.id} onClick={() => setAberto(l)} className={cn("align-top cursor-pointer hover:bg-muted/40", (!l.ativo || l.esgotado) && "opacity-60")} title="Ver quem ganhou">
                <td><p className="font-medium">{l.nome}</p><p className="text-[11px] !text-muted-foreground">{dataHora(l.criadoEm)}{l.criadoPor && ` · por ${l.criadoPor}`}</p></td>
                <td>
                  <button onClick={(e) => { e.stopPropagation(); copiar(linkDe(l), "Link copiado"); }} className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-primary" title="Copiar link">
                    ?bonus={l.codigo}<Copy className="h-3.5 w-3.5" />
                  </button>
                </td>
                <td className="tabular-nums font-semibold">{brl(l.valor)}</td>
                <td className="tabular-nums">
                  {num(l.resgates)}{l.limite != null && <span className="!text-muted-foreground"> / {num(l.limite)}</span>}
                  {l.esgotado && <p className="text-[11px] text-[#F59E0B]">esgotado</p>}
                </td>
                <td className="tabular-nums font-semibold">{brl(l.totalPago)}</td>
                <td>
                  <button role="switch" aria-checked={l.ativo} aria-label={l.ativo ? "Pausar link" : "Reativar link"} disabled={alternar.isPending}
                    onClick={(e) => { e.stopPropagation(); alternar.mutate(l); }}
                    className={cn("relative shrink-0 h-7 w-12 rounded-full border-2 border-[#9B5BF8] transition-colors disabled:opacity-50", l.ativo ? "bg-[#9B5BF8]" : "bg-transparent")}>
                    <span className={cn("absolute top-0.5 h-5 w-5 rounded-full transition-all", l.ativo ? "left-[22px] bg-white" : "left-0.5 bg-[#9B5BF8]")} />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Quem abrir o site pelo link ganha o valor em bônus assim que entrar na conta ou criar uma: uma vez por conta, até o limite. Clique num link pra ver quem ganhou. Pausado ou esgotado, o link para de dar bônus.
        </p>
      </Panel>

      <AlertDialog open={novo} onOpenChange={(o) => { if (!o) { setNovo(false); setForm(VAZIO); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Novo link de bônus</AlertDialogTitle>
            <AlertDialogDescription>Todo mundo que entrar no site por esse link ganha o valor em bônus (não sacável), uma vez por conta.</AlertDialogDescription>
          </AlertDialogHeader>
          <form id="form-link" className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (podeCriar) criar.mutate(); }}>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Nome (só você vê)</span>
              <input required maxLength={80} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Campanha Instagram" className={fieldCls} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Bônus por conta (até R$ 1.000)</span>
              <ValorInput valor={form.valor} onChange={(valor) => setForm({ ...form, valor })} max={1000} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Limite de contas (opcional)</span>
                <input type="number" min={1} step={1} inputMode="numeric" value={form.limite} onChange={(e) => setForm({ ...form, limite: e.target.value })} placeholder="Sem limite" className={fieldCls} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">Código (opcional)</span>
                <input maxLength={16} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase() })} placeholder="Gerado sozinho" className={cn(fieldCls, "font-mono")} />
              </label>
            </div>
            {form.codigo && <p className="text-xs text-muted-foreground font-mono break-all">{linkDe({ codigo: form.codigo })}</p>}
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button type="submit" form="form-link" disabled={criar.isPending || !podeCriar} className="bg-[#9B5BF8] hover:bg-[#884BE0] text-white">
              {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar link"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResgatesModal link={aberto} onClose={() => setAberto(null)} />
    </div>
  );
}

/** todo mundo que ganhou por um link, paginado */
function ResgatesModal({ link, onClose }: { link: BonusLink | null; onClose: () => void }) {
  const [pagina, setPagina] = useState(1);
  const porPagina = 10;
  useEffect(() => setPagina(1), [link?.id]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["bonus-links", link?.id, "resgates", pagina],
    queryFn: () => api<Pagina<Resgate, number>>(`/admin/bonus-links/${link!.id}/resgates${qs({ pagina, porPagina })}`),
    enabled: !!link,
    placeholderData: keepPreviousData,
  });

  return (
    <AlertDialog open={!!link} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Quem ganhou pelo link {link?.nome}</AlertDialogTitle>
          <AlertDialogDescription>
            {link && <>{brl(link.valor)} por conta · {num(link.resgates)}{link.limite != null && ` de ${num(link.limite)}`} contas · {brl(link.totalPago)} no total</>}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Erro error={error} />
        <div className="max-h-[55vh] overflow-y-auto">
          {isLoading ? <Carregando h="h-32" /> : (
            <Table head={["Data", "Jogador", "E-mail", "Valor"]} empty={data?.itens.length === 0 ? "Ninguém ganhou por esse link ainda." : false}>
              {data?.itens.map((r) => (
                <tr key={`${r.userId}-${r.criadoEm}`}>
                  <td className="!text-muted-foreground">{dataHora(r.criadoEm)}</td>
                  <td className="font-medium">{r.nome ?? "—"}</td>
                  <td className="!text-muted-foreground">{r.email}</td>
                  <td className="font-semibold">{brl(r.valor)}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        <Pagination currentPage={pagina} totalPages={data ? Math.ceil(data.total / porPagina) : 0} onPageChange={setPagina} />
        <AlertDialogFooter>
          <AlertDialogCancel>Fechar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
