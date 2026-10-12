// Auto-teste do motor de regras. node src/rules.test.js
import { Rules, VARIANTS } from './rules.js';

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('FALHOU: ' + msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} -> esperado ${b}, obtido ${a}`);

function perft(rules, st, d) {
  const ms = rules.moves(st);
  if (d === 1) return ms.length;
  let n = 0;
  for (const m of ms) { const u = rules.do(st, m); n += perft(rules, st, d - 1); rules.undo(st, m, u); }
  return n;
}

// 1. Perft do American Checkers: numeros de referencia publicos.
{
  const r = new Rules(VARIANTS.american);
  const st = r.initial();
  const exp = [7, 49, 302, 1469, 7361, 36768];
  exp.forEach((v, i) => eq(perft(r, r.clone(st), i + 1), v, `perft american d${i + 1}`));
}

// 2. Brasileiras: abertura tem 7 lances; peao nao captura para tras em quiet.
{
  const r = new Rules(VARIANTS.brazilian);
  const st = r.initial();
  eq(r.moves(st).length, 7, 'abertura brasileiras');
  eq(r.count(st).p, 12, 'pecas do jogador');
}

// 3. Captura obrigatoria: havendo captura, so capturas sao legais.
{
  const r = new Rules(VARIANTS.brazilian), N = 8;
  const st = { b: new Int8Array(64), turn: 1, half: 0 };
  const at = (rr, cc) => rr * N + cc;
  st.b[at(5, 2)] = 1; st.b[at(4, 3)] = -1; st.b[at(5, 6)] = 1;
  const ms = r.moves(st);
  eq(ms.length, 1, 'apenas a captura e legal');
  eq(ms[0].to, at(3, 4), 'destino do salto');
  eq(ms[0].captures.length, 1, 'uma peca capturada');
}

// 4. Lei da maioria: escolhe a sequencia mais longa.
{
  const r = new Rules(VARIANTS.brazilian), N = 8;
  const at = (rr, cc) => rr * N + cc;
  const st = { b: new Int8Array(64), turn: 1, half: 0 };
  st.b[at(7, 0)] = 1;
  st.b[at(6, 1)] = -1; st.b[at(4, 3)] = -1; st.b[at(2, 3)] = -1; // corrente de 3
  const ms = r.moves(st);
  eq(ms.length, 1, 'maioria filtra para um lance');
  eq(ms[0].captures.length, 3, 'captura tripla obrigatoria');
}

// 5. Peao captura para tras nas brasileiras, mas nao anda para tras.
{
  const r = new Rules(VARIANTS.brazilian), N = 8;
  const at = (rr, cc) => rr * N + cc;
  const st = { b: new Int8Array(64), turn: 1, half: 0 };
  st.b[at(4, 3)] = 1; st.b[at(5, 4)] = -1;
  const ms = r.moves(st);
  eq(ms.length, 1, 'captura para tras existe');
  eq(ms[0].to, at(6, 5), 'destino da captura para tras');
  const st2 = { b: new Int8Array(64), turn: 1, half: 0 };
  st2.b[at(4, 3)] = 1;
  ok(r.moves(st2).every((m) => ((m.to / N) | 0) === 3), 'peao so anda para frente');
}

// 6. Dama voadora: alcance longo e pouso multiplo apos captura.
{
  const r = new Rules(VARIANTS.brazilian), N = 8;
  const at = (rr, cc) => rr * N + cc;
  const st = { b: new Int8Array(64), turn: 1, half: 0 };
  st.b[at(7, 0)] = 2;
  eq(r.moves(st).length, 7, 'dama isolada no canto tem 7 destinos');
  st.b[at(4, 3)] = -1;
  const ms = r.moves(st);
  eq(ms.length, 4, 'quatro pousos possiveis apos a captura');
  ok(ms.every((m) => m.captures.length === 1), 'todos capturam a mesma peca');
}

// 7. Promocao apenas ao terminar o lance na ultima linha.
{
  const r = new Rules(VARIANTS.brazilian), N = 8;
  const at = (rr, cc) => rr * N + cc;
  const st = { b: new Int8Array(64), turn: 1, half: 0 };
  st.b[at(1, 2)] = 1;
  const m = r.moves(st).find((x) => ((x.to / N) | 0) === 0);
  ok(m.promote, 'peao promove ao chegar na linha 0');
  r.do(st, m);
  eq(st.b[m.to], 2, 'virou dama no tabuleiro');
}
{
  const r = new Rules(VARIANTS.brazilian), N = 8;
  const at = (rr, cc) => rr * N + cc;
  const st = { b: new Int8Array(64), turn: 1, half: 0 };
  st.b[at(2, 3)] = 1; st.b[at(1, 4)] = -1; st.b[at(1, 6)] = -1;
  const ms = r.moves(st);
  eq(ms.length, 1, 'sequencia unica pela lei da maioria');
  eq(ms[0].captures.length, 2, 'passa pela linha 0 e continua como peao');
  eq(ms[0].to, at(2, 7), 'termina fora da linha de promocao');
  ok(!ms[0].promote, 'nao promove no meio da sequencia');
}

// 8. Peca capturada bloqueia e nao pode ser saltada duas vezes.
{
  const r = new Rules(VARIANTS.brazilian), N = 8;
  const at = (rr, cc) => rr * N + cc;
  const st = { b: new Int8Array(64), turn: 1, half: 0 };
  st.b[at(4, 1)] = 1;
  st.b[at(3, 2)] = -1; st.b[at(3, 4)] = -1; st.b[at(5, 4)] = -1; st.b[at(5, 2)] = -1;
  const ms = r.moves(st);
  const max = Math.max(...ms.map((m) => m.captures.length));
  eq(max, 4, 'circuito fechado de 4 capturas');
  eq(ms[0].to, at(4, 1), 'volta a casa de origem');
  ok(new Set(ms[0].captures).size === ms[0].captures.length, 'nenhuma peca capturada duas vezes');
}

// 9. do/undo restaura o estado exatamente.
{
  const r = new Rules(VARIANTS.brazilian);
  const st = r.initial();
  const snap = Int8Array.from(st.b);
  for (const m of r.moves(st)) {
    const u = r.do(st, m);
    for (const m2 of r.moves(st)) { const u2 = r.do(st, m2); r.undo(st, m2, u2); }
    r.undo(st, m, u);
  }
  ok(st.b.every((v, i) => v === snap[i]) && st.turn === 1 && st.half === 0, 'do/undo e simetrico');
}

// 10. Sem lances legais = derrota de quem joga; limite de plies = empate.
{
  const r = new Rules(VARIANTS.brazilian), N = 8;
  const at = (rr, cc) => rr * N + cc;
  const st = { b: new Int8Array(64), turn: 1, half: 0 };
  st.b[at(7, 0)] = 1; st.b[at(6, 1)] = -1; st.b[at(5, 2)] = -1;
  eq(r.outcome(st), -1, 'jogador sem lances perde');
  const st2 = { b: new Int8Array(64), turn: 1, half: 40 };
  st2.b[at(7, 0)] = 2; st2.b[at(0, 7)] = -2;
  eq(r.outcome(st2), 0, 'limite sem captura e empate');
}

console.log(fails === 0 ? 'rules.test.js: todos os testes passaram' : `rules.test.js: ${fails} falha(s)`);
if (typeof process !== 'undefined' && fails) process.exit(1);
