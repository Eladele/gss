import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

// Remplace l'ancien insert direct (cote client, cle anon) dans `profiles`
// qui utilisait un mot de passe fixe 'chef2026' pour tout nouveau chef
// d'equipe -- lisible par n'importe qui dans le bundle JS et permettait a
// quiconque de creer un compte (y compris role admin) via l'API REST.
//
// Desormais seul ce endpoint (service_role) peut inserer dans `profiles`,
// et chaque nouveau compte recoit un mot de passe temporaire aleatoire,
// deja hashe en bcrypt, retourne une seule fois dans la reponse pour etre
// communique au chef d'equipe.
//
// Déploiement : supabase functions deploy create-team-leader

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function randomPassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  let body: { name?: string; team_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  const name = (body.name ?? "").trim();
  const teamId = body.team_id ?? null;

  if (!name || !teamId) {
    return new Response(JSON.stringify({ error: "name et team_id requis" }), { status: 400, headers });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const tempPassword = randomPassword();
  const hash = bcrypt.hashSync(tempPassword, 10);

  const { data, error } = await admin
    .from("profiles")
    .insert({ name, role: "chef", team_id: teamId, password_hash: hash })
    .select("id, name, role, team_id")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  }

  return new Response(JSON.stringify({ profile: data, tempPassword }), { status: 200, headers });
});
