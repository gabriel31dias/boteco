// Mesa de teste do buraco: bots numa sala privada (código TESTE, sem aposta).
// O 1º bot abre a sala e espera; quando um humano entra, o resto senta e começa.
//   node scripts/bots-buraco.mjs           1 contra 1 (1 bot)
//   node scripts/bots-buraco.mjs duplas    2×2 (3 bots: um é seu parceiro)
// Usa as contas bot1..bot3@example.com / teste123 (criadas pelo bots-poker.mjs ou aqui).
import { io } from 'socket.io-client';
import { db } from '../server/db.js';
import { jogadaBot } from '../src/games/buraco/bot.js';

const duplas = process.argv[2] === 'duplas';
const PORTA = duplas ? 3011 : 3010;
const CAMINHO = duplas ? '/ws/buraco-duplas' : '/ws/buraco';
const CODIGO = 'TESTE';
const NOMES = ['Zé Bigode', 'Tião', 'Dona Neide'].slice(0, duplas ? 3 : 1);
const API = 'http://localhost:3001/api';
const post = (rota, corpo) => fetch(`${API}/${rota}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
}).then((r) => r.json());

async function conta(i) {
  const email = `bot${i + 1}@example.com`;
  await post('register', { name: NOMES[i], email, password: 'teste123' });   // já existe: ignora o erro
  db.prepare('UPDATE users SET is_verified = 1 WHERE email = ?').run(email);
  const r = await post('login', { email, password: 'teste123' });
  if (!r.token) throw new Error(`${email}: ${r.error}`);
  return { token: r.token, id: r.profile.id };
}

const contas = await Promise.all(NOMES.map((_, i) => conta(i)));
const ids = new Set(contas.map((c) => c.id));
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

const bots = contas.map((c, i) => {
  const s = io(`http://localhost:${PORTA}`, { path: CAMINHO, auth: { token: c.token }, transports: ['websocket'] });
  const bot = { s, sentado: false, entrar() { if (!bot.sentado) { bot.sentado = true; s.emit('join', { code: CODIGO }); } } };
  s.on('denied', (m) => { console.log(`${NOMES[i]}: recusado — ${m}`); bot.sentado = false; });
  s.on('estado', (e) => {
    const j = jogadaBot(e);
    if (j) nap(700 + Math.random() * 1000).then(() => s.emit('jogada', j));
  });
  s.on('settled', () => { bot.sentado = false; nap(3000).then(() => i === 0 && bot.entrar()); });
  return bot;
});

// O líder vê quem senta: chegou alguém que não é bot, chama o resto da turma.
bots[0].s.on('mesa', (m) => {
  if (m.players.some((p) => !ids.has(p.id))) for (const b of bots.slice(1)) b.entrar();
});
bots[0].s.on('connect', () => {
  bots[0].entrar();
  console.log(`Mesa ${CODIGO} aberta: entre no Buraco${duplas ? ' (duplas)' : ''} → Entrar com código → ${CODIGO}`);
});
