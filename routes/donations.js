// Donations / online giving via Stripe Checkout (test mode).
// Stub-safe: if no STRIPE_SECRET_KEY is set, the endpoint reports that giving
// is not yet configured instead of crashing.
import { Router } from 'express';
import db from '../db.js';

const router = Router();

let stripe = null;
const key = process.env.STRIPE_SECRET_KEY?.trim();
if (key) {
  const { default: Stripe } = await import('stripe');
  stripe = new Stripe(key);
}

const insertDonation = db.prepare(
  `INSERT INTO donations (amount_cents, currency, donor_name, donor_email, stripe_session, status, method)
   VALUES (?, ?, ?, ?, ?, ?, 'card')`
);

const insertPaypal = db.prepare(
  `INSERT INTO donations (amount_cents, currency, donor_name, donor_email, status, method)
   VALUES (?, 'cad', ?, ?, 'pending', 'paypal')`
);

router.get('/api/giving/status', (req, res) => {
  res.json({ configured: Boolean(stripe) });
});

// Records a PayPal gift intent (the actual payment happens on paypal.me).
router.post('/api/donate/paypal', (req, res) => {
  const { amount, name, email } = req.body || {};
  const dollars = Number(amount);
  const cents = dollars >= 1 ? Math.round(dollars * 100) : 0;
  insertPaypal.run(cents, name?.trim() || null, email?.trim() || null);
  res.status(201).json({ ok: true });
});

router.post('/api/donate', async (req, res) => {
  const { amount, name, email } = req.body || {};
  const dollars = Number(amount);
  if (!dollars || dollars < 1) {
    return res.status(400).json({ error: 'Please enter a giving amount of at least $1.' });
  }
  const amountCents = Math.round(dollars * 100);

  if (!stripe) {
    // Record the intent so nothing is lost, but tell the user it's not live yet.
    insertDonation.run(amountCents, 'cad', name?.trim() || null, email?.trim() || null, null, 'pending');
    return res.status(503).json({
      error: 'Online giving is not yet configured. Please add a Stripe key, or contact us to give another way.',
    });
  }

  const siteUrl = process.env.SITE_URL?.trim() || 'http://localhost:3000';
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'cad',
          product_data: { name: 'Offering — The Prophetic Prayer Army' },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      customer_email: email?.trim() || undefined,
      success_url: `${siteUrl}/?giving=success`,
      cancel_url: `${siteUrl}/?giving=cancelled`,
    });
    insertDonation.run(amountCents, 'cad', name?.trim() || null, email?.trim() || null, session.id, 'pending');
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: `Could not start checkout: ${err.message}` });
  }
});

export default router;
