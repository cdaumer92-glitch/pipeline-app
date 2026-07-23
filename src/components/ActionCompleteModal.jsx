import * as React from 'react';
import { ACTION_TYPES } from '../lib/constants.js';

export function ActionCompleteModal({ action, prospectId, API_URL, token, onClose, onCompleted, affairesList = [], interlocuteurs = [] }) {
      const nextDefault = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
      // Contexte repris de l'action terminée : même affaire, ou Marketing, sinon aucun.
      const contexteDefault = action.affaire_id ? `affaire_${action.affaire_id}` : (action.contexte === 'Marketing' ? 'marketing' : '');
      const [resultNote, setResultNote] = React.useState('');
      const [createNext, setCreateNext] = React.useState(true);
      const [nextType, setNextType] = React.useState(action.action_type || 'Appel');
      const [nextDate, setNextDate] = React.useState(nextDefault);
      const [nextPriority, setNextPriority] = React.useState(1);
      const [nextContexte, setNextContexte] = React.useState(contexteDefault);
      const [nextActor, setNextActor] = React.useState(action.actor || '');
      const [nextContact, setNextContact] = React.useState(action.contact || '');
      const [nextComment, setNextComment] = React.useState('');
      const [saving, setSaving] = React.useState(false);
      const hdrs = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
      const lbl = { fontSize: '11px', color: 'var(--tw-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' };
      const fld = { width: '100%', padding: '8px 10px', border: '1px solid var(--tw-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', background: 'white', color: 'var(--tw-ink)', boxSizing: 'border-box' };
      const validate = async () => {
        setSaving(true);
        try {
          const r = await fetch(`${API_URL}/next_actions/${action.id}`, { method: 'PUT', headers: hdrs, body: JSON.stringify({ completed: true, completed_notes: resultNote || '' }) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          if (createNext && nextDate) {
            // Endpoint prospect : c'est le seul qui accepte affaire_id + contexte + commentaire
            // (même contrat que le formulaire « + Nouvelle action »).
            const isAffaire = nextContexte.startsWith('affaire_');
            const affaire_id = isAffaire ? parseInt(nextContexte.replace('affaire_', '')) : null;
            const contexte = nextContexte === 'marketing' ? 'Marketing' : null;
            const url = `${API_URL}/prospects/${action.prospect_id || prospectId}/next_actions`;
            await fetch(url, { method: 'POST', headers: hdrs, body: JSON.stringify({ action_type: nextType, planned_date: nextDate, priority: nextPriority, actor: nextActor, contact: nextContact, completed_note: nextComment, affaire_id, contexte }) });
          }
          if (window.showToast) window.showToast({ title: 'Action terminée' + (createNext && nextDate ? ' · prochaine action créée' : ''), type: 'success' });
          if (onCompleted) onCompleted({ resultNote });
          onClose();
        } catch (e) {
          if (window.showToast) window.showToast({ title: 'Erreur : ' + e.message, type: 'error' });
          setSaving(false);
        }
      };
      return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,31,78,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 }} onClick={onClose}>
          <div style={{ background: 'white', borderRadius: 'var(--r-md)', padding: '22px 24px', width: '520px', maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--sh-md)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--tw-ink)', marginBottom: '4px' }}>Action terminée</h3>
            <p style={{ fontSize: '13px', color: 'var(--tw-muted)', marginBottom: '16px' }}>{action.prospect_name ? action.prospect_name + ' — ' : ''}{action.action_type}{action.planned_date ? ' · ' + String(action.planned_date).slice(0, 10).split('-').reverse().join('/') : ''}</p>
            <label style={lbl}>Résultat de l'action (optionnel)</label>
            <textarea value={resultNote} onChange={e => setResultNote(e.target.value)} rows={3} placeholder="Ex. : joint, rappeler mardi ; devis à envoyer ; pas intéressé…" style={{ ...fld, marginBottom: '16px', resize: 'vertical' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--tw-ink)', fontWeight: 600, marginBottom: '12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={createNext} onChange={e => setCreateNext(e.target.checked)} />
              Programmer une prochaine action
            </label>
            {createNext && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                <div><label style={lbl}>Type</label><select value={nextType} onChange={e => setNextType(e.target.value)} style={fld}>{ACTION_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><label style={lbl}>Date prévue</label><input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} style={fld} /></div>
                <div style={{ gridColumn: '1 / span 2' }}>
                  <label style={lbl}>Affaire / Marketing</label>
                  <select value={nextContexte} onChange={e => setNextContexte(e.target.value)} style={fld}>
                    <option value="">-- Aucun --</option>
                    <option value="marketing">Marketing</option>
                    {affairesList.length > 0 && <option disabled>──────────</option>}
                    {affairesList.map(a => <option key={a.id} value={`affaire_${a.id}`}>{a.nom_affaire}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>De (Acteur)</label>
                  <select value={nextActor} onChange={e => setNextActor(e.target.value)} style={fld}>
                    <option value="">-- Acteur --</option>
                    {['Christian', 'Roger', 'Frederic'].map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Vers (Contact)</label>
                  <select value={nextContact} onChange={e => setNextContact(e.target.value)} style={fld}>
                    <option value="">-- Contact --</option>
                    <option value="Interne">Interne</option>
                    {interlocuteurs.map(i => <option key={i.id} value={i.nom}>{i.nom}{i.fonction ? ' (' + i.fonction + ')' : ''}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / span 2' }}><label style={lbl}>Priorité</label><select value={nextPriority} onChange={e => setNextPriority(Number(e.target.value))} style={fld}><option value={1}>Normale</option><option value={2}>Haute</option></select></div>
                <div style={{ gridColumn: '1 / span 2' }}>
                  <label style={lbl}>Commentaire</label>
                  <textarea value={nextComment} onChange={e => setNextComment(e.target.value)} rows={2} placeholder="Optionnel" style={{ ...fld, resize: 'vertical' }} />
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '999px', border: '1px solid var(--tw-border)', background: 'white', color: 'var(--tw-slate)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
              <button onClick={validate} disabled={saving} style={{ padding: '8px 16px', borderRadius: '999px', border: 'none', background: 'var(--primary)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? .7 : 1, fontFamily: 'inherit' }}>{saving ? '…' : 'Valider'}</button>
            </div>
          </div>
        </div>
      );
    }
