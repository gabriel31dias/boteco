import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { net } from '../../net';

/** Quanto tempo a tela espera a internet voltar antes de tirar o jogador da partida. */
const SEGUNDOS = 5;

type Aviso = { falta: number; definitivo: boolean };

/**
 * Internet caiu no meio da partida: mostra "sem internet" e conta 5s. Voltou
 * nesse tempo e o servidor confirma que ainda estou na mesa: segue o jogo.
 * Não voltou (ou o servidor já me tirou, `definitivo`): sai da partida.
 *
 * Sem isso a mesa ficava congelada (ou, no tempo real, o boneco seguia andando
 * sozinho) num jogo que o servidor já tinha encerrado com W.O.
 */
export const ConexaoPerdida: React.FC<{ matchId: unknown }> = ({ matchId }) => {
  const { setMatch, showNotification } = useApp();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const sairRef = useRef<() => void>(() => {});

  useEffect(() => {
    let acabou = false;          // a partida terminou de verdade (ou já saí): nada a vigiar
    let definitivo = false;      // o servidor já me tirou: não adianta a internet voltar
    let fim = 0;
    let relogio: ReturnType<typeof setInterval> | null = null;
    let conferindo = false;
    setAviso(null);

    const mostrar = () => setAviso({ falta: Math.max(0, Math.ceil((fim - Date.now()) / 1000)), definitivo });

    const sair = () => {
      if (acabou) return;
      acabou = true;
      if (relogio) clearInterval(relogio);
      net.disconnect();   // o servidor (se alcançar) conta como saída
      setMatch(null);
      showNotification(navigator.onLine ? '📶 A conexão caiu e você saiu da partida' : '📶 Sem internet: você saiu da partida');
    };
    sairRef.current = sair;

    const alarme = (def: boolean) => {
      if (acabou) return;
      definitivo ||= def;
      if (!relogio) { fim = Date.now() + SEGUNDOS * 1000; relogio = setInterval(passo, 250); }
      mostrar();
    };

    const cancelar = () => {
      if (!relogio || definitivo) return;
      clearInterval(relogio);
      relogio = null;
      setAviso(null);
    };

    // Pergunta pro servidor se ainda estou na partida. Na contagem a espera é
    // curta: tem que dar tempo de responder antes dos 5s acabarem.
    const conferir = async () => {
      if (acabou || conferindo) return;
      if (!navigator.onLine) { alarme(false); return; }
      conferindo = true;
      const r = await net.conferir(relogio ? 1500 : 4000);
      conferindo = false;
      if (acabou) return;
      if (r === 'ok') cancelar();
      else if (r === 'fora') alarme(true);
      else if (r === 'sem resposta') alarme(false);
    };

    function passo() {
      if (Date.now() >= fim) { sair(); return; }
      mostrar();
      if (!definitivo) conferir();   // voltou? confere de novo
    }

    const offFim = net.on('settled', (s?: { desistiu?: boolean }) => {
      acabou = true;
      if (relogio) clearInterval(relogio);
      setAviso(null);
      // o servidor me tirou (app em segundo plano demais) e a tela segue aberta:
      // sem isso a mesa ficava congelada sem resultado. Quem clicou em sair já saiu da tela.
      if (s?.desistiu) { setMatch(null); showNotification('⏱️ Você ficou fora do jogo e saiu da partida'); }
    });
    const offCaiu = net.on('caiu', () => alarme(true));            // o socket caiu: o servidor já me tirou
    const offInstavel = net.on('instavel', () => alarme(false));   // tempo real parou de receber estado
    const vigia = setInterval(conferir, 5000);
    const semNet = () => alarme(false);
    const visivel = () => { if (document.visibilityState === 'visible') conferir(); };
    addEventListener('offline', semNet);
    addEventListener('online', conferir);
    document.addEventListener('visibilitychange', visivel);
    return () => {
      acabou = true;
      if (relogio) clearInterval(relogio);
      offFim(); offCaiu(); offInstavel(); clearInterval(vigia);
      removeEventListener('offline', semNet);
      removeEventListener('online', conferir);
      document.removeEventListener('visibilitychange', visivel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  if (!aviso) return null;
  const semInternet = typeof navigator !== 'undefined' && !navigator.onLine;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" style={{ touchAction: 'auto' }}>
      <div className="w-full max-w-sm bg-[#140c2c] border border-amber-500/40 rounded-3xl p-6 text-center shadow-[0_0_50px_rgba(245,158,11,0.3)]">
        <div className="mx-auto mb-3 w-16 h-16 rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-3xl animate-pulse">📶</div>
        <h3 className="text-2xl font-black text-white">
          {aviso.definitivo && !semInternet ? 'Conexão perdida' : 'Sem internet'}
        </h3>
        <p className="text-sm text-gray-300 mt-2">
          Saindo da partida em <span className="text-3xl font-black text-amber-300 align-middle mx-1">{aviso.falta}</span>s
        </p>
        <p className="text-xs text-gray-500 mt-2">
          {aviso.definitivo
            ? 'Sua conexão caiu e a partida foi encerrada pra você.'
            : 'Se a internet voltar, você continua jogando.'}
        </p>
        <button
          onClick={() => sairRef.current()}
          className="w-full mt-5 py-3 rounded-2xl bg-white/10 border border-white/15 text-white font-bold text-sm active:scale-95 transition-all"
        >
          Sair agora
        </button>
      </div>
    </div>
  );
};
