// ═══════════════════════════════════════════════════════════════════
// VERCEL FUNCTION — api/send-push.js
// Envoie une notification Web Push à un client
// ═══════════════════════════════════════════════════════════════════

import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:contact@restopro.fr",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { subscription, title, body, tag, url } = req.body;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "Subscription manquante" });
  }

  const payload = JSON.stringify({ title, body, tag, url });

  try {
    await webpush.sendNotification(subscription, payload);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Push error:", err);
    // 410 = abonné supprimé (token expiré)
    if (err.statusCode === 410) {
      return res.status(410).json({ error: "Subscription expirée" });
    }
    return res.status(500).json({ error: err.message });
  }
}
