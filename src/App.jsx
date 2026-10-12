import { useEffect, useRef, useState } from 'react'
import { useApp } from './app/context/AppContext'
import { ChatAvisos, ChatBotao, ChatPainel, ConviteModal, PedidoAmizadeModal } from './app/components/Chat'
import { Avatar } from './app/components/CustomIcons'
import { reduzirFoto } from './app/reduzirFoto'
import { Reacoes } from './app/components/Reacoes'
import { GameScreen } from './app/screens/GameScreen'
import { VelhaScreen } from './app/screens/VelhaScreen'
import { DominoScreen } from './app/screens/DominoScreen'
import { TrucoScreen } from './app/screens/TrucoScreen'
import { DamasScreen } from './app/screens/DamasScreen'
import { PokerScreen } from './app/screens/PokerScreen'
import { BuracoScreen } from './app/screens/BuracoScreen'
import { CachetaScreen } from './app/screens/CachetaScreen'
import { TanqueScreen } from './app/screens/TanqueScreen'
import { RatosScreen } from './app/screens/RatosScreen'
import capaCacheta from './assets/cacheta/capa.webp'
import capaTanque from './assets/tanque/capa.webp'
import capaRatos from './assets/ratos/capa.webp'
import capaDamas from './app/assets/jogo-damas.png'
import capaVelha from './app/assets/jogo-velha.png'
import Lobby from './Lobby.jsx'
import { idade } from './cpf.js'
import { api } from './api.js'

const a = import.meta.glob('./assets/*', { eager: true, import: 'default' })
const img = (n) => a[`./assets/${n}`]

// ponytail: layout in reference pixels (941px wide), scaled to the viewport via CSS zoom
const W = 941
function useZoom() {
  const calc = () => Math.min(document.documentElement.clientWidth, 470) / W
  const [z, setZ] = useState(calc)
  useEffect(() => {
    // observes <html> so a scrollbar appearing (desktop) also re-fits the stage
    const ro = new ResizeObserver(() => setZ(calc()))
    ro.observe(document.documentElement)
    return () => ro.disconnect()
  }, [])
  return z
}

const tabs = [['Todos', 124], ['Slots', 132], ['Cassino', 132], ['Cartas', 138], ['Sinuca', 158], ['Esportes', 141]]
// [name, category matching a tab label]; image index = position in the array
// Sem servidor ainda: comentados pra não aparecer. A imagem vem da posição na lista
// (g0, b0, m0...), então os que ficam fixam a sua — descomentar não troca a capa de ninguém.
const destaque = [
  // ['Fortune Tiger', 'Slots'], ['Aviator', 'Cassino'], ['Spaceman', 'Cassino'], ['Sweet Bonanza', 'Slots'],
]
const boteco = [
  ['Sinuca Online', 'Sinuca'], ['Truco Online', 'Cartas'], ['Pôquer Online', 'Cartas'], ['Dominó Online', ''],
  ['Tanques Online', '', capaTanque], ['Ratos em Guerra', '', capaRatos],
  // ['Cassino Ao Vivo', 'Cassino'],
]
const todos = [
  ['Sinuca', 'Sinuca', img('m0.png')], ['Truco', 'Cartas', img('m1.png')],
  // ['Escopa', 'Cartas', img('m2.png')],
  ['Buraco', 'Cartas', img('m3.png')],
  // ['Canastra', 'Cartas', img('m4.png')],
  ['Dominó', '', img('m5.png')], ['Poker', 'Cartas', img('m6.png')],
  // ['Blackjack', 'Cartas', img('m7.png')], ['Caça-Níquel', 'Slots', img('m8.png')], ['Roleta', 'Cassino', img('m9.png')],
  // ['Crash', 'Cassino', img('m10.png')], ['Mines', 'Cassino', img('m11.png')],
  ['Damas', '', capaDamas], ['Jogo da Velha', '', capaVelha], ['Cacheta', 'Cartas', capaCacheta],
  ['Tanques', '', capaTanque], ['Ratos', '', capaRatos],
]
/** Tile da vitrine -> jogo do servidor (server/jogos.js). O resto ainda não tem servidor. */
const JOGO_DO_TILE = { 'Sinuca Online': 'sinuca', Sinuca: 'sinuca', 'Truco Online': 'truco', Truco: 'truco',
  'Dominó Online': 'domino', Dominó: 'domino', Damas: 'damas', 'Jogo da Velha': 'velha',
  'Pôquer Online': 'poker', Poker: 'poker', Buraco: 'buraco', Cacheta: 'cacheta',
  'Tanques Online': 'tanque', Tanques: 'tanque', 'Ratos em Guerra': 'ratos', Ratos: 'ratos' }
const reais = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`
const steps = [
  ['Cadastre-se', 'Crie sua conta em', 'menos de 1 minuto'],
  ['Faça um depósito', 'Escolha seu método', 'favorito'],
  ['Jogue e ganhe', 'Divirta-se e receba', 'seus prêmios'],
]

const Arrow = ({ s = 24 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16M13 5l7 7-7 7" /></svg>
)

const Icon = {
  home: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5 1.5 12h3v9.5h6v-6h3v6h6V12h3z" /></svg>,
  gift: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9M12 8v13M12 8C10 4 6.5 3.5 6.5 6S10 8 12 8c2 0 5.5-.5 5.5-2S14 4 12 8" /></svg>,
  trophy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M7 3h10v6a5 5 0 0 1-10 0zM7 5H3.5c0 4 1.5 5.5 4 5.5M17 5h3.5c0 4-1.5 5.5-4 5.5M12 14v4M8 21h8l-1-3H9z" /><path d="M12 6l1 2-1 2-1-2z" fill="currentColor" /></svg>,
  user: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="12" cy="8" r="4.5" /><path d="M3.5 21.5c0-4.5 3.8-7.5 8.5-7.5s8.5 3 8.5 7.5z" /></svg>,
}

const sv = (d) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
const menu = [
  ['Principal', [
    ['Início', Icon.home],
    ['Promoções', Icon.gift],
    ['Torneios', Icon.trophy],
    ['Ranking', sv('M4 20V12h4v8M10 20V6h4v14M16 20v-6h4v6')],
    ['Cashback Semanal', sv('M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4M12 8.5l1.1 2.3 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.3z')],
    ['Clube VIP', sv('M3 8l4 4 5-7 5 7 4-4-2 11H5z')],
  ]],
  ['Jogos', tabs.slice(1).map(([t], i) => [t, <img src={img(`tab${i + 1}.png`)} alt="" />])],
  ['Ajuda', [
    ['Minha conta', Icon.user],
    ['Suporte 24h', sv('M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H4zM17 14h3v6h-3z')],
    ['Jogo responsável', sv('M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z')],
  ]],
]

function SideMenu({ open, onClose, page }) {
  const { isAuthenticated, profile, walletBalance, bonusBalance, logoutUser, setPedirFoto } = useApp()
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [open, onClose])
  return (
    <div className={`side ${open ? 'open' : ''}`} aria-hidden={!open} inert={!open}>
      <div className="side-bg" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label="Menu">
        <div className="side-top">
          <img className="side-logo" src={img('logo.png')} alt="Boteco Online" />
          <button className="side-x" onClick={onClose} aria-label="Fechar menu">✕</button>
        </div>
        {isAuthenticated ? (
          <div className="side-user">
            <button className="side-foto" onClick={() => { onClose(); setPedirFoto(true) }} aria-label="Trocar foto de perfil">
              <Avatar url={profile.avatarUrl} size={48} alt="" />
            </button>
            <div><b>{profile.name}</b><span>Saldo {reais(walletBalance)}{bonusBalance > 0 && ` + bônus ${reais(bonusBalance)}`}</span></div>
            <button onClick={() => { onClose(); logoutUser(); location.hash = '/' }}>Sair</button>
          </div>
        ) : (
          <div className="side-cta">
            <button className="entrar" onClick={() => { onClose(); location.hash = '/entrar' }}>Entrar</button>
            <button className="cadastrar" onClick={() => { onClose(); location.hash = '/cadastro' }}>Cadastrar</button>
          </div>
        )}
        <a href="#/" className="side-bonus" onClick={onClose}>
          <b>BÔNUS DE BOAS-VINDAS</b>
          <span>100% até <em>R$300</em></span>
        </a>
        {menu.map(([group, items]) => (
          <nav key={group}>
            <h4>{group}</h4>
            {items.map(([t, ic], i) => (
              <a href={t === 'Início' ? '#/' : ['Torneios', 'Ranking'].includes(t) ? '#/torneios' : ['Promoções', 'Cashback Semanal', 'Clube VIP'].includes(t) ? '#/promocoes' : '#/'} key={t} className={({ home: 'Início', torneios: 'Torneios', promocoes: 'Promoções' })[page] === t ? 'on' : ''} onClick={onClose}>
                <i>{ic}</i>{t}<Arrow s={16} />
              </a>
            ))}
          </nav>
        ))}
        <p className="side-foot">+18 · Jogue com responsabilidade</p>
      </aside>
    </div>
  )
}

function SectionHead({ icon, children }) {
  return (
    <div className="head">
      <img src={img(icon)} alt="" />
      <h2>{children}</h2>
      <a href="#">Ver todos <Arrow s={26} /></a>
    </div>
  )
}

const periods = ['Diário', 'Semanal', 'Mensal', 'Geral']
const PERIODO_API = ['dia', 'semana', 'mes', 'geral']
const pts = (n) => n.toLocaleString('pt-BR')

const Bell = () => (
  <button className="bell" aria-label="Notificações">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0" /></svg>
    <b />
  </button>
)

function BottomNav({ page }) {
  const rk = page === 'torneios'
  return (
    <footer className="bottom">
      <a href="#/" className={page === 'home' ? 'on' : ''}>{page === 'home' ? Icon.home : sv('M3 11 12 3l9 8M5 9.5V21h5v-6h4v6h5V9.5')}<span>Início</span></a>
      <a href="#/promocoes" className={page === 'promocoes' ? 'on' : ''}>{Icon.gift}<span>Promoções</span></a>
      <a href="#/" className="dep"><b>$</b><span>Depositar</span></a>
      <a href="#/torneios" className={rk ? 'on' : ''}>{Icon.trophy}<span>Ranking</span></a>
      <a href="#/">{Icon.user}<span>Conta</span></a>
    </footer>
  )
}

function Home({ openMenu, onJogar }) {
  const { isAuthenticated, walletBalance, bonusBalance, showNotification } = useApp()
  const [cat, setCat] = useState('Todos')
  const filtra = (list, prefix) => list.map(([g, c, url], i) => [g, c, url ?? img(`${prefix}${i}.png`)]).filter(([, c]) => cat === 'Todos' || c === cat)
  const secoes = [
    ['ic-fire.png', <>JOGOS EM <em>DESTAQUE</em></>, 'row games', filtra(destaque, 'g')],
    ['ic-trophy.png', 'JOGOS DO BOTECO', 'row boteco', filtra(boteco, 'b')],
    ['ic-beer.png', <>TODOS OS <em>JOGOS</em></>, 'grid-jogos', filtra(todos, 'm')],
  ].filter((sec) => sec[3].length)
  return (
    <>
      <header className="hero" style={{ backgroundImage: `url(${img('hero.jpg')})` }}>
        <button className="menu" aria-label="Abrir menu" onClick={openMenu}><i /><i /><i /></button>
        <Bell />
        {isAuthenticated ? (
          <>
            <button className="entrar saldo" onClick={openMenu} aria-label="Seu saldo">{reais(walletBalance + bonusBalance)}</button>
            <button className="cadastrar" onClick={() => showNotification('💸 Depósito por Pix chega na próxima etapa')}>Depositar</button>
          </>
        ) : (
          <>
            <button className="entrar" onClick={() => (location.hash = '/entrar')}>Entrar</button>
            <button className="cadastrar" onClick={() => (location.hash = '/cadastro')}>Cadastrar</button>
          </>
        )}
        <img className="logo" src={img('logo.png')} alt="Boteco Online" />
        <button className="bonus" onClick={() => (location.hash = '/cadastro')}>Quero meu bônus <Arrow s={28} /></button>
      </header>

      <nav className="tabs">
        {tabs.map(([t, w], i) => (
          <button key={t} className={cat === t ? 'on' : ''} style={{ width: w }} onClick={() => setCat(t)} aria-pressed={cat === t}>
            <img src={img(`tab${i}.png`)} alt="" />
            {t}
          </button>
        ))}
      </nav>

      {secoes.map(([icon, title, cls, jogos]) => (
        <div key={icon} className="secao">
          <SectionHead icon={icon}>{title}</SectionHead>
          <div className={cls}>
            {jogos.map(([g, , src]) => <button className="tile" key={g} onClick={() => onJogar(g, src)}><img src={src} alt={g} />{JOGO_DO_TILE[g] && <span className="tile-on">AO VIVO</span>}</button>)}
          </div>
        </div>
      ))}
      {!secoes.length && <p className="vazio">⚽ {cat} chegando em breve no boteco!</p>}

      <section className="steps">
        <h3><span>COMECE EM</span> 3 PASSOS</h3>
        {steps.map(([t, d1, d2], i) => (
          <div key={t} className={`step s${i}`}>
            <img src={img(`s${i}.png`)} alt="" />
            <strong><em>{i + 1}.</em> {t}</strong>
            <p>{d1}<br />{d2}</p>
          </div>
        ))}
        <span className="arr a0"><Arrow s={36} /></span>
        <span className="arr a1"><Arrow s={36} /></span>
      </section>

      <a href="#/torneios" className="banner"><img src={img('banner.png')} alt="Torneios diários — Ver torneios" /></a>
    </>
  )
}

function Torneios({ openMenu }) {
  const { profile, isAuthenticated } = useApp()
  const [period, setPeriod] = useState(0)
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState(null)

  // Busca a cada troca de período: o ranking muda a cada partida de qualquer um.
  useEffect(() => {
    let vivo = true
    api.ranking(PERIODO_API[period])
      .then((r) => vivo && setLista(r.ranking))
      .catch((e) => vivo && setErro(e.message))
    return () => { vivo = false }
  }, [period])

  const podio = (lista ?? []).slice(0, 3)
  const resto = (lista ?? []).slice(3)
  const eu = (p) => isAuthenticated && p.id === profile.id
  return (
    <>
      <header className="hero rk-hero" style={{ backgroundImage: `url(${img('rk-hero.jpg')})` }}>
        <button className="menu" aria-label="Abrir menu" onClick={openMenu}><i /><i /><i /></button>
        <Bell />
        <button className="cadastrar rk-dep">Depositar</button>
        <button className="entrar rk-sacar">Sacar</button>
        <img className="logo rk-logo" src={img('rk-logo.png')} alt="Boteco Online" />
      </header>

      <nav className="rk-tabs">
        {periods.map((t, i) => (
          <button key={t} className={period === i ? 'on' : ''} onClick={() => { setPeriod(i); setLista(null); setErro(null) }} aria-pressed={period === i}>
            <img src={img(`rk-p${i}.png`)} alt="" />{t}
          </button>
        ))}
      </nav>

      {erro && <p className="rk-msg">Não deu pra carregar o ranking: {erro}</p>}
      {!lista && !erro && <p className="rk-msg">Carregando…</p>}
      {lista?.length === 0 && <p className="rk-msg">Ninguém pontuou nesse período ainda. Vença uma partida e o 1º lugar é seu.</p>}

      {!!podio.length && (
        <div className="rk-podium" style={{ backgroundImage: `url(${img('rk-podio.jpg')})` }}>
          {podio.map((p, i) => (
            <div key={p.id} className={`rk-pod p${i}${eu(p) ? ' eu' : ''}`}>
              {p.avatarUrl && <img className="rk-foto" src={p.avatarUrl} alt="" />}
              <strong>{p.name}</strong>
              <span className="rk-pts"><img src={img('rk-star.png')} alt="" />{pts(p.points)}</span>
              <b>{p.wins} {p.wins === 1 ? 'vitória' : 'vitórias'}</b>
            </div>
          ))}
        </div>
      )}

      {!!resto.length && (
        <table className="rk-table">
          <thead><tr><th>#</th><th>Usuário</th><th>Pontos</th><th>Vitórias</th></tr></thead>
          <tbody>
            {resto.map((p) => (
              <tr key={p.id} className={eu(p) ? 'eu' : ''}>
                <td>{p.rank}</td>
                <td><span className="rk-user"><img src={p.avatarUrl ?? img(`rk-a${(p.rank - 4) % 7}.png`)} alt="" />{p.name}{eu(p) ? ' (você)' : ''}</span></td>
                <td><span className="rk-pts"><img src={img('rk-star.png')} alt="" />{pts(p.points)}</span></td>
                <td>{p.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

const vazio = { nome: '', nasc: '', email: '', senha: '', promo: '', termos: false }
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

function validar(f) {
  const e = {}
  if (f.nome.trim().split(/\s+/).length < 2) e.nome = 'Informe nome e sobrenome'
  if (!f.nasc) e.nasc = 'Informe sua data de nascimento'
  else if (idade(f.nasc) < 18) e.nasc = 'Você precisa ter 18 anos ou mais'
  if (!emailOk(f.email)) e.email = 'E-mail inválido'
  if (f.senha.length < 8 || !/\d/.test(f.senha) || !/[a-z]/i.test(f.senha)) e.senha = 'Mínimo 8 caracteres, com letras e números'
  if (!f.termos) e.termos = 'Aceite os termos para continuar'
  return e
}

/** Conta criada mas e-mail por confirmar: o servidor mandou um código de 6 dígitos. */
function Codigo({ email, onOk }) {
  const { verifyEmail, resendCode } = useApp()
  const [codigo, setCodigo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const enviar = async (ev) => {
    ev.preventDefault()
    if (codigo.length !== 6) return
    setEnviando(true)
    const ok = await verifyEmail(email, codigo).catch(() => false)
    setEnviando(false)
    if (ok) onOk()
  }
  return (
    <form className="cd-card" onSubmit={enviar}>
      <h1>CONFIRME SEU <em>E-MAIL</em></h1>
      <p className="cd-sub">Mandamos um código de 6 dígitos para<br /><b>{email}</b></p>
      <Campo id="codigo" label="Código">
        <input id="codigo" className="cd-cod" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" autoFocus
          value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} />
      </Campo>
      <button className="cd-btn" type="submit" disabled={enviando || codigo.length !== 6}>{enviando ? 'Conferindo…' : 'Confirmar'} <Arrow s={30} /></button>
      <p className="cd-entrar">Não chegou? <a href="#" onClick={(e) => { e.preventDefault(); resendCode(email) }}>Reenviar código</a></p>
    </form>
  )
}

function Campo({ id, label, erro, children }) {
  return (
    <label className={`cd-campo ${erro ? 'erro' : ''}`} htmlFor={id}>
      <span>{label}</span>
      {children}
      {erro && <small role="alert">{erro}</small>}
    </label>
  )
}

const promoTabs = ['Todas', 'Boas-Vindas', 'Cashback', 'Torneios', 'VIP']
// [tab it belongs to (besides Todas), link, full width?, alt]
const promos = [
  ['Boas-Vindas', '#/cadastro', true, 'Bônus de boas-vindas: 100% até R$300 no seu primeiro depósito. Use o cupom BOTECO100'],
  ['Cashback', '#/promocoes', true, 'Cashback semanal: até 15% de dinheiro de volta'],
  ['Torneios', '#/torneios', false, 'Torneios diários: dispute, suba no ranking e ganhe prêmios reais'],
  ['', '#/', false, 'Rodadas grátis em slots selecionados'],
  ['', '#/', false, 'Bônus nos jogos de mesa: truco, pôquer, buraco e mais'],
  ['VIP', '#/promocoes', false, 'Ofertas VIP: promoções exclusivas pra jogadores VIP'],
]

function Promocoes({ openMenu }) {
  const [tab, setTab] = useState(0)
  const lista = promos.map((p, i) => [...p, i]).filter(([t]) => tab === 0 || t === promoTabs[tab])
  return (
    <>
      <header className="hero pr-hero" style={{ backgroundImage: `url(${img('pr-hero.jpg')})` }}>
        <button className="menu" aria-label="Abrir menu" onClick={openMenu}><i /><i /><i /></button>
        <Bell />
        <button className="cadastrar rk-dep">Depositar</button>
        <button className="entrar rk-sacar">Sacar</button>
        <img className="logo pr-logo" src={img('pr-logo.png')} alt="Boteco Online" />
      </header>

      <nav className="pr-tabs">
        {promoTabs.map((t, i) => (
          <button key={t} className={tab === i ? 'on' : ''} onClick={() => setTab(i)} aria-pressed={tab === i}>
            <img src={img(`pr-t${i}.png`)} alt="" />{t}
          </button>
        ))}
      </nav>

      <div className="pr-cards">
        {lista.map(([, href, full, alt, i]) => (
          <a key={i} href={href} className={full ? 'full' : ''}><img src={img(`pr-c${i}.jpg`)} alt={alt} /></a>
        ))}
      </div>
    </>
  )
}

function CdTopo() {
  return (
    <header className="cd-hero" style={{ backgroundImage: `url(${img('cd-hero.jpg')})` }}>
      <a href="#/" className="cd-voltar" aria-label="Voltar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg></a>
      <img className="logo cd-logo" src={img('logo.png')} alt="Boteco Online" />
    </header>
  )
}

function Entrar() {
  const { loginUser } = useApp()
  const [f, setF] = useState({ id: '', senha: '', lembrar: true })
  const [erros, setErros] = useState({})
  const [verSenha, setVerSenha] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [pendente, setPendente] = useState(false)
  const set = (k) => (ev) => {
    setF({ ...f, [k]: ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value })
    if (erros[k]) setErros({ ...erros, [k]: undefined })
  }
  const enviar = async (ev) => {
    ev.preventDefault()
    const e = {}
    if (!emailOk(f.id)) e.id = 'Informe um e-mail válido'
    if (!f.senha) e.senha = 'Informe sua senha'
    setErros(e)
    if (Object.keys(e).length) return document.getElementById(Object.keys(e)[0])?.focus()
    setEnviando(true)
    const r = await loginUser(f.id.trim(), f.senha)   // erro vira aviso no AppContext
    setEnviando(false)
    if (r === 'pendente') setPendente(true)
    else if (r) location.hash = '/'
  }
  if (pendente) return <><CdTopo /><Codigo email={f.id.trim()} onOk={() => (location.hash = '/')} /></>
  return (
    <>
      <CdTopo />
      <form className="cd-card" onSubmit={enviar} noValidate>
        <h1>BEM-VINDO <em>DE VOLTA!</em></h1>
        <p className="cd-sub">Entre e continue a rodada 🍺</p>

        <Campo id="id" label="E-mail" erro={erros.id}>
          <input id="id" type="email" autoComplete="username" placeholder="voce@email.com" value={f.id} onChange={set('id')} />
        </Campo>
        <Campo id="senha" label="Senha" erro={erros.senha}>
          <div className="cd-senha">
            <input id="senha" type={verSenha ? 'text' : 'password'} autoComplete="current-password" placeholder="Sua senha" value={f.senha} onChange={set('senha')} />
            <button type="button" onClick={() => setVerSenha(!verSenha)} aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}>{verSenha ? 'Ocultar' : 'Mostrar'}</button>
          </div>
        </Campo>

        <div className="lg-linha">
          <label className="cd-termos lg-lembrar">
            <input type="checkbox" checked={f.lembrar} onChange={set('lembrar')} />
            <span>Lembrar de mim</span>
          </label>
          <a href="#/entrar" className="lg-esqueci">Esqueci minha senha</a>
        </div>

        <button className="cd-btn" type="submit" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'} <Arrow s={30} /></button>

        <div className="lg-ou"><span>ou</span></div>
        <a href="#/cadastro" className="lg-cad">Criar conta grátis</a>
        <div className="cd-bonus lg-bonus"><b>NOVO POR AQUI?</b><span>Ganhe 100% até <em>R$300</em> no primeiro depósito</span></div>
      </form>
      <p className="cd-aviso">+18 · Jogue com responsabilidade</p>
    </>
  )
}

function Cadastro() {
  const { registerUser } = useApp()
  const [f, setF] = useState(vazio)
  const [etapa, setEtapa] = useState('form')   // form | codigo
  const [enviando, setEnviando] = useState(false)
  const [erros, setErros] = useState({})
  const [verSenha, setVerSenha] = useState(false)
  const [ok, setOk] = useState(false)
  const set = (k, mask) => (ev) => {
    const v = ev.target.type === 'checkbox' ? ev.target.checked : mask ? mask(ev.target.value) : ev.target.value
    setF({ ...f, [k]: v })
    if (erros[k]) setErros({ ...erros, [k]: undefined })
  }
  const enviar = async (ev) => {
    ev.preventDefault()
    const e = validar(f)
    setErros(e)
    if (Object.keys(e).length) return document.getElementById(Object.keys(e)[0])?.focus()
    // ponytail: o servidor só guarda nome, e-mail e senha; nascimento/termos são checados aqui
    setEnviando(true)
    const r = await registerUser(f.nome.trim(), f.email.trim(), f.senha)
    setEnviando(false)
    if (r === 'pendente') setEtapa('codigo')
    else if (r) setOk(true)
    window.scrollTo(0, 0)
  }

  const topo = <CdTopo />
  if (etapa === 'codigo' && !ok) return <>{topo}<Codigo email={f.email.trim()} onOk={() => setOk(true)} /></>

  if (ok) return (
    <>
      {topo}
      <section className="cd-card cd-ok">
        <div className="cd-check">✓</div>
        <h1>CONTA <em>CRIADA!</em></h1>
        <p>Bem-vindo ao boteco, {f.nome.trim().split(/\s+/)[0]}! 🍺</p>
        <div className="cd-bonus"><b>BÔNUS DE BOAS-VINDAS</b><span>100% até <em>R$300</em> no seu primeiro depósito</span></div>
        <a href="#/" className="cd-btn">Jogar agora com R$ 5 de bônus <Arrow s={30} /></a>
        <a href="#/promocoes" className="cd-link">Ver promoções</a>
      </section>
    </>
  )

  return (
    <>
      {topo}
      <form className="cd-card" onSubmit={enviar} noValidate>
        <h1>CRIE SUA <em>CONTA</em></h1>
        <p className="cd-sub">Leva menos de 1 minuto</p>
        <div className="cd-bonus"><b>BÔNUS DE BOAS-VINDAS</b><span>100% até <em>R$300</em> no seu primeiro depósito</span></div>

        <Campo id="nome" label="Nome completo" erro={erros.nome}>
          <input id="nome" autoComplete="name" placeholder="Seu nome e sobrenome" value={f.nome} onChange={set('nome')} />
        </Campo>
        <Campo id="nasc" label="Data de nascimento" erro={erros.nasc}>
          <input id="nasc" type="date" autoComplete="bday" value={f.nasc} onChange={set('nasc')} />
        </Campo>
        <Campo id="email" label="E-mail" erro={erros.email}>
          <input id="email" type="email" autoComplete="email" placeholder="voce@email.com" value={f.email} onChange={set('email')} />
        </Campo>
        <Campo id="senha" label="Senha" erro={erros.senha}>
          <div className="cd-senha">
            <input id="senha" type={verSenha ? 'text' : 'password'} autoComplete="new-password" placeholder="Mínimo 8 caracteres" value={f.senha} onChange={set('senha')} />
            <button type="button" onClick={() => setVerSenha(!verSenha)} aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}>{verSenha ? 'Ocultar' : 'Mostrar'}</button>
          </div>
        </Campo>
        <Campo id="promo" label="Código promocional (opcional)">
          <input id="promo" placeholder="Ex: BOTECO300" value={f.promo} onChange={set('promo', (v) => v.toUpperCase())} />
        </Campo>

        <label className={`cd-termos ${erros.termos ? 'erro' : ''}`}>
          <input id="termos" type="checkbox" checked={f.termos} onChange={set('termos')} />
          <span>Tenho mais de 18 anos e aceito os <a href="#/cadastro">Termos de Uso</a> e a <a href="#/cadastro">Política de Privacidade</a>.</span>
        </label>
        {erros.termos && <small className="cd-erro-termos" role="alert">{erros.termos}</small>}

        <button className="cd-btn" type="submit" disabled={enviando}>{enviando ? 'Criando…' : 'Criar minha conta'} <Arrow s={30} /></button>
        <p className="cd-entrar">Já tem conta? <a href="#/entrar">Entrar</a></p>
      </form>
      <p className="cd-aviso">+18 · Jogue com responsabilidade</p>
    </>
  )
}

/**
 * Foto de perfil: abre sozinha no primeiro acesso de conta sem foto (AppContext)
 * e de novo tocando na foto do menu. É a foto que aparece na mesa de todos os jogos.
 */
function FotoModal({ onClose }) {
  const { profile, setAvatar, showNotification } = useApp()
  const arquivo = useRef(null)
  const [enviando, setEnviando] = useState(false)
  const escolher = async (ev) => {
    const f = ev.target.files?.[0]
    ev.target.value = ''
    if (!f) return
    setEnviando(true)
    try {
      if (await setAvatar(await reduzirFoto(f))) onClose()
    } catch {
      showNotification('❌ Não deu pra ler essa imagem')
    }
    setEnviando(false)
  }
  return (
    <div className="lb" role="dialog" aria-modal="true" aria-labelledby="ft-titulo">
      <div className="lb-bg" onClick={onClose} />
      <div className="lb-card lb-espera">
        <button className="lb-x" onClick={onClose} aria-label="Fechar">✕</button>
        <span className="lb-tag">Seu perfil</span>
        <button className="ft-foto" onClick={() => arquivo.current?.click()} disabled={enviando} aria-label="Escolher foto de perfil">
          <Avatar url={profile.avatarUrl} size={110} alt={profile.name} />
        </button>
        <h2 id="ft-titulo">COLOQUE SUA <em>FOTO</em></h2>
        <p className="lb-sub">É ela que seus adversários veem na mesa, em todos os jogos.</p>
        <input ref={arquivo} type="file" accept="image/*" onChange={escolher} hidden />
        <button className="lb-btn" onClick={() => arquivo.current?.click()} disabled={enviando}>
          {enviando ? 'Enviando…' : profile.avatarUrl ? 'Trocar foto' : 'Escolher foto'}
        </button>
        <button className="lb-btn sec" onClick={onClose}>Agora não</button>
        <p className="ft-dica">Dá pra trocar depois tocando na sua foto no menu.</p>
      </div>
    </div>
  )
}

function useHashPage() {
  const get = () => location.hash.slice(2) || 'home'
  const [page, setPage] = useState(get)
  useEffect(() => {
    const on = () => { setPage(get()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return page
}

/** Na partida o site sai do caminho: cada jogo tem sua tela, o servidor diz qual (como no sinuca2). */
function Partida({ match }) {
  // A mesa ocupa a tela toda: sem a calha da barra de rolagem do site por baixo.
  useEffect(() => {
    const html = document.documentElement, h = html.style
    h.scrollbarGutter = 'auto'; h.overflow = 'hidden'
    // Sinuca e pôquer no celular em pé: giram a partida pra ficar igual ao desktop (ver gira.js).
    // O pôquer é DOM: o navegador desfaz o giro do toque sozinho, só a sinuca (canvas) precisa do gira.js.
    const girar = () => html.classList.toggle('mesa-girada', ['sinuca', 'poker', 'buraco', 'buraco-duplas', 'cacheta'].includes(match.game) && innerWidth < innerHeight)
    girar()
    addEventListener('resize', girar)
    return () => { removeEventListener('resize', girar); html.classList.remove('mesa-girada'); h.scrollbarGutter = ''; h.overflow = '' }
  }, [match.game])
  const tela = match.game === 'velha' ? <VelhaScreen />
    : match.game === 'domino' || match.game === 'domino-duplas' ? <DominoScreen />
    : match.game === 'truco' || match.game === 'truco-duplas' ? <TrucoScreen />
    : match.game === 'damas' ? <DamasScreen />
    : match.game === 'poker' ? <PokerScreen />
    : match.game === 'buraco' || match.game === 'buraco-duplas' ? <BuracoScreen />
    : match.game === 'cacheta' ? <CachetaScreen />
    : match.game === 'tanque' ? <TanqueScreen />
    : match.game === 'ratos' ? <RatosScreen />
    : <GameScreen />
  return <div className="bt-partida">{tela}<Reacoes key={match.matchId} match={match} /><ChatAvisos /></div>
}

export default function App() {
  const zoom = useZoom()
  const page = useHashPage()
  const { match, isAuthenticated, notification, showNotification, pedirFoto, setPedirFoto } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const [lobby, setLobby] = useState(null)
  const openMenu = () => setMenuOpen(true)
  const jogar = (nome, capa) => {
    const id = JOGO_DO_TILE[nome]
    if (!id) return showNotification('🍺 Esse jogo chega em breve no boteco!')
    if (!isAuthenticated) { showNotification('Entre na sua conta pra jogar 🎱'); location.hash = '/entrar'; return }
    setLobby({ id, nome, capa })
  }
  if (match) return <Partida match={match} />
  return (
    <>
      <SideMenu open={menuOpen} page={page} onClose={() => setMenuOpen(false)} />
      {/* ponytail: stage fills the screen height so the nav sits at the bottom on tall phones */}
      <div className="stage" style={{ zoom, minHeight: window.innerHeight / zoom }}>
        {page === 'torneios' ? <Torneios openMenu={openMenu} /> : page === 'cadastro' ? <Cadastro /> : page === 'entrar' ? <Entrar /> : page === 'promocoes' ? <Promocoes openMenu={openMenu} /> : <Home openMenu={openMenu} onJogar={jogar} />}
        <BottomNav page={page} />
      </div>
      {isAuthenticated && <Lobby abrir={lobby} onClose={() => setLobby(null)} />}
      {isAuthenticated && <><ChatBotao /><ChatPainel /><ConviteModal onEntrar={() => (location.hash = '/')} />{!pedirFoto && <PedidoAmizadeModal />}<ChatAvisos /></>}
      {pedirFoto && isAuthenticated && <FotoModal onClose={() => setPedirFoto(false)} />}
      {notification && <div className="bt-toast" role="status">{notification}</div>}
    </>
  )
}
