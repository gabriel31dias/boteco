import { Carregando, Erro, pillCls } from "@/shared/components/admin";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MonitorPlay, Radio } from "lucide-react";
import { Replayer, type eventWithTime } from "rrweb";
import "rrweb/dist/style.css";
import Player from "rrweb-player";
import "rrweb-player/dist/style.css";
import { useEffect, useRef, useState } from "react";

/**
 * Vídeo da tela de cada jogador (rrweb: o DOM do app + quadros dos canvas que o
 * próprio app manda, ver src/app/gravarTela.ts). O iframe do rrweb fica sem
 * scripts: o que o jogador mandou nunca roda dentro do painel. Por isso os
 * quadros dos canvas são desenhados por este plugin, e não pelo
 * UNSAFE_replayCanvas do rrweb (que liga scripts no iframe).
 */

type Jogador = { id: number; nome: string; username: string; venceu: boolean; blocos: number; bytes: number; de: number | null; ate: number | null; ultimo: number | null };
type Telas = { aoVivo: boolean; jogo: string; jogadores: Jogador[] };
type Lote = { proximo: number; temMais: boolean; aoVivo: boolean; eventos: eventWithTime[] };

const mb = (b: number) => `${(b / 1_048_576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

type Comando = { property: string; args: unknown[] };
type ArgImagem = { rr_type: string; args: { rr_type: string; data: { base64: string }[]; type: string }[] };

/**
 * Plugin do Replayer: mostra os quadros dos canvas. O quadro vira fundo do
 * canvas (que no replay fica vazio) por uma folha de estilo dentro do iframe:
 * pintar no canvas por fora não repinta num iframe sem scripts, e estilo
 * inline se perderia quando o app mexe no `style` do canvas.
 */
function quadrosDosCanvas() {
  const quadros = new Map<number, string>();   // id do canvas → data URL do último quadro
  let raf = 0;
  let rep: Replayer | null = null;

  const aplicar = () => {
    raf = 0;
    const doc = rep?.iframe.contentDocument;
    if (!doc?.head) return;
    let estilo = doc.getElementById("rr-quadros") as HTMLStyleElement | null;
    if (!estilo) {
      estilo = doc.createElement("style");
      estilo.id = "rr-quadros";
      doc.head.appendChild(estilo);
    }
    const regras: string[] = [];
    for (const [id, url] of quadros) {
      const c = rep!.getMirror().getNode(id) as Element | null;
      if (!c || c.nodeName !== "CANVAS") continue;
      c.setAttribute("data-rr-quadro", String(id));
      regras.push(`canvas[data-rr-quadro="${id}"]{background:url("${url}") 0 0/100% 100% no-repeat !important}`);
    }
    estilo.textContent = regras.join("\n");
  };

  return {
    handler(e: eventWithTime, _sync: boolean, ctx: { replayer: Replayer }) {
      rep = ctx.replayer;
      if (e.type === 2) quadros.clear();   // tela inteira nova: canvas novos (e a folha some com o documento)
      else {
        const d = e.data as { source?: number; id?: number; commands?: Comando[] };
        if (e.type !== 3 || d.source !== 9 || d.id == null || !d.commands) return;
        const img = d.commands.find((x) => x.property === "drawImage")?.args[0] as ArgImagem | undefined;
        const blob = img?.args?.[0];
        const base64 = blob?.data?.[0]?.base64;
        if (!base64 || !/^image\/(webp|jpeg|png)$/.test(blob.type) || !/^[A-Za-z0-9+/=]+$/.test(base64)) return;
        quadros.set(d.id, `data:${blob.type};base64,${base64}`);
      }
      if (!raf) raf = requestAnimationFrame(aplicar);
    },
  };
}

/** Tamanho da tela do aparelho (evento Meta). */
const tamanhoDe = (ev: eventWithTime[]) => {
  const meta = ev.find((e) => e.type === 4)?.data as { width?: number; height?: number } | undefined;
  return { w: meta?.width || 390, h: meta?.height || 844 };
};

// --------------------------------------------------------------- gravada

/** Toda a tela gravada de um jogador, com o player do rrweb (tempo, velocidade, tela cheia). */
export function TelaGravada({ matchId, userId, bytes }: { matchId: number; userId: number; bytes: number }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [baixado, setBaixado] = useState(0);
  const [eventos, setEventos] = useState<eventWithTime[] | null>(null);
  const [erro, setErro] = useState<Error | null>(null);

  useEffect(() => {
    let parou = false;
    setEventos(null); setErro(null); setBaixado(0);
    (async () => {
      const todos: eventWithTime[] = [];
      let desde = 0;
      for (;;) {
        const r = await api<Lote>(`/admin/gravacoes/${matchId}/tela/${userId}?desde=${desde}`);
        if (parou) return;
        todos.push(...r.eventos);
        setBaixado(todos.length);
        if (!r.temMais || r.proximo === desde) break;
        desde = r.proximo;
      }
      setEventos(todos);
    })().catch((e) => !parou && setErro(e));
    return () => { parou = true; };
  }, [matchId, userId]);

  useEffect(() => {
    const el = caixa.current;
    if (!el || !eventos) return;
    if (eventos.length < 2) return;
    const { w, h } = tamanhoDe(eventos);
    const largura = el.clientWidth;
    const altura = Math.min(Math.round(largura * h / w), Math.round(window.innerHeight * 0.7));
    el.innerHTML = "";
    const p = new Player({
      target: el,
      props: {
        events: eventos, width: largura, height: altura, autoPlay: false, skipInactive: true,
        speedOption: [1, 2, 4, 8], mouseTail: false, plugins: [quadrosDosCanvas()],
      },
    });
    return () => { p.pause(); p.getReplayer().destroy(); el.innerHTML = ""; };
  }, [eventos]);

  if (erro) return <Erro error={erro} />;
  if (!eventos) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />Baixando a gravação ({mb(bytes)} comprimido{baixado ? ` · ${baixado.toLocaleString("pt-BR")} eventos` : ""})…
      </div>
    );
  }
  if (eventos.length < 2) return <p className="text-sm text-muted-foreground">A tela desse jogador não chegou a ser gravada.</p>;
  // o rrweb-player flutua (float) e tem fundo branco: aqui fica contido e no tema do painel
  return (
    <div ref={caixa} className={cn("w-full flow-root",
      "[&_.rr-player]:!float-none [&_.rr-player]:mx-auto [&_.rr-player]:!bg-transparent [&_.rr-player]:!shadow-none",
      "[&_.rr-controller]:!bg-transparent [&_.rr-controller]:!rounded-none [&_.rr-timeline__time]:!text-foreground [&_.rr-controller_button]:!text-muted-foreground")} />
  );
}

// --------------------------------------------------------------- ao vivo

/** Tela de um jogador ao vivo (uns segundos atrás do aparelho). */
export function TelaAoVivo({ matchId, userId, nome, compacta }: { matchId: number; userId: number; nome?: string; compacta?: boolean }) {
  const caixa = useRef<HTMLDivElement>(null);
  const palco = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"esperando" | "ao-vivo" | "encerrada">("esperando");

  useEffect(() => {
    const box = caixa.current, root = palco.current;
    if (!box || !root) return;
    let parou = false;
    let proximo: number | null = null;
    let rep: Replayer | null = null;
    let tam = { w: 390, h: 844 };
    let timer = 0;

    const encaixar = () => {
      const s = box.clientWidth / tam.w;
      root.style.width = `${tam.w}px`;
      root.style.transform = `scale(${s})`;
      box.style.height = `${Math.round(tam.h * s)}px`;
    };
    const ro = new ResizeObserver(encaixar);
    ro.observe(box);

    const puxar = async () => {
      try {
        const r = await api<Lote>(`/admin/gravacoes/${matchId}/tela/${userId}?aoVivo=1${proximo != null ? `&desde=${proximo}` : ""}`);
        if (parou) return;
        if (r.eventos.length) {
          if (!rep) {
            if (r.eventos[0].type !== 4) { proximo = null; return; }   // espera um começo com a tela inteira
            tam = tamanhoDe(r.eventos);
            root.innerHTML = "";
            rep = new Replayer([], { root, liveMode: true, mouseTail: false, plugins: [quadrosDosCanvas()] });
            // ao vivo o rrweb deixa o documento "pausado" (animações congeladas no começo)
            rep.on("fullsnapshot-rebuilded", () => rep?.iframe.contentDocument?.documentElement.classList.remove("rrweb-paused"));
            rep.on("resize", (d) => { const x = d as { width: number; height: number }; tam = { w: x.width, h: x.height }; encaixar(); });
            // relógio do aparelho, não o daqui: começa 3 s antes do último evento
            rep.startLive(r.eventos[r.eventos.length - 1].timestamp - 3000);
            encaixar();
          }
          for (const e of r.eventos) rep.addEvent(e);
          setStatus("ao-vivo");
        }
        proximo = r.proximo;
        if (!r.aoVivo && !r.temMais) { setStatus("encerrada"); return; }
      } catch { /* tenta de novo */ }
      if (!parou) timer = window.setTimeout(puxar, 1500);
    };
    void puxar();
    return () => { parou = true; clearTimeout(timer); ro.disconnect(); rep?.destroy(); root.innerHTML = ""; };
  }, [matchId, userId]);

  return (
    <div className="space-y-1.5">
      {nome && (
        <p className="flex items-center gap-2 text-sm font-medium text-[#54052D] dark:text-foreground">
          {status === "ao-vivo" ? <i className="h-2 w-2 rounded-full bg-[#CC0854] animate-pulse" /> : <i className="h-2 w-2 rounded-full bg-muted-foreground/40" />}
          {nome}
          <span className="text-[11px] font-normal text-muted-foreground">{status === "ao-vivo" ? "ao vivo" : status === "encerrada" ? "partida encerrada" : "esperando a tela…"}</span>
        </p>
      )}
      <div ref={caixa} className={cn("relative w-full overflow-hidden rounded-xl bg-black/90 border border-border", compacta ? "min-h-[120px]" : "min-h-[200px]")}>
        <div ref={palco} className="absolute left-0 top-0 origin-top-left [&_.replayer-wrapper]:!static" />
        {status === "esperando" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-white/60">
            <Loader2 className="h-4 w-4 animate-spin" />Esperando a tela do jogador…
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- por partida

/** As telas da partida: ao vivo lado a lado, ou a gravação de um jogador por vez. */
export function TelasDaPartida({ id }: { id: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["telas", id],
    queryFn: () => api<Telas>(`/admin/gravacoes/${id}/telas`),
    refetchInterval: (q) => (q.state.data?.aoVivo ? 5000 : false),
  });
  const [quem, setQuem] = useState<number | null>(null);
  const [modo, setModo] = useState<"ao-vivo" | "gravada">("ao-vivo");

  if (isLoading) return <Carregando />;
  if (error || !data) return <Erro error={error} />;
  const gravados = data.jogadores.filter((j) => j.blocos > 0);
  const aoVivo = data.aoVivo && modo === "ao-vivo";
  const atual = data.jogadores.find((j) => j.id === quem) ?? gravados[0] ?? data.jogadores[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {data.aoVivo && (
          <>
            <button onClick={() => setModo("ao-vivo")} className={cn(pillCls, "inline-flex items-center h-8 text-xs", aoVivo && "!border-[#CC0854] !text-[#CC0854]")}><Radio className="h-3.5 w-3.5" />Ao vivo</button>
            <button onClick={() => setModo("gravada")} className={cn(pillCls, "inline-flex items-center h-8 text-xs", !aoVivo && "!border-primary !text-primary")}><MonitorPlay className="h-3.5 w-3.5" />Desde o começo</button>
            <span className="mx-1 h-5 w-px bg-border" />
          </>
        )}
        {!aoVivo && data.jogadores.map((j) => (
          <button key={j.id} onClick={() => setQuem(j.id)} disabled={!j.blocos}
            className={cn(pillCls, "h-8 text-xs disabled:opacity-40", atual?.id === j.id && "!border-primary !text-primary")}>
            Tela de {j.nome}{j.blocos ? <span className="ml-1 opacity-60">({mb(j.bytes)})</span> : <span className="ml-1 opacity-60">(sem vídeo)</span>}
          </button>
        ))}
      </div>

      {aoVivo ? (
        <div className={cn("grid gap-4", data.jogadores.length > 1 && "md:grid-cols-2", data.jogadores.length > 4 && "xl:grid-cols-3")}>
          {data.jogadores.map((j) => <TelaAoVivo key={j.id} matchId={id} userId={j.id} nome={j.nome} compacta={data.jogadores.length > 2} />)}
        </div>
      ) : !gravados.length ? (
        <p className="text-sm text-muted-foreground">
          Sem vídeo das telas nesta partida. A gravação da tela começou a valer a partir desta versão do app; partidas antes dela só têm os eventos (abaixo).
        </p>
      ) : atual && atual.blocos > 0 ? (
        <TelaGravada key={atual.id} matchId={id} userId={atual.id} bytes={atual.bytes} />
      ) : null}
    </div>
  );
}
