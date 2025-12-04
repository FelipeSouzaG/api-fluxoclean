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

    const backendUrl = process.env.API_BASE_URL;

    if (!backendUrl) {
      throw new Error(
        'FATAL: API_BASE_URL não definida. Configure-a nas variáveis de ambiente do Render.'
      );
    }

    const returnRoute = `${backendUrl}/api/subscription/return`;
    const notificationUrl = `${backendUrl}/api/webhooks/mercadopago`;

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
          success: returnRoute,
          failure: returnRoute,
          pending: returnRoute,
        },
        auto_return: 'approved',
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
