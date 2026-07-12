export type Role = 'admin' | 'superviseur' | 'chef';
export type SituationStatus = 'pending' | 'in_progress' | 'ok' | 'non_ok' | 'urgent';
export type SituationType = 'CPL' | 'DRG' | 'TRL' | 'CST' | 'ANS' | 'CLS' | 'CMI' | 'RLR';

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
