import session from "express-session";
import connectPg from "connect-pg-simple";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import type { Express, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { pool } from "./db";

type Role = "customer" | "driver" | "supplier" | "admin" | "company";

export type SessionUser = {
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

/** Same JSON shape as `GET /api/auth/user` (flat user object for login/register responses). */
export async function buildAuthUserApiPayload(userId: string, emailFallback: string) {
  const prof = await pool.query(
    `SELECT role, full_name, phone, profile_photo_url FROM profiles WHERE id = $1`,
    [userId],
  );
  const row = prof.rows[0];
  return {
    id: userId,
    email: emailFallback,
    role: row?.role ?? null,
    fullName: row?.full_name ?? "",
    phone: row?.phone ?? null,
    profilePhotoUrl: row?.profile_photo_url ?? null,
  };
}

/**
 * Passport local login + session cookie (Inspect360-style). Response is portal user JSON; no JWT.
 */
export function handleSessionPasswordLogin(req: Request, res: Response, next: NextFunction) {
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email.trim() || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  passport.authenticate(
    "local",
    (err: unknown, user: false | SessionUser, info: { message?: string } | undefined) => {
      if (err) {
        console.error("[login] passport error:", err);
        return next(err as Error);
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid email or password." });
      }

      const finishLogin = () => {
        req.login(user, (loginErr) => {
          if (loginErr) {
            console.error("[login] req.login error:", loginErr);
            return res.status(500).json({ message: "Login failed." });
          }
          req.session.save(async (saveErr) => {
            if (saveErr) {
              console.error("[login] session save error:", saveErr);
            }
            try {
              const payload = await buildAuthUserApiPayload(user.id, user.email);
              return res.json(payload);
            } catch {
              return res.status(500).json({ message: "Failed to load profile." });
            }
          });
        });
      };

      try {
        req.session.regenerate((regenErr) => {
          if (regenErr) {
            console.error("[login] session regenerate error:", regenErr);
          }
          finishLogin();
        });
      } catch (e) {
        console.error("[login] session regenerate threw:", e);
        finishLogin();
      }
    },
  )(req, res, next);
}

/** Default session signing secret — set SESSION_SECRET in production. */
export const SESSION_SIGNING_SECRET = process.env.SESSION_SECRET || "change_me_session_secret";

export function setupAuth(app: Express) {
  const PgStore = connectPg(session);
  const isProd = process.env.NODE_ENV === "production";
  // Same-origin SPA + API (typical): "lax" works and avoids stricter "none" requirements.
  // Cross-subdomain auth: set SESSION_COOKIE_SAME_SITE=none (still requires secure: true).
  const sameSiteRaw = (process.env.SESSION_COOKIE_SAME_SITE || (isProd ? "lax" : "lax")).toLowerCase();
  const sameSite =
    sameSiteRaw === "none" ? "none" : sameSiteRaw === "strict" ? "strict" : "lax";
  const cookieDomain = process.env.SESSION_COOKIE_DOMAIN?.trim() || undefined;
  const secureEnv = process.env.SESSION_COOKIE_SECURE?.toLowerCase();

  // express-session skips Set-Cookie entirely when cookie.secure is true but the request is not
  // "secure" (req.secure / X-Forwarded-Proto). Default to "auto" so HTTPS gets Secure cookies and
  // local http:// does not. Explicit SESSION_COOKIE_SECURE=true|false still overrides (except SameSite=none).
  let cookieSecure: boolean | "auto";
  if (sameSite === "none") {
    cookieSecure = true;
  } else if (secureEnv === "1" || secureEnv === "true") {
    cookieSecure = true;
  } else if (secureEnv === "0" || secureEnv === "false") {
    cookieSecure = false;
  } else {
    cookieSecure = "auto";
  }

  if (isProd && cookieSecure === true) {
    console.warn(
      "[auth] Session cookie secure=true. If Node runs behind nginx/ALB on HTTP, set trust proxy (see server/index.ts) and forward X-Forwarded-Proto=https, or login will return 200 without Set-Cookie.",
    );
  }

  app.use(
    session({
      store: new PgStore({
        pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      name: "easyfuel.sid",
      secret: SESSION_SIGNING_SECRET,
      resave: false,
      // Passport calls session.regenerate() on login; false can prevent Set-Cookie in some cases.
      saveUninitialized: true,
      proxy: true,
      cookie: {
        httpOnly: true,
        path: "/",
        sameSite,
        secure: cookieSecure,
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

