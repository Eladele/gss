export type Role = 'admin' | 'superviseur' | 'chef';
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
  delai: number;
  status: SituationStatus;
  comment: string;
  updatedAt?: string;
  isUrgent?: boolean;
  nature?: SituationNature;
  conformite?: ConformiteDelai;
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
  mle: string;          // matricule
  name: string;
  poste?: string;        // fonction : technicien, chef d'équipe, superviseur, coordinateur...
  banque?: string;
  rib?: string;
  montant?: number;      // salaire net (MRU)
  telephone?: string;
  nni?: string;           // Numéro National d'Identification
  ville?: string;         // NKTT, NDB, KEADI, ROSSO...
  equipeNom?: string;     // équipe RH d'appartenance (ex: ARAFAT, CENTRE VILLE, TVZ, Déploiement...)
  dateEmbauche?: string;
  actif: boolean;
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
  type: string;             // modèle : L200, GANGO, EXPRESS, NISSAN...
  immatriculation: string;
  statut: VehicleStatut;
  statutDepuis?: string;      // date ISO depuis laquelle le statut actuel est actif (calcul des jours au garage)
  equipeNom?: string;        // équipe RH assignée
  chauffeurId?: string;      // employee id
  notes?: string;
  createdAt?: string;
}

// ─── MATÉRIEL / OUTILLAGE DES ÉQUIPES (module admin) ──────────────────────────
export type EtatMateriel = 'neuf' | 'bon' | 'a_reparer' | 'hors_service';

export interface Materiel {
  id: string;
  nom: string;             // ex: Marteau, Pince, Cliveuse fibre optique, Source Laser, Grimpette, Power Meter, Tournevis...
  equipeNom?: string;       // équipe RH assignée (vide = stock central)
  quantite: number;
  etat: EtatMateriel;
  notes?: string;
  createdAt?: string;
}
