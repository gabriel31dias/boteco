import React, { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';

/** A partir daqui o relógio aparece: antes disso ele só atrapalharia quem pensa. */
const AVISO_SEGUNDOS = 20;

/**
 * Contagem nos últimos segundos da jogada, pros jogos em que estourar o prazo
 * é W.O. (damas, dominó). Quem está na vez vê o alerta em vermelho; o outro vê
 * quanto falta pro adversário.
 */
export const AvisoPrazo: React.FC<{ prazo: number | null; minhaVez: boolean; className?: string }> = ({
  prazo, minhaVez, className = 'bottom-16',
}) => {
  const [segundos, setSegundos] = useState<number | null>(null);
  useEffect(() => {
    if (!prazo) { setSegundos(null); return; }
    const tick = () => setSegundos(Math.max(0, Math.ceil((prazo - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [prazo]);

  if (segundos === null || segundos > AVISO_SEGUNDOS) return null;
  return (
    <div
      role="status"
      className={`absolute left-1/2 -translate-x-1/2 ${className} z-30 flex items-center gap-2 px-4 py-2 rounded-2xl border text-sm font-bold whitespace-nowrap pointer-events-none ${
        minhaVez
          ? 'bg-red-950/85 border-red-400/60 text-red-200'
          : 'bg-black/70 border-white/15 text-gray-300'}`}
    >
      <Timer className="w-4 h-4 shrink-0" />
      {minhaVez
        ? <span>Jogue em <b className="tabular-nums">{segundos}s</b> ou perde a partida</span>
        : <span>O adversário tem <b className="tabular-nums">{segundos}s</b> pra jogar</span>}
    </div>
  );
};
