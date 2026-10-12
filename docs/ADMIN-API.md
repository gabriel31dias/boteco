# API do painel admin (Joggpix)

Contrato entre o backend (`server/painel/*.js`, rotas em `server/api.js`) e o
painel (`admin-app/`, servido em `https://joggpix.com/admin/`).

Os jogos são **entre jogadores**: a casa não aposta, ela fica com a **taxa**
de cada partida paga (pote − prêmios). Não existe RTP.

## Convenções

- Base: `${VITE_API_URL}/api` (produção: `https://api.prevsion.com/api`). Origem
  diferente da do painel; CORS já libera joggpix.com.
- Só **GET e POST** (o CORS não libera outros métodos).
- Auth: `Authorization: Bearer <token>`. O token sai de `POST /api/login`
  `{email, password}` → `{token, profile: {..., isAdmin, isInfluencer}}`.
  - 401 → sessão inválida (volta pro login).
  - 403 → sem acesso.
  - Erro: `{error: "mensagem"}`.
- Admin = `profile.isAdmin`. Influencer = `profile.isInfluencer`. A mesma conta
  pode ser as duas coisas; o painel prioriza admin.
- Logout: `POST /api/logout`.
- Dinheiro em **reais** (number). Datas em **ms epoch** (number).
- Período: `de` e `ate` em `YYYY-MM-DD`, que são dias de São Paulo (UTC−3). Os
  dois são opcionais: sem eles, vale todo o período.
- Paginação: `pagina` (1…), `porPagina` (padrão 20, máx. 100). Resposta paginada:
  `Pagina<T,S> = { itens: T[], total, pagina, porPagina, soma: S }`.
- `jogo`: `sinuca | velha | domino | domino-duplas | truco | truco-duplas | damas`.
  Nomes vêm de `GET /api/rooms` → `jogos[]` (`{id, nome, ...}`).

## Dashboard

`GET /api/admin/dashboard?de&ate&jogo`

```ts
{
  periodo: { de, ate, granularidade: 'hora' | 'dia' },   // hora quando de == ate
  depositos: { valor, quantidade, ticketMedio, clientes, conversao,      // conversao 0..1
               pendentes: { quantidade, valor } },
  partidas: { quantidade, apostado, premios, taxa, jogadores, estornadas },  // só pagas entram em apostado/premios/taxa
  custos: { bonus, conversao, indicacoes, influencers, total },          // o que a casa deu de volta
  lucroLiquido,            // partidas.taxa − custos.total
  saques: { aprovados: { quantidade, valor }, pendentes: { quantidade, valor } },
  caixa,                   // depositos.valor − saques.aprovados.valor
  saldoJogadores: { saldo, bonus, travado },   // agora, não do período
  jogandoAgora,            // partidas em andamento agora
  alertas: number,         // problemas da conferência do dinheiro (deve ser 0)
  serie: { rotulo, depositos, taxa, custos, lucroLiquido, partidas }[],
  porJogo: { jogo, nome, partidas, apostado, premios, taxa, jogadores }[],
  ultimosDepositos: Deposito[],   // 8
}
```

Com `jogo`, os campos de depósito, custos e saque continuam sendo globais. O
painel mostra "Taxa · <jogo>" no lugar do lucro.

## Ao vivo

`GET /api/admin/ao-vivo` → `{ partidas: { id, jogo, sala, codigo, aposta, pote, jogadores: {id,nome,username}[], desde }[] }`

## Depósitos (Pix)

`GET /api/admin/depositos?de&ate&status&q&min&max&pagina&porPagina`

- `status`: `pago | pendente | expirado`.
- `q`: nome, e-mail ou id do Pix.
- Resposta: `Pagina<Deposito, number>`, com `soma` = valor total do filtro.
- `Deposito = { id, userId, nome, email, valor, status, criadoEm, pagoEm }`

## Saques

Aprovação manual: o jogador pede, o saldo fica reservado, o admin faz o Pix na
mão e aprova. Se cancelar, o valor volta pro saldo.

`GET /api/admin/saques?status&q&de&ate&pagina&porPagina`

- `status`: `pendente` (padrão) `| aprovado | cancelado | todos`.
- Resposta: `Pagina<Saque, number> & { pendentes: { quantidade, valor } }`

```ts
Saque = { id, userId, nome, email, chavePix, tipoChave, valor, status, motivo,
          criadoEm, decididoEm, decididoPor,
          conferencia: { depositado, jaSacado, resultadoPartidas, taxaPaga, bonusRecebido, saldoAgora } }
```

- `resultadoPartidas` = prêmios recebidos − entradas pagas (só partidas pagas).
- Alerta no painel quando `valor + jaSacado > depositado + max(resultadoPartidas, 0) + 0.01`.

Ações:

- `POST /api/admin/saques/:id/aprovar` → `{ok}`. Responde 409 se o saque não está mais pendente.
- `POST /api/admin/saques/:id/cancelar {motivo}` → `{ok}`. `motivo` tem ≥ 3 letras e aparece pro jogador.

## Partidas

`GET /api/admin/partidas?de&ate&jogo&status&sala&q&pagina&porPagina`

- `status`: `settled | refunded | disputed | interrupted | playing`.
- `sala`: `bronze | prata | ouro | privada | treino`.
- `q`: nome, @ ou e-mail de um jogador.
- Resposta: `Pagina<Partida, { apostado, premios, taxa }>`

```ts
Partida = { id, jogo, sala, codigo, status, aposta, pote, premio, taxa,
            jogadores: { id, nome, username, venceu }[], criadoEm, encerradaEm }
```

- `aposta` = entrada por jogador.
- `pote` = aposta × jogadores.
- `premio` = valor por vencedor.
- `taxa` = o que a casa ficou (0 se não foi paga).

## Jogadores

`GET /api/admin/jogadores?q&ordem&pagina&porPagina`

- `ordem`: `recente` (padrão) `| saldo | nome | depositado`.
- Resposta: `Pagina<Jogador, { saldo, bonus }>`

```ts
Jogador = { id, nome, username, email, saldo, bonus, travado, depositado, sacado,
            partidas, vitorias, criadoEm, verificado, bloqueado: boolean,
            influencer: string | null, jogandoAgora: boolean }
```

### Ficha do jogador

`GET /api/admin/jogadores/:id`

```ts
{
  conta: { id, nome, username, email, verificado, criadoEm, saldo, bonus, travado, pontos, nivel, avatarUrl },
  origem: { indicadoPor: { id, nome } | null, influencer: { id, nome, codigo } | null },
  depositos: { pagos: { quantidade, valor }, pendentes: { quantidade, valor }, primeiroEm, ultimoEm },
  saques: { aprovados: { quantidade, valor }, pendentes: { quantidade, valor }, cancelados: { quantidade, valor } },
  partidas: { quantidade, vitorias, apostado, ganho, resultado, taxaGerada,
              porJogo: { jogo, nome, partidas, vitorias, apostado, ganho, resultado }[] },
  bonus: { quantidade, valor, porTipo: Record<tipo, { quantidade, valor }> },
  indicacoes: { codigo, indicados, ganho },
  bloqueio: { em, por, motivo } | null,
}
```

### Histórico do jogador

`GET /api/admin/jogadores/:id/historico?tipo&pagina&porPagina` → `{ itens, total, pagina, porPagina }`

Itens por `tipo`:

| tipo | item |
|---|---|
| `partidas` | `{ id, jogo, sala, aposta, premio, venceu, status, adversarios, criadoEm }` |
| `depositos` | `Deposito` |
| `saques` | `{ id, valor, chavePix, status, motivo, criadoEm, decididoEm }` |
| `bonus` | `{ id, tipo, valor, motivo, criadoPor, criadoEm }` |
| `transacoes` | `{ id, tipo, titulo, valor, criadoEm }` |
| `indicados` | `{ id, nome, email, status, depositou, partidas, criadoEm }` |

### Ações sobre o jogador

- `POST /api/admin/jogadores/:id/bonus {valor, motivo}` → `{ok}`. Vai pro **bônus**, que não é sacável. Máximo R$ 10.000.
- `POST /api/admin/jogadores/:id/remover {carteira: 'saldo'|'bonus', valor?, tudo?: true, motivo}` → `{ok, removido}`
- `POST /api/admin/jogadores/:id/bloquear {motivo}` → `{ok}`. Derruba as sessões; a conta não entra mais.
- `POST /api/admin/jogadores/:id/desbloquear` → `{ok}`

## Bônus

`tipo`: `cadastro | manual | link | indicacao | conversao` (`conversao` = pontos virando saldo).

`GET /api/admin/bonus?de&ate&tipo&q&pagina&porPagina`

- Resposta: `Pagina<Bonus, { valor, porTipo: Record<tipo, { quantidade, valor }> }>`
- `Bonus = { id, tipo, userId, nome, email, valor, motivo, criadoPor, criadoEm }`

`POST /api/admin/bonus {email, valor, motivo}` → `{ok, userId, nome}` (o mesmo que o bônus da ficha, só que pelo e-mail).

### Links de bônus

O jogador abre `https://joggpix.com/?bonus=CODIGO` e, logado, ganha o valor em bônus. É um por conta, até o `limite`.

- `GET /api/admin/bonus-links` → `BonusLink[]`
- `POST /api/admin/bonus-links {nome, valor, limite?, codigo?}` → `{id, codigo}`
- `POST /api/admin/bonus-links/:id {ativo}` → `{ok}`
- `GET /api/admin/bonus-links/:id/resgates?pagina&porPagina` → `Pagina<{ userId, nome, email, valor, criadoEm }, number>`

```ts
BonusLink = { id, codigo, nome, valor, limite: number | null, resgates, totalPago,
              ativo, esgotado, criadoPor, criadoEm, link }
```

## Indicações (indique e ganhe, entre jogadores)

Cada jogador tem um código; o link é `https://joggpix.com/?ref=CODIGO`. Quem
indicou ganha em **bônus**:

- um prêmio fixo, quando o amigo deposita e joga N partidas pagas;
- uma % da taxa que o amigo gera.

`GET /api/admin/indicacoes?status&q&pagina&porPagina`

- `status`: `pendente | liberada`.
- Resposta: `Pagina<Indicacao, { pendentes, liberadas, valorPago, comissoes }>`

```ts
Indicacao = { id, indicador: { id, nome }, indicado: { id, nome }, depositou: boolean,
              partidas, status, premio, comissao, criadoEm, liberadaEm }
```

## Influencers

A comissão é uma **% da taxa da casa** nas partidas pagas dos jogadores que
entraram pelo link `https://joggpix.com/?inf=CODIGO`. O dinheiro do influencer
é separado do saldo de jogo: ele pede saque e o admin paga por Pix na mão.

- `GET /api/admin/influencers?q` → `Influencer[]`
- `POST /api/admin/influencers {nome, email, senha, chavePix, percentual?}` → `{id, codigo}`. Cria a conta (já verificada) ou promove uma conta existente com esse e-mail; nesse caso a senha é ignorada se vier vazia.
- `POST /api/admin/influencers/:id {ativo?, chavePix?, senha?, percentual?}` → `{ok}`. `percentual: null` volta pro padrão. Trocar a senha derruba as sessões.
- `GET /api/admin/influencers/:id/inscritos?pagina&porPagina` → `Pagina<{ id, nome, email, criadoEm, depositou, depositado, partidas, taxaGerada, comissao }, number>`
- `GET /api/admin/influencers/saques?status&pagina&porPagina` (`status`: `pendente | pago | cancelado | todos`) → `Pagina<InfSaque, number> & { pendentes: { quantidade, valor } }`
- `POST /api/admin/influencers/saques/:id/aprovar` → `{ok}`
- `POST /api/admin/influencers/saques/:id/cancelar {motivo}` → `{ok}`

```ts
Influencer = { id, userId, nome, email, codigo, chavePix, ativo, percentual: number | null,
               percentualEfetivo, criadoEm, cliques, pessoas, inscritos, depositaram,
               totalDepositado, taxaGerada, ganho, sacado, saquePendente, disponivel, link }
InfSaque = { id, influencerId, influencer, email, valor, chavePix, status, motivo,
             decididoPor, decididoEm, criadoEm }
```

`percentual` é em % (`20` = 20% da taxa).

### Painel do próprio influencer (login com a conta dele)

`GET /api/influencer/me`

```ts
{ nome, codigo, link, chavePix,
  regras: { percentual, saqueMinimo },
  inscritos, depositaram, totalDepositado, taxaGerada, ganho, sacado, saquePendente, disponivel,
  comissoes: { id, indicado, base, valor, jogo, criadoEm }[],      // últimas 30; nome mascarado "Maria S."
  saques: { id, valor, chavePix, status, motivo, criadoEm, decididoEm }[] }  // últimos 30
```

- `GET /api/influencer/inscritos?pagina&porPagina` → `Pagina<{ nome, criadoEm, depositou, partidas, comissao }, number>`. Os nomes vêm mascarados.
- `POST /api/influencer/saques {valor}` → `{ok}`. Tem um mínimo (`regras.saqueMinimo`) e não passa do `disponivel`.

## Configurações

`GET /api/admin/config` → `Config`. `POST /api/admin/config` recebe um `Config` parcial e devolve o `Config` inteiro.

```ts
Config = {
  taxaCasa,               // % de cada pote que fica com a casa (padrão 10; 0..30)
  bonusCadastroAtivo, bonusCadastro,          // R$ de bônus pra conta nova (padrão ligado, 5)
  saqueMinimo, saqueMaxDia, saqueExigeDeposito,   // R$; maxDia 0 = sem limite
  conversaoPontosAtiva,   // pontos → saldo
  indicacaoAtiva, indicacaoPremio, indicacaoMinPartidas, indicacaoPercentual,  // percentual = % da taxa
  infPercentual, infSaqueMinimo,              // padrão dos influencers
  atualizadoPor, atualizadoEm,
}
```

## Moderação

Já existia e continua igual:

- `GET /api/admin/resumo` → `{ denuncias, partidas, auditoria, agora }`
- `POST /api/admin/denuncia {id, acao: 'descartar'|'silenciar'}`
