// Public prayer-request submissions.
import { Router } from 'express';
import db from '../db.js';

const router = Router();

const insert = db.prepare(
  'INSERT INTO prayer_requests (name, email, request, is_private) VALUES (?, ?, ?, ?)'
);

router.post('/api/prayer', (req, res) => {
  const { name, email, request, is_private } = req.body || {};
  if (!request || !String(request).trim()) {
    return res.status(400).json({ error: 'A prayer request is required.' });
  }
  insert.run(
    name?.trim() || null,
    email?.trim() || null,
    String(request).trim(),
    is_private ? 1 : 0
  );
  res.status(201).json({ ok: true, message: 'Your prayer request has been received. We are praying with you.' });
});

export default router;
