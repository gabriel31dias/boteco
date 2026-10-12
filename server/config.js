import { one, run } from './db.js';
import { Erro } from './model.js';
import { jogoDe } from './jogos.js';

/**
 * Regras que o admin muda no painel (tabela `config`, uma linha). Lida a cada
 * uso: são oito processos no mesmo banco, e cache aqui deixaria um jogo com a
 * taxa velha depois de o admin trocar.
 */
export const regras = () => one('SELECT * FROM config WHERE id = 1');

/** Taxa própria de cada jogo em pontos-base; jogo fora daqui usa a padrão. */
const taxasJogo = (c = regras()) => {
  try { return JSON.parse(c.taxas_jogo || '{}'); } catch { return {}; }
};

/** Fração da casa em cada pote (0.10 = 10%): a do jogo, se o admin pôs uma, senão a padrão. */
export const taxaCasa = (jogo) => {
  const c = regras();
  return (taxasJogo(c)[jogo] ?? c.taxa_bp) / 10_000;
};

const reais = (c) => c / 100;
const pct = (bp) => bp / 100;

/** Config pro painel: reais e %, como no contrato (docs/ADMIN-API.md). */
export function configPainel() {
  const c = regras();
  return {
    taxaCasa: pct(c.taxa_bp),
    taxasJogo: Object.fromEntries(Object.entries(taxasJogo(c)).map(([j, v]) => [j, pct(v)])),
    bonusCadastroAtivo: !!c.bonus_cadastro_ativo, bonusCadastro: reais(c.bonus_cadastro),
    saqueMinimo: reais(c.saque_minimo), saqueMaxDia: reais(c.saque_max_dia),
    saqueExigeDeposito: !!c.saque_exige_deposito,
    conversaoPontosAtiva: !!c.conversao_ativa,
    indicacaoAtiva: !!c.indicacao_ativa, indicacaoPremio: reais(c.indicacao_premio),
    indicacaoMinPartidas: c.indicacao_min_partidas, indicacaoPercentual: pct(c.indicacao_bp),
    infPercentual: pct(c.inf_bp), infSaqueMinimo: reais(c.inf_saque_minimo),
    atualizadoPor: c.atualizado_por, atualizadoEm: c.atualizado_em,
  };
}

// campo do painel → [coluna, conversão, mínimo, máximo] (limites no valor do painel)
const centavos = (v) => Math.round(v * 100);
const bp = (v) => Math.round(v * 100);
const inteiro = (v) => Math.round(v);
const CAMPOS = {
  taxaCasa: ['taxa_bp', bp, 0, 30],
  bonusCadastro: ['bonus_cadastro', centavos, 0, 1000],
  saqueMinimo: ['saque_minimo', centavos, 0, 100_000],
  saqueMaxDia: ['saque_max_dia', centavos, 0, 1_000_000],
  indicacaoPremio: ['indicacao_premio', centavos, 0, 1000],
  indicacaoMinPartidas: ['indicacao_min_partidas', inteiro, 0, 1000],
  indicacaoPercentual: ['indicacao_bp', bp, 0, 50],
  infPercentual: ['inf_bp', bp, 0, 100],
  infSaqueMinimo: ['inf_saque_minimo', centavos, 0, 100_000],
};
const CHAVES = {
  bonusCadastroAtivo: 'bonus_cadastro_ativo',
  saqueExigeDeposito: 'saque_exige_deposito',
  conversaoPontosAtiva: 'conversao_ativa',
  indicacaoAtiva: 'indicacao_ativa',
};

/** Grava só o que veio; o resto fica como está. */
export function salvarConfig(parcial, por) {
  const sets = [];
  const vals = [];
  for (const [campo, [coluna, conv, min, max]] of Object.entries(CAMPOS)) {
    if (parcial[campo] === undefined) continue;
    const n = Number(parcial[campo]);
    if (!Number.isFinite(n) || n < min || n > max) throw new Erro(`Valor inválido em ${campo} (de ${min} a ${max})`);
    sets.push(`${coluna} = ?`); vals.push(conv(n));
  }
  for (const [campo, coluna] of Object.entries(CHAVES)) {
    if (parcial[campo] === undefined) continue;
    sets.push(`${coluna} = ?`); vals.push(parcial[campo] ? 1 : 0);
  }
  // {jogo: %}; null ou '' tira a taxa própria e o jogo volta pra padrão
  if (parcial.taxasJogo !== undefined) {
    if (!parcial.taxasJogo || typeof parcial.taxasJogo !== 'object') throw new Erro('Valor inválido em taxasJogo');
    const [, conv, min, max] = CAMPOS.taxaCasa;
    const novas = taxasJogo();
    for (const [jogo, v] of Object.entries(parcial.taxasJogo)) {
      if (!jogoDe(jogo)) throw new Erro(`Jogo inválido: ${jogo}`);
      if (v === null || v === '') { delete novas[jogo]; continue; }
      const n = Number(v);
      if (!Number.isFinite(n) || n < min || n > max) throw new Erro(`Taxa inválida em ${jogo} (de ${min} a ${max})`);
      novas[jogo] = conv(n);
    }
    sets.push('taxas_jogo = ?'); vals.push(JSON.stringify(novas));
  }
  if (sets.length) {
    run(`UPDATE config SET ${sets.join(', ')}, atualizado_por = ?, atualizado_em = ? WHERE id = 1`,
      ...vals, por ?? null, Date.now());
  }
  return configPainel();
}
