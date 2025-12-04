import Tenant, { PlanType, SubscriptionStatus } from '../models/Tenant';

export async function processApprovedPayment(
  referenceCode: string,
  amountPaid: number
) {
  const tenant = await Tenant.findOne({
    'requests.referenceCode': referenceCode,
  });

  if (!tenant) {
    console.error(
      `⚠️ Tenant não encontrado para a referência: ${referenceCode}`
    );
    return { success: false, message: 'Tenant não encontrado.' };
  }

  const requestIndex = tenant.requests.findIndex(
    (r) => r.referenceCode === referenceCode
  );
  if (requestIndex === -1)
    return { success: false, message: 'Solicitação não encontrada.' };

  const request = tenant.requests[requestIndex];

  if (request.status === 'approved') {
    return { success: true, message: 'Pagamento já processado anteriormente.' };
  }

  if (request.type === 'extension') {
    const currentEnd =
      new Date(tenant.trialEndsAt) > new Date()
        ? new Date(tenant.trialEndsAt)
        : new Date();
    currentEnd.setDate(currentEnd.getDate() + 30);
    tenant.trialEndsAt = currentEnd;

    if (tenant.status !== SubscriptionStatus.ACTIVE) {
      tenant.status = SubscriptionStatus.TRIAL;
    }

    tenant.extensionCount = (tenant.extensionCount || 0) + 1;

    if (tenant.plan === PlanType.SINGLE_TENANT) {
      tenant.lastPaymentDate = new Date();
      tenant.status = SubscriptionStatus.ACTIVE;
    }
  } else if (request.type === 'upgrade') {
    tenant.plan = PlanType.SINGLE_TENANT;
    tenant.status = SubscriptionStatus.ACTIVE;

    tenant.lastPaymentDate = new Date();

    tenant.billingDayConfigured = false;

    const subEnd = new Date();
    subEnd.setDate(subEnd.getDate() + 30);
    tenant.subscriptionEndsAt = subEnd;
  }

  tenant.requests[requestIndex].status = 'approved';

  tenant.requests = tenant.requests.filter((r, i) => {
    if (i === requestIndex) return true;
    if (r.status !== 'pending') return true;
    if (r.type !== request.type) return true;
    return false;
  });

  await tenant.save();
  return { success: true, message: 'Assinatura atualizada com sucesso!' };
}
