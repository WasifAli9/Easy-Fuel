import session from "express-session";
import connectPg from "connect-pg-simple";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import type { Express, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { pool } from "./db";

type Role = "customer" | "driver" | "supplier" | "admin" | "company";

type SessionUser = {
  id: string;
  email: string;
  role: Role | null;
};

async function ensureLocalAuthTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS local_auth_users (
      id uuid PRIMARY KEY,
      email text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function getRoleByUserId(userId: string): Promise<Role | null> {
  const result = await pool.query(`SELECT role FROM profiles WHERE id = $1`, [userId]);
  return (result.rows[0]?.role as Role | undefined) ?? null;
}

async function getAuthUserByEmail(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  const result = await pool.query(`SELECT id, email, password_hash FROM local_auth_users WHERE email = $1`, [email]);
  return result.rows[0] ?? null;
}

export async function registerSessionUser(input: {
  email: string;
  password: string;
  fullName: string;
  role: Role;
}) {
  await ensureLocalAuthTables();
  const email = input.email.trim().toLowerCase();
  const existing = await getAuthUserByEmail(email);
  if (existing) throw new Error("Email already in use.");

  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(input.password, 12);
  await pool.query(`INSERT INTO local_auth_users (id, email, password_hash) VALUES ($1, $2, $3)`, [userId, email, passwordHash]);

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
  return { id: userId, email, role } satisfies SessionUser;
}

export function setupAuth(app: Express) {
  const PgStore = connectPg(session);
  const sessionSecret = process.env.SESSION_SECRET || "change_me_session_secret";
  const isProd = process.env.NODE_ENV === "production";
  // Same-origin SPA + API (typical): "lax" works and avoids stricter "none" requirements.
  // Cross-subdomain auth: set SESSION_COOKIE_SAME_SITE=none (still requires secure: true).
  const sameSiteRaw = (process.env.SESSION_COOKIE_SAME_SITE || (isProd ? "lax" : "lax")).toLowerCase();
  const sameSite =
    sameSiteRaw === "none" ? "none" : sameSiteRaw === "strict" ? "strict" : "lax";
  // IMPORTANT: In production, do NOT default secure=true. Browsers will refuse to store/send
  // Secure cookies on plain http:// (e.g. http://host:5002), so login returns 200 but /api/auth/me
  // sees no cookies (hasCookie: false). Use https:// in front, then set SESSION_COOKIE_SECURE=true.
  const cookieSecure =
    process.env.SESSION_COOKIE_SECURE === "1" ||
    process.env.SESSION_COOKIE_SECURE === "true";
  const cookieDomain = process.env.SESSION_COOKIE_DOMAIN?.trim() || undefined;

  if (isProd && !cookieSecure) {
    console.warn(
      "[auth] Session cookie secure=false (default). If the site is served over HTTPS, set SESSION_COOKIE_SECURE=true in .env",
    );
  }

  const effectiveSecure = sameSite === "none" ? true : cookieSecure;
  if (sameSite === "none" && !cookieSecure) {
    console.warn("[auth] SameSite=none requires Secure cookies; using secure=true");
  }

  app.use(
    session({
      store: new PgStore({
        pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      name: "easyfuel.sid",
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: {
        httpOnly: true,
        path: "/",
        sameSite,
        secure: effectiveSecure,
        maxAge: 1000 * 60 * 60 * 24 * 30,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy({ usernameField: "email", passwordField: "password" }, async (email, password, done) => {
      try {
        await ensureLocalAuthTables();
        const user = await getAuthUserByEmail(email);
        if (!user) return done(null, false, { message: "Invalid email or password." });
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return done(null, false, { message: "Invalid email or password." });
        const role = await getRoleByUserId(user.id);
        return done(null, { id: user.id, email: user.email, role } satisfies SessionUser);
      } catch (error) {
        return done(error as Error);
      }
    }),
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, (user as SessionUser).id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const result = await pool.query(`SELECT id, email FROM local_auth_users WHERE id = $1`, [id]);
      const row = result.rows[0];
      if (!row) return done(null, false);
      const role = await getRoleByUserId(row.id);
      done(null, { id: row.id, email: row.email, role } satisfies SessionUser);
    } catch (error) {
      done(error as Error);
    }
  });
}

export function requireSessionAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

export function getRequestUser(req: Request): SessionUser | null {
  if (!req.isAuthenticated?.() || !req.user) return null;
  return req.user as SessionUser;
}

export async function updateSessionUserRole(userId: string, role: Role, fullName: string, phone?: string) {
  await pool.query(
    `INSERT INTO profiles (id, role, full_name, phone, is_active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, updated_at = now()`,
    [userId, role, fullName, phone || null],
  );
}

