import { Router } from 'express';
import Tenant, { SystemType, SubscriptionStatus } from '../models/Tenant';
import { protect } from '../middleware/authMiddleware';
import { createPaymentPreference } from '../utils/pixUtils';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { processApprovedPayment } from '../utils/paymentProcessor';

const router = Router();

const getClient = () => {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error('MP_ACCESS_TOKEN não configurado.');
  return new MercadoPagoConfig({ accessToken: token });
};

router.get('/return', async (req: any, res: any) => {
  const { status, external_reference, collection_status } = req.query;
  try {
    const tenant = await Tenant.findOne({
      'requests.referenceCode': external_reference,
    });
    let targetBaseUrl = process.env.FLUXOCLEAN_HOME;

    if (tenant) {
      // If already migrated, redirect to the new Single Tenant URL
      if (tenant.plan === 'single_tenant' && tenant.singleTenantUrl) {
        targetBaseUrl = tenant.singleTenantUrl;
      } else {
        switch (tenant.systemType) {
          case SystemType.COMMERCE:
            targetBaseUrl = process.env.SMART_STORE;
            break;
          case SystemType.INDUSTRY:
            targetBaseUrl = process.env.SMART_INDUSTRY;
            break;
          case SystemType.SERVICES:
            targetBaseUrl = process.env.SMART_SERVICE;
            break;
        }
      }
    }

    const finalStatus = status || collection_status;
    const redirectUrl = `${targetBaseUrl}/dashboard?status=${finalStatus}&ref=${external_reference}`;
    res.redirect(redirectUrl);
  } catch (error) {
    res.redirect(`${process.env.FLUXOCLEAN_HOME}?error=redirect_failed`);
  }
});

router.get('/status', protect, async (req: any, res: any) => {
  try {
    const tenant = await Tenant.findById(req.user.tenantId);
    if (!tenant)
      return res.status(404).json({ message: 'Tenant não encontrado.' });

    res.json({
      name: tenant.name,
      plan: tenant.plan,
      status: tenant.status,
      trialEndsAt: tenant.trialEndsAt,
      subscriptionEndsAt: tenant.subscriptionEndsAt,
      extensionCount: tenant.extensionCount || 0,
      requests: tenant.requests || [],
      monthlyPaymentDay: tenant.monthlyPaymentDay,
      billingDayConfigured: tenant.billingDayConfigured,
      lastPaymentDate: tenant.lastPaymentDate,
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar status.' });
  }
});

router.put('/billing-day', protect, async (req: any, res: any) => {
  const { day } = req.body;
  if (day < 1 || day > 28)
    return res.status(400).json({ message: 'Dia inválido (1-28).' });

  try {
    const tenant = await Tenant.findById(req.user.tenantId);
    if (!tenant)
      return res.status(404).json({ message: 'Tenant não encontrado' });

    tenant.monthlyPaymentDay = day;
    tenant.billingDayConfigured = true;
    await tenant.save();
    res.json({ message: 'Dia de pagamento atualizado.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar dia.' });
  }
});

router.post(
  '/check-payment/:reference',
  protect,
  async (req: any, res: any) => {
    const { reference } = req.params;
    try {
      const client = getClient();
      const payment = new Payment(client);
      const searchResult = await payment.search({
        options: {
          external_reference: reference,
          status: 'approved',
          limit: 1,
        },
      });

      if (searchResult.results && searchResult.results.length > 0) {
        const paidTransaction = searchResult.results[0];
        const result = await processApprovedPayment(
          reference,
          paidTransaction.transaction_amount || 0
        );
        return res.json({ status: 'approved', message: result.message });
      } else {
        return res.json({
          status: 'pending',
          message: 'Pagamento ainda não confirmado.',
        });
      }
    } catch (error: any) {
      res.status(500).json({ message: 'Erro ao verificar pagamento.' });
    }
  }
);

router.post('/request', protect, async (req: any, res: any) => {
  const { type } = req.body;

  if (!['extension', 'upgrade', 'migrate', 'monthly'].includes(type)) {
    return res.status(400).json({ message: 'Tipo inválido.' });
  }

  try {
    const tenant = await Tenant.findById(req.user.tenantId);
    if (!tenant)
      return res.status(404).json({ message: 'Tenant não encontrado.' });

    const now = new Date();
    const userEmail = req.user.email || 'cliente@fluxoclean.com';
    const dateString = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');

    if (type === 'monthly') {
      const amount = 197.0;
      const referenceCode = `MTH-${dateString}-${randomSuffix}`;
      const description = `FluxoClean - Mensalidade (Venc: Dia ${tenant.monthlyPaymentDay})`;

      const mpResult = await createPaymentPreference({
        amount,
        referenceCode,
        payerEmail: userEmail,
        description,
      });

      const newRequest = {
        type: 'extension',
        status: 'pending',
        requestedAt: now,
        amount,
        referenceCode,
        preferenceId: mpResult.preferenceId,
      };

      tenant.requests.push(newRequest as any);
      await tenant.save();

      return res.json({
        request: newRequest,
        publicKey: process.env.MP_PUBLIC_KEY,
        message: 'Checkout de mensalidade gerado.',
      });
    }

    if (type === 'extension') {
      if ((tenant.extensionCount || 0) >= 2)
        return res
          .status(403)
          .json({ message: 'Limite de extensões atingido.' });
      if (tenant.requests)
        tenant.requests = tenant.requests.filter(
          (r: any) => !(r.type === 'extension' && r.status === 'pending')
        );

      const amount = 97.0;
      const referenceCode = `TRIAL-${dateString}-${randomSuffix}`;
      const mpResult = await createPaymentPreference({
        amount,
        referenceCode,
        payerEmail: userEmail,
        description: `Extensão Trial`,
      });

      const newRequest = {
        type: 'extension',
        status: 'pending',
        requestedAt: now,
        amount,
        referenceCode,
        preferenceId: mpResult.preferenceId,
      };
      tenant.requests.push(newRequest as any);
      await tenant.save();

      return res.json({
        request: newRequest,
        publicKey: process.env.MP_PUBLIC_KEY,
      });
    }

    if (type === 'upgrade') {
      const existing = tenant.requests.find(
        (r: any) =>
          r.type === 'upgrade' &&
          (r.status === 'pending' || r.status === 'waiting_payment')
      );
      if (existing)
        return res.status(400).json({ message: 'Solicitação em andamento.' });

      const referenceCode = `UPG-PROV-${dateString}-${randomSuffix}`;
      const newRequest = {
        type: 'upgrade',
        status: 'pending',
        requestedAt: now,
        amount: 197.0,
        referenceCode,
      };
      tenant.requests.push(newRequest as any);
      await tenant.save();

      return res.json({
        request: newRequest,
        message: 'Solicitação enviada para provisionamento.',
      });
    }

    if (type === 'migrate') {
      const upgradeIndex = tenant.requests.findIndex(
        (r: any) => r.type === 'upgrade' && r.status === 'waiting_payment'
      );
      if (upgradeIndex === -1)
        return res.status(400).json({ message: 'Nenhuma migração pendente.' });

      const referenceCode = `MIGRATE-${dateString}-${randomSuffix}`;
      const mpResult = await createPaymentPreference({
        amount: 197.0,
        referenceCode,
        payerEmail: userEmail,
        description: `Assinatura Premium`,
      });

      tenant.requests[upgradeIndex].referenceCode = referenceCode;
      tenant.requests[upgradeIndex].preferenceId = mpResult.preferenceId;
      tenant.requests[upgradeIndex].requestedAt = now;

      await tenant.save();
      return res.json({
        request: tenant.requests[upgradeIndex],
        publicKey: process.env.MP_PUBLIC_KEY,
      });
    }
  } catch (error) {
    res.status(500).json({ message: 'Erro ao processar solicitação.' });
  }
});

export default router;
