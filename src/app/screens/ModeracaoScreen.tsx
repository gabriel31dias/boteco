import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../../api.js';

type Pessoa = { id: number; name: string; username: string };
type Denuncia = { id: number; motivo: string; texto: string | null; em: number; de: Pessoa; alvo: Pessoa; silenciadoAte: number | null; total: number };
type Partida = { id: number; jogo: string; sala: string; code: string | null; status: string; stake: number; em: number; jogadores: Pessoa[] };
type Problema = { id: number; name: string; email: string; balance: number; bonus: number; locked: number; tipo: string; deveria?: number };
type Resumo = { denuncias: Denuncia[]; partidas: Partida[]; auditoria: Problema[]; agora: number };

const reais = (c: number) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;
const quando = (t: number) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const MOTIVO: Record<string, string> = { ofensa: 'Ofensa', spam: 'Spam', golpe: 'Golpe', outro: 'Outro' };
const STATUS: Record<string, string> = { disputed: 'Contestada', interrupted: 'Interrompida' };

/**
 * Moderação (só ADMIN_EMAILS): denúncias do chat, partidas contestadas ou
 * interrompidas (as duas foram estornadas) e a conferência do dinheiro.
 */
export const ModeracaoScreen: React.FC = () => {
  const { setActiveTab, showNotification } = useApp();
  const [r, setR] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setErro(null);
    api.adminResumo().then(setR, (e: Error) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  const decidir = (id: number, acao: 'descartar' | 'silenciar') =>
    api.adminDecidir(id, acao).then((novo: Resumo) => {
      setR(novo);
      showNotification(acao === 'silenciar' ? 'Silenciado no chat geral por 24h' : 'Denúncias descartadas');
    }, (e: Error) => showNotification(`❌ ${e.message}`));

  return (
    <div className="flex flex-col gap-4 pb-28 pt-2 px-4 max-w-md mx-auto animate-fade-in">
      <div className="flex items-center gap-3 pt-1">
        <button onClick={() => setActiveTab('perfil')} aria-label="Voltar ao perfil" className="w-9 h-9 rounded-full bg-white/10 grid place-items-center">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-2xl font-black text-white">Moderação</h1>
        <button onClick={carregar} aria-label="Atualizar" className="w-9 h-9 rounded-full bg-white/10 grid place-items-center">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {erro && <p className="text-sm text-rose-300">{erro}</p>}
      {!r && !erro && <p className="text-sm text-gray-400">Carregando…</p>}

      {r && (
        <>
          {/* Dinheiro primeiro: é o que não pode esperar */}
          <section className={`rounded-3xl p-4 border ${r.auditoria.length ? 'bg-rose-950/40 border-rose-500/40' : 'bg-emerald-950/30 border-emerald-500/30'}`}>
            <h2 className="flex items-center gap-2 text-sm font-black text-white">
              {r.auditoria.length ? <AlertTriangle className="w-4 h-4 text-rose-300" /> : <CheckCircle2 className="w-4 h-4 text-emerald-300" />}
              Conferência do dinheiro
            </h2>
            {r.auditoria.length === 0 ? (
              <p className="text-xs text-emerald-200/80 mt-1">Tudo certo: o travado de cada conta bate com as partidas abertas, e ninguém está negativo.</p>
            ) : r.auditoria.map((p, i) => (
              <p key={i} className="text-xs text-rose-100 mt-2">
                <b>{p.name}</b> ({p.email}): {p.tipo === 'travado'
                  ? `travado ${reais(p.locked)}, deveria ser ${reais(p.deveria ?? 0)}`
                  : `saldo ${reais(p.balance)}, bônus ${reais(p.bonus)}, travado ${reais(p.locked)}`}
              </p>
            ))}
          </section>

          <section>
            <h2 className="flex items-center gap-2 text-sm font-black text-white mb-2">
              <ShieldAlert className="w-4 h-4 text-amber-300" />Denúncias abertas ({r.denuncias.length})
            </h2>
            {r.denuncias.length === 0 && <p className="text-xs text-gray-500">Nenhuma denúncia esperando.</p>}
            <div className="space-y-2">
              {r.denuncias.map((d) => (
                <div key={d.id} className="rounded-2xl bg-[#1b1238] border border-purple-500/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-white truncate">{d.alvo.name} <span className="text-gray-500 font-normal">{d.alvo.username}</span></p>
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 text-[11px] font-bold">{MOTIVO[d.motivo] ?? d.motivo}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    por {d.de.name} · {quando(d.em)} · {d.total} {d.total === 1 ? 'pessoa denunciou' : 'pessoas denunciaram'}
                    {d.silenciadoAte && d.silenciadoAte > r.agora ? ` · silenciado até ${quando(d.silenciadoAte)}` : ''}
                  </p>
                  {d.texto && <p className="text-sm text-gray-200 mt-2 px-3 py-2 rounded-xl bg-black/30 break-words">“{d.texto}”</p>}
                  <div className="flex gap-2 mt-2.5">
                    <button onClick={() => decidir(d.id, 'descartar')} className="flex-1 py-2 rounded-xl bg-white/5 text-gray-300 text-xs font-bold">Descartar</button>
                    <button onClick={() => decidir(d.id, 'silenciar')} className="flex-1 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold">Silenciar 24h</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-black text-white mb-1">Partidas estornadas pra conferir</h2>
            <p className="text-[11px] text-gray-500 mb-2">Contestada: os dois lados da sinuca relataram vencedores diferentes. Interrompida: o servidor reiniciou com a mesa aberta. Nas duas, a entrada voltou pra cada um.</p>
            {r.partidas.length === 0 && <p className="text-xs text-gray-500">Nenhuma.</p>}
            <div className="space-y-1.5">
              {r.partidas.map((p) => (
                <div key={p.id} className="rounded-2xl bg-[#1b1238] border border-purple-500/15 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-white">#{p.id} · {p.jogo}{p.code ? ` · sala ${p.code}` : ` · ${p.sala}`}</p>
                    <span className="text-[11px] font-bold text-amber-200">{STATUS[p.status] ?? p.status}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 truncate">{p.jogadores.map((j) => j.name).join(', ')} · {p.stake ? reais(p.stake) : 'sem valor'} · {quando(p.em)}</p>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
