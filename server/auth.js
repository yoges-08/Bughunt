/**
 * Authentication and Role-Based Authorization Middleware
 * 
 * SERVER-SIDE SECURITY RULE:
 * UI is just a display choice. All critical and admin-only actions are strictly
 * verified server-side using the verified user role from signed JWT tokens.
 */

import jwt from 'jsonwebtoken';
import { db } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'bughunt_lan_secret_key_2026_x89f';
const TOKEN_EXPIRY = '24h';

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
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Express middleware to authenticate token from Header or Query
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const tokenFromQuery = req.query.token;
  const token = tokenFromHeader || tokenFromQuery;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Authentication token required' });
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
