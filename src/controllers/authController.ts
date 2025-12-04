import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Tenant, { SubscriptionStatus, SystemType } from '../models/Tenant';
import User from '../models/User';
import {
  sendResetPasswordEmail,
  sendCompleteRegistrationEmail,
} from '../utils/emailService';

const slugify = (text: string) => {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

const getSystemUrl = (tenant: any) => {
  if (tenant.plan === 'single_tenant' && tenant.singleTenantUrl) {
    return tenant.singleTenantUrl;
  }
  switch (tenant.systemType) {
    case SystemType.COMMERCE:
      return process.env.SMART_STORE;
    case SystemType.INDUSTRY:
      return process.env.SMART_INDUSTRY;
    case SystemType.SERVICES:
      return process.env.SMART_SERVICE;
    default:
      return process.env.FLUXOCLEAN_HOME;
  }
};

const validatePasswordStrength = (password: string) => {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  return regex.test(password);
};

const authCodes = new Map<string, string>();
const generateAuthCode = (token: string): string => {
  const code =
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
  authCodes.set(code, token);
  setTimeout(() => {
    authCodes.delete(code);
  }, 60000);
  return code;
};

export const exchangeCode = async (req: any, res: any) => {
  const { code } = req.body;
  if (!code)
    return res
      .status(400)
      .json({ message: 'Código de autorização é obrigatório.' });
  const token = authCodes.get(code);
  if (!token)
    return res.status(400).json({ message: 'Código inválido ou expirado.' });
  authCodes.delete(code);
  res.json({ token });
};

export const preRegister = async (req: any, res: any) => {
  const { companyName, document, email, systemType } = req.body;

  try {
    if (!companyName || !document || !email || !systemType) {
      return res
        .status(400)
        .json({ message: 'Todos os campos são obrigatórios.' });
    }

    const existingActive = await Tenant.findOne({
      $or: [{ document }, { email }],
      status: { $ne: SubscriptionStatus.PENDING_VERIFICATION },
    });

    if (existingActive) {
      return res.status(400).json({
        message: 'CNPJ/CPF ou E-mail já estão em uso por uma conta ativa.',
      });
    }

    const tenantName = slugify(companyName);
    if (tenantName.length < 3) {
      return res.status(400).json({
        message: 'Nome da empresa inválido para criação de endereço web.',
      });
    }

    const slugTaken = await Tenant.findOne({ tenantName });
    if (slugTaken) {
      if (
        slugTaken.status === SubscriptionStatus.PENDING_VERIFICATION &&
        slugTaken.email === email
      ) {
        // Resend logic below (Update token)
      } else {
        return res.status(400).json({
          message: `O endereço '${tenantName}.fluxoclean.com.br' já está em uso. Tente outro nome.`,
        });
      }
    }

    const token = crypto.randomBytes(32).toString('hex');

    await Tenant.findOneAndUpdate(
      { document },
      {
        name: companyName,
        tenantName,
        document,
        email,
        systemType,
        status: SubscriptionStatus.PENDING_VERIFICATION,
        registrationToken: token,
        trialEndsAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await sendCompleteRegistrationEmail(email, companyName, token);

    res.status(200).json({
      success: true,
      message:
        'Pré-cadastro realizado! Verifique seu e-mail para criar sua senha.',
    });
  } catch (error: any) {
    console.error('Pre-register error:', error);
    res.status(500).json({ message: 'Erro interno ao processar cadastro.' });
  }
};

export const validateRegistrationToken = async (req: any, res: any) => {
  const { token } = req.body;
  try {
    const tenant = await Tenant.findOne({
      registrationToken: token,
      status: SubscriptionStatus.PENDING_VERIFICATION,
    });

    if (!tenant) {
      return res
        .status(400)
        .json({ valid: false, message: 'Link inválido ou expirado.' });
    }

    res.json({
      valid: true,
      data: {
        companyName: tenant.name,
        tenantName: tenant.tenantName,
        document: tenant.document,
        email: tenant.email,
        systemType: tenant.systemType,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao validar token.' });
  }
};

export const completeRegistration = async (req: any, res: any) => {
  const { token, userName, password } = req.body;
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');

  try {
    if (!userName || !password)
      return res.status(400).json({ message: 'Nome e senha obrigatórios.' });
    if (!validatePasswordStrength(password))
      return res.status(400).json({ message: 'Senha fraca.' });

    const tenant = await Tenant.findOne({
      registrationToken: token,
      status: SubscriptionStatus.PENDING_VERIFICATION,
    });

    if (!tenant)
      return res
        .status(400)
        .json({ message: 'Cadastro não encontrado ou link expirado.' });

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 15);

    tenant.status = SubscriptionStatus.TRIAL;
    tenant.trialEndsAt = trialEndsAt;
    tenant.registrationToken = undefined;
    await tenant.save();

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      tenantId: (tenant as any)._id,
      name: userName,
      email: tenant.email,
      passwordHash,
      role: 'owner',
    } as any);

    const jwtToken = jwt.sign(
      {
        userId: (user as any)._id,
        tenantId: (tenant as any)._id,
        role: (user as any).role,
        name: (user as any).name,
        email: (user as any).email,
        companyName: (tenant as any).name,
        document: (tenant as any).document,
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    const code = generateAuthCode(jwtToken);

    res.status(201).json({
      message: 'Conta ativada com sucesso!',
      code,
      token: jwtToken,
      tenant,
      redirectUrl: getSystemUrl(tenant),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro ao finalizar cadastro.', error });
  }
};

export const register = async (req: any, res: any) => {
  res
    .status(410)
    .json({ message: 'Use o novo fluxo de cadastro (pre-register).' });
};

export const login = async (req: any, res: any) => {
  let { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email e senha são obrigatórios.' });
  }

  email = email.trim().toLowerCase();
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');

  try {
    const superEmail = process.env.U_X;
    const superPass = process.env.U_S;
    const superName = process.env.U_N;

    if (
      superEmail &&
      superPass &&
      email === superEmail &&
      password === superPass
    ) {
      const token = jwt.sign(
        { role: 'superadmin', name: superName, email: superEmail },
        JWT_SECRET,
        { expiresIn: '4h' }
      );
      return res.json({
        token,
        user: { name: superName, role: 'superadmin' },
        redirectUrl: '/superadmin',
      });
    }

    const user = await User.findOne({ email }).populate('tenantId');
    if (!user)
      return res.status(400).json({ message: 'Credenciais inválidas.' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch)
      return res.status(400).json({ message: 'Credenciais inválidas.' });

    const tenant = user.tenantId as any;
    if (!tenant)
      return res
        .status(500)
        .json({ message: 'Erro de cadastro: Empresa não encontrada.' });

    if (tenant.status === SubscriptionStatus.PENDING_VERIFICATION) {
      return res
        .status(403)
        .json({ message: 'Conta pendente de verificação. Cheque seu e-mail.' });
    }

    const isMigrationReady =
      tenant.requests &&
      tenant.requests.some(
        (r: any) => r.type === 'upgrade' && r.status === 'waiting_payment'
      );
    if (isMigrationReady && user.role !== 'owner') {
      return res
        .status(423)
        .json({ message: 'ACESSO BLOQUEADO: Migração em andamento.' });
    }

    const targetUrl = getSystemUrl(tenant);
    const token = jwt.sign(
      {
        userId: user._id,
        tenantId: tenant._id,
        role: user.role,
        name: user.name,
        email: user.email,
        companyName: tenant.name,
        document: tenant.document,
      },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    const code = generateAuthCode(token);

    res.json({
      code,
      token,
      user: { name: user.name, email: user.email },
      tenant: {
        name: tenant.name,
        status: tenant.status,
        system: tenant.systemType,
      },
      redirectUrl: targetUrl,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Erro no servidor' });
  }
};

export const forgotPassword = async (req: any, res: any) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.json({
        message: 'Se o email existir, você receberá um link de recuperação.',
      });
    const token = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 3600000);
    await user.save();
    await sendResetPasswordEmail(user.email, token);
    res.json({ message: 'Email de recuperação enviado com sucesso.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao processar solicitação.' });
  }
};

export const validateResetToken = async (req: any, res: any) => {
  const { token } = req.params;
  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user)
      return res.status(400).json({ message: 'Token inválido ou expirado.' });
    res.json({ message: 'Token válido.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao validar token.' });
  }
};

export const resetPassword = async (req: any, res: any) => {
  const { token, newPassword } = req.body;
  try {
    if (!validatePasswordStrength(newPassword))
      return res.status(400).json({ message: 'Senha fraca.' });
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user)
      return res.status(400).json({ message: 'Token inválido ou expirado.' });
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    res.json({ message: 'Senha alterada com sucesso.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao redefinir senha.' });
  }
};

export const createSubUser = async (req: any, res: any) => {
  try {
    const { name, email, password, role } = req.body;
    const tenantId = req.user.tenantId;
    if (!tenantId)
      return res.status(401).json({ message: 'Tenant não identificado.' });
    if (!validatePasswordStrength(password))
      return res.status(400).json({ message: 'Senha fraca.' });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res
        .status(400)
        .json({ message: 'Email já cadastrado no sistema.' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const user = await User.create({
      tenantId,
      name,
      email,
      passwordHash,
      role: role || 'technician',
    } as any);
    res.status(201).json({
      _id: (user as any)._id,
      name: (user as any).name,
      email: (user as any).email,
      role: (user as any).role,
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ message: 'Erro ao criar usuário central: ' + error.message });
  }
};

export const updateSubUser = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { name, email, password, role } = req.body;
    const tenantId = req.user.tenantId;
    const user = await User.findOne({ _id: id, tenantId });
    if (!user)
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    user.name = name || user.name;
    user.email = email || user.email;
    if (role) user.role = role;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      user.passwordHash = await bcrypt.hash(password, salt);
    }
    await user.save();
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar usuário central.' });
  }
};

export const deleteSubUser = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId;
    const user = await User.findOneAndDelete({ _id: id, tenantId });
    if (!user)
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    res.json({ message: 'Usuário removido.' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao deletar usuário.' });
  }
};
