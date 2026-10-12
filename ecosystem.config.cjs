// Produção: pm2 start ecosystem.config.cjs && pm2 save
// Um processo por jogo, separado da sinuca (/root/sinuca-mult): processos,
// portas e banco próprios. Todos escutam só no localhost; o nginx
// (botecoonline.site) serve o front e manda /api e /ws/<jogo> pra cá.
const path = require('node:path');

const SITE_URL = 'https://botecoonline.site';

// Porta = a de server/jogos.js + 1000 (3001 -> 4001): as 30xx são da sinuca.
// O buraco é 3010 no jogos.js, mas aqui fica 4010 do mesmo jeito.
const SERVICOS = {
  sinuca: 4001, velha: 4002, domino: 4003, truco: 4004, damas: 4005,
  'truco-duplas': 4006, 'domino-duplas': 4007, chat: 4008, poker: 4009,
  buraco: 4010, 'buraco-duplas': 4011, cacheta: 4012, tanque: 4014, ratos: 4015, capivara: 4016,
};

const backend = ([jogo, porta]) => ({
  name: `boteco-${jogo}`,
  script: 'server/main.js',
  cwd: __dirname,
  exec_mode: 'fork',       // nunca cluster: as salas vivem na memória do processo
  instances: 1,
  autorestart: true,
  max_memory_restart: '400M',
  kill_timeout: 5000,
  time: true,
  env: {
    NODE_ENV: 'production',
    JOGO: jogo,
    PORT: String(porta),
    HTTP: '1',              // o TLS termina no nginx
    HOST: '127.0.0.1',
    DB: path.join(__dirname, 'data/boteco.db'),
    API_URL: SITE_URL,
    SITE_URL,
    // front e API na mesma origem: sem CORS
  },
});

module.exports = { apps: Object.entries(SERVICOS).map(backend) };
