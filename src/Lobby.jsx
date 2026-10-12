import { useEffect, useRef, useState } from 'react'
import { useApp } from './app/context/AppContext'
import { useChat } from './app/context/ChatContext'
import { ConvidarAmigos } from './app/components/Chat'
import { Avatar } from './app/components/CustomIcons'
import { net } from './net'
import { api } from './api.js'

// Lógica de sala portada da HomeScreen do sinuca2 (mesmos eventos de socket:
// join/start/denied/proposta/convidado/mesa/joined/recusada); só a cara mudou.

const brl = (centavos) => `R$ ${(centavos / 100).toFixed(2).replace('.', ',')}`
const reais = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`
const APOSTAS = [0, 2, 5, 10, 20]
const SALAS = [
  { id: 'r_treino', name: 'Treino', fee: 0, prize: '+50 pontos', tom: 'treino' },
  { id: 'r_bronze', name: 'Bronze', fee: 2, prize: 'R$ 3,60', tom: 'bronze' },
  { id: 'r_prata', name: 'Prata', fee: 5, prize: 'R$ 9,00', tom: 'prata' },
  { id: 'r_ouro', name: 'Ouro', fee: 10, prize: 'R$ 18,00', tom: 'ouro' },
]
/** Jogo com modo de duplas: o botão de modo troca o id do servidor. */
const MODOS = {
  truco: [['truco', '1 contra 1'], ['truco-duplas', 'Duplas 2×2']],
  domino: [['domino', 'Cada um por si'], ['domino-duplas', 'Duplas 2×2']],
  buraco: [['buraco', '1 contra 1'], ['buraco-duplas', 'Duplas 2×2']],
}
const base = (id) => id.replace(/-duplas$/, '')
/** Jogos com cor (tanque): a escolhida fica guardada pra próxima vez. */
const TOM_COR = { azul: '#3b8cff', vermelho: '#ff4646', verde: '#3ddc5a', amarelo: '#ffc53d', roxo: '#b86bff', rosa: '#ff6fc8' }
const NOME_COR = { azul: 'Azul', vermelho: 'Vermelho', verde: 'Verde', amarelo: 'Amarelo', roxo: 'Roxo', rosa: 'Rosa' }
// figurinha de cada escolha, pra sala de espera: o rato parado / o tanque da cor
const FIG = (() => {
  const g = { ...import.meta.glob('./assets/ratos/*-parado.webp', { eager: true, import: 'default' }),
    ...import.meta.glob('./assets/tanque/tanque-*.webp', { eager: true, import: 'default' }),
    ...import.meta.glob('./assets/capivara/*-anda-0.webp', { eager: true, import: 'default' }) }
  const f = { ratos: {}, tanque: {}, capivara: {} }
  for (const [k, url] of Object.entries(g)) {
    const m = /ratos\/(\w+)-parado|tanque\/tanque-(\w+)\.|capivara\/(\w+)-anda-0/.exec(k)
    if (m) f[m[1] ? 'ratos' : m[2] ? 'tanque' : 'capivara'][m[1] ?? m[2] ?? m[3]] = url
  }
  return f
})()
const novoCodigo = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('')

/**
 * `abrir`: { id, nome, capa } do jogo escolhido na vitrine, ou null.
 * Fica montado o app inteiro: convite aceito no chat entra na sala daqui.
 */
export default function Lobby({ abrir, onClose }) {
  const { profile, walletBalance, bonusBalance, showNotification, setMatch } = useApp()
  const { entrada, consumirEntrada, convidar, setProcurando } = useChat()
  const [jogos, setJogos] = useState({})
  const [jogo, setJogo] = useState(null)          // id do servidor (truco-duplas etc.)
  const [capa, setCapa] = useState(null)
  const [aba, setAba] = useState('criar')         // criar | codigo
  const [roomCode, setRoomCode] = useState('')
  const [aposta, setAposta] = useState(0)
  const [time, setTime] = useState(0)
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [isMatchmaking, setIsMatchmaking] = useState(false)
  const [start, setStart] = useState(null)
  const [proposta, setProposta] = useState(null)
  const [convidado, setConvidado] = useState(null)
  const [mesa, setMesa] = useState(null)
  const [salaPrivada, setSalaPrivada] = useState(null)
  const [convidando, setConvidando] = useState(false)
  const [abreEm, setAbreEm] = useState(null)
  const convidarAoEntrar = useRef(null)
  const jogosRef = useRef(jogos)   // o ouvinte do socket nasce uma vez: lê o catálogo daqui
  jogosRef.current = jogos

  const saldo = walletBalance + bonusBalance
  const info = jogos[jogo] ?? null
  const duplas = !!info?.duplas
  const cores = info?.cores ?? null
  const nomeCor = (c) => info?.nomesCores?.[c] ?? NOME_COR[c] ?? c
  const maxMesa = info?.maxJogadores ?? info?.jogadores ?? 2
  const mesaVariavel = !duplas && maxMesa > 2

  useEffect(() => {
    api.rooms().then((r) => setJogos(r.jogos ?? {})).catch(() => setJogos({}))
  }, [])

  useEffect(() => {
    if (!abrir) return
    setJogo(abrir.id); setCapa(abrir.capa); setAba('criar'); setRoomCode(''); setAposta(0); setTime(0)
  }, [abrir])

  useEffect(() => {
    const quando = mesa?.inicioEm
    if (!quando) { setAbreEm(null); return }
    const tick = () => setAbreEm(Math.max(0, Math.ceil((quando - Date.now()) / 1000)))
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [mesa?.inicioEm])

  useEffect(() => {
    const offs = [
      net.on('start', (m) => setStart(m)),
      net.on('denied', (motivo) => {
        showNotification(`❌ ${motivo}`)
        setIsMatchmaking(false); setSelectedRoom(null); setProposta(null)
        setConvidado(null); setSalaPrivada(null); setConvidando(false)
      }),
      net.on('erro', (msg) => showNotification(`❌ ${msg}`)),
      net.on('proposta', (p) => { setProposta(p); setIsMatchmaking(false) }),
      net.on('convidado', (c) => setConvidado(c.player.name)),
      net.on('mesa', (m) => setMesa(m)),
      net.on('joined', (j) => {
        setSalaPrivada(j.room.type === 'privada' ? { code: j.code, stake: j.room.stake } : null)
      }),
      net.on('recusada', (r) => {
        setProposta(null); setIsMatchmaking(true); setConvidado(null)
        showNotification(`${r.player.name} recusou a aposta`)
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [showNotification])

  // Achou oponente: mostra o VS por um instante e cai na mesa.
  useEffect(() => {
    if (!start) return
    const t = setTimeout(() => { setMatch(start); setIsMatchmaking(false); setStart(null); onClose() }, 1500)
    return () => clearTimeout(t)
  }, [start, setMatch, onClose])

  const salas = SALAS.map((r) => {
    if (!mesaVariavel || !r.fee) return r
    const min = r.fee * 2 * 0.9, max = r.fee * maxMesa * 0.9
    return { ...r, prize: `${reais(min)} a ${reais(max)}` }
  })

  const entrarNaSala = (jogoId, code, apostaReais) => {
    const c = code.toUpperCase()
    setSelectedRoom({
      id: 'custom_' + c, name: `Sala privada #${c}`,
      prize: apostaReais ? brl(Math.round(apostaReais * 100 * 2 * 0.9)) : 'Desafio entre amigos',
    })
    setIsMatchmaking(true); setStart(null); setConvidado(null); setMesa(null); setSalaPrivada(null)
    net.join({ game: jogoId, code: c, stake: apostaReais, ...(jogos[jogoId]?.duplas ? { time } : {}) })
  }

  const handleSelectRoom = (room, jogoId = jogo) => {
    if (room.fee > saldo) return showNotification(`❌ Saldo insuficiente! Recarregue pelo menos ${reais(room.fee)}`)
    setSelectedRoom(room); setIsMatchmaking(true); setStart(null); setMesa(null); setSalaPrivada(null)
    net.join({ game: jogoId, roomType: room.id })
  }

  const criarSala = () => {
    if (aposta > saldo) return showNotification(`❌ Você não tem ${reais(aposta)} pra apostar`)
    entrarNaSala(jogo, novoCodigo(), aposta)
  }

  const entrarComCodigo = (e) => {
    e.preventDefault()
    if (!roomCode.trim()) return showNotification('Digite o código da sala!')
    // Quem entra numa sala que existe paga o valor dela (o servidor manda a proposta).
    entrarNaSala(jogo, roomCode.trim(), 0)
  }

  // Convite aceito no chat / revanche / fila de amigo: mesmo fluxo da HomeScreen.
  useEffect(() => {
    if (!entrada) return
    consumirEntrada()
    if (isMatchmaking) net.leave()
    setJogo(entrada.jogo)
    if (entrada.roomType) {
      const sala = salas.find((r) => r.id === `r_${entrada.roomType}`)
      if (sala) handleSelectRoom(sala, entrada.jogo)
      return
    }
    if (!entrada.code) return
    setRoomCode(entrada.code)
    convidarAoEntrar.current = entrada.convidar?.length ? { code: entrada.code, ids: entrada.convidar } : null
    entrarNaSala(entrada.jogo, entrada.code, entrada.host ? entrada.stake / 100 : 0)
  }, [entrada]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = convidarAoEntrar.current
    if (!salaPrivada || !p || salaPrivada.code !== p.code) return
    convidarAoEntrar.current = null
    for (const id of p.ids) convidar(id, { jogo, code: salaPrivada.code, stake: salaPrivada.stake, revanche: true })
  }, [salaPrivada]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isMatchmaking || !selectedRoom) { setProcurando(null); return }
    const privada = selectedRoom.id.startsWith('custom_')
    setProcurando({
      jogo,
      sala: privada
        ? { tipo: 'privada', code: salaPrivada?.code ?? selectedRoom.id.slice(7) }
        : { tipo: 'fila', roomType: selectedRoom.id.replace(/^r_/, '') },
    })
  }, [isMatchmaking, selectedRoom, salaPrivada, jogo]) // eslint-disable-line react-hooks/exhaustive-deps

  const aceitarAposta = () => { setProposta(null); setIsMatchmaking(true); net.emit('aceitar') }
  const recusarAposta = () => { net.emit('recusar'); setProposta(null); setIsMatchmaking(false); setSelectedRoom(null) }
  const cancelar = () => {
    net.leave()
    setIsMatchmaking(false); setSelectedRoom(null); setStart(null)
    setConvidado(null); setMesa(null); setSalaPrivada(null); setConvidando(false)
  }

  const codigoSala = salaPrivada?.code ?? (selectedRoom?.id.startsWith('custom_') ? selectedRoom.id.slice(7) : null)
  const copiar = () => navigator.clipboard?.writeText(codigoSala).then(() => showNotification('Código copiado! 📋'), () => {})

  const titulo = start ? 'Oponente encontrado!'
    : convidado ? `${convidado} entrou`
    : cores && mesa && !mesa.players.find((p) => p.id === profile.id)?.cor ? (jogo === 'capivara' ? 'Escolha sua capivara!' : info?.nomesCores ? 'Escolha seu rato!' : 'Escolha seu tanque!')
    : cores && mesa && mesa.players.length >= (mesa.minimo ?? 2) && mesa.players.some((p) => !p.cor) ? 'Esperando todos escolherem…'
    : mesa && !mesa.duplas && mesa.jogadores > 2 ? (abreEm !== null ? `Começa em ${abreEm}s` : 'Esperando jogadores…')
    : mesa && mesa.jogadores > 2 ? `Faltam ${mesa.jogadores - mesa.players.length} jogador${mesa.jogadores - mesa.players.length === 1 ? '' : 'es'}`
    : codigoSala ? 'Esperando o amigo…' : 'Procurando partida…'
  const sub = convidado && !start ? 'Aguardando a aposta ser aceita…'
    : mesa && !mesa.duplas && mesa.jogadores > 2 && mesa.premio ? `Prêmio com ${Math.max(mesa.players.length, mesa.minimo ?? 2)}: ${brl(mesa.premio)} · entra mais gente, sobe`
    : `Prêmio: ${selectedRoom?.prize}`
  const oponente = start?.players[(start.seat + 1) % start.players.length]

  const aberto = abrir && !isMatchmaking && !proposta
  const modos = MODOS[base(jogo ?? '')]

  return (
    <>
      {aberto && (
        <div className="lb" role="dialog" aria-modal="true" aria-label={`Jogar ${abrir.nome}`}>
          <div className="lb-bg" onClick={onClose} />
          <div className="lb-card">
            <div className="lb-capa" style={{ backgroundImage: `url(${capa})` }}>
              <button className="lb-x" onClick={onClose} aria-label="Fechar">✕</button>
            </div>
            <div className="lb-corpo">
              <h2>{info?.nome ?? abrir.nome}</h2>
              <p className="lb-sub">{info?.subtitulo}</p>
              <div className="lb-saldo">Seu saldo <b>{reais(walletBalance)}</b>{bonusBalance > 0 && <> + bônus <b>{reais(bonusBalance)}</b></>}</div>

              {modos && (
                <div className="lb-seg">
                  {modos.map(([id, nome]) => (
                    <button key={id} className={jogo === id ? 'on' : ''} onClick={() => setJogo(id)}>{nome}</button>
                  ))}
                </div>
              )}

              <h3>⚡ Jogar agora</h3>
              <div className="lb-salas">
                {salas.map((r) => (
                  <button key={r.id} className={`lb-sala ${r.tom}`} disabled={r.fee > saldo} onClick={() => handleSelectRoom(r)}>
                    <span className="lb-sala-nome">{r.name}</span>
                    <span className="lb-sala-fee">{r.fee ? reais(r.fee) : 'Grátis'}</span>
                    <span className="lb-sala-prize">leva {r.prize}</span>
                  </button>
                ))}
              </div>

              <h3>🔑 Sala privada</h3>
              <div className="lb-seg">
                <button className={aba === 'criar' ? 'on' : ''} onClick={() => setAba('criar')}>Criar sala</button>
                <button className={aba === 'codigo' ? 'on' : ''} onClick={() => setAba('codigo')}>Entrar com código</button>
              </div>

              {duplas && (
                <div className="lb-linha">
                  <span>Seu time</span>
                  <div className="lb-chips">
                    {['Time A', 'Time B'].map((n, t) => (
                      <button key={n} className={time === t ? 'on' : ''} aria-pressed={time === t} onClick={() => setTime(t)}>{n}</button>
                    ))}
                  </div>
                </div>
              )}

              {aba === 'criar' ? (
                <>
                  <div className="lb-linha">
                    <span>Valor da aposta {aposta > 0 && <em>· vencedor leva {brl(Math.round(aposta * 100 * 2 * 0.9))}</em>}</span>
                    <div className="lb-chips">
                      {APOSTAS.map((v) => (
                        <button key={v} disabled={v > saldo} className={aposta === v ? 'on' : ''} onClick={() => setAposta(v)}>
                          {v ? `R$ ${v}` : 'Grátis'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className="lb-btn" onClick={criarSala}>Criar sala e chamar amigos →</button>
                </>
              ) : (
                <form className="lb-codigo" onSubmit={entrarComCodigo}>
                  <input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                    placeholder="CÓDIGO" aria-label="Código da sala" autoCapitalize="characters" />
                  <button className="lb-btn" type="submit">Entrar</button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {isMatchmaking && selectedRoom && (
        <div className="lb" role="dialog" aria-modal="true" aria-label="Sala">
          <div className="lb-bg" />
          <div className="lb-card lb-espera">
            <button className="lb-x" onClick={cancelar} aria-label="Cancelar">✕</button>
            <span className="lb-tag">{selectedRoom.name}</span>
            <h2>{titulo}</h2>
            <p className="lb-sub">{sub}</p>

            {codigoSala && !start && (
              <button className="lb-code" onClick={copiar} aria-label={`Copiar código ${codigoSala}`}>
                <small>Código da sala</small>{codigoSala}<small>toque para copiar</small>
              </button>
            )}

            {mesa && !mesa.duplas && mesa.jogadores > 2 && !start ? (
              <div className="lb-vagas">
                {Array.from({ length: mesa.jogadores }, (_, k) => {
                  const p = mesa.players[k]
                  return (
                    <div key={k} className={p ? '' : 'vazia'} style={p?.cor ? { '--tom': TOM_COR[p.cor] } : undefined}>
                      {p?.cor && FIG[base(jogo ?? '')]?.[p.cor]
                        ? <img className="lb-fig" src={FIG[base(jogo)][p.cor]} alt="" />
                        : p ? <Avatar url={p.avatar} size={30} alt="" /> : <i />}
                      <span>{p ? p.name : 'vaga livre'}{p && cores && <small>{p.cor ? nomeCor(p.cor) : 'escolhendo…'}</small>}</span>
                    </div>
                  )
                })}
              </div>
            ) : mesa && mesa.jogadores > 2 && !start ? (
              <div className="lb-times">
                {[0, 1].map((t) => {
                  const nomes = mesa.players.filter((p) => p.time === t).map((p) => p.name)
                  return (
                    <div key={t}>
                      <b>Time {t === 0 ? 'A' : 'B'}</b>
                      {Array.from({ length: mesa.jogadores / 2 }, (_, k) => <span key={k} className={nomes[k] ? '' : 'vazia'}>{nomes[k] ?? 'vaga livre'}</span>)}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="lb-vs">
                <div><Avatar url={profile.avatarUrl} size={64} alt="Você" /><span>Você</span></div>
                <div className={`lb-vs-meio ${start ? 'ok' : ''}`}>{start ? '⚔️' : <i className="lb-spin" />}<b>VS</b></div>
                <div>
                  {oponente?.avatar ? <Avatar url={oponente.avatar} size={64} /> : <span className="lb-anon">{start ? '⚡' : '?'}</span>}
                  <span>{start ? start.players.filter((_, i) => i % 2 !== start.seat % 2).map((p) => p.name).join(' e ') : convidado ?? 'Buscando…'}</span>
                </div>
              </div>
            )}

            {cores && mesa && !start && (
              <div className="lb-escolha">
                <b>{jogo === 'capivara' ? 'Escolha sua capivara' : info?.nomesCores ? 'Escolha seu rato' : 'Escolha sua cor'}</b>
                <div>
                  {cores.map((c) => {
                    const dono = mesa.players.find((p) => p.cor === c)
                    const meu = dono?.id === profile.id
                    return (
                      <button key={c} className={meu ? 'on' : ''} disabled={!!dono && !meu} aria-pressed={meu}
                        aria-label={nomeCor(c)} style={{ '--tom': TOM_COR[c] }}
                        onClick={() => net.emit('cor', c)}>
                        {FIG[base(jogo ?? '')]?.[c] ? <img src={FIG[base(jogo)][c]} alt="" /> : <i />}
                        <span>{nomeCor(c).split(' · ')[0]}</span>
                        <small>{meu ? 'você' : dono ? dono.name.split(' ')[0] : (nomeCor(c).split(' · ')[1] ?? 'livre')}</small>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {start ? (
              <button className="lb-btn verde" onClick={() => { setMatch(start); setIsMatchmaking(false); setStart(null); onClose() }}>Entrar no jogo 🎮</button>
            ) : (
              <>
                {salaPrivada && <button className="lb-btn" onClick={() => setConvidando(true)}>Convidar amigos</button>}
                <button className="lb-btn sec" onClick={cancelar}>Cancelar</button>
              </>
            )}
          </div>
        </div>
      )}

      {proposta && (
        <div className="lb" role="dialog" aria-modal="true" aria-label="Desafio">
          <div className="lb-bg" />
          <div className="lb-card lb-espera">
            <span className="lb-tag">Sala #{proposta.code}</span>
            <h2>{proposta.host.name} te desafiou ⚔️</h2>
            <div className="lb-prop">
              <div><small>Sua entrada</small><b>{brl(proposta.stake)}</b></div>
              <div className="verde"><small>Se vencer</small><b>{brl(proposta.prize)}</b></div>
            </div>
            <p className="lb-sub">O valor sai do seu saldo só quando você aceitar.</p>
            <button className="lb-btn verde" onClick={aceitarAposta}>Aceitar e jogar</button>
            <button className="lb-btn sec" onClick={recusarAposta}>Recusar</button>
          </div>
        </div>
      )}

      {convidando && salaPrivada && (
        <ConvidarAmigos sala={{ jogo, code: salaPrivada.code, stake: salaPrivada.stake }} onClose={() => setConvidando(false)} />
      )}
    </>
  )
}
