import * as React from 'react';
import { displayName } from '../lib/shared.jsx';

// ── Devis simple : grille de saisie Réf / Désignation / PU HT / Qté / Remise ──
// Créé depuis la modale « Nouveau devis » → « Créer un devis ». Les lignes sont
// stockées dans devis.lignes_json ; le PDF est généré par le container
// propale-service (POST /api/devis/:id/generate-pdf-simple) et attaché au devis.
// En édition (devis.lignes_json présent), la même grille est rechargée.

const REFS = ['DEVELOPPEMENT', 'ASSISTANCE TECHNIQUE', 'MATERIEL', 'AUTRE'];
const LIGNE_VIDE = { ref: 'DEVELOPPEMENT', ref_autre: '', designation: '', pu: '', qte: 1, remise: 0 };

const fmtEur = (x) => (isNaN(x) ? '—' : x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
// Parse un montant saisi librement : « 1 150,00 € », « 1150.5 », « 1150,5 » → 1150.5
const parseMontant = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[€\s ]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
};
// Normalise la civilité éventuellement stockée sur le contact (M., Mme, Monsieur…)
const normCivilite = (c) => {
  const s = String(c || '').trim().toLowerCase();
  if (['m', 'm.', 'mr', 'monsieur'].includes(s)) return 'Monsieur';
  if (['mme', 'madame', 'mademoiselle', 'mlle'].includes(s)) return 'Madame';
  return '';
};

export function DevisSimpleForm({ prospect, interlocuteurs = [], affaireId, user, API_URL, editingDevis = null, onClose, onSaved }) {
  const lj = editingDevis?.lignes_json || null;
  const [quoteDate, setQuoteDate] = React.useState(
    editingDevis?.quote_date ? String(editingDevis.quote_date).slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [validite, setValidite] = React.useState(lj?.validite || '1 mois');
  const [attentionDe, setAttentionDe] = React.useState(lj?.attention_de || '');
  const [civilite, setCivilite] = React.useState(lj?.attention_civilite || '');
  const [lignes, setLignes] = React.useState(
    lj?.lignes?.length
      ? lj.lignes.map(l => ({
          ref: REFS.includes((l.ref || '').toUpperCase()) ? (l.ref || '').toUpperCase() : 'AUTRE',
          ref_autre: REFS.includes((l.ref || '').toUpperCase()) ? '' : (l.ref || ''),
          designation: l.designation || '',
          pu: (l.pu != null && l.pu !== '') ? fmtEur(parseFloat(l.pu)) : '',
          qte: l.qte ?? 1, remise: l.remise ?? 0,
        }))
      : [{ ...LIGNE_VIDE }]
  );
  const [saving, setSaving] = React.useState(false);

  const maj = (i, champ, val) => setLignes(ls => ls.map((l, j) => j === i ? { ...l, [champ]: val } : l));
  const totalLigne = (l) => {
    const pu = parseMontant(l.pu), qte = parseFloat(l.qte) || 0, remise = parseFloat(l.remise) || 0;
    return Math.round(pu * qte * (1 - remise / 100) * 100) / 100;
  };
  const totalHT = Math.round(lignes.reduce((s, l) => s + totalLigne(l), 0) * 100) / 100;
  const tva = Math.round(totalHT * 20) / 100;
  const totalTTC = Math.round((totalHT + tva) * 100) / 100;

  const enregistrer = async (genererPdf) => {
    const lignesValides = lignes
      .filter(l => (l.designation || '').trim() && parseMontant(l.pu) > 0)
      .map(l => ({
        ref: l.ref === 'AUTRE' ? ((l.ref_autre || '').trim() || 'AUTRE') : l.ref,
        designation: l.designation.trim(),
        pu: parseMontant(l.pu),
        qte: parseFloat(l.qte) || 0,
        remise: parseFloat(l.remise) || 0,
        total: totalLigne(l),
      }));
    if (lignesValides.length === 0) {
      window.showToast({ title: 'Ajoutez au moins une ligne avec désignation et prix', type: 'warning' });
      return;
    }
    // Le devis s'adresse à quelqu'un : civilité obligatoire dès qu'un destinataire est choisi
    // (« À l'attention de Monsieur/Madame Prénom Nom » sur le document).
    if (attentionDe && !civilite) {
      window.showToast({ title: 'Précisez la civilité du destinataire : Monsieur ou Madame ?', type: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const hdrs = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` };
      const lignes_json = { lignes: lignesValides, validite: validite.trim() || '1 mois', attention_de: attentionDe, attention_civilite: civilite, tva_rate: 20 };
      let devisId, devisName;
      if (editingDevis) {
        const r = await fetch(`${API_URL}/devis/${editingDevis.id}`, {
          method: 'PUT', headers: hdrs,
          body: JSON.stringify({ quote_date: quoteDate, setup_amount: totalHT, lignes_json })
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        devisId = editingDevis.id; devisName = editingDevis.devis_name;
      } else {
        // devis_name absent → numérotation automatique DEV-AAAA-NNN côté serveur
        const r = await fetch(`${API_URL}/prospects/${prospect.id}/devis`, {
          method: 'POST', headers: hdrs,
          body: JSON.stringify({
            affaire_id: affaireId || null, devis_status: 'En cours', quote_date: quoteDate,
            setup_amount: totalHT, chance_percent: 50, lignes_json,
          })
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const created = await r.json();
        devisId = created.id; devisName = created.devis_name;
      }

      if (genererPdf) {
        const rp = await fetch(`${API_URL}/devis/${devisId}/generate-pdf-simple`, { method: 'POST', headers: hdrs });
        if (!rp.ok) {
          const e = await rp.json().catch(() => ({}));
          window.showToast({ title: `Devis ${devisName} enregistré, mais PDF non généré : ${e.error || rp.status}`, type: 'warning' });
        } else {
          window.showToast({ title: `Devis ${devisName} enregistré · PDF généré et attaché`, type: 'success' });
        }
      } else {
        window.showToast({ title: `Devis ${devisName} enregistré`, type: 'success' });
      }
      if (onSaved) await onSaved();
      onClose();
    } catch (err) {
      window.showToast({ title: 'Erreur : ' + err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const lbl = { fontSize: '11px', color: 'var(--tw-slate)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', display: 'block', marginBottom: '4px' };
  const inp = { width: '100%', padding: '7px 10px', border: '1px solid var(--tw-border)', borderRadius: '6px', fontSize: '13px', fontFamily: "'Inter',sans-serif", boxSizing: 'border-box', background: 'white' };
  const inpNum = { ...inp, textAlign: 'right' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,31,78,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: '14px', padding: '24px 26px', width: '880px', maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(17,24,39,.25)' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 700, color: 'var(--tw-ink)' }}>
          {editingDevis ? `Devis ${editingDevis.devis_name}` : 'Nouveau devis'}
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--tw-muted)' }}>{prospect?.name}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.4fr', gap: '10px', marginBottom: '16px' }}>
          <div>
            <label style={lbl}>N° devis</label>
            <input value={editingDevis ? editingDevis.devis_name : 'Auto (DEV-' + new Date().getFullYear() + '-…)'} readOnly
              style={{ ...inp, background: 'var(--tw-bg)', color: 'var(--tw-muted)' }} />
          </div>
          <div>
            <label style={lbl}>Date</label>
            <input type="date" value={quoteDate} onChange={e => setQuoteDate(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Validité</label>
            <input value={validite} onChange={e => setValidite(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>À l'attention de</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <select value={civilite} onChange={e => setCivilite(e.target.value)}
                title="Civilité du destinataire (obligatoire si un destinataire est choisi)"
                style={{ ...inp, width: '92px', flexShrink: 0, borderColor: attentionDe && !civilite ? '#f0a4a4' : 'var(--tw-border)' }}>
                <option value="">M. / Mme ?</option>
                <option value="Monsieur">Monsieur</option>
                <option value="Madame">Madame</option>
              </select>
              <select value={attentionDe}
                onChange={e => {
                  const n = e.target.value;
                  setAttentionDe(n);
                  // Pré-remplir la civilité si le contact la connaît ; sinon laisser
                  // le choix à l'utilisateur (jamais devinée depuis le prénom).
                  const c = interlocuteurs.find(i => displayName(i) === n);
                  setCivilite(normCivilite(c?.civilite));
                }}
                style={{ ...inp, flex: 1, minWidth: 0 }}>
                <option value="">— Aucun —</option>
                {interlocuteurs.map(i => {
                  const n = displayName(i);
                  return <option key={i.id} value={n}>{n}{i.fonction ? ' (' + i.fonction + ')' : ''}</option>;
                })}
              </select>
            </div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['Réf', 'Désignation', 'PU HT', 'Qté', 'Remise %', 'Total HT', ''].map((h, i) => (
                <th key={i} style={{ textAlign: i >= 2 && i <= 5 ? 'right' : 'left', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tw-slate)', padding: '6px 6px', borderBottom: '2px solid var(--primary-soft)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={i}>
                <td style={{ padding: '5px 6px', width: '170px', verticalAlign: 'top' }}>
                  <select value={l.ref} onChange={e => maj(i, 'ref', e.target.value)} style={inp}>
                    {REFS.map(r => <option key={r} value={r}>{r === 'AUTRE' ? 'Autre…' : r}</option>)}
                  </select>
                  {l.ref === 'AUTRE' && (
                    <input value={l.ref_autre} onChange={e => maj(i, 'ref_autre', e.target.value)} placeholder="Réf libre"
                      style={{ ...inp, marginTop: '4px' }} />
                  )}
                </td>
                <td style={{ padding: '5px 6px', verticalAlign: 'top' }}>
                  <textarea value={l.designation} onChange={e => maj(i, 'designation', e.target.value)} rows={l.designation.length > 60 ? 2 : 1}
                    placeholder="Désignation de la prestation ou du matériel"
                    style={{ ...inp, resize: 'vertical', minHeight: '32px' }} />
                </td>
                <td style={{ padding: '5px 6px', width: '105px', verticalAlign: 'top' }}>
                  {/* Affiché au format monétaire (comme Total HT) hors saisie ; valeur brute pendant la frappe */}
                  <input type="text" inputMode="decimal" value={l.pu}
                    onChange={e => maj(i, 'pu', e.target.value)}
                    onFocus={() => { const p = parseMontant(l.pu); maj(i, 'pu', p ? String(p).replace('.', ',') : ''); }}
                    onBlur={() => { const p = parseMontant(l.pu); maj(i, 'pu', p ? fmtEur(p) : ''); }}
                    placeholder="0,00 €" style={inpNum} />
                </td>
                <td style={{ padding: '5px 6px', width: '62px', verticalAlign: 'top' }}>
                  <input type="number" step="0.5" min="0" value={l.qte} onChange={e => maj(i, 'qte', e.target.value)} style={inpNum} />
                </td>
                <td style={{ padding: '5px 6px', width: '70px', verticalAlign: 'top' }}>
                  <input type="number" step="1" min="0" max="100" value={l.remise} onChange={e => maj(i, 'remise', e.target.value)} style={inpNum} />
                </td>
                <td style={{ padding: '11px 6px', width: '100px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' }}>
                  {fmtEur(totalLigne(l))}
                </td>
                <td style={{ padding: '8px 2px', width: '26px', verticalAlign: 'top' }}>
                  <span title="Supprimer la ligne"
                    onClick={() => setLignes(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [{ ...LIGNE_VIDE }])}
                    style={{ cursor: 'pointer', color: 'var(--tw-muted)', fontWeight: 700 }}>×</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => setLignes(ls => [...ls, { ...LIGNE_VIDE }])}
          style={{ marginTop: '8px', background: 'white', border: '0.5px solid var(--tw-border)', padding: '5px 12px', borderRadius: '7px', fontSize: '12px', color: 'var(--tw-slate)', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>
          + Ajouter une ligne
        </button>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
          <table style={{ width: '250px', fontSize: '13px' }}>
            <tbody>
              <tr><td style={{ color: 'var(--tw-muted)', padding: '2px 6px' }}>Total HT</td><td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtEur(totalHT)}</td></tr>
              <tr><td style={{ color: 'var(--tw-muted)', padding: '2px 6px' }}>TVA 20 %</td><td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtEur(tva)}</td></tr>
              <tr><td style={{ fontWeight: 700, padding: '2px 6px', color: 'var(--tw-ink)' }}>Total TTC</td><td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--tw-teal)', fontVariantNumeric: 'tabular-nums' }}>{fmtEur(totalTTC)}</td></tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: '8px 16px', border: '1px solid var(--tw-border)', borderRadius: '7px', background: 'white', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}>Annuler</button>
          <button onClick={() => enregistrer(false)} disabled={saving}
            style={{ padding: '8px 16px', border: '1px solid var(--tw-teal)', borderRadius: '7px', background: 'white', color: 'var(--tw-teal)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter',sans-serif", opacity: saving ? .6 : 1 }}>Enregistrer</button>
          <button onClick={() => enregistrer(true)} disabled={saving}
            style={{ padding: '8px 16px', border: 'none', borderRadius: '7px', background: 'var(--tw-teal)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter',sans-serif", opacity: saving ? .6 : 1 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer + générer le PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
