import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

// Gestion des comptes de connexion (table `profiles`) par l'administrateur :
//   list            : liste des comptes (sans mot de passe)
//   create          : nouveau compte (chef / technicien : équipe obligatoire), mot de passe temporaire
//   update          : changer le rôle et / ou l'équipe d'un compte
//   reset_password  : nouveau mot de passe temporaire
//
// L'application n'utilise pas Supabase Auth : chaque appel contient l'identifiant ET le mot de
// passe de l'administrateur, vérifiés ici (bcrypt, comme la fonction login). Sans cela, n'importe
// qui ayant la clé publique pourrait créer un compte administrateur.
//
// Déploiement : supabase functions deploy admin-users

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ROLES = ["admin", "superviseur", "chef", "technicien", "rh", "consultation", "directeur"] as const;
type Role = (typeof ROLES)[number];
/** rôles rattachés à une équipe de terrain */
const ROLES_EQUIPE: Role[] = ["chef", "technicien"];

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

interface Body {
  action?: "list" | "create" | "update" | "reset_password";
  admin_id?: string;
  admin_password?: string;
  user_id?: string;
  name?: string;
  role?: string;
  team_id?: string | null;
  password?: string;
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req.headers.get("origin"));
  const repondre = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status, headers });

  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return repondre(405, { error: "Method not allowed" });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return repondre(400, { error: "Invalid JSON body" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // ── 1. L'appelant doit être un administrateur (ou super-administrateur) ──
  const adminId = body.admin_id ?? "";
  const adminPassword = (body.admin_password ?? "").trim();
  if (!adminId || !adminPassword) return repondre(401, { error: "Mot de passe administrateur requis" });

  const { data: appelant } = await admin
    .from("profiles")
    .select("id, role, password_hash, est_superadmin")
    .eq("id", adminId)
    .maybeSingle();
  const stored = appelant?.password_hash ?? "";
  const mdpOk = stored.startsWith("$2") ? bcrypt.compareSync(adminPassword, stored) : stored !== "" && stored === adminPassword;
  if (!appelant || !mdpOk) return repondre(401, { error: "Mot de passe administrateur incorrect" });
  if (appelant.role !== "admin" && appelant.est_superadmin !== true) {
    return repondre(403, { error: "Réservé à l'administrateur" });
  }

  const roleValide = (r?: string): r is Role => !!r && (ROLES as readonly string[]).includes(r);
  const equipeExiste = async (teamId: string) => {
    const { data } = await admin.from("teams").select("id").eq("id", teamId).maybeSingle();
    return !!data;
  };

  switch (body.action) {
    // ── liste des comptes ──
    case "list": {
      const { data, error } = await admin
        .from("profiles")
        .select("id, name, role, team_id, ville_scope, est_superadmin, created_at")
        .order("name");
      if (error) return repondre(500, { error: error.message });
      return repondre(200, { users: data ?? [] });
    }

    // ── nouveau compte ──
    case "create": {
      const name = (body.name ?? "").trim();
      const role = body.role;
      const teamId = body.team_id || null;
      if (name.length < 2) return repondre(400, { error: "Nom d'utilisateur trop court" });
      if (!roleValide(role)) return repondre(400, { error: "Rôle invalide" });
      if (ROLES_EQUIPE.includes(role) && !teamId) return repondre(400, { error: "Choisissez l'équipe du chef / technicien" });
      if (teamId && !(await equipeExiste(teamId))) return repondre(400, { error: "Équipe introuvable" });

      // la connexion cherche le nom sans tenir compte des majuscules : il doit être unique
      const { data: existant } = await admin.from("profiles").select("id").ilike("name", name).limit(1);
      if (existant && existant.length) return repondre(409, { error: `Le nom « ${name} » est déjà utilisé` });

      const motDePasse = (body.password ?? "").trim() || randomPassword();
      if (motDePasse.length < 6) return repondre(400, { error: "Mot de passe : 6 caractères minimum" });

      const { data, error } = await admin
        .from("profiles")
        .insert({ name, role, team_id: teamId, password_hash: bcrypt.hashSync(motDePasse, 10) })
        .select("id, name, role, team_id")
        .single();
      if (error) return repondre(500, { error: error.message });
      return repondre(200, { user: data, tempPassword: motDePasse });
    }

    // ── changer le rôle / l'équipe ──
    case "update": {
      const userId = body.user_id ?? "";
      if (!userId) return repondre(400, { error: "Compte manquant" });
      const { data: cible } = await admin.from("profiles").select("id, role, team_id, est_superadmin").eq("id", userId).maybeSingle();
      if (!cible) return repondre(404, { error: "Compte introuvable" });
      if (cible.est_superadmin && appelant.est_superadmin !== true) {
        return repondre(403, { error: "Seul le super-administrateur peut modifier ce compte" });
      }

      const role = body.role ?? cible.role;
      if (!roleValide(role)) return repondre(400, { error: "Rôle invalide" });
      if (userId === adminId && role !== cible.role) return repondre(400, { error: "Vous ne pouvez pas changer votre propre rôle" });

      // un compte hors terrain ne garde pas d'équipe ; chef / technicien : équipe obligatoire
      const teamId = ROLES_EQUIPE.includes(role) ? (body.team_id !== undefined ? body.team_id : cible.team_id) || null : null;
      if (ROLES_EQUIPE.includes(role) && !teamId) return repondre(400, { error: "Choisissez l'équipe du chef / technicien" });
      if (teamId && !(await equipeExiste(teamId))) return repondre(400, { error: "Équipe introuvable" });

      // garder au moins un administrateur
      if (cible.role === "admin" && role !== "admin") {
        const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
        if ((count ?? 0) <= 1) return repondre(400, { error: "Il faut garder au moins un administrateur" });
      }

      const { data, error } = await admin
        .from("profiles")
        .update({ role, team_id: teamId })
        .eq("id", userId)
        .select("id, name, role, team_id")
        .single();
      if (error) return repondre(500, { error: error.message });
      return repondre(200, { user: data });
    }

    // ── nouveau mot de passe temporaire ──
    case "reset_password": {
      const userId = body.user_id ?? "";
      const { data: cible } = await admin.from("profiles").select("id, est_superadmin").eq("id", userId).maybeSingle();
      if (!cible) return repondre(404, { error: "Compte introuvable" });
      if (cible.est_superadmin && appelant.est_superadmin !== true) {
        return repondre(403, { error: "Seul le super-administrateur peut modifier ce compte" });
      }
      const motDePasse = (body.password ?? "").trim() || randomPassword();
      if (motDePasse.length < 6) return repondre(400, { error: "Mot de passe : 6 caractères minimum" });
      const { error } = await admin.from("profiles").update({ password_hash: bcrypt.hashSync(motDePasse, 10) }).eq("id", userId);
      if (error) return repondre(500, { error: error.message });
      return repondre(200, { tempPassword: motDePasse });
    }

    default:
      return repondre(400, { error: "Action inconnue" });
  }
});
