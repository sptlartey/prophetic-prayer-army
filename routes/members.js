// Member sign-up and general contact form.
import { Router } from 'express';
import db from '../db.js';

const router = Router();

const insertMember = db.prepare(
  'INSERT INTO members (name, email, phone) VALUES (?, ?, ?)'
);
const insertContact = db.prepare(
  'INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)'
);

router.post('/api/members', (req, res) => {
  const { name, email, phone } = req.body || {};
  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }
  insertMember.run(name.trim(), email.trim(), phone?.trim() || null);
  res.status(201).json({ ok: true, message: 'Welcome to the family! You are now signed up.' });
});

router.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }
  insertContact.run(name.trim(), email.trim(), message.trim());
  res.status(201).json({ ok: true, message: 'Thank you for reaching out. We will be in touch soon.' });
});

export default router;
