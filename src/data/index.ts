import type { Equipe, Situation, Notification, User } from '@/types';

export const EQUIPES: Equipe[] = [
  { id: 'e1', name: 'THIAM',  leader: 'Cheikh Thiam',    zones: ['CA1Z02','CA1Z04','CA3Z05','CA3Z13','CA3Z16'],                          color: '#1565C0' },
  { id: 'e2', name: 'hamadi', leader: 'Mohamed Lemine',  zones: ['CI1Z01','CP1Z01','CA1Z02','CA1Z04','TZ3Z04','SP1Z01','KT1Z07','CV2Z03'], color: '#2E7D32' },
  { id: 'e3', name: 'DJIBY',  leader: 'Djiby Diallo',    zones: ['CV2Z03','CV2Z04','KT1Z07','SP1Z01','SP1Z02','SP1Z03','TZ3Z04','TZ3Z02','CP1Z01','CI1Z01'], color: '#6A1B9A' },
  { id: 'e4', name: 'med',    leader: 'Med Sidi',        zones: ['TZ3Z04','TZ3Z02','KT1Z07','SP1Z01','SP1Z03','CV2Z03'],                  color: '#E65100' },
  { id: 'e5', name: 'sidi',   leader: 'Sidi Ahmed',      zones: ['CA3Z13','CA3Z16','CA1Z02','CA1Z04','CA3Z05','KT1Z07','CI1Z01'],         color: '#00838F' },
];

export const ZONE_EQUIPE_MAP: Record<string, string> = {};
EQUIPES.forEach(e => e.zones.forEach(z => { if (!ZONE_EQUIPE_MAP[z]) ZONE_EQUIPE_MAP[z] = e.name; }));

export const DEMO_USERS: Record<string, User> = {
  superviseur: { id: 'u1', name: 'THIAM',          role: 'superviseur', teamId: null,  teamName: null,     avatar: 'T', color: '#1565C0' },
  chef:        { id: 'u2', name: 'Mohamed Lemine', role: 'chef',        teamId: 'e2',  teamName: 'hamadi', avatar: 'M', color: '#2E7D32' },
  admin:       { id: 'u3', name: 'Directeur GSS',  role: 'admin',       teamId: null,  teamName: null,     avatar: 'D', color: '#6A1B9A' },
};

export const SAMPLE_SITUATIONS: Situation[] = [
  { id:'s1',  fgp:'67995',    type:'CPL', zone:'SP1Z01', equipe:'hamadi', motif:'oK',             dateDepo:'2025-12-31', dateClt:'2026-01-02', delai:2, status:'ok',      comment:'' },
  { id:'s2',  fgp:'67701',    type:'CPL', zone:'KT1Z07', equipe:'hamadi', motif:'oK',             dateDepo:'2025-12-31', dateClt:'2026-01-02', delai:2, status:'ok',      comment:'' },
  { id:'s3',  fgp:'67977',    type:'CPL', zone:'CA1Z02', equipe:'THIAM',  motif:'oK',             dateDepo:'2025-12-31', dateClt:'2026-01-02', delai:2, status:'pending', comment:'' },
  { id:'s4',  fgp:'67828',    type:'CPL', zone:'CA3Z13', equipe:'THIAM',  motif:'oK',             dateDepo:'2025-12-30', dateClt:'2026-01-02', delai:3, status:'non_ok',  comment:'Client absent, porte verrouillée' },
  { id:'s5',  fgp:'68088',    type:'CPL', zone:'TZ3Z04', equipe:'DJIBY',  motif:'oK',             dateDepo:'2026-01-01', dateClt:'2026-01-02', delai:1, status:'pending', comment:'' },
  { id:'s6',  fgp:'68084',    type:'CPL', zone:'CI1Z01', equipe:'hamadi', motif:'oK',             dateDepo:'2026-01-01', dateClt:'2026-01-02', delai:1, status:'ok',      comment:'' },
  { id:'s7',  fgp:'29851',    type:'DRG', zone:'TZ3Z04', equipe:'DJIBY',  motif:'oK',             dateDepo:'2025-12-29', dateClt:'2026-01-02', delai:4, status:'pending', comment:'' },
  { id:'s8',  fgp:'67446',    type:'DRG', zone:'CA1Z04', equipe:'THIAM',  motif:'oK',             dateDepo:'2026-01-05', dateClt:'2026-01-05', delai:0, status:'pending', comment:'' },
  { id:'s9',  fgp:'63422',    type:'DRG', zone:'CA1Z04', equipe:'THIAM',  motif:'oK',             dateDepo:'2026-01-05', dateClt:'2026-01-05', delai:0, status:'ok',      comment:'' },
  { id:'s10', fgp:'63315',    type:'DRG', zone:'CA1Z02', equipe:'hamadi', motif:'oK',             dateDepo:'2026-01-05', dateClt:'2026-01-05', delai:0, status:'pending', comment:'' },
  { id:'s11', fgp:'62072',    type:'DRG', zone:'CV2Z03', equipe:'DJIBY',  motif:'oK',             dateDepo:'2026-01-05', dateClt:'2026-01-05', delai:0, status:'pending', comment:'' },
  { id:'s12', fgp:'441122',   type:'DRG', zone:'CA1Z02', equipe:'hamadi', motif:'Pas de signal fibre — client 46464646', dateDepo:'2026-01-05', dateClt:'2026-01-05', delai:0, status:'urgent', comment:'Pas de signal fibre', isUrgent:true },
  { id:'s13', fgp:'57047',    type:'TRL', zone:'CA1Z04', equipe:'THIAM',  motif:'INJOIGNABLE',    dateDepo:'2026-02-10', dateClt:'',           delai:0, status:'pending', comment:'' },
  { id:'s14', fgp:'45241649', type:'CST', zone:'CV2Z03', equipe:'DJIBY',  motif:'hebib',          dateDepo:'2025-12-26', dateClt:'2026-01-01', delai:6, status:'pending', comment:'' },
  { id:'s15', fgp:'11393',    type:'DRG', zone:'KT1Z07', equipe:'DJIBY',  motif:'oK',             dateDepo:'2026-01-05', dateClt:'2026-01-05', delai:0, status:'ok',      comment:'' },
  { id:'s16', fgp:'52411',    type:'DRG', zone:'SP1Z03', equipe:'DJIBY',  motif:'oK',             dateDepo:'2026-01-05', dateClt:'2026-01-05', delai:0, status:'pending', comment:'' },
  { id:'s17', fgp:'18025',    type:'DRG', zone:'CA1Z02', equipe:'hamadi', motif:'oK',             dateDepo:'2026-01-05', dateClt:'2026-01-05', delai:0, status:'pending', comment:'' },
  { id:'s18', fgp:'60023',    type:'DRG', zone:'CA3Z05', equipe:'THIAM',  motif:'oK',             dateDepo:'2026-01-05', dateClt:'2026-01-05', delai:0, status:'non_ok',  comment:'Câble sectionné, intervention technique requise' },
  { id:'s19', fgp:'55299',    type:'DRG', zone:'CA3Z05', equipe:'THIAM',  motif:'oK',             dateDepo:'2026-01-05', dateClt:'2026-01-05', delai:0, status:'pending', comment:'' },
  { id:'s20', fgp:'63313',    type:'DRG', zone:'CA3Z13', equipe:'THIAM',  motif:'oK',             dateDepo:'2026-01-01', dateClt:'2026-01-05', delai:4, status:'ok',      comment:'' },
  { id:'s21', fgp:'62468',    type:'DRG', zone:'CA1Z04', equipe:'THIAM',  motif:'oK',             dateDepo:'2026-01-01', dateClt:'2026-01-05', delai:4, status:'pending', comment:'' },
  { id:'s22', fgp:'12728',    type:'DRG', zone:'SP1Z03', equipe:'DJIBY',  motif:'oK',             dateDepo:'2026-01-05', dateClt:'2026-01-05', delai:0, status:'ok',      comment:'' },
  { id:'s23', fgp:'4028',     type:'DRG', zone:'CV2Z03', equipe:'hamadi', motif:'oK',             dateDepo:'2026-01-05', dateClt:'2026-01-05', delai:0, status:'non_ok',  comment:'Poteau cassé, impossible accès' },
  { id:'s24', fgp:'11498',    type:'DRG', zone:'TZ3Z04', equipe:'DJIBY',  motif:'oK',             dateDepo:'2026-01-05', dateClt:'2026-01-05', delai:0, status:'pending', comment:'' },
  { id:'s25', fgp:'15115',    type:'DRG', zone:'CP1Z01', equipe:'hamadi', motif:'oK',             dateDepo:'2026-01-05', dateClt:'2026-01-05', delai:0, status:'pending', comment:'' },
];

export const SAMPLE_NOTIFICATIONS: Notification[] = [
  { id:1, title:'NON OK détecté',  message:'FGP 60023 — CA3Z05 — Câble sectionné',            time:'Il y a 5 min',  read:false, type:'nok'    },
  { id:2, title:'NON OK détecté',  message:'FGP 67828 — CA3Z13 — Client absent',               time:'Il y a 1h',     read:false, type:'nok'    },
  { id:3, title:'Import réussi',   message:'20 situations importées depuis fichier Excel',      time:'Il y a 2h',     read:false, type:'import' },
  { id:4, title:'Urgence créée',   message:'FGP 441122 — CA1Z02 — Pas de signal fibre',        time:'Il y a 3h',     read:true,  type:'urgent' },
  { id:5, title:'OK confirmé',     message:'FGP 63422 — THIAM — CA1Z04',                       time:'Il y a 4h',     read:true,  type:'ok'     },
];
