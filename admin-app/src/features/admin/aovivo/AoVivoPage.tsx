import { SALAS, useJogos, type AoVivo } from "@/features/admin/types";
import { Carregando, Erro, MiniCard, Panel, pillCls, Table } from "@/shared/components/admin";
import { cn } from "@/shared/lib/utils";
import { api } from "@/shared/lib/api";
import { brl, num } from "@/shared/lib/format";
import { useQuery } from "@tanstack/react-query";
import { Coins, Loader2, MonitorPlay, Radio, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { JogadorModal } from "../jogadores/JogadorModal";

/** "há 3 min" a partir do ms epoch */
function ha(desde: number, agora: number) {
  const s = Math.max(0, Math.round((agora - desde) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

/** partidas acontecendo agora (atualiza a cada 10 s) */
export function AoVivoPage() {
  const jogos = useJogos();
  const [ficha, setFicha] = useState<number | null>(null);
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, []);
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["ao-vivo"],
    queryFn: () => api<AoVivo>("/admin/ao-vivo"),
    refetchInterval: 10_000,
  });
  const partidas = data?.partidas ?? [];
  const jogadores = partidas.reduce((n, p) => n + p.jogadores.length, 0);
  const emJogo = partidas.reduce((n, p) => n + (p.pote || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniCard title="Partidas agora" value={num(partidas.length)} icon={<Radio className="h-5 w-5" />} />
        <MiniCard title="Jogadores na mesa" value={num(jogadores)} icon={<Users className="h-5 w-5" />} />
        <MiniCard title="Em jogo" value={brl(emJogo)} icon={<Coins className="h-5 w-5" />} hint="soma dos potes abertos" />
      </div>

      <Panel title="Jogando agora" icon={<Radio className="h-5 w-5" />}
        actions={<span className="inline-flex items-center gap-2 text-xs text-muted-foreground">{isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <i className="h-2 w-2 rounded-full bg-[#45BC56] animate-pulse" />}atualiza a cada 10 s</span>}>
        <Erro error={error} />
        {isLoading ? <Carregando /> : (
          <Table head={["Jogo", "Sala", "Jogadores", "Entrada", "Pote", "Há", ""]} empty={partidas.length === 0 ? "Ninguém jogando agora." : false}>
            {partidas.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{jogos[p.jogo] ?? p.jogo}<p className="text-[11px] !text-muted-foreground">#{p.id}</p></td>
                <td className="!text-muted-foreground">{SALAS[p.sala] ?? p.sala}{p.codigo && <p className="text-[11px] font-mono">{p.codigo}</p>}</td>
                <td className="!whitespace-normal min-w-[200px]">
                  {p.jogadores.map((j) => (
                    <button key={j.id} onClick={() => setFicha(j.id)} className="mr-2 text-sm font-medium hover:text-primary hover:underline" title={j.username}>{j.nome}</button>
                  ))}
                </td>
                <td>{brl(p.aposta)}</td>
                <td className="font-semibold">{brl(p.pote)}</td>
                <td className="!text-muted-foreground tabular-nums">{ha(p.desde, agora)}</td>
                <td>
                  <Link to={`/ao-vivo/${p.id}`} className={cn(pillCls, "inline-flex items-center text-primary")}><MonitorPlay className="h-4 w-4" />Assistir</Link>
                </td>
              </tr>
            ))}
          </Table>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Clique num jogador pra abrir a ficha dele, ou em Assistir pra ver a tela de cada um ao vivo.</p>
      </Panel>
      {ficha != null && <JogadorModal id={ficha} onClose={() => setFicha(null)} />}
    </div>
  );
}
