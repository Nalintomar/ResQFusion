import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { signToken } from '../middleware/auth.js';

export function authRouter(db) {
  const router = Router();

  router.post('/register', async (req, res) => {
    const { email, password, name, role } = req.body || {};
    if (!email || !password || !name) return res.status(400).json({ error: 'email, password and name are required' });
    if (!['citizen', 'relief', 'admin'].includes(role)) return res.status(400).json({ error: 'role must be citizen, relief or admin' });
    if (await db.sql.findUserByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists' });

    const user = await db.sql.createUser({ email, name, role, passwordHash: bcrypt.hashSync(password, 8) });
    res.status(201).json({ token: signToken(user), user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });

  router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};
    const user = email && (await db.sql.findUserByEmail(email));
    if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    res.json({ token: signToken(user), user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });

  return router;
}
