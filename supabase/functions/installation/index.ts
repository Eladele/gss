import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

// Installation d'une NOUVELLE base (nouveau projet Supabase d'une entreprise) :
//   etat      : la base a-t-elle déjà un administrateur ?
//   installer : crée en une fois le super-administrateur, le nom de l'entreprise (marque) et ses
//               comptes administrateurs — SEULEMENT si aucun administrateur n'existe encore.
//   inscrire_superadmin : base déjà installée mais SANS super-administrateur (ex. base existante) :
//               crée le compte super-administrateur, avec le nom + mot de passe d'un administrateur
//               existant (ou le code INSTALL_TOKEN). Refusé dès qu'un super-administrateur existe.
// Les autres comptes se créent dans la page « Utilisateurs » (fonction admin-users).
//
// Sécurité : tant que la base est vide, le premier qui appelle « installer » crée les comptes.
// Faire l'installation juste après la création du projet, ou définir le secret INSTALL_TOKEN
// (supabase secrets set INSTALL_TOKEN=...) : il sera alors demandé à l'installation.
//
// Déploiement : supabase functions deploy installation

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const installToken = Deno.env.get("INSTALL_TOKEN") ?? "";

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

interface Compte {
  name?: string;
  password?: string;
}
interface Body {
  action?: "etat" | "installer" | "inscrire_superadmin";
  token?: string;
  admin_name?: string;
  admin_password?: string;
  superadmin?: Compte | null;
  entreprise?: { nom?: string; nomComplet?: string };
  admins?: Compte[];
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

  const db = createClient(supabaseUrl, serviceRoleKey);

  // base installée = au moins un administrateur ou super-administrateur
  const { count, error: errCompte } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .or("role.eq.admin,est_superadmin.eq.true");
  if (errCompte) return repondre(500, { error: `Base non prête (exécuter supabase_schema.sql) : ${errCompte.message}` });
  const installe = (count ?? 0) > 0;

  // un super-administrateur existe-t-il déjà ?
  const { count: nbSuper } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("est_superadmin", true);
  const superadminExiste = (nbSuper ?? 0) > 0;

  if (body.action === "etat") return repondre(200, { installe, jetonRequis: !!installToken, superadmin: superadminExiste });

  if (body.action === "inscrire_superadmin") {
    if (superadminExiste) return repondre(409, { error: "Un super-administrateur existe déjà : il gère les comptes depuis la page Utilisateurs." });
    // autorisation : code d'installation, ou identifiants d'un administrateur de la base
    let autorise = !!installToken && body.token === installToken;
    if (!autorise) {
      const nomAdmin = (body.admin_name ?? "").trim();
      const mdpAdmin = (body.admin_password ?? "").trim();
      if (!nomAdmin || !mdpAdmin) return repondre(401, { error: "Nom et mot de passe d'un administrateur requis" });
      const { data: adm } = await db.from("profiles").select("id, role, password_hash").ilike("name", nomAdmin).limit(1).maybeSingle();
      const stocke = adm?.password_hash ?? "";
      const mdpOk = stocke.startsWith("$2") ? bcrypt.compareSync(mdpAdmin, stocke) : stocke !== "" && stocke === mdpAdmin;
      if (!adm || !mdpOk) return repondre(401, { error: "Identifiants de l'administrateur incorrects" });
      if (adm.role !== "admin") return repondre(403, { error: "Ce compte n'est pas administrateur" });
      autorise = true;
    }
    const name = (body.superadmin?.name ?? "").trim();
    if (name.length < 2) return repondre(400, { error: "Nom du super-administrateur : 2 caractères minimum" });
    const password = (body.superadmin?.password ?? "").trim() || randomPassword();
    if (password.length < 6) return repondre(400, { error: "Mot de passe : 6 caractères minimum" });
    const { data: pris } = await db.from("profiles").select("id").ilike("name", name).limit(1);
    if (pris && pris.length) return repondre(409, { error: `Le nom « ${name} » est déjà utilisé` });
    const { error: errSuper } = await db
      .from("profiles")
      .insert({ name, role: "admin", est_superadmin: true, password_hash: bcrypt.hashSync(password, 10) });
    if (errSuper) return repondre(500, { error: errSuper.message });
    return repondre(200, { comptes: [{ name, password, superadmin: true }] });
  }

  if (body.action !== "installer") return repondre(400, { error: "Action inconnue" });

  if (installe) return repondre(409, { error: "Cette base est déjà installée : créez les comptes depuis la page Utilisateurs." });
  if (installToken && body.token !== installToken) return repondre(401, { error: "Code d'installation incorrect" });

  const nomEntreprise = (body.entreprise?.nom ?? "").trim();
  if (!nomEntreprise) return repondre(400, { error: "Nom de l'entreprise obligatoire" });

  // comptes à créer : super-administrateur (facultatif) + administrateurs de l'entreprise
  const aCreer: { name: string; password: string; role: "admin"; est_superadmin: boolean }[] = [];
  const ajouter = (c: Compte | null | undefined, superadmin: boolean) => {
    const name = (c?.name ?? "").trim();
    if (!name) return null;
    if (name.length < 2) return `Nom trop court : « ${name} »`;
    const password = (c?.password ?? "").trim() || randomPassword();
    if (password.length < 6) return `Mot de passe de « ${name} » : 6 caractères minimum`;
    if (aCreer.some((x) => x.name.toLowerCase() === name.toLowerCase())) return `Nom en double : « ${name} »`;
    aCreer.push({ name, password, role: "admin", est_superadmin: superadmin });
    return null;
  };
  const erreurSuper = ajouter(body.superadmin, true);
  if (erreurSuper) return repondre(400, { error: erreurSuper });
  for (const a of body.admins ?? []) {
    const e = ajouter(a, false);
    if (e) return repondre(400, { error: e });
  }
  if (!aCreer.some((c) => !c.est_superadmin)) return repondre(400, { error: "Ajoutez au moins un administrateur de l'entreprise" });

  // nom déjà pris (comptes existants d'un autre rôle) : la connexion cherche le nom sans tenir compte des majuscules
  for (const c of aCreer) {
    const { data } = await db.from("profiles").select("id").ilike("name", c.name).limit(1);
    if (data && data.length) return repondre(409, { error: `Le nom « ${c.name} » est déjà utilisé` });
  }

  const { error: errInsert } = await db.from("profiles").insert(
    aCreer.map((c) => ({ name: c.name, role: c.role, est_superadmin: c.est_superadmin, password_hash: bcrypt.hashSync(c.password, 10) })),
  );
  if (errInsert) return repondre(500, { error: errInsert.message });

  // nom de l'entreprise dans la marque (app_settings « marque ») ; le reste se règle dans Personnalisation
  let avertissement: string | undefined;
  try {
    const { data: ligne } = await db.from("app_settings").select("value").eq("key", "marque").maybeSingle();
    let marque: Record<string, unknown> = {};
    const brut = ligne?.value;
    if (typeof brut === "string") marque = JSON.parse(brut);
    else if (brut && typeof brut === "object") marque = brut as Record<string, unknown>;
    marque.nom = nomEntreprise;
    const nomComplet = (body.entreprise?.nomComplet ?? "").trim();
    if (nomComplet) marque.nomComplet = nomComplet;
    const { error } = await db.from("app_settings").upsert({ key: "marque", value: JSON.stringify(marque) }, { onConflict: "key" });
    if (error) avertissement = `Comptes créés, mais nom de l'entreprise non enregistré : ${error.message}`;
  } catch (e) {
    avertissement = `Comptes créés, mais nom de l'entreprise non enregistré : ${e instanceof Error ? e.message : String(e)}`;
  }

  return repondre(200, {
    comptes: aCreer.map((c) => ({ name: c.name, password: c.password, superadmin: c.est_superadmin })),
    avertissement,
  });
});
