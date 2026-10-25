export type Role = 'admin' | 'superviseur' | 'chef' | 'rh' | 'consultation' | 'directeur';
export type SituationStatus = 'pending' | 'in_progress' | 'ok' | 'non_ok' | 'urgent';
export type SituationType = 'CPL' | 'DRG' | 'TRL' | 'CST' | 'ANS' | 'CLS' | 'CMI' | 'RLR';
// Nature d'une situation : installation (mise en service) ou dérangement (SAV / panne)
export type SituationNature = 'installation' | 'derangement';
// Conformité délai calculée à l'import (comme la colonne "ConformitéDélais" du fichier GSS)
export type ConformiteDelai = 'TLID' | 'HorsDelais';
// Ville de rattachement d'une équipe (utilisée pour les rapports par ville)
export type Ville = 'Nouakchott' | 'Kaédi' | 'Rosso' | 'Nouadhibou';

export interface User {
  id: string;
  name: string;
  role: Role;
  teamId: string | null;
  teamName: string | null;
  avatar: string;
  color: string;
  // Restreint STRICTEMENT cet utilisateur à une seule ville (ex: superviseur
  // régional) — non défini = pas de restriction géographique.
  villeScope?: Ville;
}

export interface Equipe {
  id: string;
  name: string;
  leader: string;
  zones: string[];
  color: string;
  elements?: string[];
  ville?: Ville;
}

export interface Situation {
  id: string;
  fgp: string;
  type: SituationType;
  zone: string;
  equipe: string;
  motif: string;
  dateDepo: string;
  dateClt: string;
  dateMessage?: string; // date du message initial (fichiers "installation" : DETE MESSAGE)
  serviceDestination?: string; // ex: GSS — colonne "Service Destination" du fichier
  delai: number;
  status: SituationStatus;
  comment: string;
  updatedAt?: string;
  isUrgent?: boolean;
  nature?: SituationNature;
  conformite?: ConformiteDelai;
  importId?: string; // relie la situation à sa ligne d'historique d'import (suppression en cascade)
  poteau?: number; // nombre de poteaux posés pour cette intervention (colonne POTEAU du fichier)
  rxDbm?: number; // Rx (dBm) confirmé à la clôture OK
  rangingM?: number; // Ranging (m) confirmé à la clôture OK
  scanStatut?: 'SCANNE' | 'NON SCANE'; // statut réseau confirmé à la clôture OK
  closedBy?: string; // nom de la personne ayant clôturé (marqué OK) la situation
}

export interface Notification {
  id: number;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'nok' | 'ok' | 'urgent' | 'import' | 'assign';
}

export interface ImportRecord {
  id: string;
  fileName: string;
  date: string;
  count: number;
  by: string;
}

// ─── EMPLOYÉS (module admin, indépendant des équipes techniques) ─────────────
export type LeaveType = 'annuel' | 'maladie' | 'sans_solde' | 'exceptionnel' | 'maternite' | 'autre';

export interface Employee {
  id: string;
  mle: string; // matricule
  name: string;
  poste?: string; // fonction : technicien, chef d'équipe, superviseur, coordinateur...
  banque?: string;
  rib?: string;
  montant?: number; // salaire net (MRU)
  telephone?: string;
  nni?: string; // Numéro National d'Identification
  ville?: string; // NKTT, NDB, KEADI, ROSSO...
  equipeNom?: string; // équipe RH d'appartenance (ex: ARAFAT, CENTRE VILLE, TVZ, Déploiement...)
  dateEmbauche?: string;
  actif: boolean;
  createdAt?: string;
}

export interface Loan {
  id: string;
  employeeId: string;
  montantTotal: number;
  mensualite: number;
  dateDebut: string;
  dureeMois?: number;
  reste: number;
  banqueCaisse?: string;
  statut: 'actif' | 'solde';
  createdAt?: string;
}

export interface Chantier {
  id: string;
  nom: string;
  zone?: string; // code zone ex: CA3Z05, CI1Z01
  ville?: string;
  equipeNom?: string;
  typeDeploiement: 'aerien' | 'souterrain';
  statut: 'en_cours' | 'termine' | 'suspendu';
  dateDebut?: string;
  dateFinPrevue?: string;

  // ── Aérien uniquement ──
  poteauxPrevus: number;
  poteauxPoses: number;

  // ── Souterrain uniquement ──
  tranchéePrevueM: number;
  tranchéePoseeM: number;
  blocagePrevu: number;
  blocageFait: number;
  ouverturePrevue: number;
  ouvertureFaite: number;
  closerMpoPrevu: number;
  closerMpoFait: number;
  closerDisPrevu: number;
  closerDisFait: number;

  // ── Commun aux deux modes ──
  xBoxPrevus: number;
  xBoxPoses: number;
  hubBoxPrevus: number;
  hubBoxPoses: number;
  subBoxPrevus: number;
  subBoxPoses: number;
  endBoxPrevus: number;
  endBoxPoses: number;
  cableMpoPrevuM: number;
  cableMpoPoseM: number;
  cableDistributionPrevuM: number;
  cableDistributionPoseM: number;

  notes?: string;
  createdAt?: string;
}

export interface LeaveRecord {
  id: string;
  employeeId: string;
  type: LeaveType;
  dateDebut: string;
  dateFin: string;
  jours: number;
  motif?: string;
  createdBy?: string;
  createdAt?: string;
}

// ─── VÉHICULES (module admin) ─────────────────────────────────────────────────
export type VehicleStatut = 'active' | 'reserve' | 'maintenance';

export interface Vehicle {
  id: string;
  type: string; // modèle : L200, GANGO, EXPRESS, NISSAN...
  immatriculation: string;
  statut: VehicleStatut;
  statutDepuis?: string; // date ISO depuis laquelle le statut actuel est actif (calcul des jours au garage)
  equipeNom?: string; // équipe RH assignée
  chauffeurId?: string; // employee id
  notes?: string;
  createdAt?: string;
}

// ─── MATÉRIEL / OUTILLAGE DES ÉQUIPES (module admin) ──────────────────────────
export type EtatMateriel = 'neuf' | 'bon' | 'a_reparer' | 'hors_service';

export interface Materiel {
  id: string;
  code?: string; // code interne (inventaire) — permet de partager/affecter précisément à une équipe
  nom: string; // ex: Marteau, Pince, Cliveuse fibre optique, Source Laser, Grimpette, Power Meter, Tournevis...
  equipeNom?: string; // équipe RH assignée (vide = stock central)
  quantite: number;
  etat: EtatMateriel;
  notes?: string;
  createdAt?: string;
}

// ─── SCANS RÉSEAU (ONU/OLT — contrôle des équipements fibre, module admin) ────
export type ScanResult = 'SCANNE' | 'NON SCANE';

export interface ScanRecord {
  id: string;
  zone: string;
  stt?: string;
  result: ScanResult;
  scanTime?: string; // date ISO du dernier scan (vide si jamais scanné)
  portId?: number;
  onuId?: number;
  onuName?: string;
  softwareVersion?: string;
  snMac?: string;
  timeAddedToNms?: string; // date d'ajout au NMS
  rxPower?: number | null; // Rx Optical Power (dBm) — signal reçu
  ranging?: number | null; // distance (m)
  remarque?: string; // Suspendu, Résilié...
  changeType?: 'new' | 'existing'; // par rapport à l'import précédent (calculé et persisté à l'import)
  importedAt?: string;
  importId?: string; // rattache cette ligne à son import (scan_import_history.id)
}

export type TypeNoeudReseau = 'olt' | 'closure_mpo' | 'x_box' | 'closure_dis' | 'hub_box' | 'sp' | 'sub_box' | 'end_box';

export interface NoeudReseau {
  id: string;
  zone: string;
  type: TypeNoeudReseau;
  nom: string;
  sn?: string;
  parentId?: string | null;
  parentPort?: number; // port du parent auquel ce nœud est raccordé (pour le tableau "Port Connection Details")
  cableSn?: string;
  cableLongueurM?: number; // longueur de câble posé (bobine, arrondie)
  cableDistanceReelleM?: number; // distance réelle mesurée (avant arrondi à la bobine)
  nbPorts: number;
  portsOccupes: number;
  coordonnees?: string;
  puissanceOptiqueDbm?: number;
  notes?: string;
  createdAt?: string;
}
// ─── CAISSES (dépenses terrain, alimentations Bankily, validation comptable) ──
export type CaisseOpType = 'depense' | 'alimentation';
export type CaisseOpStatut = 'en_attente' | 'validee' | 'rejetee' | 'annulee';
export type CaisseCategorie =
  | 'carburant'
  | 'main_oeuvre'
  | 'materiel'
  | 'transport'
  | 'vehicule'
  | 'location'
  | 'communication'
  | 'projet'
  | 'autre'
  | 'alimentation';

export interface Caisse {
  id: string;
  nom: string;
  titulaireId: string | null;
  telephone: string;
  seuilAlerte: number;
  actif: boolean;
}

export interface CaisseOperation {
  id: string;
  caisseId: string;
  type: CaisseOpType;
  montant: number; // MRU
  date: string; // YYYY-MM-DD
  libelle: string;
  categorie: CaisseCategorie;
  chantier: string;
  trsId: string | null;
  statut: CaisseOpStatut;
  demandeParId: string | null;
  demandeParNom: string | null;
  traiteParNom: string | null;
  traiteLe: string | null;
  motifRejet: string | null;
  note: string;
  source: string;
  createdAt: string;
}

export interface CaisseChargeFixe {
  id: string;
  caisseId: string;
  libelle: string;
  montant: number; // MRU
  categorie: CaisseCategorie;
  chantier?: string;
  frequence: 'hebdo' | 'mensuel';
  jourSemaine?: number | null; // 1 = Lundi, 4 = Jeudi
  jourMois?: number | null; // 1 = 1er du mois
  actif: boolean;
  dernierDeclenchement?: string | null; // YYYY-MM-DD
  createdAt?: string;
}

// Notification persistée en base (une ligne par destinataire), reçue en temps réel
export interface AppNotification {
  id: string;
  titre: string;
  message: string;
  type: 'demande_depense' | 'demande_alimentation' | 'validee' | 'rejetee' | 'alimentation' | 'programme' | 'programme_non_fait' | 'info';
  module: string;
  refId: string | null;
  lu: boolean;
  createdAt: string;
}

// ─── PROGRAMME PAR FICHES OT (PDF Mauritel dérangements / installations) ─────
export type OtStatut = 'a_faire' | 'fait' | 'non_fait';

export interface ProgrammeOT {
  id: string;
  numeroOt: string;
  nature: 'derangement' | 'installation';
  sousType: string;
  typeOt: string; // CPL, CLS, TRL, RLR, CST, ANS, DRG
  typeLigne: 'FGP' | 'TPH';
  dateRecu: string | null;
  dateProgramme: string; // YYYY-MM-DD
  fgp: string;
  clientCode: string;
  clientNom: string;
  clientInfo: string;
  telephones: string[];
  adresse: string;
  zone: string;
  pco: string;
  port: string;
  dis: string;
  ancienDis: string;
  ontSerials: string[];
  defaut: string;
  abonnement: string;
  cableFibreM: number | null; // installation : câble fibre prévu (m)
  miseEnService: string;
  equipe: string;
  statut: OtStatut;
  motif: string; // motif choisi à la clôture (liste « fait » ou « non fait »)
  commentaire: string;
  decharge: boolean | null; // décharge signée (fait)
  scanne: boolean | null; // ONT scanné (fait)
  cstChange: boolean; // fait avec changement de constitution
  nouveauDis: string;
  nouvelOnt: string;
  poteaux: number; // poteaux comptés dans les statistiques
  assigneLe: string | null; // YYYY-MM-DD / date d'affectation à l'équipe
  traiteParNom: string | null;
  traiteLe: string | null;
  distribueParNom: string | null;
  sourceFichier: string;
  createdAt: string;
}
