import type { Config, Influencer } from "@/features/admin/types";
import { Carregando, copiar, Erro, fieldCls, inputCls, MiniCard, Panel, Table, useDebounced } from "@/shared/components/admin";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { api, post, qs } from "@/shared/lib/api";
import { brl, dataHora, num } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Megaphone, Pencil, Plus, Search, Users, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { InscritosModal } from "./InscritosModal";

const linkDe = (i: { link?: string; codigo: string }) => i.link || `https://joggpix.com/?inf=${i.codigo}`;
const VAZIO = { nome: "", email: "", senha: "", chavePix: "", percentual: "" };
const pctOk = (p: string) => p.trim() === "" || (Number(p.replace(",", ".")) >= 0 && Number(p.replace(",", ".")) <= 100);
const pctNum = (p: string) => (p.trim() === "" ? null : Number(p.replace(",", ".")));

/** influencers: o admin cria a conta (login no mesmo painel, onde o influencer só vê o dashboard dele) e acompanha os números */
export function InfluencersPage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [editando, setEditando] = useState<Influencer | null>(null);
  const [inscritosDe, setInscritosDe] = useState<Influencer | null>(null);
  const q = useDebounced(busca.trim());

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["influencers", q],
    queryFn: () => api<Influencer[]>(`/admin/influencers${qs({ q })}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const cfg = useQuery({ queryKey: ["config"], queryFn: () => api<Config>("/admin/config"), staleTime: 60_000 });
  const padrao = cfg.data?.infPercentual;

  const criar = useMutation({
    mutationFn: () => post<{ id: number; codigo: string }>("/admin/influencers", {
      nome: form.nome.trim(), email: form.email.trim(), senha: form.senha, chavePix: form.chavePix.trim(),
      ...(form.percentual.trim() !== "" && { percentual: pctNum(form.percentual) }),
    }),
    onSuccess: (r) => {
      toast.success(`${form.nome} agora é influencer`, { description: `Link: ${linkDe(r)} · login: ${form.email}` });
      setNovo(false); setForm(VAZIO);
      qc.invalidateQueries({ queryKey: ["influencers"] });
    },
    onError: (e) => toast.error("Não deu pra criar", { description: (e as Error).message }),
  });
  const alternar = useMutation({
    mutationFn: (i: Influencer) => post(`/admin/influencers/${i.id}`, { ativo: !i.ativo }),
    onSuccess: (_, i) => {
      toast.success(i.ativo ? "Influencer desativado: o login dele caiu" : "Influencer reativado");
      qc.invalidateQueries({ queryKey: ["influencers"] });
    },
    onError: (e) => toast.error("Não deu certo", { description: (e as Error).message }),
  });

  const tot = (k: "inscritos" | "depositaram" | "totalDepositado" | "taxaGerada" | "ganho" | "sacado" | "disponivel" | "saquePendente" | "cliques") =>
    (data ?? []).reduce((a, i) => a + (i[k] ?? 0), 0);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const podeCriar = form.nome.trim().length >= 2 && emailOk && (form.senha === "" || form.senha.length >= 6) && pctOk(form.percentual);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MiniCard title="Influencers ativos" value={num(data?.filter((i) => i.ativo).length)} icon={<Megaphone className="h-5 w-5" />} hint={`${num(data?.length)} no total`} />
        <MiniCard title="Inscritos pelos links" value={num(tot("inscritos"))} icon={<Users className="h-5 w-5" />} hint={`${num(tot("depositaram"))} depositaram · ${brl(tot("totalDepositado"))}`} />
        <MiniCard title="Comissões geradas" value={brl(tot("ganho"))} icon={<Wallet className="h-5 w-5" />} hint={`sobre ${brl(tot("taxaGerada"))} de taxa · ${brl(tot("sacado"))} pagos`} />
        <MiniCard title="A pagar" value={brl(tot("disponivel") + tot("saquePendente"))} icon={<Wallet className="h-5 w-5" />} hint={`${brl(tot("saquePendente"))} em saques pedidos`} />
      </div>

      <Panel title="Influencers" icon={<Megaphone className="h-5 w-5" />}
        actions={<button onClick={() => setNovo(true)} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold"><Plus className="h-4 w-4" />Novo influencer</button>}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input className={cn(inputCls, "w-full pl-9")} placeholder="Nome, e-mail ou código" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar influencer" />
          </label>
          {isFetching && !isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        <Erro error={error} />
        {isLoading ? <Carregando /> : (
          <Table head={["Influencer", "Link", "Comissão", "Cliques", "Inscritos", "Taxa gerada", "Ganho", "Disponível", "Ativo", ""]} empty={data?.length === 0 ? "Nenhum influencer ainda." : false}>
            {data?.map((i) => (
              <tr key={i.id} onClick={() => setInscritosDe(i)} className={cn("align-top cursor-pointer hover:bg-muted/40", !i.ativo && "opacity-60")} title="Ver quem entrou pelo link">
                <td><p className="font-medium">{i.nome}</p><p className="text-xs !text-muted-foreground">{i.email}</p><p className="text-[11px] !text-muted-foreground">Pix: {i.chavePix || "não cadastrado"}</p></td>
                <td>
                  <button onClick={(e) => { e.stopPropagation(); copiar(linkDe(i), "Link copiado"); }} className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-primary" title="Copiar link">
                    ?inf={i.codigo}<Copy className="h-3.5 w-3.5" />
                  </button>
                </td>
                <td className="tabular-nums">{num(i.percentualEfetivo)}%<p className="text-[11px] !text-muted-foreground">{i.percentual == null ? "padrão" : "próprio"} · da taxa</p></td>
                <td className="tabular-nums">{num(i.cliques)}<p className="text-[11px] !text-muted-foreground">{num(i.pessoas)} pessoa{i.pessoas === 1 ? "" : "s"}</p></td>
                <td className="tabular-nums">{num(i.inscritos)}<p className="text-[11px] !text-muted-foreground">{num(i.depositaram)} depositaram</p></td>
                <td className="tabular-nums">{brl(i.taxaGerada)}<p className="text-[11px] !text-muted-foreground">{brl(i.totalDepositado)} depositado</p></td>
                <td className="tabular-nums font-semibold">{brl(i.ganho)}<p className="text-[11px] font-normal !text-muted-foreground">{brl(i.sacado)} pagos</p></td>
                <td className="tabular-nums">{brl(i.disponivel)}{i.saquePendente > 0 && <p className="text-[11px] text-[#F59E0B]">{brl(i.saquePendente)} pedido</p>}</td>
                <td>
                  <button role="switch" aria-checked={i.ativo} aria-label={i.ativo ? "Desativar influencer" : "Ativar influencer"} disabled={alternar.isPending}
                    onClick={(e) => { e.stopPropagation(); alternar.mutate(i); }}
                    className={cn("relative shrink-0 h-7 w-12 rounded-full border-2 border-[#9B5BF8] transition-colors disabled:opacity-50", i.ativo ? "bg-[#9B5BF8]" : "bg-transparent")}>
                    <span className={cn("absolute top-0.5 h-5 w-5 rounded-full transition-all", i.ativo ? "left-[22px] bg-white" : "left-0.5 bg-[#9B5BF8]")} />
                  </button>
                  <p className="mt-1 text-[11px] !text-muted-foreground">desde {dataHora(i.criadoEm).split(" ")[0]}</p>
                </td>
                <td>
                  <button onClick={(e) => { e.stopPropagation(); setEditando(i); }} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border text-xs hover:bg-muted" title="Editar"><Pencil className="h-3.5 w-3.5" />Editar</button>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          A comissão é uma % da taxa da casa nas partidas pagas de quem entrou pelo link. O influencer entra no painel com o e-mail e a senha daqui e vê só o dashboard dele. Desativado, o login dele cai. Clique num influencer pra ver os inscritos.
        </p>
      </Panel>

      {inscritosDe && <InscritosModal influencer={inscritosDe} onClose={() => setInscritosDe(null)} />}

      <AlertDialog open={novo} onOpenChange={(o) => { if (!o) { setNovo(false); setForm(VAZIO); } }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Novo influencer</AlertDialogTitle>
            <AlertDialogDescription>Cria a conta (já verificada) e o link de inscrição. Se já existe uma conta com esse e-mail, ela vira influencer e a senha só muda se você preencher.</AlertDialogDescription>
          </AlertDialogHeader>
          <form id="form-influencer" className="grid grid-cols-1 sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (podeCriar) criar.mutate(); }}>
            <Campo label="Nome" className="sm:col-span-2"><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome do influencer" className={fieldCls} /></Campo>
            <Campo label="E-mail (login)"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" className={fieldCls} /></Campo>
            <Campo label="Senha" erro={form.senha && form.senha.length < 6 ? "Mínimo de 6 caracteres" : undefined}>
              <input type="text" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} placeholder="6+ caracteres" className={fieldCls} />
            </Campo>
            <Campo label="Chave Pix (pra receber)"><input value={form.chavePix} onChange={(e) => setForm({ ...form, chavePix: e.target.value })} placeholder="CPF, e-mail, celular ou aleatória" className={fieldCls} /></Campo>
            <Campo label="% da taxa" erro={!pctOk(form.percentual) ? "De 0 a 100" : undefined}>
              <PctInput valor={form.percentual} onChange={(percentual) => setForm({ ...form, percentual })} padrao={padrao} />
            </Campo>
          </form>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button type="submit" form="form-influencer" disabled={criar.isPending || !podeCriar} className="bg-[#9B5BF8] hover:bg-[#884BE0] text-white">{criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditarDialog influencer={editando} padrao={padrao} onClose={() => setEditando(null)} />
    </div>
  );
}

function Campo({ label, erro, className, children }: { label: string; erro?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {erro && <span className="text-xs text-[#CC0854]">{erro}</span>}
    </label>
  );
}

function PctInput({ valor, onChange, padrao }: { valor: string; onChange: (v: string) => void; padrao?: number }) {
  return (
    <div className="flex items-center rounded-xl border border-border bg-white dark:bg-transparent h-10 px-3 focus-within:border-primary">
      <input type="number" min={0} max={100} step="0.1" inputMode="decimal" value={valor} onChange={(e) => onChange(e.target.value)} placeholder={padrao != null ? `padrão (${num(padrao)})` : "padrão"} className="w-full bg-transparent text-sm outline-none tabular-nums" />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
}

/** chave Pix, % própria (vazio = padrão) e senha nova (vazio = mantém) */
function EditarDialog({ influencer: i, padrao, onClose }: { influencer: Influencer | null; padrao?: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [chavePix, setChavePix] = useState("");
  const [percentual, setPercentual] = useState("");
  const [senha, setSenha] = useState("");
  const [de, setDe] = useState<number | null>(null);
  if (i && de !== i.id) {
    setDe(i.id);
    setChavePix(i.chavePix ?? "");
    setPercentual(i.percentual == null ? "" : String(i.percentual));
    setSenha("");
  }
  const salvar = useMutation({
    mutationFn: () => post(`/admin/influencers/${i!.id}`, {
      chavePix: chavePix.trim(), percentual: pctNum(percentual), ...(senha && { senha }),
    }),
    onSuccess: () => {
      toast.success("Influencer atualizado", { description: senha ? "A senha mudou e as sessões abertas dele caíram." : undefined });
      setDe(null); onClose();
      qc.invalidateQueries({ queryKey: ["influencers"] });
    },
    onError: (e) => toast.error("Não salvou", { description: (e as Error).message }),
  });
  const ok = pctOk(percentual) && (senha === "" || senha.length >= 6);

  return (
    <AlertDialog open={!!i} onOpenChange={(o) => { if (!o) { setDe(null); onClose(); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Editar {i?.nome}</AlertDialogTitle>
          <AlertDialogDescription>{i?.email} · link <span className="font-mono">?inf={i?.codigo}</span></AlertDialogDescription>
        </AlertDialogHeader>
        <form id="form-editar-inf" className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (ok) salvar.mutate(); }}>
          <Campo label="Chave Pix"><input value={chavePix} onChange={(e) => setChavePix(e.target.value)} placeholder="CPF, e-mail, celular ou aleatória" className={fieldCls} /></Campo>
          <Campo label="% da taxa (vazio = padrão)" erro={!pctOk(percentual) ? "De 0 a 100" : undefined}>
            <PctInput valor={percentual} onChange={setPercentual} padrao={padrao} />
          </Campo>
          <Campo label="Senha nova (vazio = mantém)" erro={senha && senha.length < 6 ? "Mínimo de 6 caracteres" : undefined}>
            <input type="text" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Trocar derruba as sessões dele" className={fieldCls} />
          </Campo>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <Button type="submit" form="form-editar-inf" disabled={salvar.isPending || !ok} className="bg-[#9B5BF8] hover:bg-[#884BE0] text-white">{salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
