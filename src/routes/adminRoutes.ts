import { Router } from 'express';
import Tenant, {
  PlanType,
  SubscriptionStatus,
  SystemType,
} from '../models/Tenant';
import User from '../models/User';
import StoreConfig from '../models/StoreConfig';
import mongoose from 'mongoose';

const router = Router();

router.get('/tenants', async (req, res) => {
  try {
    const tenants = await Tenant.find()
      .sort({ 'requests.0.requestedAt': -1, createdAt: -1 })
      .lean();

    const tenantsWithOwners = await Promise.all(
      tenants.map(async (tenant) => {
        const owner = await User.findOne({
          tenantId: tenant._id as any,
          role: 'owner',
        }).select('name email');

        const config = await StoreConfig.findOne({
          tenantId: tenant._id as any,
        }).select('companyInfo.phone');

        return {
          ...tenant,
          owner: owner
            ? {
                name: owner.name,
                email: owner.email,
                phone: config?.companyInfo?.phone || '-',
              }
            : null,
        };
      })
    );

    res.json(tenantsWithOwners);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao buscar tenants' });
  }
});

router.patch('/tenants/:id/status', async (req, res) => {
  const { status } = req.body;
  try {
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    res.json(tenant);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar status' });
  }
});

router.post('/tenants/:id/approve-request', async (req, res) => {
  const { requestType, targetUrl } = req.body;

  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant)
      return res.status(404).json({ message: 'Tenant não encontrado' });

    const requestIndex = tenant.requests.findIndex(
      (r) => r.type === requestType && r.status === 'pending'
    );
    if (requestIndex === -1)
      return res.status(400).json({
        message: 'Nenhuma solicitação pendente encontrada deste tipo.',
      });

    if (requestType === 'extension') {
      const currentEnd =
        new Date(tenant.trialEndsAt) > new Date()
          ? new Date(tenant.trialEndsAt)
          : new Date();
      currentEnd.setDate(currentEnd.getDate() + 30);
      tenant.trialEndsAt = currentEnd;

      if (
        tenant.status === SubscriptionStatus.EXPIRED ||
        tenant.status === SubscriptionStatus.BLOCKED
      ) {
        tenant.status = SubscriptionStatus.TRIAL;
      }
      tenant.extensionCount = (tenant.extensionCount || 0) + 1;

      tenant.requests[requestIndex].status = 'approved';
    } else if (requestType === 'upgrade') {
      if (!targetUrl) {
        return res.status(400).json({
          message: 'URL do novo ambiente é obrigatória para provisionamento.',
        });
      }

      tenant.singleTenantUrl = targetUrl;

      tenant.requests[requestIndex].status = 'waiting_payment';
    }

    await tenant.save();
    res.json(tenant);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao processar solicitação.' });
  }
});

export default router;
