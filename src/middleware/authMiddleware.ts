
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Tenant from '../models/Tenant';
import User from '../models/User';

const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing in environment variables.');
  }
  return process.env.JWT_SECRET;
};

export const protect = async (req: any, res: any, next: any) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      // Handle "Bearer null" or "Bearer undefined" sent by frontend bugs gracefully
      if (!token || token === 'null' || token === 'undefined') {
          return res.status(401).json({ message: 'Token de autenticação inválido ou ausente.' });
      }

      const decoded: any = jwt.verify(token, getJwtSecret());

      if (!decoded.tenantId) {
        return res
          .status(401)
          .json({ message: 'Token inválido: Violação de isolamento.' });
      }

      req.tenantId = decoded.tenantId;

      req.tenantInfo = {
        companyName: decoded.companyName,
        document: decoded.document,
      };

      const tenant = await Tenant.findById(req.tenantId);
      if (!tenant) {
        return res.status(401).json({ message: 'Empresa não encontrada.' });
      }

      const isMigrationReady =
        tenant.requests &&
        tenant.requests.some(
          (r) => r.type === 'upgrade' && r.status === 'waiting_payment'
        );

      if (isMigrationReady && decoded.role !== 'owner') {
        return res.status(423).json({
          message:
            'ACESSO BLOQUEADO: O sistema está em processo de migração para Single-Tenant. Aguarde o proprietário finalizar a ativação.',
        });
      }

      const user = await User.findOne({
        _id: decoded.userId,
        tenantId: req.tenantId,
      }).select('-password');

      req.user = user || {
        id: decoded.userId,
        role: decoded.role,
        tenantId: decoded.tenantId,
        name: decoded.name || 'Usuário',
        email: decoded.email || '',
      };

      next();
    } catch (error: any) {
      // Quietly handle JWT errors
      if (error.name === 'JsonWebTokenError' || error.message === 'jwt malformed') {
        return res.status(401).json({
          message: 'Falha de Segurança: Token inválido.',
        });
      }

      console.error('Auth Middleware Error:', error.message);

      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          message: 'Sua sessão expirou. Por favor, faça login novamente.',
        });
      }

      res.status(401).json({ message: 'Não autorizado.' });
    }
  } else {
    res
      .status(401)
      .json({ message: 'Não autorizado, nenhum token fornecido.' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Acesso negado. A função '${req.user.role}' não tem permissão.`,
      });
    }
    next();
  };
};
