
import nodemailer from 'nodemailer';

let transporter: any = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  
  // Lógica restaurada do ambiente de desenvolvimento:
  // Se a porta for 465, força secure=true. 
  // Se a variável SMTP_SECURE for 'true', usa secure=true.
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  console.log(`📧 [EmailService] Configurando: Host=${host}, Port=${port}, Secure=${secure}, User=${user ? '***DEFINIDO***' : 'NÃO DEFINIDO'}`);

  if (!host || !user || !pass) {
      console.warn("⚠️ [EmailService] Variáveis de ambiente de e-mail incompletas.");
  }

  transporter = nodemailer.createTransport({
    host: host,
    port: port,
    secure: secure, // true para 465 (SSL), false para 587 (STARTTLS)
    auth: {
      user: user,
      pass: pass,
    },
    tls: {
      rejectUnauthorized: false,
      ciphers: 'SSLv3'
    },
    // CRÍTICO PARA RENDER: Força IPv4.
    // O erro ETIMEDOUT no Render geralmente ocorre porque o container tenta resolver o host SMTP via IPv6 e falha.
    family: 4, 
    connectionTimeout: 20000, 
    greetingTimeout: 20000,
    socketTimeout: 20000,
    debug: true, 
    logger: true 
  } as any);

  transporter.verify((error: any, success: any) => {
      if (error) {
          console.error("❌ [EmailService] Erro de conexão SMTP:", error);
      } else {
          console.log("✅ [EmailService] Pronto para envio (Porta " + port + ").");
      }
  });

  return transporter;
};

export const sendResetPasswordEmail = async (to: string, token: string) => {
  const frontendUrl = process.env.FLUXOCLEAN_HOME;
  const resetLink = `${frontendUrl}/reset-password/${token}`;

  const mailOptions = {
    from: `"FluxoClean System" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Recuperação de Senha - FluxoClean',
    html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
                <h2 style="color: #4F46E5; text-align: center;">Recuperação de Senha</h2>
                <p style="color: #333;">Olá,</p>
                <p style="color: #333;">Recebemos uma solicitação para redefinir a senha da sua conta no sistema <strong>FluxoClean</strong>.</p>
                <p style="color: #333;">Este link é um token provisório seguro. Clique no botão abaixo para criar uma nova senha:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetLink}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Redefinir Minha Senha</a>
                </div>
                <p style="color: #666; font-size: 14px;">Ou copie e cole o link abaixo no seu navegador:</p>
                <p style="word-break: break-all; color: #4F46E5; font-size: 12px;">${resetLink}</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 12px; color: #9ca3af; text-align: center;">Este link expira em 1 hora. Se você não solicitou isso, ignore este e-mail.</p>
            </div>
        `,
  };

  try {
    const t = getTransporter();
    await t.sendMail(mailOptions);
    console.log(`📧 E-mail de recuperação enviado para ${to}`);
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail de recuperação:', error);
    throw error;
  }
};

export const sendCompleteRegistrationEmail = async (
  to: string,
  companyName: string,
  token: string
) => {
  const frontendUrl = process.env.FLUXOCLEAN_HOME;
  const completeLink = `${frontendUrl}/complete-registration?token=${token}`;

  const mailOptions = {
    from: `"FluxoClean System" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Finalize seu cadastro - FluxoClean',
    html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
                  <h2 style="color: #10B981; text-align: center;">Bem-vindo ao FluxoClean!</h2>
                  <p style="color: #333;">Olá,</p>
                  <p style="color: #333;">A empresa <strong>${companyName}</strong> iniciou o cadastro em nossa plataforma.</p>
                  <p style="color: #333;">Para ativar seu ambiente e criar seu acesso administrativo, clique no botão abaixo:</p>
                  <div style="text-align: center; margin: 30px 0;">
                      <a href="${completeLink}" style="background-color: #10B981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">Completar Cadastro</a>
                  </div>
                  <p style="color: #666; font-size: 14px;">Link direto: <br/><a href="${completeLink}" style="color: #10B981;">${completeLink}</a></p>
                  <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                  <p style="font-size: 12px; color: #9ca3af; text-align: center;">Se você não iniciou este cadastro, por favor ignore este e-mail.</p>
              </div>
          `,
  };

  try {
    const t = getTransporter();
    await t.sendMail(mailOptions);
    console.log(`📧 E-mail de conclusão de cadastro enviado para ${to}`);
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail de cadastro:', error);
    throw error;
  }
};
