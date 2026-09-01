/**
 * Authentication and Role-Based Authorization Middleware
 * 
 * SERVER-SIDE SECURITY RULE:
 * UI is just a display choice. All critical and admin-only actions are strictly
 * verified server-side using the verified user role from signed JWT tokens.
 */

import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET_FILE = path.resolve(__dirname, '..', 'data', '.jwt_secret');
const TOKEN_EXPIRY = '24h';

/**
 * Get or dynamically generate a persistent cryptographically secure JWT secret.
 * Priority:
 * 1. process.env.JWT_SECRET
 * 2. Persistent secret file (data/.jwt_secret)
 * 3. Newly generated 256-bit random hex string saved to data/.jwt_secret
 */
function getJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length > 0) {
    return process.env.JWT_SECRET.trim();
  }

  try {
    const dataDir = path.dirname(SECRET_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (fs.existsSync(SECRET_FILE)) {
      const savedSecret = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
      if (savedSecret.length >= 32) {
        return savedSecret;
      }
    }

    // Generate fresh 256-bit random secret
    const newSecret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, newSecret, 'utf-8');
    return newSecret;
  } catch (err) {
    console.error('Warning: Failed to persist JWT secret to disk, using in-memory random secret:', err);
    return crypto.randomBytes(32).toString('hex');
  }
}

const JWT_SECRET = getJwtSecret();

/**
 * Generate a JWT token for a user
 */
export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * Verify a JWT token
 */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Express middleware to authenticate token strictly from Authorization: Bearer header.
 * Query string tokens are rejected to prevent leakage in URL logs/history.
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Authentication token required in Authorization header' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
  }

  const user = db.findUserById(payload.id);
  if (!user) {
    return res.status(403).json({ error: 'Forbidden: User not found' });
  }

  req.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name
  };

  next();
}

/**
 * Express middleware to enforce specific role(s)
 * e.g., requireRole('admin')
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Action requires one of roles: [${allowedRoles.join(', ')}]. Current role: '${req.user.role}'`
      });
    }

    next();
  };
}
