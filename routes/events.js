// Public read of upcoming events.
import { Router } from 'express';
import db from '../db.js';

const router = Router();

router.get('/api/events', (req, res) => {
  const rows = db
    .prepare("SELECT id, title, starts_at, location, description FROM events ORDER BY starts_at ASC")
    .all();
  res.json(rows);
});

export default router;
