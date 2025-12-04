import { MercadoPagoConfig, Preference } from 'mercadopago';

const getClient = () => {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new Error('MP_ACCESS_TOKEN não configurado no .env');
  }
  return new MercadoPagoConfig({ accessToken: token });
};

interface PreferenceData {
  amount: number;
  referenceCode: string;
  payerEmail: string;
  description: string;
}

interface PreferenceResponse {
  preferenceId: string;
  initPoint: string;
}

export const createPaymentPreference = async ({
  amount,
  referenceCode,
  payerEmail,
  description,
}: PreferenceData): Promise<PreferenceResponse> => {
  try {
    const client = getClient();
    const preference = new Preference(client);

    let successUrl;
    let failureUrl;
    let pendingUrl;
    let autoReturnSetting = undefined;
    let notificationUrl = undefined;

    if (process.env.API_PUBLIC_URL) {
      // Se temos Ngrok configurado (Ideal para dev e webhook)
      const backendUrl = process.env.API_PUBLIC_URL; // ex: https://xxxx.ngrok-free.app

      // Aponta para a rota 'return' no subscriptionRoutes.ts
      const returnRoute = `${backendUrl}/api/subscription/return`;

      successUrl = returnRoute;
      failureUrl = returnRoute;
      pendingUrl = returnRoute;

      // Webhook URL
      notificationUrl = `${backendUrl}/api/webhooks/mercadopago`;

      // Com HTTPS válido, podemos ativar o retorno automático
      autoReturnSetting = 'approved';

      console.log(`✅ Bridge de Redirecionamento Ativa: ${returnRoute}`);
      console.log(`📡 Webhook Configurado: ${notificationUrl}`);
    } else {
      // Fallback (Sem Ngrok/Produção Direta)
      const frontendBase = process.env.FLUXOCLEAN_HOME;
      successUrl = `${frontendBase}`;
      failureUrl = `${frontendBase}`;
      pendingUrl = `${frontendBase}`;

      // Desativa auto_return se for localhost para evitar erro 400
      const isLocalhost =
        frontendBase.includes('localhost') ||
        frontendBase.includes('127.0.0.1');
      autoReturnSetting = isLocalhost ? undefined : 'approved';

      if (isLocalhost)
        console.log("⚠️ Localhost (sem ngrok): 'auto_return' desativado.");
    }

    const preferencePayload = {
      body: {
        items: [
          {
            id: referenceCode,
            title: description,
            quantity: 1,
            unit_price: Number(amount),
            currency_id: 'BRL',
            description: description,
            category_id: 'services',
          },
        ],
        payer: {
          email: payerEmail,
        },
        external_reference: referenceCode,
        back_urls: {
          success: successUrl,
          failure: failureUrl,
          pending: pendingUrl,
        },
        auto_return: autoReturnSetting,
        notification_url: notificationUrl,
        binary_mode: true,
        statement_descriptor: 'FLUXOCLEAN',
        payment_methods: {
          excluded_payment_types: [{ id: 'ticket' }],
          installments: 12,
        },
      },
    };

    const response = await preference.create(preferencePayload);

    if (!response.id) {
      throw new Error('O Mercado Pago não retornou um ID de preferência.');
    }

    return {
      preferenceId: response.id,
      initPoint: response.init_point!,
    };
  } catch (error: any) {
    console.error('❌ Erro no Mercado Pago (createPreference):');

    if (error.cause) {
      console.error(JSON.stringify(error.cause, null, 2));
    } else {
      console.error(error.message);
    }

    throw new Error(
      `Erro ao gerar pagamento: ${error.message || 'Erro desconhecido'}`
    );
  }
};
