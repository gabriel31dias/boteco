import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// node:sqlite é stdlib no Node 22.5+ — sem better-sqlite3, sem build nativo.
const FILE = process.env.DB ?? 'data/sinuca.db';
if (FILE !== ':memory:') mkdirSync(dirname(FILE), { recursive: true });

export const db = new DatabaseSync(FILE);
// busy_timeout ANTES de tudo: um processo por jogo, todos no mesmo arquivo, e
// até o `journal_mode` precisa de lock exclusivo por um instante. Sem a espera,
// subir os quatro servidores juntos derruba os que perderem a corrida — e, em
// jogo, quem escreve aqui é entrada de aposta e pagamento de prêmio.
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Verificação de e-mail é nova: se a tabela de códigos ainda não existe, quem
// já tem conta cadastrou antes da regra e não pode ficar trancado do lado de fora.
const antesDaVerificacao = !db.prepare(
  `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'email_codes'`).get();

// Dinheiro é INTEGER em centavos. Ponto flutuante em saldo é como se perde
// dinheiro sem ninguém roubar nada.
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  username    TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass        TEXT NOT NULL,              -- scrypt: salt:hash em hex
  created_at  INTEGER NOT NULL,
  level       INTEGER NOT NULL DEFAULT 1,
  xp          INTEGER NOT NULL DEFAULT 0,
  balance     INTEGER NOT NULL DEFAULT 0, -- centavos sacáveis
  bonus       INTEGER NOT NULL DEFAULT 0, -- centavos de bônus (não sacáveis)
  locked      INTEGER NOT NULL DEFAULT 0, -- centavos presos em partida
  points      INTEGER NOT NULL DEFAULT 0,
  coins       INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  streak_day  TEXT,                       -- AAAA-MM-DD do último check-in
  total_games INTEGER NOT NULL DEFAULT 0,
  wins        INTEGER NOT NULL DEFAULT 0,
  is_verified INTEGER NOT NULL DEFAULT 0,
  CHECK (balance >= 0 AND bonus >= 0 AND locked >= 0 AND points >= 0 AND coins >= 0)
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,   -- deposit|withdrawal|reward|tournament_entry
  title      TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_tx_user ON transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_missions (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  current   INTEGER NOT NULL DEFAULT 0,
  claimed   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS matches (
  id         INTEGER PRIMARY KEY,
  code       TEXT,
  room_type  TEXT NOT NULL,
  stake      INTEGER NOT NULL,
  prize      INTEGER NOT NULL,
  a_bonus    INTEGER NOT NULL DEFAULT 0,  -- quanto da entrada saiu do bônus
  b_bonus    INTEGER NOT NULL DEFAULT 0,
  a_id       INTEGER NOT NULL REFERENCES users(id),
  b_id       INTEGER NOT NULL REFERENCES users(id),
  c_id       INTEGER REFERENCES users(id),        -- duplas: parceiro de a
  d_id       INTEGER REFERENCES users(id),        -- duplas: parceiro de b
  c_bonus    INTEGER NOT NULL DEFAULT 0,
  d_bonus    INTEGER NOT NULL DEFAULT 0,
  e_id       INTEGER REFERENCES users(id),        -- pôquer: mesa de até 6
  f_id       INTEGER REFERENCES users(id),
  e_bonus    INTEGER NOT NULL DEFAULT 0,
  f_bonus    INTEGER NOT NULL DEFAULT 0,
  fora       TEXT NOT NULL DEFAULT '',            -- pôquer: ids já eliminados ('3,7,'), livres pra jogar outra
  winner_id  INTEGER REFERENCES users(id),
  status     TEXT NOT NULL,   -- playing|settled|refunded|disputed|interrupted
  created_at INTEGER NOT NULL,
  ended_at   INTEGER
);
CREATE INDEX IF NOT EXISTS ix_match_a ON matches(a_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_match_b ON matches(b_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pix_charges (
  external_id TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL,   -- centavos cobrados
  brcode      TEXT NOT NULL,      -- copia e cola
  status      TEXT NOT NULL,      -- pending|paid|expired
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  paid_at     INTEGER
);
CREATE INDEX IF NOT EXISTS ix_pix_user ON pix_charges(user_id, status);

CREATE TABLE IF NOT EXISTS email_codes (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  tries      INTEGER NOT NULL DEFAULT 0,
  sent_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS achievements (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- Amizade: um par por linha, sempre com a_id < b_id (não existe "A→B" e "B→A").
-- de_id é quem pediu; bloqueador_id só existe com status 'bloqueada'.
CREATE TABLE IF NOT EXISTS amizades (
  a_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  de_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,   -- pendente|aceita|bloqueada
  bloqueador_id INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (a_id, b_id)
);

-- Chat: canal 'geral' (para_id nulo) ou 'dm' (entre dois amigos).
CREATE TABLE IF NOT EXISTS mensagens (
  id         INTEGER PRIMARY KEY,
  canal      TEXT NOT NULL,
  de_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  para_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  texto      TEXT NOT NULL,
  lida       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_msg_canal ON mensagens(canal, id DESC);
CREATE INDEX IF NOT EXISTS ix_msg_dm ON mensagens(de_id, para_id, id DESC);

-- Denúncias do chat: uma por (quem denunciou, denunciado) a cada 24h.
CREATE TABLE IF NOT EXISTS denuncias (
  id          INTEGER PRIMARY KEY,
  de_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alvo_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mensagem_id INTEGER,
  texto       TEXT,              -- cópia da mensagem: ela pode sumir do geral
  motivo      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'aberta',   -- aberta|resolvida|descartada
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_den_alvo ON denuncias(alvo_id, created_at DESC);
`);

// Migração preguiçosa: acrescenta coluna que falta num banco já existente.
for (const [tabela, coluna, tipo] of [
  ['matches', 'a_bonus', 'INTEGER NOT NULL DEFAULT 0'],
  ['matches', 'b_bonus', 'INTEGER NOT NULL DEFAULT 0'],
  ['matches', 'game', "TEXT NOT NULL DEFAULT 'sinuca'"],
  ['users', 'avatar', 'BLOB'],                        // foto de perfil, já reduzida no cliente
  ['users', 'avatar_type', 'TEXT'],
  ['users', 'avatar_v', 'INTEGER NOT NULL DEFAULT 0'], // versão: entra na URL pra furar cache
  ['users', 'silenciado_ate', 'INTEGER'],              // chat geral: sem escrever até essa hora
  ['matches', 'c_id', 'INTEGER REFERENCES users(id)'],
  ['matches', 'd_id', 'INTEGER REFERENCES users(id)'],
  ['matches', 'c_bonus', 'INTEGER NOT NULL DEFAULT 0'],
  ['matches', 'd_bonus', 'INTEGER NOT NULL DEFAULT 0'],
  ['matches', 'e_id', 'INTEGER REFERENCES users(id)'],
  ['matches', 'f_id', 'INTEGER REFERENCES users(id)'],
  ['matches', 'e_bonus', 'INTEGER NOT NULL DEFAULT 0'],
  ['matches', 'f_bonus', 'INTEGER NOT NULL DEFAULT 0'],
  ['matches', 'fora', "TEXT NOT NULL DEFAULT ''"],
]) {
  const tem = db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`).get(tabela, coluna);
  // Os processos sobem juntos: entre o SELECT e o ALTER outro pode ter criado
  // a coluna. Perder essa corrida não é erro.
  try {
    if (!tem) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
  } catch (e) {
    if (!/duplicate column/.test(e.message)) throw e;
  }
}

if (antesDaVerificacao) db.exec('UPDATE users SET is_verified = 1');

// O @ é único no sistema. Banco antigo pode ter repetidos: desempata antes de
// criar o índice, acrescentando o id (que já é único) ao nome. O laço cobre o
// caso raro de o nome novo esbarrar em outro que já existia.
for (let i = 0; i < 5; i++) {
  const dup = db.prepare(
    `SELECT 1 FROM users GROUP BY username COLLATE NOCASE HAVING COUNT(*) > 1`).get();
  if (!dup) break;
  db.exec(`UPDATE users SET username = username || id
            WHERE id NOT IN (SELECT MIN(id) FROM users GROUP BY username COLLATE NOCASE)`);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username ON users(username COLLATE NOCASE)');

/** Roda fn dentro de uma transação: débito e crédito não podem ficar pela metade. */
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const one = (sql, ...args) => db.prepare(sql).get(...args);
export const all = (sql, ...args) => db.prepare(sql).all(...args);
export const run = (sql, ...args) => db.prepare(sql).run(...args);
