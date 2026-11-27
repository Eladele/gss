// GSS · send-push : envoie une notification de l'application (table app_notifications)
// en notification push FCM sur les téléphones du destinataire.
//
// Appelée par le déclencheur app_notifications_push (pg_net), jamais par les téléphones.
// Secrets (supabase secrets set …) :
//   PUSH_SECRET          même valeur que push_config.secret
//   FCM_SERVICE_ACCOUNT  contenu JSON du compte de service Firebase (Paramètres du projet → Comptes de service)
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase.
//
// Déploiement : supabase functions deploy send-push --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';

interface CompteService {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface Notification {
  id: string;
  destinataire_id: string;
  titre: string;
  message: string;
  type: string;
  module: string;
  ref_id: string | null;
}

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// ─── jeton d'accès Google (OAuth 2, JWT signé RS256), gardé jusqu'à son expiration ───
let jetonGoogle: { valeur: string; expire: number } | null = null;

function base64url(octets: Uint8Array | string): string {
  const b = typeof octets === 'string' ? new TextEncoder().encode(octets) : octets;
  let s = '';
  for (const o of b) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function cleePrivee(pem: string): Promise<CryptoKey> {
  const corps = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(corps), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function accesGoogle(compte: CompteService): Promise<string> {
  const maintenant = Math.floor(Date.now() / 1000);
  if (jetonGoogle && jetonGoogle.expire - 60 > maintenant) return jetonGoogle.valeur;
  const entete = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const charge = base64url(
    JSON.stringify({
      iss: compte.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: maintenant,
      exp: maintenant + 3600,
    }),
  );
  const cle = await cleePrivee(compte.private_key);
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cle, new TextEncoder().encode(`${entete}.${charge}`)),
  );
  const rep = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${entete}.${charge}.${base64url(signature)}`,
    }),
  });
  if (!rep.ok) throw new Error(`OAuth Google : ${rep.status} ${await rep.text()}`);
  const j = (await rep.json()) as { access_token: string; expires_in: number };
  jetonGoogle = { valeur: j.access_token, expire: maintenant + j.expires_in };
  return j.access_token;
}

// ─── envoi FCM HTTP v1 ───
async function envoyer(
  compte: CompteService,
  acces: string,
  token: string,
  n: Notification,
): Promise<'ok' | 'invalide' | string> {
  const rep = await fetch(`https://fcm.googleapis.com/v1/projects/${compte.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${acces}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: n.titre, body: n.message || n.titre },
        // lu par l'application quand la notification est touchée (ouvre le bon onglet)
        data: {
          notification_id: n.id,
          type: n.type ?? '',
          module: n.module ?? '',
          ref_id: n.ref_id ?? '',
        },
        android: {
          priority: 'high',
          notification: { tag: n.id, ...(n.type === 'programme_urgent' ? { notification_priority: 'PRIORITY_MAX' } : {}) },
        },
        apns: { payload: { aps: { sound: 'default' } } },
      },
    }),
  });
  if (rep.ok) return 'ok';
  const texte = await rep.text();
  // jeton périmé (application désinstallée, données effacées…) : à supprimer
  if (rep.status === 404 || texte.includes('UNREGISTERED') || (rep.status === 400 && texte.includes('registration token'))) {
    return 'invalide';
  }
  return `${rep.status} ${texte}`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Méthode non permise', { status: 405 });
  const secret = Deno.env.get('PUSH_SECRET') ?? '';
  if (!secret || req.headers.get('x-push-secret') !== secret) return new Response('Non autorisé', { status: 401 });

  let n: Notification;
  try {
    const corps = await req.json();
    n = (corps.record ?? corps) as Notification;
    if (!n?.destinataire_id || !n?.titre) throw new Error('notification incomplète');
  } catch (e) {
    return new Response(`Requête invalide : ${(e as Error).message}`, { status: 400 });
  }

  const { data: jetons, error } = await supabase.from('device_tokens').select('token').eq('user_id', n.destinataire_id);
  if (error) return new Response(`Lecture des jetons : ${error.message}`, { status: 500 });
  if (!jetons?.length) return Response.json({ envoyes: 0 });

  let compte: CompteService;
  try {
    compte = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT') ?? '');
  } catch {
    return new Response('Secret FCM_SERVICE_ACCOUNT manquant ou illisible', { status: 500 });
  }

  try {
    const acces = await accesGoogle(compte);
    const resultats = await Promise.all(jetons.map((j) => envoyer(compte, acces, j.token, n)));
    const invalides = jetons.filter((_, i) => resultats[i] === 'invalide').map((j) => j.token);
    if (invalides.length) await supabase.from('device_tokens').delete().in('token', invalides);
    const erreurs = resultats.filter((r) => r !== 'ok' && r !== 'invalide');
    if (erreurs.length) console.error('send-push', erreurs);
    return Response.json({
      envoyes: resultats.filter((r) => r === 'ok').length,
      supprimes: invalides.length,
      erreurs: erreurs.length,
    });
  } catch (e) {
    console.error('send-push', e);
    return new Response((e as Error).message, { status: 500 });
  }
});
