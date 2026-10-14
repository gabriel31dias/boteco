import React, { useEffect, useMemo, useState } from 'react';
import { carregar, progresso } from '../carregar';
import logo from '../../assets/logo.png';

/**
 * Telinha de carregamento de toda partida: o logo e a barra de progresso das
 * imagens do jogo (ver carregar.ts). Cobre a partida, que já vai montando por
 * baixo, e some sozinha quando carregou — no mínimo MIN_MS, pra não piscar;
 * no máximo MAX_MS, pra rede lenta não prender ninguém fora da partida.
 */
const MIN_MS = 900;
const MAX_MS = 12_000;

export const Carregando: React.FC<{ jogo: string }> = ({ jogo }) => {
  const carga = useMemo(() => carregar(jogo), [jogo]);
  const [pct, setPct] = useState(0);
  const [saindo, setSaindo] = useState(false);
  const [fora, setFora] = useState(false);

  useEffect(() => {
    const inicio = performance.now();
    let raf = 0, mostrado = 0;
    const quadro = () => {
      const t = performance.now() - inicio;
      const alvo = t > MAX_MS ? 1 : Math.min(progresso(carga), t / MIN_MS);
      mostrado += (alvo - mostrado) * 0.2;
      if (alvo >= 1 && mostrado > 0.995) mostrado = 1;
      setPct(Math.round(mostrado * 100));
      if (mostrado >= 1) { setSaindo(true); setTimeout(() => setFora(true), 300); return; }
      raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
  }, [carga]);

  if (fora) return null;
  return (
    <div role="progressbar" aria-label="Carregando" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
      className={`fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 bg-[#0b0a12] transition-opacity duration-300 ${saindo ? 'opacity-0 pointer-events-none' : ''}`}>
      <img src={logo} alt="Boteco Online" className="w-[min(55vw,220px)]" />
      <div className="w-[min(70vw,280px)] h-2.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="-mt-3 text-xs font-bold text-white/60 tabular-nums">{pct}%</span>
    </div>
  );
};
