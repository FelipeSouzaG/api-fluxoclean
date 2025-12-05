
import { Resend } from 'resend';

// Inicializa o cliente Resend apenas se a chave estiver presente
const apiKey = process.env.RESEND_API_KEY;
let resend: Resend | null = null;

if (apiKey) {
    resend = new Resend(apiKey);
    console.log("✅ [EmailService] Cliente Resend inicializado.");
} else {
    console.warn("⚠️ [EmailService] RESEND_API_KEY não configurada. E-mails não serão enviados.");
}

// Helper para obter o remetente configurado ou um fallback seguro
// Retorna apenas o email, o nome de exibição é adicionado no envio
const getFromEmail = () => {
    return process.env.EMAIL_FROM || 'onboarding@resend.dev';
};

export const sendResetPasswordEmail = async (to: string, token: string) => {
  if (!resend) {
      console.error("❌ [EmailService] Tentativa de envio sem configuração do Resend.");
      throw new Error("Serviço de e-mail não configurado.");
  }

  const frontendUrl = process.env.FLUXOCLEAN_HOME;
  const resetLink = `${frontendUrl}/reset-password/${token}`;

  const htmlContent = `
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
        `;

  try {
    const { data, error } = await resend.emails.send({
        from: `FluxoClean Sistemas <${getFromEmail()}>`,
        to: [to],
        subject: 'Recuperação de Senha - FluxoClean',
        html: htmlContent,
    });

    if (error) {
        console.error("❌ [EmailService] Erro na API do Resend:", error);
        throw new Error(error.message);
    }

    console.log(`📧 E-mail de recuperação enviado para ${to}. ID: ${data?.id}`);
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
  if (!resend) {
      console.error("❌ [EmailService] Tentativa de envio sem configuração do Resend.");
      return; // Em fluxo de cadastro, podemos logar o erro mas não necessariamente crashar a request se o email falhar
  }

  const frontendUrl = process.env.FLUXOCLEAN_HOME;
  const completeLink = `${frontendUrl}/complete-registration?token=${token}`;

  const htmlContent = `
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
          `;

  try {
    const { data, error } = await resend.emails.send({
        from: `FluxoClean Sistemas <${getFromEmail()}>`,
        to: [to],
        subject: 'Finalize seu cadastro - FluxoClean',
        html: htmlContent,
    });

    if (error) {
        console.error("❌ [EmailService] Erro na API do Resend:", error);
        // Não lançamos erro aqui para não travar o cadastro no frontend, apenas logamos
    } else {
        console.log(`📧 E-mail de conclusão de cadastro enviado para ${to}. ID: ${data?.id}`);
    }
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail de cadastro:', error);
  }
};
