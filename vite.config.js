import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Um processo por jogo (server/jogos.js): cada caminho de socket vai pro seu.
// Os servidores rodam com HTTP=1 (npm run servers), então o proxy é http.
const alvo = (porta) => `http://localhost:${porta}`
const proxy = {
  '/ws/sinuca': { target: alvo(3001), ws: true },
  '/ws/velha': { target: alvo(3002), ws: true },
  // Antes de /ws/domino e /ws/truco: o proxy casa por prefixo, na ordem das chaves.
  '/ws/domino-duplas': { target: alvo(3007), ws: true },
  '/ws/domino': { target: alvo(3003), ws: true },
  '/ws/truco-duplas': { target: alvo(3006), ws: true },
  '/ws/truco': { target: alvo(3004), ws: true },
  '/ws/damas': { target: alvo(3005), ws: true },
  '/ws/chat': { target: alvo(3008), ws: true },
  '/ws/poker': { target: alvo(3009), ws: true },
  // Antes de /ws/buraco: o proxy casa por prefixo.
  '/ws/buraco-duplas': { target: alvo(3011), ws: true },
  '/ws/buraco': { target: alvo(3010), ws: true },
  '/ws/cacheta': { target: alvo(3012), ws: true },
  '/ws/tanque': { target: alvo(3014), ws: true },
  '/ws/ratos': { target: alvo(3015), ws: true },
  '/ws/capivara': { target: alvo(3016), ws: true },
  '/ws/psicopatas': { target: alvo(3017), ws: true },
  '/ws/galinhas': { target: alvo(3018), ws: true },
  '/api': { target: alvo(3001) },
}

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5199, proxy },
  preview: { host: true, proxy },
})
