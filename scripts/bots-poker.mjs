// Mesa de teste do pôquer: 5 bots numa sala privada (código TESTE, sem aposta).
// O 1º bot abre a sala e espera; quando um humano entra, os outros 4 sentam,
// a mesa fecha com 6 e começa na hora. No fim, todo mundo volta a esperar.
//   node scripts/bots-poker.mjs          (com os servidores no ar: npm run servers)
// Contas bot1..bot5@example.com / teste123 — criadas e ativadas na 1ª vez.
import { io } from 'socket.io-client';
import { db } from '../server/db.js';

const API = 'http://localhost:3001/api';
const CODIGO = 'TESTE';
const NOMES = ['Zé Bigode', 'Tião', 'Dona Neide', 'Marlene', 'Juca'];
const post = (rota, corpo) => fetch(`${API}/${rota}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
}).then((r) => r.json());

async function token(i) {
  const email = `bot${i + 1}@example.com`;
  await post('register', { name: NOMES[i], email, password: 'teste123' });   // já existe: ignora o erro
  db.prepare('UPDATE users SET is_verified = 1 WHERE email = ?').run(email);
  const r = await post('login', { email, password: 'teste123' });
  if (!r.token) throw new Error(`${email}: ${r.error}`);
  return { token: r.token, id: r.profile.id };
}

const contas = await Promise.all(NOMES.map((_, i) => token(i)));
const ids = new Set(contas.map((c) => c.id));
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

/** Jogada de boteco: quase sempre paga/passa, às vezes aumenta, às vezes larga. */
function decidir(L) {
  const sorte = Math.random();
  if (L.minRaise != null && sorte < 0.15) {
    const para = Math.min(L.maxRaise, L.minRaise + Math.floor(Math.random() * L.minRaise));
    return sorte < 0.02 ? { tipo: 'allin' } : { tipo: 'raise', valor: para };
  }
  if (L.check) return { tipo: 'check' };
  if (L.call > 0 && sorte > 0.8) return { tipo: 'fold' };
  return { tipo: 'call' };
}

const bots = contas.map((c, i) => {
  const s = io('http://localhost:3009', { path: '/ws/poker', auth: { token: c.token }, transports: ['websocket'] });
  const bot = { s, nome: NOMES[i], sentado: false, entrar() { if (!bot.sentado) { bot.sentado = true; s.emit('join', { code: CODIGO }); } } };
  s.on('denied', (m) => { console.log(`${bot.nome}: recusado — ${m}`); bot.sentado = false; });
  s.on('estado', (e) => {
    if (e.vez === e.assento && e.legais) nap(800 + Math.random() * 1700).then(() => s.emit('jogada', decidir(e.legais)));
  });
  s.on('settled', () => { bot.sentado = false; nap(3000).then(() => i === 0 && bot.entrar()); });
  return bot;
});

// O líder vê quem senta: chegou alguém que não é bot, chama o resto da turma.
bots[0].s.on('mesa', (m) => {
  const humanos = m.players.filter((p) => !ids.has(p.id));
  if (humanos.length) {
    console.log(`${humanos.map((p) => p.name).join(', ')} sentou — chamando os bots`);
    for (const b of bots.slice(1)) b.entrar();
  }
});
bots[0].s.on('connect', () => { bots[0].entrar(); console.log(`Mesa ${CODIGO} aberta: entre no Pôquer → Entrar com código → ${CODIGO}`); });
