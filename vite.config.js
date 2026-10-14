import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Um processo por jogo (server/jogos.js): cada caminho de socket vai pro seu.
// Os servidores rodam com HTTP=1 (npm run servers), então o proxy é http.
const alvo = (porta) => `http://localhost:${porta}`
const proxy = {
  // antes de /ws/sinuca: o proxy casa por prefixo
  '/ws/sinuca9': { target: alvo(3026), ws: true },
  '/ws/sinuca10': { target: alvo(3027), ws: true },
  '/ws/sinucabr': { target: alvo(3028), ws: true },
  '/ws/sinuca': { target: alvo(3001), ws: true },
  '/ws/snooker': { target: alvo(3029), ws: true },
  '/ws/botao': { target: alvo(3030), ws: true },
  '/ws/jegues': { target: alvo(3031), ws: true },
  '/ws/bazuca': { target: alvo(3032), ws: true },
  '/ws/zumbis': { target: alvo(3033), ws: true },
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
  '/ws/cobras': { target: alvo(3019), ws: true },
  '/ws/arqueiros': { target: alvo(3020), ws: true },
  '/ws/naval': { target: alvo(3021), ws: true },
  '/ws/forca': { target: alvo(3022), ws: true },
  '/ws/golfe': { target: alvo(3023), ws: true },
  '/ws/ultima': { target: alvo(3024), ws: true },
  '/ws/patos': { target: alvo(3025), ws: true },
  '/api': { target: alvo(3001) },
}

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5199, proxy },
  preview: { host: true, proxy },
})
