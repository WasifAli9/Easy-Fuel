import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { pool } from "./db";

type AppRole = "customer" | "driver" | "supplier" | "admin" | "company";

type TokenPayload = {
  sub: string;
  email: string;
  role: AppRole | null;
  type: "access" | "refresh";
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: AppRole | null;
};

const ACCESS_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 60 * 60);
const REFRESH_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 30);
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev_refresh_secret_change_me";
let initialized = false;

async function ensureAuthTables() {
  if (initialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS local_auth_users (
      id uuid PRIMARY KEY,
      email text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS local_auth_refresh_tokens (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL,
      token_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  initialized = true;
}

function signAccessToken(payload: Omit<TokenPayload, "type">) {
  return jwt.sign({ ...payload, type: "access" }, JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL_SECONDS });
}

function signRefreshToken(payload: Omit<TokenPayload, "type">) {
  return jwt.sign({ ...payload, type: "refresh" }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL_SECONDS });
}

async function storeRefreshToken(userId: string, refreshToken: string) {
  const tokenHash = await bcrypt.hash(refreshToken, 10);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
  await pool.query(
    `INSERT INTO local_auth_refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), userId, tokenHash, expiresAt],
  );
}

export async function revokeRefreshToken(refreshToken: string) {
  await ensureAuthTables();
  const rows = await pool.query(
    `SELECT id, token_hash FROM local_auth_refresh_tokens WHERE revoked_at IS NULL AND expires_at > now()`,
  );
  for (const row of rows.rows) {
    const ok = await bcrypt.compare(refreshToken, row.token_hash);
    if (ok) {
      await pool.query(`UPDATE local_auth_refresh_tokens SET revoked_at = now() WHERE id = $1`, [row.id]);
      return;
    }
  }
}

async function findValidRefreshToken(refreshToken: string) {
  const rows = await pool.query(
    `SELECT id, user_id, token_hash FROM local_auth_refresh_tokens WHERE revoked_at IS NULL AND expires_at > now()`,
  );
  for (const row of rows.rows) {
    const ok = await bcrypt.compare(refreshToken, row.token_hash);
    if (ok) return row;
  }
  return null;
}

async function getRoleByUserId(userId: string): Promise<AppRole | null> {
  const res = await pool.query(`SELECT role FROM profiles WHERE id = $1`, [userId]);
  return (res.rows[0]?.role as AppRole | undefined) ?? null;
}

export async function registerLocalUser(input: {
  email: string;
  password: string;
  fullName: string;
  role: AppRole;
}) {
  await ensureAuthTables();
  const email = input.email.trim().toLowerCase();
  const existing = await pool.query(`SELECT id FROM local_auth_users WHERE email = $1`, [email]);
  if (existing.rowCount) {
    throw new Error("Email already in use.");
  }

  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(input.password, 12);
  await pool.query(`INSERT INTO local_auth_users (id, email, password_hash) VALUES ($1, $2, $3)`, [
    userId,
    email,
    passwordHash,
  ]);

  await pool.query(
    `INSERT INTO profiles (id, role, full_name, is_active) VALUES ($1, $2, $3, true) ON CONFLICT (id) DO NOTHING`,
    [userId, input.role, input.fullName],
  );

  if (input.role === "customer") {
    await pool.query(`INSERT INTO customers (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
  } else if (input.role === "driver") {
    await pool.query(`INSERT INTO drivers (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
  } else if (input.role === "supplier") {
    await pool.query(
      `INSERT INTO suppliers (owner_id, name, registered_name) VALUES ($1, $2, $2) ON CONFLICT DO NOTHING`,
      [userId, input.fullName],
    );
  } else if (input.role === "company") {
    await pool.query(
      `INSERT INTO companies (owner_user_id, name, status) VALUES ($1, $2, 'active') ON CONFLICT DO NOTHING`,
      [userId, input.fullName],
    );
  }

  const role = await getRoleByUserId(userId);
  const accessToken = signAccessToken({ sub: userId, email, role });
  const refreshToken = signRefreshToken({ sub: userId, email, role });
  await storeRefreshToken(userId, refreshToken);
  return { user: { id: userId, email, role }, accessToken, refreshToken };
}

export async function loginLocalUser(emailRaw: string, password: string) {
  await ensureAuthTables();
  const email = emailRaw.trim().toLowerCase();
  const result = await pool.query(`SELECT id, email, password_hash FROM local_auth_users WHERE email = $1`, [email]);
  const user = result.rows[0];
  if (!user) throw new Error("Invalid email or password.");
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error("Invalid email or password.");
  const role = await getRoleByUserId(user.id);
  const accessToken = signAccessToken({ sub: user.id, email: user.email, role });
  const refreshToken = signRefreshToken({ sub: user.id, email: user.email, role });
  await storeRefreshToken(user.id, refreshToken);
  return { user: { id: user.id, email: user.email, role }, accessToken, refreshToken };
}

export async function refreshLocalTokens(refreshToken: string) {
  await ensureAuthTables();
  let payload: TokenPayload;
  try {
    payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as TokenPayload;
  } catch {
    throw new Error("Invalid refresh token.");
  }
  if (payload.type !== "refresh") {
    throw new Error("Invalid refresh token.");
  }
  const tokenRow = await findValidRefreshToken(refreshToken);
  if (!tokenRow || tokenRow.user_id !== payload.sub) {
    throw new Error("Refresh token expired or revoked.");
  }
  await pool.query(`UPDATE local_auth_refresh_tokens SET revoked_at = now() WHERE id = $1`, [tokenRow.id]);
  const role = await getRoleByUserId(payload.sub);
  const nextAccess = signAccessToken({ sub: payload.sub, email: payload.email, role });
  const nextRefresh = signRefreshToken({ sub: payload.sub, email: payload.email, role });
  await storeRefreshToken(payload.sub, nextRefresh);
  return { accessToken: nextAccess, refreshToken: nextRefresh, role };
}

export async function changeLocalPassword(userId: string, currentPassword: string, newPassword: string) {
  await ensureAuthTables();
  const result = await pool.query(`SELECT password_hash FROM local_auth_users WHERE id = $1`, [userId]);
  const row = result.rows[0];
  if (!row) throw new Error("User not found.");
  if (currentPassword) {
    const valid = await bcrypt.compare(currentPassword, row.password_hash);
    if (!valid) throw new Error("Current password is incorrect.");
  }
  const nextHash = await bcrypt.hash(newPassword, 12);
  await pool.query(`UPDATE local_auth_users SET password_hash = $2, updated_at = now() WHERE id = $1`, [userId, nextHash]);
}

export function isLocalAuthEnabled() {
  return true;
}

function parseBearer(authHeader?: string) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.substring(7);
}

export async function getLocalUserFromRequest(req: Request): Promise<AuthenticatedUser | null> {
  const token = parseBearer(req.headers.authorization);
  if (!token) return null;
  return getLocalUserFromAccessToken(token);
}

export async function getLocalUserFromAccessToken(token: string): Promise<AuthenticatedUser | null> {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_ACCESS_SECRET) as TokenPayload;
    if (payload.type !== "access") return null;
    const role = await getRoleByUserId(payload.sub);
    return { id: payload.sub, email: payload.email, role };
  } catch {
    return null;
  }
}

export async function bootstrapLocalAuth() {
  if (isLocalAuthEnabled()) {
    await ensureAuthTables();
  }
}

