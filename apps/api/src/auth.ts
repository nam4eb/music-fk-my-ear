import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
export type AuthorizedRequest = Request & { userId: string };
export function issueToken(userId: string) {
  return jwt.sign({ sub: userId }, config.JWT_SECRET, { issuer: 'vibebox', expiresIn: '7d' });
}
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const bearer = /^Bearer (.+)$/.exec(req.get('authorization') ?? '');
  if (!bearer) { res.status(401).json({ error: 'Login required' }); return; }
  try {
    const payload = jwt.verify(bearer[1], config.JWT_SECRET, { issuer: 'vibebox' });
    if (!payload || typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error('Invalid token');
    (req as AuthorizedRequest).userId = payload.sub;
    next();
  } catch { res.status(401).json({ error: 'Session expired; login again' }); }
}
