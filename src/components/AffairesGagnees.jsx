import * as React from 'react';
import { I, ICONS, IconBtn, formatDecisionPeriode } from '../lib/shared.jsx';

// ── Onglet « Affaires gagnées » de la fiche société ──
// Une carte par affaire gagnée : synthèse (description, montants du devis retenu,
// commandé / facturé), proposition retenue + historique des devis (PDF), bons de
// commande et factures (référence recopiée, date, montant HT, nature, statut, PDF).
// Raccourcis : « Créer le BDC » depuis la proposition retenue, « Créer la facture »
// depuis un BDC (montant et lien pré-remplis).

const NATURES = ['Setup', 'Abonnement', 'Formation', 'Matériel', 'Autre'];
// Familles d'un bon de commande (cases à cocher) et leurs champs de montant HT.
const FAMILLES = [
  { key: 'licences', label: 'Licences', champs: [['setup', 'Setup'], ['lic_mensuelles', 'Licences mensuelles'], ['lic_annuelles', 'Licences annuelles'], ['prestations', 'Prestations'], ['formation', 'Formation']] },
  { key: 'developpement', label: 'Développement', champs: [['montant', 'Montant HT']] },
  { key: 'materiel', label: 'Matériel', champs: [['montant', 'Montant HT'], ['integration', 'Intégration']] },
];
const num = (v) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const detailTotal = (detail) => Object.values(detail || {}).reduce((s, fam) => s + Object.values(fam || {}).reduce((t, v) => t + num(v), 0), 0);
const BDC_STATUTS = ['Reçu', 'Signé'];
const FACTURE_STATUTS = ['Émise', 'Payée', 'Annulée'];
const fmtEur = (v) => { const n = Number(v); return (!v || isNaN(n)) ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'; };
const fmtDate = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
const today = () => new Date().toISOString().slice(0, 10);
const statutStyle = (s) => ({
  'Signé': { bg: 'var(--success-soft)', fg: 'var(--success)' }, 'Payée': { bg: 'var(--success-soft)', fg: 'var(--success)' },
  'Reçu': { bg: 'var(--primary-soft)', fg: 'var(--primary)' }, 'Émise': { bg: '#fdf3e3', fg: '#b06e2a' },
  'Annulée': { bg: 'var(--danger-soft)', fg: 'var(--danger)' }, 'Gagné': { bg: 'var(--success-soft)', fg: 'var(--success)' },
}[s] || { bg: 'var(--tw-bg)', fg: 'var(--tw-slate)' });
const Pill = ({ children, s }) => { const c = statutStyle(s || children); return <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', background: c.bg, color: c.fg, whiteSpace: 'nowrap' }}>{children}</span>; };
const lbl = { display: 'block', fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tw-slate)', marginBottom: '4px' };
const inp = { width: '100%', padding: '7px 10px', border: '1px solid var(--tw-border)', borderRadius: '6px', fontSize: '13px', fontFamily: "'Inter',sans-serif", boxSizing: 'border-box', background: 'white' };
const secTitle = { fontSize: '11px', fontWeight: 600, letterSpacing: '.4px', textTransform: 'uppercase', color: 'var(--tw-muted)', margin: '14px 0 6px' };

// ── Formulaire BDC / facture (création et édition) ──
function DocForm({ kind, initial, devisList, bdcList, onCancel, onSave }) {
  const isBdc = kind === 'bdc';
  const dateKey = isBdc ? 'date_bdc' : 'date_facture';
  // BDC : détail par famille (cases cochées). Un BDC ancien sans détail garde son montant global.
  const initDetail = () => {
    const d = initial?.detail && typeof initial.detail === 'object' ? initial.detail : null;
    const out = {};
    for (const fam of FAMILLES) if (d && d[fam.key]) out[fam.key] = Object.fromEntries(fam.champs.map(([c]) => [c, d[fam.key][c] != null && d[fam.key][c] !== 0 ? String(d[fam.key][c]) : '']));
    return out;
  };
  const [f, setF] = React.useState({
    reference: initial?.reference || '', [dateKey]: initial?.[dateKey] ? String(initial[dateKey]).slice(0, 10) : today(),
    montant_ht: initial?.montant_ht != null ? String(initial.montant_ht) : '', nature: initial?.nature || 'Setup',
    statut: initial?.statut || (isBdc ? 'Reçu' : 'Émise'), notes: initial?.notes || '',
    devis_id: initial?.devis_id || '', bdc_id: initial?.bdc_id || '',
  });
  const [detail, setDetail] = React.useState(initDetail);
  const [saving, setSaving] = React.useState(false);
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  const toggleFam = (key) => setDetail(d => { const n = { ...d }; if (n[key]) delete n[key]; else n[key] = Object.fromEntries(FAMILLES.find(x => x.key === key).champs.map(([c]) => [c, ''])); return n; });
  const setChamp = (fam, c) => (e) => setDetail(d => ({ ...d, [fam]: { ...d[fam], [c]: e.target.value } }));
  const famChecked = Object.keys(detail).length > 0;
  const total = isBdc && famChecked ? detailTotal(detail) : num(f.montant_ht);
  const submit = async () => {
    if (!f.reference.trim()) { window.showToast({ title: 'La référence est obligatoire', type: 'warning' }); return; }
    if (isBdc && !famChecked) { window.showToast({ title: 'Cochez au moins une famille : Licences, Développement ou Matériel', type: 'warning' }); return; }
    setSaving(true);
    try {
      const payload = { ...f, montant_ht: total };
      if (isBdc) payload.detail = Object.fromEntries(Object.entries(detail).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([c, x]) => [c, num(x)]))]));
      await onSave(payload);
    } finally { setSaving(false); }
  };
  const montantInput = (value, onChange, placeholder = '0') => <input type="text" inputMode="decimal" value={value} onChange={onChange} placeholder={placeholder} style={{ ...inp, textAlign: 'right' }} />;
  return (
    <div style={{ border: '1px solid var(--tw-border)', borderRadius: '10px', padding: '12px 14px', background: '#fafaf9', margin: '6px 0 10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isBdc ? '1.4fr 1fr 1fr' : '1.3fr 1fr 1fr 1fr 1fr', gap: '10px' }}>
        <div><label style={lbl}>Référence *</label><input value={f.reference} onChange={set('reference')} placeholder={isBdc ? 'BC-2026-0412' : 'F-2026-1187'} style={inp} autoFocus /></div>
        <div><label style={lbl}>Date</label><input type="date" value={f[dateKey]} onChange={set(dateKey)} style={inp} /></div>
        {!isBdc && <div><label style={lbl}>Montant HT</label>{montantInput(f.montant_ht, set('montant_ht'))}</div>}
        {!isBdc && <div><label style={lbl}>Nature</label><select value={f.nature} onChange={set('nature')} style={inp}>{NATURES.map(n => <option key={n}>{n}</option>)}</select></div>}
        <div><label style={lbl}>Statut</label><select value={f.statut} onChange={set('statut')} style={inp}>{(isBdc ? BDC_STATUTS : FACTURE_STATUTS).map(s => <option key={s}>{s}</option>)}</select></div>
      </div>
      {isBdc && (
        <div style={{ marginTop: '12px' }}>
          <label style={lbl}>Contenu du bon de commande (HT)</label>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {FAMILLES.map(fam => (
              <label key={fam.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: detail[fam.key] ? 'var(--tw-ink)' : 'var(--tw-slate)', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!detail[fam.key]} onChange={() => toggleFam(fam.key)} /> {fam.label}
              </label>
            ))}
          </div>
          {FAMILLES.filter(fam => detail[fam.key]).map(fam => (
            <div key={fam.key} style={{ border: '0.5px solid var(--tw-border)', borderRadius: '8px', padding: '8px 10px', background: 'white', marginBottom: '6px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tw-teal)', marginBottom: '6px' }}>{fam.label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(fam.champs.length, 5)}, minmax(0, 1fr))`, gap: '8px' }}>
                {fam.champs.map(([c, label]) => <div key={c}><label style={lbl}>{label}</label>{montantInput(detail[fam.key][c], setChamp(fam.key, c))}</div>)}
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'right', fontSize: '13px', color: 'var(--tw-ink)' }}>Total HT : <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtEur(total)}</strong>{!famChecked && num(f.montant_ht) ? <span style={{ color: 'var(--tw-muted)', fontSize: '11.5px' }}> (montant global, ancien BDC : cochez une famille pour détailler)</span> : null}</div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', marginTop: '10px' }}>
        <div>
          <label style={lbl}>{isBdc ? 'Proposition liée' : 'Bon de commande lié'}</label>
          {isBdc ? (
            <select value={f.devis_id} onChange={set('devis_id')} style={inp}>
              <option value="">— Aucune —</option>
              {(devisList || []).map(d => <option key={d.id} value={d.id}>{d.devis_name || ('Devis #' + d.id)}</option>)}
            </select>
          ) : (
            <select value={f.bdc_id} onChange={set('bdc_id')} style={inp}>
              <option value="">— Aucun —</option>
              {(bdcList || []).map(b => <option key={b.id} value={b.id}>{b.reference} · {fmtEur(b.montant_ht)}</option>)}
            </select>
          )}
        </div>
        <div><label style={lbl}>Notes</label><input value={f.notes} onChange={set('notes')} placeholder="Optionnel" style={inp} /></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
        <button onClick={onCancel} disabled={saving} style={{ padding: '7px 14px', border: '1px solid var(--tw-border)', borderRadius: '7px', background: 'white', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>Annuler</button>
        <button onClick={submit} disabled={saving} style={{ padding: '7px 14px', border: 'none', borderRadius: '7px', background: 'var(--tw-teal)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter',sans-serif", opacity: saving ? .6 : 1 }}>{saving ? 'Enregistrement…' : (initial?.id ? 'Enregistrer' : (isBdc ? 'Créer le bon de commande' : 'Créer la facture'))}</button>
      </div>
    </div>
  );
}

// ── Une affaire gagnée ──
function AffaireGagneeCard({ affaire, devisList, user, API_URL, onReopen }) {
  const hdrs = { 'Authorization': `Bearer ${user.token}` };
  const jhdrs = { ...hdrs, 'Content-Type': 'application/json' };
  const [open, setOpen] = React.useState(false);
  const [bdcs, setBdcs] = React.useState(null);
  const [factures, setFactures] = React.useState(null);
  const [showAllDevis, setShowAllDevis] = React.useState(false);
  const [form, setForm] = React.useState(null); // { kind:'bdc'|'facture', initial }
  const toast = (title, type = 'success') => window.showToast && window.showToast({ title, type });

  const devisAff = (devisList || []).filter(d => d.affaire_id === affaire.id)
    .sort((a, b) => new Date(b.quote_date || b.created_at || 0) - new Date(a.quote_date || a.created_at || 0));
  const retenu = devisAff.find(d => d.devis_status === 'Gagné') || devisAff[0] || null;
  const autres = devisAff.filter(d => d !== retenu);

  const load = React.useCallback(async () => {
    try {
      const [rb, rf] = await Promise.all([
        fetch(`${API_URL}/affaires/${affaire.id}/bons-commande`, { headers: hdrs }),
        fetch(`${API_URL}/affaires/${affaire.id}/factures`, { headers: hdrs }),
      ]);
      setBdcs(rb.ok ? await rb.json() : []);
      setFactures(rf.ok ? await rf.json() : []);
    } catch { setBdcs([]); setFactures([]); }
  }, [affaire.id, user.token]);
  React.useEffect(() => { if (open && bdcs === null) load(); }, [open, bdcs, load]);

  const commande = (bdcs || []).filter(b => b.statut !== 'Annulé').reduce((s, b) => s + Number(b.montant_ht || 0), 0);
  const facture = (factures || []).filter(f => f.statut !== 'Annulée').reduce((s, f) => s + Number(f.montant_ht || 0), 0);

  const save = async (kind, initial, data) => {
    const isBdc = kind === 'bdc';
    const path = isBdc ? 'bons-commande' : 'factures';
    const body = isBdc
      ? { reference: data.reference, date_bdc: data.date_bdc, montant_ht: data.montant_ht, nature: data.nature, statut: data.statut, notes: data.notes, devis_id: data.devis_id || null, detail: data.detail || null }
      : { reference: data.reference, date_facture: data.date_facture, montant_ht: data.montant_ht, nature: data.nature, statut: data.statut, notes: data.notes, bdc_id: data.bdc_id || null };
    const url = initial?.id ? `${API_URL}/${path}/${initial.id}` : `${API_URL}/affaires/${affaire.id}/${path}`;
    const r = await fetch(url, { method: initial?.id ? 'PUT' : 'POST', headers: jhdrs, body: JSON.stringify(body) });
    if (!r.ok) { const e = await r.json().catch(() => ({})); toast('Erreur : ' + (e.error || r.status), 'error'); return; }
    toast(initial?.id ? 'Enregistré' : (isBdc ? 'Bon de commande ajouté' : 'Facture ajoutée'));
    setForm(null); await load();
  };
  const remove = async (kind, doc) => {
    const isBdc = kind === 'bdc';
    if (!window.confirm(`Supprimer ${isBdc ? 'le bon de commande' : 'la facture'} ${doc.reference} ?${doc.pdf_url ? '\n\nSon PDF sera supprimé.' : ''}`)) return;
    const r = await fetch(`${API_URL}/${isBdc ? 'bons-commande' : 'factures'}/${doc.id}`, { method: 'DELETE', headers: hdrs });
    if (!r.ok) { toast('Suppression impossible', 'error'); return; }
    await load();
  };
  const uploadPdf = async (kind, doc, file) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) { toast('Le fichier doit être un PDF', 'warning'); return; }
    if (doc.pdf_url && !window.confirm(`Remplacer le PDF de ${doc.reference} par « ${file.name} » ?`)) return;
    const fd = new FormData(); fd.append('pdf', file);
    const r = await fetch(`${API_URL}/${kind === 'bdc' ? 'bons-commande' : 'factures'}/${doc.id}/upload-pdf`, { method: 'POST', headers: hdrs, body: fd });
    if (!r.ok) { const e = await r.json().catch(() => ({})); toast('Erreur : ' + (e.error || r.status), 'error'); return; }
    toast(doc.pdf_url ? 'PDF remplacé' : 'PDF joint'); await load();
  };
  const openPdf = async (url) => {
    try {
      const r = await fetch(url, { headers: hdrs });
      if (!r.ok) { const e = await r.json().catch(() => ({})); toast(e.error || 'PDF indisponible', 'warning'); return; }
      window.open(window.URL.createObjectURL(await r.blob()), '_blank');
    } catch (err) { toast('Erreur : ' + err.message, 'error'); }
  };

  const docRow = (kind, doc) => {
    const isBdc = kind === 'bdc';
    const path = isBdc ? 'bons-commande' : 'factures';
    const linked = isBdc
      ? (doc.devis_id ? (devisList || []).find(d => d.id === doc.devis_id)?.devis_name : null)
      : (doc.bdc_id ? (bdcs || []).find(b => b.id === doc.bdc_id)?.reference : null);
    const inputId = `pdf-${path}-${doc.id}`;
    return (
      <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', border: '0.5px solid var(--tw-border)', borderRadius: '8px', marginBottom: '6px', background: 'white' }}>
        <span style={{ color: 'var(--tw-slate)', display: 'inline-flex' }}>{I(isBdc ? ICONS.clipboard : ICONS.receipt, 14)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '13px', fontWeight: 600, color: 'var(--tw-ink)' }}>{doc.reference} <Pill>{doc.statut}</Pill></div>
          <div style={{ fontSize: '12px', color: 'var(--tw-muted)', marginTop: '2px' }}>
            {fmtDate(isBdc ? doc.date_bdc : doc.date_facture)} · {fmtEur(doc.montant_ht)} HT{isBdc ? '' : ` · ${doc.nature}`}{linked ? ` · ${isBdc ? 'proposition' : 'BDC'} ${linked}` : ''}{doc.notes ? ` · ${doc.notes}` : ''}
          </div>
          {isBdc && doc.detail && typeof doc.detail === 'object' && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '5px' }}>
              {FAMILLES.filter(fam => doc.detail[fam.key]).map(fam => (
                <span key={fam.key} title={fam.champs.map(([c, l]) => `${l} : ${fmtEur(doc.detail[fam.key][c])}`).join(' · ')}
                  style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: 'var(--tw-bg)', border: '0.5px solid var(--tw-border)', color: 'var(--tw-slate)' }}>
                  {fam.label} · {fmtEur(detailTotal({ [fam.key]: doc.detail[fam.key] }))}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <input type="file" accept="application/pdf,.pdf" id={inputId} style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; await uploadPdf(kind, doc, f); e.target.value = ''; }} />
          {doc.pdf_url && <IconBtn title="Voir le PDF" color="var(--tw-teal)" hoverColor="var(--tw-teal)" hoverBg="var(--tw-teal-light)" onClick={() => openPdf(`${API_URL}/${path}/${doc.id}/download-pdf`)}>{I(ICONS.download, 13)}</IconBtn>}
          <IconBtn title={doc.pdf_url ? 'Remplacer le PDF' : 'Joindre un PDF'} onClick={() => document.getElementById(inputId).click()}>{I(doc.pdf_url ? ICONS.replacePdf : ICONS.attach, 13)}</IconBtn>
          {isBdc && <IconBtn title="Créer la facture de ce bon de commande" onClick={() => setForm({ kind: 'facture', initial: { reference: '', date_facture: today(), montant_ht: doc.montant_ht, nature: doc.nature, statut: 'Émise', bdc_id: doc.id } })}>{I(ICONS.receipt, 13)}</IconBtn>}
          <IconBtn title="Modifier" onClick={() => setForm({ kind, initial: doc })}>{I(ICONS.edit, 13)}</IconBtn>
          <IconBtn title="Supprimer" danger onClick={() => remove(kind, doc)}>{I(ICONS.trash, 13)}</IconBtn>
        </div>
      </div>
    );
  };

  const devisRow = (d, main) => (
    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', border: main ? '1px solid var(--tw-teal)' : '0.5px solid var(--tw-border)', borderRadius: '8px', marginBottom: '6px', background: 'white', opacity: main ? 1 : .85 }}>
      <span style={{ color: main ? 'var(--tw-teal)' : 'var(--tw-slate)', display: 'inline-flex' }}>{I(ICONS.doc, 14)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '13px', fontWeight: 600, color: 'var(--tw-ink)', fontFamily: 'var(--mono)' }}>{d.devis_name || ('Devis #' + d.id)} <Pill s={d.devis_status}>{d.devis_status || 'En cours'}</Pill>{d.remplace_par_devis_id && <Pill>Remplacé</Pill>}</div>
        <div style={{ fontSize: '12px', color: 'var(--tw-muted)', marginTop: '2px' }}>{fmtDate(d.quote_date)} · Setup {fmtEur(d.setup_amount)} · Mensuel {fmtEur(d.monthly_amount)}{Number(d.training_amount) ? ` · Formation ${fmtEur(d.training_amount)}` : ''}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {d.pdf_url ? (
          <button onClick={() => openPdf(`${API_URL}/devis/${d.id}/download-pdf`)} style={{ padding: '5px 10px', border: main ? 'none' : '1px solid var(--tw-border)', borderRadius: '7px', background: main ? 'var(--tw-teal)' : 'white', color: main ? 'white' : 'var(--tw-ink)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>Voir le PDF</button>
        ) : <span style={{ fontSize: '11px', color: 'var(--tw-muted)' }}>Pas de PDF</span>}
        {main && <button title="Pré-remplit un bon de commande Licences avec les montants de cette proposition" onClick={() => setForm({ kind: 'bdc', initial: { reference: '', date_bdc: today(), statut: 'Reçu', devis_id: d.id, detail: { licences: { setup: Number(d.setup_amount) || 0, lic_mensuelles: Number(d.monthly_amount) || 0, lic_annuelles: Number(d.annual_amount) || 0, prestations: 0, formation: Number(d.training_amount) || 0 } } } })}
          style={{ padding: '5px 10px', border: '1px solid var(--tw-teal)', borderRadius: '7px', background: 'white', color: 'var(--tw-teal)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>Créer le BDC</button>}
      </div>
    </div>
  );

  const addBtn = (label, onClick) => (
    <button onClick={onClick} style={{ background: 'none', border: 'none', color: 'var(--tw-teal)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', padding: '4px 0', fontFamily: "'Inter',sans-serif", display: 'inline-flex', alignItems: 'center', gap: '5px' }}>{I(ICONS.plus, 11)} {label}</button>
  );

  return (
    <div style={{ background: 'white', borderRadius: '10px', border: '0.5px solid var(--tw-border)', borderLeft: '4px solid #0f6e56', marginBottom: '10px', overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: '12px 14px', cursor: 'pointer', background: open ? '#fafaf9' : 'white', borderBottom: open ? '0.5px solid var(--tw-border)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--tw-muted)', display: 'inline-flex' }}>{I(open ? ICONS.chevron : ICONS.chevronR, 12)}</span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tw-ink)' }}>{affaire.nom_affaire}</span>
          <Pill s="Gagné">Gagnée{affaire.updated_at ? ` le ${fmtDate(affaire.updated_at)}` : ''}</Pill>
          {affaire.decision_periode && <Pill>Décision : {formatDecisionPeriode(affaire.decision_periode)}</Pill>}
          <span style={{ fontSize: '11px', color: 'var(--tw-muted)' }}>· {devisAff.length} proposition{devisAff.length > 1 ? 's' : ''}</span>
          {bdcs && <span style={{ fontSize: '11px', color: 'var(--tw-muted)' }}>· {bdcs.length} BDC · {(factures || []).length} facture{(factures || []).length > 1 ? 's' : ''}</span>}
          <span style={{ marginLeft: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => onReopen(affaire)} title="Repasser l'affaire en cours (erreur de statut)" style={{ padding: '4px 10px', border: '0.5px solid var(--tw-border)', borderRadius: '7px', background: 'white', color: 'var(--tw-slate)', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>Rouvrir l'affaire</button>
          </span>
        </div>
        {affaire.description && <div style={{ fontSize: '12.5px', color: 'var(--tw-slate)', marginTop: '6px', marginLeft: '20px' }}>{affaire.description}</div>}
      </div>

      {open && (
        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
            {[['Setup', fmtEur(retenu?.setup_amount)], ['Abonnement mensuel', fmtEur(retenu?.monthly_amount)], ['Formation', fmtEur(retenu?.training_amount)], ['Commandé / Facturé', bdcs ? `${fmtEur(commande)} / ${fmtEur(facture)}` : '…']].map(([k, v]) => (
              <div key={k} style={{ background: 'var(--tw-bg)', borderRadius: '8px', padding: '8px 10px' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--tw-muted)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{k}</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--tw-ink)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={secTitle}>Proposition retenue</div>
          {retenu ? devisRow(retenu, true) : <div style={{ fontSize: '12.5px', color: 'var(--tw-muted)' }}>Aucune proposition sur cette affaire.</div>}
          {autres.length > 0 && (
            <>
              <button onClick={() => setShowAllDevis(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--tw-teal)', fontSize: '12px', cursor: 'pointer', padding: '2px 0 6px', fontFamily: "'Inter',sans-serif" }}>
                {showAllDevis ? 'Masquer' : 'Voir'} les {devisAff.length} propositions de cette affaire {showAllDevis ? '▴' : '▾'}
              </button>
              {showAllDevis && autres.map(d => devisRow(d, false))}
            </>
          )}

          <div style={secTitle}>Bons de commande</div>
          {form?.kind === 'bdc' && <DocForm kind="bdc" initial={form.initial} devisList={devisAff} onCancel={() => setForm(null)} onSave={(data) => save('bdc', form.initial, data)} />}
          {bdcs === null ? <div style={{ fontSize: '12px', color: 'var(--tw-muted)' }}>Chargement…</div> : bdcs.map(b => docRow('bdc', b))}
          {bdcs && bdcs.length === 0 && form?.kind !== 'bdc' && <div style={{ fontSize: '12.5px', color: 'var(--tw-muted)', marginBottom: '4px' }}>Aucun bon de commande.</div>}
          {form?.kind !== 'bdc' && addBtn('Ajouter un bon de commande', () => setForm({ kind: 'bdc', initial: null }))}

          <div style={secTitle}>Factures</div>
          {form?.kind === 'facture' && <DocForm kind="facture" initial={form.initial} bdcList={bdcs || []} onCancel={() => setForm(null)} onSave={(data) => save('facture', form.initial, data)} />}
          {factures === null ? <div style={{ fontSize: '12px', color: 'var(--tw-muted)' }}>Chargement…</div> : factures.map(f => docRow('facture', f))}
          {factures && factures.length === 0 && form?.kind !== 'facture' && <div style={{ fontSize: '12.5px', color: 'var(--tw-muted)', marginBottom: '4px' }}>Aucune facture.</div>}
          {form?.kind !== 'facture' && addBtn('Ajouter une facture', () => setForm({ kind: 'facture', initial: null }))}
        </div>
      )}
    </div>
  );
}

export function AffairesGagnees({ affairesList, devisList, user, API_URL, onReopen }) {
  const gagnees = (affairesList || []).filter(a => a.statut_global === 'Gagné');
  if (gagnees.length === 0) {
    return <div style={{ padding: '28px', textAlign: 'center', color: 'var(--tw-muted)', fontSize: '13px' }}>Aucune affaire gagnée pour cette société. Une affaire passe ici quand l'un de ses devis est marqué « Gagné ».</div>;
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: 'var(--tw-ink)' }}>Affaires gagnées <span style={{ color: 'var(--tw-muted)', fontWeight: 400 }}>· {gagnees.length}</span></h3>
      </div>
      {gagnees.map(a => <AffaireGagneeCard key={a.id} affaire={a} devisList={devisList} user={user} API_URL={API_URL} onReopen={onReopen} />)}
    </div>
  );
}
