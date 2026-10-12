// Mesa de teste da cacheta: bots numa sala privada (código TESTE, sem aposta).
// O 1º bot abre a sala e espera; quando um humano entra, o resto senta e a
// mesa abre. No fim, o 1º bot volta a esperar.
//   node scripts/bots-cacheta.mjs        5 bots (mesa cheia de 6 com você)
//   node scripts/bots-cacheta.mjs 2      2 bots (mesa de 3 abre depois da espera)
// Contas bot1..bot5@example.com / teste123 — criadas e ativadas na 1ª vez.
import { io } from 'socket.io-client';
import { db } from '../server/db.js';
import { jogadaBot } from '../src/games/cacheta/bot.js';

const CODIGO = 'TESTE';
const NOMES = ['Zé Bigode', 'Tião', 'Dona Neide', 'Marlene', 'Juca'].slice(0, Number(process.argv[2]) || 5);
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
  const s = io('http://localhost:3012', { path: '/ws/cacheta', auth: { token: c.token }, transports: ['websocket'] });
  const bot = { s, sentado: false, entrar() { if (!bot.sentado) { bot.sentado = true; s.emit('join', { code: CODIGO }); } } };
  s.on('denied', (m) => { console.log(`${NOMES[i]}: recusado — ${m}`); bot.sentado = false; });
  s.on('estado', (e) => {
    const j = jogadaBot(e);
    if (j) nap(900 + Math.random() * 1400).then(() => s.emit('jogada', j));
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
  console.log(`Mesa ${CODIGO} aberta: entre na Cacheta → Entrar com código → ${CODIGO}`);
});
