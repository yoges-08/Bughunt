/**
 * Authentication Routes
 */

import express from 'express';
import { db } from '../db.js';
import { generateToken, authenticateToken } from '../auth.js';

const router = express.Router();

// Login endpoint (Admin or Student)
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.findUserByUsername(username);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    }
  });
});

// Current user profile
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    user: req.user
  });
});

export default router;
