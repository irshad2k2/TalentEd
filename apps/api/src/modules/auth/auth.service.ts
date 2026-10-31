/**
 * Authentication: short-lived access tokens + rotating refresh tokens.
 *
 *  - Access token: JWT, 15 minutes, sent in the Authorization header, kept in browser MEMORY only.
 *  - Refresh token: random string, 7 days, in an HttpOnly cookie (JavaScript can't read it -> XSS can't steal it).
 *  - Every refresh REPLACES the refresh token (rotation). The old one is marked revoked.
 *  - If a revoked token is ever presented again, someone has a stolen copy, so the whole
 *    "family" (every token from that login) is revoked and the user must log in again.
 */
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { User } from '@prisma/client';
import type { LoginInput, SignupInput } from '@talented/shared';
import { prisma } from '../../config/db';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS, env } from '../../config/env';
import { conflict, unauthorized } from '../../lib/errors';
import { randomToken, sha256 } from '../../lib/crypto';
import { logger } from '../../lib/logger';

const BCRYPT_ROUNDS = 12;

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: User['role'];
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

const toPublic = (u: User): PublicUser => ({ id: u.id, name: u.name, email: u.email, role: u.role });

/** The pepper means a leaked database alone is not enough to forge a matching token hash. */
const hashRefresh = (token: string) => sha256(`${token}.${env.REFRESH_TOKEN_PEPPER}`);

export function signAccessToken(user: Pick<User, 'id' | 'role' | 'name'>): string {
  return jwt.sign({ role: user.role, name: user.name }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

async function issueRefreshToken(userId: string, familyId: string) {
  const token = randomToken(48);
  const row = await prisma.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashRefresh(token),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return { token, row };
}

async function startSession(user: User): Promise<Session> {
  const { token } = await issueRefreshToken(user.id, crypto.randomUUID());
  return { accessToken: signAccessToken(user), refreshToken: token, user: toPublic(user) };
}

export async function signup(input: SignupInput): Promise<Session> {
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw conflict('An account with this email already exists');

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
    },
  });
  return startSession(user);
}

export async function login(input: LoginInput): Promise<Session> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Same message for "no such user" and "wrong password" so emails can't be enumerated.
  const ok = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !ok) throw unauthorized('Invalid email or password');
  return startSession(user);
}

export async function refresh(presented: string | undefined): Promise<Session> {
  if (!presented) throw unauthorized('No refresh token');

  const current = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefresh(presented) },
    include: { user: true },
  });
  if (!current) throw unauthorized('Invalid refresh token');

  if (current.revokedAt) {
    // REUSE DETECTED: this token was already rotated. Kill every session from that login.
    await revokeFamily(current.familyId);
    logger.warn({ userId: current.userId, familyId: current.familyId }, 'Refresh token reuse detected');
    throw unauthorized('Session revoked, please log in again');
  }
  if (current.expiresAt < new Date()) throw unauthorized('Session expired, please log in again');

  // Atomically claim the old token. If two requests race, only one gets count === 1.
  const claimed = await prisma.refreshToken.updateMany({
    where: { id: current.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count === 0) {
    await revokeFamily(current.familyId);
    throw unauthorized('Session revoked, please log in again');
  }

  const { token, row } = await issueRefreshToken(current.userId, current.familyId);
  await prisma.refreshToken.update({ where: { id: current.id }, data: { replacedBy: row.id } });

  return { accessToken: signAccessToken(current.user), refreshToken: token, user: toPublic(current.user) };
}

export async function logout(presented: string | undefined): Promise<void> {
  if (!presented) return;
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefresh(presented) } });
  if (row) await revokeFamily(row.familyId);
}

async function revokeFamily(familyId: string) {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();
  return toPublic(user);
}
