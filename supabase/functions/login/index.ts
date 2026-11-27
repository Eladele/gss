import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

// Cette fonction remplace la lecture directe (cote client, cle anon) de la
// table `profiles`. Le mot de passe n'est plus jamais expose au navigateur :
// la verification se fait ici, cote serveur, avec la service_role key.
//
// Migration douce vers bcrypt : les mots de passe historiques stockes en
// clair sont compares directement puis re-hashes en bcrypt automatiquement
// des la premiere connexion reussie. Les nouveaux mots de passe sont deja
// au format bcrypt (cf. fonctions create-team-leader, admin-users, installation).
//
// Déploiement : supabase functions deploy login

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const COLORS: Record<string, string> = {
  admin: "#6A1B9A",
  superviseur: "#1565C0",
  chef: "#2E7D32",
  technicien: "#00897B",
  rh: "#C2185B",
  consultation: "#546E7A",
  directeur: "#E65100",
};

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  let body: { name?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  const name = (body.name ?? "").trim();
  const password = (body.password ?? "").trim();

  if (!name) {
    return new Response(JSON.stringify({ error: "Nom requis" }), { status: 400, headers });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, name, role, team_id, password_hash, ville_scope")
    .ilike("name", name)
    .single();

  if (error || !profile) {
    return new Response(JSON.stringify({ error: "Identifiants incorrects" }), { status: 401, headers });
  }

  const stored = profile.password_hash ?? "";
  let ok = false;

  if (stored.startsWith("$2")) {
    // Format bcrypt
    ok = bcrypt.compareSync(password, stored);
  } else {
    // Legacy : mot de passe stocke en clair. On compare directement puis on
    // migre silencieusement vers bcrypt en cas de succes.
    ok = stored !== "" && stored === password;
    if (ok) {
      const newHash = bcrypt.hashSync(password, 10);
      await admin.from("profiles").update({ password_hash: newHash }).eq("id", profile.id);
    }
  }

  if (!ok) {
    return new Response(JSON.stringify({ error: "Identifiants incorrects" }), { status: 401, headers });
  }

  let teamName: string | null = null;
  if (profile.team_id) {
    const { data: team } = await admin.from("teams").select("name").eq("id", profile.team_id).single();
    teamName = team?.name ?? null;
  }

  const user = {
    id: profile.id,
    name: profile.name,
    role: profile.role,
    teamId: profile.team_id ?? null,
    teamName,
    avatar: profile.name[0].toUpperCase(),
    color: COLORS[profile.role] ?? "#546E7A",
    villeScope: profile.ville_scope ?? undefined,
  };

  return new Response(JSON.stringify({ user }), { status: 200, headers });
});
