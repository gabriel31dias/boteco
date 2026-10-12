import { useJogos, type Config } from "@/features/admin/types";
import { Carregando, Erro, Panel } from "@/shared/components/admin";
import { api, post } from "@/shared/lib/api";
import { dataHora } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Coins, Gift, Handshake, Megaphone, Percent } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

type CampoNum = { k: keyof Config; label: string; un: "R$" | "%" | ""; min: number; max: number; step: string; dica?: string };

/** limites iguais aos do servidor (server/config.js) */
const TAXA: CampoNum[] = [{ k: "taxaCasa", label: "Taxa padrão de cada pote", un: "%", min: 0, max: 30, step: "0.1" }];
const CADASTRO: CampoNum[] = [{ k: "bonusCadastro", label: "Valor do bônus", un: "R$", min: 0, max: 1000, step: "0.01" }];
const SAQUES: CampoNum[] = [
  { k: "saqueMinimo", label: "Saque mínimo", un: "R$", min: 0, max: 100_000, step: "0.01" },
  { k: "saqueMaxDia", label: "Máximo por dia", un: "R$", min: 0, max: 1_000_000, step: "0.01", dica: "0 = sem limite" },
];
const INDICACAO: CampoNum[] = [
  { k: "indicacaoPremio", label: "Prêmio por amigo", un: "R$", min: 0, max: 1000, step: "0.01" },
  { k: "indicacaoMinPartidas", label: "Partidas pagas mínimas", un: "", min: 0, max: 1000, step: "1" },
  { k: "indicacaoPercentual", label: "% da taxa do amigo", un: "%", min: 0, max: 50, step: "0.1" },
];
const INFLUENCER: CampoNum[] = [
  { k: "infPercentual", label: "% padrão da taxa", un: "%", min: 0, max: 100, step: "0.1" },
  { k: "infSaqueMinimo", label: "Saque mínimo", un: "R$", min: 0, max: 100_000, step: "0.01" },
];

export function ConfiguracoesPage() {
  const qc = useQueryClient();
  const { data: c, isLoading, error } = useQuery({ queryKey: ["config"], queryFn: () => api<Config>("/admin/config"), refetchInterval: 30_000 });
  const salvar = useMutation({
    mutationFn: (parcial: Partial<Config>) => post<Config>("/admin/config", parcial),
    onSuccess: (novo) => {
      qc.setQueryData(["config"], novo);
      toast.success("Configuração salva", { description: "Vale daqui pra frente." });
    },
    onError: (e) => toast.error("Não salvou", { description: (e as Error).message }),
  });

  if (isLoading) return <Carregando />;
  if (error || !c) return <Erro error={error ?? new Error("Não carregou a configuração")} />;

  const chave = (k: keyof Config, label: string) => (
    <Switch ligado={!!c[k]} label={label} disabled={salvar.isPending} onChange={() => salvar.mutate({ [k]: !c[k] })} />
  );

  return (
    <div className="space-y-6 animate-fade-in pb-10 max-w-3xl">
      <Panel title="Taxa da casa" icon={<Percent className="h-5 w-5" />}>
        <p className="text-sm text-muted-foreground">
          A casa não aposta: em cada partida paga ela fica com uma <b className="text-foreground">% do pote</b> e o resto vai pro vencedor. É a receita do Boteco.
          Vale pras partidas que começarem depois de salvar.
        </p>
        <Campos campos={TAXA} c={c} salvar={salvar} />
        <TaxasPorJogo c={c} salvar={salvar} />
      </Panel>

      <Panel title="Bônus de cadastro" icon={<Gift className="h-5 w-5" />}>
        <Linha titulo="Dar bônus pra quem cria conta" texto={<>Ligado, toda conta nova entra com o valor abaixo na carteira de <b className="text-foreground">bônus</b> (serve pra jogar, não pra sacar). Desligado, a conta começa com R$ 0.</>}>
          {chave("bonusCadastroAtivo", "Dar bônus de cadastro")}
        </Linha>
        <Campos campos={CADASTRO} c={c} salvar={salvar} />
      </Panel>

      <Panel title="Saques" icon={<Banknote className="h-5 w-5" />}>
        <Linha titulo="Exigir depósito antes do saque" texto={<>Só pede saque quem já tem pelo menos um depósito <b className="text-foreground">pago</b>. Quem só jogou com bônus não saca.</>}>
          {chave("saqueExigeDeposito", "Exigir depósito antes do saque")}
        </Linha>
        <Campos campos={SAQUES} c={c} salvar={salvar} />
      </Panel>

      <Panel title="Conversão de pontos" icon={<Coins className="h-5 w-5" />}>
        <Linha titulo="Deixar trocar pontos por saldo" texto="Os jogadores juntam pontos jogando. Ligado, podem converter os pontos em dinheiro; o valor convertido entra nos custos do dashboard.">
          {chave("conversaoPontosAtiva", "Ligar conversão de pontos")}
        </Linha>
      </Panel>

      <Panel title="Indique e ganhe" icon={<Handshake className="h-5 w-5" />}>
        <Linha titulo="Link de indicação no perfil" texto={<>Quem indicou ganha em bônus um <b className="text-foreground">prêmio fixo</b> quando o amigo deposita e joga o mínimo de partidas pagas, e uma <b className="text-foreground">% da taxa</b> que o amigo gera. Desligado, nada novo é gerado.</>}>
          {chave("indicacaoAtiva", "Ligar indique e ganhe")}
        </Linha>
        <Campos campos={INDICACAO} c={c} salvar={salvar} />
      </Panel>

      <Panel title="Influencers" icon={<Megaphone className="h-5 w-5" />}>
        <p className="text-sm text-muted-foreground">
          O influencer ganha uma <b className="text-foreground">% da taxa da casa</b> nas partidas pagas de quem entrou pelo link <code>?inf=</code>. Esse é o padrão;
          dá pra pôr uma % própria em cada um na tela <b className="text-foreground">Influencers</b>.
        </p>
        <Campos campos={INFLUENCER} c={c} salvar={salvar} />
      </Panel>

      {c.atualizadoEm && <p className="text-xs text-muted-foreground">Última mudança {dataHora(c.atualizadoEm)}{c.atualizadoPor && ` por ${c.atualizadoPor}`}.</p>}
    </div>
  );
}

/** taxa própria de cada jogo; em branco o jogo segue a padrão */
function TaxasPorJogo({ c, salvar }: { c: Config; salvar: { mutate: (p: Partial<Config>) => void; isPending: boolean } }) {
  const jogos = useJogos();
  const atual = () => Object.fromEntries(Object.keys(jogos).map((j) => [j, c.taxasJogo?.[j] != null ? String(c.taxasJogo[j]) : ""]));
  const [v, setV] = useState<Record<string, string>>(atual);
  const chaveAtual = JSON.stringify(c.taxasJogo) + Object.keys(jogos).join();
  useEffect(() => setV(atual()), [chaveAtual]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = (j: string) => Number(String(v[j]).replace(",", "."));
  const ruim = (j: string) => v[j] !== "" && v[j] !== undefined && !(n(j) >= 0 && n(j) <= 30);
  const mudou = Object.keys(jogos).filter((j) => (v[j] ?? "") === "" ? c.taxasJogo?.[j] != null : n(j) !== c.taxasJogo?.[j]);
  const invalido = Object.keys(jogos).some(ruim);

  return (
    <form className="mt-6 border-t border-border pt-5"
      onSubmit={(e) => { e.preventDefault(); if (!invalido && mudou.length) salvar.mutate({ taxasJogo: Object.fromEntries(mudou.map((j) => [j, v[j] === "" ? null : n(j)])) as Config["taxasJogo"] }); }}>
      <p className="text-sm font-medium text-[#54052D] dark:text-foreground">Taxa por jogo</p>
      <p className="mt-1 text-sm text-muted-foreground">Em branco, o jogo usa a taxa padrão ({c.taxaCasa.toLocaleString("pt-BR")}%). De 0 a 30%.</p>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {Object.entries(jogos).map(([j, nome]) => (
          <label key={j} className="text-sm font-medium text-[#54052D] dark:text-foreground">
            {nome}
            <div className={cn("mt-1 flex items-center rounded-full border bg-white dark:bg-transparent h-9 px-3 focus-within:border-primary", ruim(j) ? "border-[#CC0854]" : "border-border")}>
              <input type="number" min={0} max={30} step="0.1" inputMode="decimal" placeholder={`${c.taxaCasa.toLocaleString("pt-BR")} (padrão)`}
                value={v[j] ?? ""} onChange={(e) => setV({ ...v, [j]: e.target.value })} className="w-full bg-transparent text-sm outline-none tabular-nums placeholder:text-muted-foreground/60" />
              <span className="text-sm text-muted-foreground ml-1">%</span>
            </div>
          </label>
        ))}
      </div>
      <button type="submit" disabled={salvar.isPending || invalido || !mudou.length}
        className="mt-4 h-9 px-5 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold disabled:opacity-50">Salvar taxas dos jogos</button>
    </form>
  );
}

function Linha({ titulo, texto, children }: { titulo: string; texto: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <p className="text-sm font-medium text-[#54052D] dark:text-foreground">{titulo}</p>
        <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
      </div>
      {children}
    </div>
  );
}

function Switch({ ligado, label, disabled, onChange }: { ligado: boolean; label: string; disabled?: boolean; onChange: () => void }) {
  return (
    <button role="switch" aria-checked={ligado} aria-label={label} disabled={disabled} onClick={onChange}
      className={cn("relative shrink-0 h-7 w-12 rounded-full border-2 border-[#9B5BF8] transition-colors disabled:opacity-50", ligado ? "bg-[#9B5BF8]" : "bg-transparent")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full transition-all", ligado ? "left-[22px] bg-white" : "left-0.5 bg-[#9B5BF8]")} />
    </button>
  );
}

/** grupo de campos numéricos com um botão Salvar que manda só o que mudou */
function Campos({ campos, c, salvar }: { campos: CampoNum[]; c: Config; salvar: { mutate: (p: Partial<Config>) => void; isPending: boolean } }) {
  const atual = () => Object.fromEntries(campos.map((f) => [f.k, String(c[f.k] ?? "")]));
  const [v, setV] = useState<Record<string, string>>(atual);
  const chaveAtual = campos.map((f) => c[f.k]).join("|");
  useEffect(() => setV(atual()), [chaveAtual]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = (k: string) => Number(String(v[k]).replace(",", "."));
  const invalido = campos.some((f) => v[f.k] === "" || !(n(f.k) >= f.min && n(f.k) <= f.max) || (f.step === "1" && !Number.isInteger(n(f.k))));
  const mudou = campos.filter((f) => n(f.k) !== Number(c[f.k]));

  return (
    <form className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-end"
      onSubmit={(e) => { e.preventDefault(); if (!invalido && mudou.length) salvar.mutate(Object.fromEntries(mudou.map((f) => [f.k, n(f.k)]))); }}>
      {campos.map((f) => {
        const ruim = v[f.k] !== "" && !(n(f.k) >= f.min && n(f.k) <= f.max);
        return (
          <label key={f.k} className="text-sm font-medium text-[#54052D] dark:text-foreground">
            {f.label}
            <div className={cn("mt-1 flex items-center rounded-full border bg-white dark:bg-transparent h-9 px-3 focus-within:border-primary", ruim ? "border-[#CC0854]" : "border-border")}>
              {f.un === "R$" && <span className="text-sm text-muted-foreground mr-1">R$</span>}
              <input type="number" min={f.min} max={f.max} step={f.step} inputMode={f.step === "1" ? "numeric" : "decimal"} value={v[f.k]} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} className="w-full bg-transparent text-sm outline-none tabular-nums" />
              {f.un === "%" && <span className="text-sm text-muted-foreground ml-1">%</span>}
            </div>
            <span className={cn("mt-1 block text-[11px] font-normal", ruim ? "text-[#CC0854]" : "text-muted-foreground")}>{f.dica ?? `de ${f.min.toLocaleString("pt-BR")} a ${f.max.toLocaleString("pt-BR")}`}</span>
          </label>
        );
      })}
      <button type="submit" disabled={salvar.isPending || invalido || !mudou.length}
        className="h-9 px-5 rounded-full bg-[#9B5BF8] hover:bg-[#884BE0] text-white text-sm font-semibold disabled:opacity-50 justify-self-start col-span-full">Salvar</button>
    </form>
  );
}
