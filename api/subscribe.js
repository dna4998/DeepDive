import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email, sessionId } = req.body;
  try {
    if (action === 'create-checkout') {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer_email: email,
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: `${req.headers.origin}/app.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/app.html?canceled=true`,
      });
      return res.status(200).json({ url: session.url, sessionId: session.id });
    }
    if (action === 'verify') {
      if (sessionId) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === 'paid') return res.status(200).json({ active: true, email: session.customer_email, customerId: session.customer });
      }
      if (email) {
        const customers = await stripe.customers.list({ email, limit: 1 });
        if (customers.data.length > 0) {
          const subs = await stripe.subscriptions.list({ customer: customers.data[0].id, status: 'active', limit: 1 });
          if (subs.data.length > 0) return res.status(200).json({ active: true, email, customerId: customers.data[0].id });
        }
      }
      return res.status(200).json({ active: false });
    }
    if (action === 'portal') {
      const customers = await stripe.customers.list({ email, limit: 1 });
      if (customers.data.length === 0) return res.status(404).json({ error: 'No subscription found' });
      const portal = await stripe.billingPortal.sessions.create({ customer: customers.data[0].id, return_url: req.headers.origin });
      return res.status(200).json({ url: portal.url });
    }
    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    return res.status(500).json({ error: { message: error.message } });
  }
}
