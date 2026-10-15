// Revue de deal : grille de qualification en six questions, score de santé et
// libellés partagés par l'écran de revue, la liste des affaires et le Kanban.
// Le score est le nombre de réponses « solides » sur six ; il ne remplace pas
// la probabilité du devis, il la confronte.

export const REVUE_QUESTIONS = [
  { key: 'douleur',         label: 'Douleur',         hint: 'Quel problème concret le client veut-il résoudre ? Que lui coûte-t-il aujourd\'hui ?' },
  { key: 'decideur',        label: 'Décideur',        hint: 'Qui signe ? L\'avons-nous rencontré ?' },
  { key: 'budget',          label: 'Budget',          hint: 'Un budget est-il validé, ou au moins un ordre de grandeur accepté ?' },
  { key: 'echeance',        label: 'Échéance',        hint: 'Quel événement impose une date côté client ?' },
  { key: 'concurrence',     label: 'Concurrence',     hint: 'Qui d\'autre est consulté ? Le statu quo compte aussi.' },
  { key: 'prochaine_etape', label: 'Prochaine étape', hint: 'Qu\'est-ce qui est daté et engagé des deux côtés ?' },
];

export const REVUE_ETATS = [
  { key: 'solide',  symbol: '✓', label: 'Solide',  color: '#1d9e75', bg: '#e1f5ee', fg: '#085041' },
  { key: 'partiel', symbol: '~', label: 'Partiel', color: '#ef9f27', bg: '#faeeda', fg: '#633806' },
  { key: 'inconnu', symbol: '?', label: 'Inconnu', color: '#e24b4a', bg: '#fcebeb', fg: '#791f1f' },
];

export const etatInfo = (key) => REVUE_ETATS.find(e => e.key === key) || REVUE_ETATS[2];

export function emptyReponses() {
  const out = {};
  REVUE_QUESTIONS.forEach(q => { out[q.key] = { texte: '', etat: 'inconnu' }; });
  return out;
}

// Ne garde que les six clés connues, un état valide, un texte chaîne.
export function normalizeReponses(raw) {
  const out = {};
  REVUE_QUESTIONS.forEach(q => {
    const r = raw && typeof raw === 'object' && raw[q.key] && typeof raw[q.key] === 'object' ? raw[q.key] : {};
    const etat = REVUE_ETATS.some(e => e.key === r.etat) ? r.etat : 'inconnu';
    out[q.key] = { texte: typeof r.texte === 'string' ? r.texte : '', etat };
  });
  return out;
}

export function computeScore(reponses) {
  const r = normalizeReponses(reponses);
  return REVUE_QUESTIONS.reduce((n, q) => n + (r[q.key].etat === 'solide' ? 1 : 0), 0);
}

// Couleur d'un score : 4 à 6 sain, 2 à 3 fragile, 0 à 1 critique.
export function scoreTone(score) {
  const s = Number(score) || 0;
  if (s >= 4) return { label: 'sain',     color: '#1d9e75', bg: '#e1f5ee', fg: '#085041' };
  if (s >= 2) return { label: 'fragile',  color: '#ef9f27', bg: '#faeeda', fg: '#633806' };
  return        { label: 'critique', color: '#e24b4a', bg: '#fcebeb', fg: '#791f1f' };
}

export function daysSince(date, now = new Date()) {
  if (!date) return null;
  // Une date civile « AAAA-MM-JJ » est lue telle quelle (pas de décalage de fuseau).
  const m = typeof date === 'string' ? date.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / 86400000);
}

export function ageLabel(days) {
  if (days == null) return '';
  if (days <= 0) return 'aujourd\'hui';
  if (days === 1) return 'hier';
  if (days < 60) return `il y a ${days} jours`;
  return `il y a ${Math.round(days / 30)} mois`;
}

// Délai au-delà duquel une revue est considérée comme trop ancienne, et âge d'une
// affaire sans devis à partir duquel on réclame une première revue.
export const REVUE_DELAI_JOURS = 30;
export const AFFAIRE_AGE_SANS_REVUE_JOURS = 14;

// Urgence de la revue d'une affaire : pilote le bouton « Revue de deal » de la liste.
//   level 'urgent' : jamais revue alors que le deal a un devis ou dure depuis plus de
//                    14 jours, ou dernière revue vieille de plus de 30 jours → rouge
//   level 'ok'     : revue récente → vert, avec le score
//   level 'none'   : affaire toute neuve sans devis ni revue → neutre
export function revueUrgence({ score, date, nbDevis, createdAt } = {}, now = new Date()) {
  const RED = { color: '#c62828', bg: '#c62828', fg: '#ffffff' };
  const GREEN = { color: '#1d9e75', bg: '#e1f5ee', fg: '#085041' };
  const GREY = { color: '#8a95a5', bg: '#ffffff', fg: '#5b6775' };
  if (!date) {
    const age = daysSince(createdAt, now);
    const urgent = Number(nbDevis) > 0 || (age != null && age > AFFAIRE_AGE_SANS_REVUE_JOURS);
    if (urgent) return { level: 'urgent', ...RED, label: 'À revoir · jamais revue', title: 'Ce deal n\'a jamais été revu : six questions, dix minutes' };
    return { level: 'none', ...GREY, label: 'Revue de deal', title: 'Faire une première revue de ce deal' };
  }
  const days = daysSince(date, now);
  const s = Number(score) || 0;
  if (days != null && days > REVUE_DELAI_JOURS) {
    return { level: 'urgent', ...RED, days, label: `À revoir · ${ageLabel(days)}`, title: `Dernière revue ${ageLabel(days)} (${s}/6) : à refaire` };
  }
  return { level: 'ok', ...GREEN, days, label: `Santé ${s}/6 · ${ageLabel(days)}`, title: `Revue ${ageLabel(days)} · ${s} réponse(s) solide(s) sur 6 · ${scoreTone(s).label}` };
}

// Pastille de santé d'une affaire pour les listes. Retourne null quand il n'y a
// rien à dire (affaire sans devis et jamais revue).
//   score : score de la dernière revue ; date : sa date ; nbDevis : devis de l'affaire.
export function santeDeal({ score, date, nbDevis } = {}, now = new Date()) {
  if (!date) {
    if (!(Number(nbDevis) > 0)) return null;
    return { label: 'Jamais revue', color: '#e24b4a', bg: '#fcebeb', fg: '#791f1f', title: 'Cette affaire a un devis mais n\'a jamais été revue', days: null, stale: true };
  }
  const days = daysSince(date, now);
  const tone = scoreTone(score);
  return {
    color: tone.color, bg: tone.bg, fg: tone.fg, tone: tone.label,
    label: `Santé ${Number(score) || 0}/6`,
    days,
    stale: days != null && days > 30,
    title: `Revue ${ageLabel(days)} · ${Number(score) || 0} réponse(s) solide(s) sur 6 · ${tone.label}`,
  };
}
