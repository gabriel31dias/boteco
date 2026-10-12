import { useJogos, type AoVivo } from "@/features/admin/types";
import { TelasDaPartida } from "@/features/admin/gravacoes/Telas";
import { Panel } from "@/shared/components/admin";
import { api } from "@/shared/lib/api";
import { brl } from "@/shared/lib/format";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MonitorPlay } from "lucide-react";
import { Link, useParams } from "react-router-dom";

/** Assistir uma partida acontecendo: a tela de cada jogador, ao vivo. */
export function AoVivoTelaPage() {
  const id = Number(useParams().id);
  const jogos = useJogos();
  const { data } = useQuery({ queryKey: ["ao-vivo"], queryFn: () => api<AoVivo>("/admin/ao-vivo"), refetchInterval: 10_000 });
  const p = data?.partidas.find((x) => x.id === id);

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/ao-vivo" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4" />Ao vivo</Link>
        <Link to={`/gravacoes/${id}`} className="text-sm text-primary hover:underline">Abrir a gravação completa (eventos e alertas)</Link>
      </div>
      <Panel title={p ? `${jogos[p.jogo] ?? p.jogo} · partida #${id} · pote ${brl(p.pote)}` : `Partida #${id}`} icon={<MonitorPlay className="h-5 w-5" />}>
        <TelasDaPartida id={id} />
        <p className="mt-4 text-xs text-muted-foreground">
          É a tela de verdade do aparelho de cada jogador, uns segundos atrás. Nos jogos desenhados em canvas (sinuca, truco, damas) a mesa chega em quadros, cerca de 5 por segundo.
        </p>
      </Panel>
    </div>
  );
}
