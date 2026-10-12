import { createTransport } from 'nodemailer';

// SMTP: o .env manda, e sem ele valem os dados abaixo. Ficam no código porque
// o app precisa mandar e-mail em qualquer máquina, sem passo de configuração.
// ATENÇÃO: esta senha vai pro git. Se o repositório deixar de ser privado, ou
// se alguém que não deveria clonar clonar, troque a senha e mova pro .env.
const PADRAO = {
  host: 'smtp.hostinger.com',
  port: 465,
  user: 'noreply@renapay.com.br',
  pass: 'i$nroxC&8Jxp!L6#',
  from: 'noreply@renapay.com.br',
  fromName: 'Renapay',
};

const config = () => {
  // MAIL_OFF=1 nos testes: cadastro fictício não pode sair mandando e-mail de
  // verdade pra endereço que não existe — isso queima a reputação do remetente.
  if (process.env.MAIL_OFF) return null;
  const host = process.env.MAIL_HOST || PADRAO.host;
  const user = process.env.MAIL_USER || PADRAO.user;
  const pass = process.env.MAIL_PASSWORD || PADRAO.pass;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.MAIL_PORT) || PADRAO.port;
  return {
    host,
    port,
    secure: port === 465,          // 465 é TLS direto; 587 sobe pra TLS depois
    auth: { user, pass },
  };
};

let transporte = null;
const transportador = () => {
  const c = config();
  if (!c) return null;
  transporte ??= createTransport(c);
  return transporte;
};

const REMETENTE = () => {
  const nome = process.env.MAIL_FROM_NAME || PADRAO.fromName;
  return `${nome} <${process.env.MAIL_FROM || PADRAO.from}>`;
};

// Paleta do app: fundo quase preto arroxeado, cartão roxo escuro, destaque em
// roxo e o código em dourado, igual às moedas.
export const html = (nome, codigo) => `
<div style="margin:0;padding:32px 12px;background:#0a0618;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#130d2c;border:1px solid rgba(168,85,247,.3);border-radius:24px;overflow:hidden">
    <tr>
      <td style="padding:28px 28px 8px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-.4px">Sinuca 🎱</div>
        <div style="font-size:13px;color:#a78bfa;font-weight:600;margin-top:4px">Confirmação de e-mail</div>
      </td>
    </tr>
    <tr>
      <td style="padding:12px 28px 0;color:#d6d3e4;font-size:14px;line-height:1.55">
        Olá, <strong style="color:#ffffff">${nome}</strong>! Use o código abaixo para confirmar
        seu e-mail e entrar na sua conta.
      </td>
    </tr>
    <tr>
      <td style="padding:22px 28px">
        <div style="background:#181138;border:1px solid rgba(168,85,247,.35);border-radius:18px;padding:18px;text-align:center">
          <div style="font-size:34px;font-weight:800;color:#fbbf24;letter-spacing:10px;text-indent:10px">${codigo}</div>
          <div style="font-size:11px;color:#9c94b8;margin-top:6px">Vale por 15 minutos</div>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 26px;color:#9c94b8;font-size:12px;line-height:1.5">
        Se não foi você que criou a conta, é só ignorar esta mensagem — nada acontece sem o código.
      </td>
    </tr>
    <tr>
      <td style="background:#0f0a24;padding:14px 28px;color:#6f688a;font-size:11px;text-align:center">
        Este e-mail foi enviado automaticamente. Não responda.
      </td>
    </tr>
  </table>
</div>`;

const texto = (nome, codigo) =>
  `Olá, ${nome}!\n\nSeu código de confirmação é ${codigo}.\nEle vale por 15 minutos.\n\n` +
  'Se não foi você que criou a conta, ignore esta mensagem.';

/**
 * Manda o código. Não derruba o cadastro se o SMTP falhar: o usuário ainda pode
 * pedir reenvio, e uma conta criada sem e-mail entregue é melhor que um erro em
 * cima de um cadastro que já gravou.
 */
export async function enviarCodigo(email, nome, codigo) {
  const t = transportador();
  if (!t) {
    console.log(`[email] sem SMTP — código ${codigo} para ${email}`);
    return false;
  }
  try {
    await t.sendMail({
      from: REMETENTE(),
      to: email,
      subject: `${codigo} é o seu código de confirmação`,
      text: texto(nome, codigo),
      html: html(nome, codigo),
    });
    return true;
  } catch (e) {
    console.error(`[email] falhou para ${email}:`, e.message);
    return false;
  }
}
