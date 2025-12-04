import { Router } from 'express';
import crypto from 'crypto';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { processApprovedPayment } from '../utils/paymentProcessor';

const router = Router();

// Initialize MP Client for checking payment status
const getClient = () => {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new Error('MP_ACCESS_TOKEN não configurado.');
  }
  return new MercadoPagoConfig({ accessToken: token });
};

router.post('/mercadopago', async (req: any, res: any) => {
  const xSignature = req.headers['x-signature'] as string;
  const xRequestId = req.headers['x-request-id'] as string;
  const queryParams = req.query;
  const body = req.body;

  // Use a chave de webhook configurada no .env (WEBHOOK_TEST_MP ou MP_WEBHOOK_SECRET como fallback)
  const secret = process.env.WEBHOOK_TEST_MP || process.env.MP_WEBHOOK_SECRET;

  if (secret && xSignature && xRequestId) {
    try {
      const parts = xSignature.split(',');
      let ts = '';
      let v1 = '';

      parts.forEach((part) => {
        const [key, value] = part.split('=');
        if (key && value) {
          if (key.trim() === 'ts') ts = value.trim();
          if (key.trim() === 'v1') v1 = value.trim();
        }
      });

      const dataID = queryParams['data.id'] || body?.data?.id;

      const manifest = `id:${dataID};request-id:${xRequestId};ts:${ts};`;

      const cyphedSignature = crypto
        .createHmac('sha256', secret)
        .update(manifest)
        .digest('hex');

      if (cyphedSignature !== v1) {
        console.warn(
          '⚠️ Webhook Signature Mismatch. Verifique a chave WEBHOOK_TEST_MP.'
        );
      } else {
        console.log('🔒 Webhook Signature Validada!');
      }
    } catch (err) {
      console.error('Error validating webhook signature:', err);
    }
  } else {
    console.warn(
      '⚠️ Webhook recebido sem validação de assinatura (Secret ou Headers ausentes).'
    );
  }

  res.status(200).send('OK');

  try {
    const { type } = body;
    const dataId = body?.data?.id;

    if ((type === 'payment' || queryParams.topic === 'payment') && dataId) {
      const client = getClient();
      const payment = new Payment(client);

      const paymentData = await payment.get({ id: dataId });

      if (paymentData.status === 'approved') {
        const referenceCode = paymentData.external_reference;

        if (referenceCode) {
          await processApprovedPayment(
            referenceCode,
            paymentData.transaction_amount || 0
          );
        }
      } else {
        console.log(`ℹ️ Pagamento ${dataId} status: ${paymentData.status}`);
      }
    }
  } catch (error) {
    console.error('❌ Erro ao processar webhook internamente:', error);
  }
});

export default router;
