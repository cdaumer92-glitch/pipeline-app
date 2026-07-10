import * as React from 'react';
import { ACTION_TYPES } from '../lib/constants.js';

export function ListesView({ type, prospects, user, API_URL, listeCtx }) {
      const admin = (typeof isUserAdmin === 'function') ? isUserAdmin(user) : !!(user && (user.role === 'admin' || user.name === 'Christian'));
      const [commercial, setCommercial] = React.useState((listeCtx && listeCtx.commercial) || '__all__');
      const [realStatusFilter, setRealStatusFilter] = React.useState((listeCtx && listeCtx.realStatus) || null); // filtre real_status (liste Sociétés, depuis une box du dashboard)
      const [statut, setStatut] = React.useState('Tous');
      const [devis, setDevis] = React.useState(null);
      const [actions, setActions] = React.useState(null);
      const [loading, setLoading] = React.useState(false);
      const [sort, setSort] = React.useState({ key: '', dir: 'asc' }); // tri par colonne
      const [actionTypeFilter, setActionTypeFilter] = React.useState('__all__'); // filtre par type (liste Actions)
      const [completion, setCompletion] = React.useState(null); // modale de complétion (résultat + prochaine action)
      const [stats, setStats] = React.useState(null); // métriques de pilotage (par commercial)
      const [editing, setEditing] = React.useState(null); // modale d'édition d'une action
      const [reopenable, setReopenable] = React.useState([]); // actions terminées à l'instant (undo "Rouvrir")
      React.useEffect(() => { setSort({ key: '', dir: 'asc' }); }, [type]); // réinit à chaque changement de liste
      // Applique le filtre initial transmis par le dashboard (commercial + real_status) à chaque ouverture.
      React.useEffect(() => {
        setCommercial((listeCtx && listeCtx.commercial) || '__all__');
        setRealStatusFilter((listeCtx && listeCtx.realStatus) || null);
      }, [listeCtx]);

      // Chargement à la demande des données non déjà présentes côté front.
      React.useEffect(() => {
        let abort = false;
        const opts = { headers: { 'Authorization': 'Bearer ' + (user && user.token) } };
        if (type === 'devis' && devis === null) {
          setLoading(true);
          fetch(`${API_URL}/devis/all`, opts).then(r => r.json())
            .then(d => { if (!abort) setDevis(Array.isArray(d) ? d : []); })
            .catch(() => { if (!abort) setDevis([]); })
            .then(() => { if (!abort) setLoading(false); });
        } else if (type === 'actions' && actions === null) {
          setLoading(true);
          fetch(`${API_URL}/lists/actions`, opts).then(r => r.json())
            .then(d => { if (!abort) setActions(Array.isArray(d) ? d : []); })
            .catch(() => { if (!abort) setActions([]); })
            .then(() => { if (!abort) setLoading(false); });
          fetch(`${API_URL}/lists/actions-stats`, opts).then(r => r.json())
            .then(d => { if (!abort) setStats(Array.isArray(d) ? d : []); })
            .catch(() => { if (!abort) setStats([]); });
        }
        return () => { abort = true; };
      }, [type]);

      // Filtre de visibilité : non-admin = ses données ; admin = tout (ou un commercial choisi).
      const inScope = (c) => admin ? (commercial === '__all__' || c === commercial) : (c === (user && user.name));
      const openFiche = (prospectId, affaireId, t, id) => window.dispatchEvent(new CustomEvent('tw:navigate', { detail: { prospectId, affaireId, type: t, entityId: id } }));

      // ---- Actions rapides depuis la liste (P1.1) + enchaînement de cadence (P2.4) ----
      const actHeaders = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (user && user.token) };
      const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
      const toast = (t, type) => { if (window.showToast) window.showToast({ title: t, type: type || 'success' }); };
      // Cliquer "Fait ?" : ouvre la modale de complétion (on saisit le résultat + la suite AVANT de valider).
      const openCompletion = (a) => setCompletion({ action: a, resultNote: '', createNext: true, nextType: a.action_type || 'Appel', nextDate: plusDays(7), nextPriority: 1 });
      // Valider : enregistre la complétion (+ résultat), retire la ligne, crée éventuellement la prochaine action.
      const validateCompletion = async () => {
        if (!completion) return;
        const a = completion.action;
        try {
          const r = await fetch(`${API_URL}/next_actions/${a.id}`, { method: 'PUT', headers: actHeaders, body: JSON.stringify({ completed: true, completed_notes: completion.resultNote || '' }) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          setActions(prev => (prev || []).filter(x => x.id !== a.id));
          // Undo de session : garder l'action terminée pour pouvoir la rouvrir en un clic.
          setReopenable(prev => [{ ...a, completed_note: completion.resultNote || a.completed_note || '' }, ...prev.filter(x => x.id !== a.id)].slice(0, 6));
          if (completion.createNext && completion.nextDate) {
            const url = a.affaire_id ? `${API_URL}/affaires/${a.affaire_id}/next_actions` : `${API_URL}/prospects/${a.prospect_id}/next_actions`;
            const rc = await fetch(url, { method: 'POST', headers: actHeaders, body: JSON.stringify({ action_type: completion.nextType, planned_date: completion.nextDate, priority: completion.nextPriority, actor: a.actor || '', contact: a.contact || '' }) });
            const created = await rc.json().catch(() => ({}));
            if (rc.ok && created && created.id) {
              setActions(prev => ([...(prev || []), { id: created.id, prospect_id: a.prospect_id, affaire_id: a.affaire_id, action_type: completion.nextType, planned_date: completion.nextDate, priority: completion.nextPriority, actor: a.actor, contact: a.contact, prospect_name: a.prospect_name, commercial: a.commercial || (user && user.name) }]));
            }
          }
          toast('Action terminée' + (completion.createNext && completion.nextDate ? ' · prochaine action créée' : ''));
        } catch (e) { toast('Erreur : ' + e.message, 'error'); }
        setCompletion(null);
      };
      // Reprogrammer (snooze / report) : met à jour la date sans compléter.
      const rescheduleAction = async (a, dateStr) => {
        if (!dateStr) return;
        try {
          const r = await fetch(`${API_URL}/next_actions/${a.id}`, { method: 'PUT', headers: actHeaders, body: JSON.stringify({ reschedule: true, planned_date: dateStr }) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          setActions(prev => (prev || []).map(x => x.id === a.id ? { ...x, planned_date: dateStr } : x));
          toast('Action reprogrammée au ' + dateStr.split('-').reverse().join('/'));
        } catch (e) { toast('Erreur : ' + e.message, 'error'); }
      };
      // Basculer la priorité Normale <-> Haute directement depuis la liste.
      const togglePriority = async (a) => {
        const next = (Number(a.priority) === 2) ? 1 : 2;
        try {
          const r = await fetch(`${API_URL}/next_actions/${a.id}`, { method: 'PUT', headers: actHeaders, body: JSON.stringify({ setPriority: true, priority: next }) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          setActions(prev => (prev || []).map(x => x.id === a.id ? { ...x, priority: next } : x));
        } catch (e) { toast('Erreur : ' + e.message, 'error'); }
      };
      // Rouvrir une action terminée par erreur : la repasse en non complétée et la remet dans la liste.
      const reopenAction = async (a) => {
        try {
          const r = await fetch(`${API_URL}/next_actions/${a.id}`, { method: 'PUT', headers: actHeaders, body: JSON.stringify({ completed: false, completed_notes: a.completed_note || '' }) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          setReopenable(prev => prev.filter(x => x.id !== a.id));
          setActions(prev => ([...(prev || []).filter(x => x.id !== a.id), a]));
          toast('Action rouverte');
        } catch (e) { toast('Erreur : ' + e.message, 'error'); }
      };
      // Ouvrir la modale d'édition d'une action (type, date, acteur, contact, priorité, commentaire).
      const openEdit = (a) => setEditing({ id: a.id, prospect_id: a.prospect_id, affaire_id: a.affaire_id, prospect_name: a.prospect_name, commercial: a.commercial, action_type: a.action_type || 'Appel', planned_date: a.planned_date ? String(a.planned_date).slice(0, 10) : '', actor: a.actor || '', contact: a.contact || '', priority: Number(a.priority) === 2 ? 2 : 1, completed_note: a.completed_note || '' });
      const saveEdit = async () => {
        if (!editing) return;
        try {
          const r = await fetch(`${API_URL}/next_actions/${editing.id}`, { method: 'PUT', headers: actHeaders, body: JSON.stringify({ edit: true, action_type: editing.action_type, planned_date: editing.planned_date || null, actor: editing.actor, contact: editing.contact, priority: editing.priority, completed_note: editing.completed_note }) });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          setActions(prev => (prev || []).map(x => x.id === editing.id ? { ...x, action_type: editing.action_type, planned_date: editing.planned_date, actor: editing.actor, contact: editing.contact, priority: editing.priority, completed_note: editing.completed_note } : x));
          toast('Action modifiée');
        } catch (e) { toast('Erreur : ' + e.message, 'error'); }
        setEditing(null);
      };

      const commerciaux = (() => {
        const src = type === 'devis' ? (devis || []).map(d => d.commercial)
          : type === 'actions' ? (actions || []).map(a => a.commercial)
          : prospects.map(p => p.assigned_to);
        return Array.from(new Set(src.filter(Boolean))).sort();
      })();

      const fmtDate = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
      const fmtEur = (v) => { const n = Number(v); return (!v || isNaN(n)) ? '—' : n.toLocaleString('fr-FR') + ' €'; };
      const th = { textAlign: 'left', fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--tw-muted)', padding: '10px 12px', borderBottom: '1px solid var(--tw-border)', whiteSpace: 'nowrap' };
      // Tri par colonne : clic sur l'en-tête → bascule asc/desc.
      const toggleSort = (key) => setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
      const applySort = (rows, accessors) => {
        if (!sort.key || !accessors[sort.key]) return rows;
        const acc = accessors[sort.key];
        return rows.slice().sort((a, b) => {
          const r = String(acc(a) == null ? '' : acc(a)).localeCompare(String(acc(b) == null ? '' : acc(b)), 'fr', { numeric: true, sensitivity: 'base' });
          return sort.dir === 'asc' ? r : -r;
        });
      };
      const SortTh = (label, key) => {
        const active = sort.key === key;
        // Indicateur permanent (↕ discret) sur toute colonne triable ; ▲/▼ en plein sur la colonne active.
        return (
          <th style={{ ...th, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(key)} title="Cliquer pour trier">
            {label} <span style={{ fontSize: '9px', opacity: active ? 1 : 0.4, color: active ? '#12a0dc' : 'inherit' }}>{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
          </th>
        );
      };
      const td = { padding: '10px 12px', borderBottom: '0.5px solid var(--tw-border)', fontSize: '13px', color: 'var(--tw-ink)' };
      const lk = { color: '#12a0dc', fontWeight: 600 };
      const tableStyle = { width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '12px', overflow: 'hidden', border: '0.5px solid var(--tw-border)' };
      const badge = (s) => { const m = ({ Suspect: ['#7a7a7a', '#f0f0f0'], Prospect: ['#c47d10', '#fdf3e3'], Client: ['#1a8f4c', '#e7f7ed'] })[s] || ['#5b6b78', '#eef2f5']; return { display: 'inline-block', fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '20px', color: m[0], background: m[1] }; };
      const rowHover = { onMouseOver: e => e.currentTarget.style.background = '#f7fbfd', onMouseOut: e => e.currentTarget.style.background = 'white' };
      const Empty = (msg) => <div style={{ padding: '36px', textAlign: 'center', color: 'var(--tw-muted)', fontSize: '14px' }}>{msg}</div>;

      const Wrap = (title, sub, filters, children) => (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '22px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '18px', gap: '16px', flexWrap: 'wrap' }}>
            <div><h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--tw-ink)' }}>{title}</h1><p style={{ fontSize: '13px', color: 'var(--tw-muted)', marginTop: '3px' }}>{sub}</p></div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>{filters}</div>
          </div>
          {children}
        </div>
      );
      const commercialFilter = admin ? (
        <select value={commercial} onChange={e => setCommercial(e.target.value)} style={{ padding: '6px 10px', borderRadius: '8px', border: '0.5px solid var(--tw-border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--tw-ink)', background: 'white' }}>
          <option value="__all__">Tous les commerciaux</option>
          {commerciaux.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      ) : null;

      // ---- SOCIÉTÉS ----
      if (type === 'societes') {
        // Filtre real_status optionnel (arrivée depuis une box du dashboard) : chaîne ou tableau de statuts.
        const rsMatch = (p) => !realStatusFilter || (Array.isArray(realStatusFilter) ? realStatusFilter.includes(p.real_status) : p.real_status === realStatusFilter);
        const base = prospects.filter(p => inScope(p.assigned_to) && rsMatch(p));
        const counts = { Suspect: 0, Prospect: 0, Client: 0 };
        base.forEach(p => { const s = p.statut_societe || 'Prospect'; if (counts[s] != null) counts[s]++; });
        let rows = (statut === 'Tous' ? base : base.filter(p => (p.statut_societe || 'Prospect') === statut)).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        rows = applySort(rows, { societe: p => p.name, type: p => p.statut_societe || 'Prospect', commercial: p => p.assigned_to });
        const statutFilter = (
          <div style={{ display: 'flex', gap: '4px' }}>
            {['Tous', 'Suspect', 'Prospect', 'Client'].map(s => (
              <button key={s} onClick={() => setStatut(s)} style={{ padding: '6px 11px', borderRadius: '8px', border: '0.5px solid ' + (statut === s ? '#12a0dc' : 'var(--tw-border)'), background: statut === s ? '#e8f6fc' : 'white', color: statut === s ? '#0d7fb0' : 'var(--tw-slate)', fontSize: '12.5px', fontWeight: statut === s ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit' }}>{s}</button>
            ))}
          </div>
        );
        const rsLabel = Array.isArray(realStatusFilter) ? 'Pipeline actif' : realStatusFilter;
        const realStatusChip = realStatusFilter ? (
          <button onClick={() => setRealStatusFilter(null)} title="Retirer ce filtre de statut" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 11px', borderRadius: '8px', border: '1px solid var(--primary)', background: 'var(--primary-soft)', color: 'var(--primary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Statut : {rsLabel} ✕</button>
        ) : null;
        return Wrap('Sociétés', `${counts.Suspect} suspect(s) · ${counts.Prospect} prospect(s) · ${counts.Client} client(s)`, <React.Fragment>{statutFilter}{realStatusChip}{commercialFilter}</React.Fragment>,
          rows.length === 0 ? Empty('Aucune société.') : (
            <table style={tableStyle}>
              <thead><tr>{SortTh('Société', 'societe')}{SortTh('Type', 'type')}{SortTh('Commercial', 'commercial')}<th style={th}>Contact</th><th style={th}>Téléphone</th></tr></thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} {...rowHover} onClick={() => openFiche(p.id, null, 'prospect', p.id)}>
                    <td style={{ ...td, ...lk }}>{p.name}</td>
                    <td style={td}><span style={badge(p.statut_societe || 'Prospect')}>{p.statut_societe || 'Prospect'}</span></td>
                    <td style={td}>{p.assigned_to || '—'}</td>
                    <td style={td}>{p.contact_name || '—'}</td>
                    <td style={td}>{p.tel_standard || p.phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        );
      }

      // ---- DEVIS EN COURS ----
      if (type === 'devis') {
        if (loading || devis === null) return Wrap('Devis en cours', '', commercialFilter, Empty('Chargement…'));
        const EN_COURS = ['En cours', 'Envoyé', 'Discussion', 'Négociation'];
        let rows = (devis || []).filter(d => EN_COURS.includes(d.devis_status) && inScope(d.commercial))
          .sort((a, b) => String(b.quote_date || '').localeCompare(String(a.quote_date || '')));
        rows = applySort(rows, { societe: d => d.prospect_name, statut: d => d.devis_status, date: d => d.quote_date || '', commercial: d => d.commercial });
        return Wrap('Devis en cours', `${rows.length} devis actif(s) — statuts hors Gagné / Perdu / Annulé`, commercialFilter,
          rows.length === 0 ? Empty('Aucun devis en cours.') : (
            <table style={tableStyle}>
              <thead><tr><th style={th}>Devis</th>{SortTh('Société', 'societe')}{SortTh('Statut', 'statut')}<th style={th}>Mise en place</th><th style={th}>Abo / mois</th>{SortTh('Date', 'date')}{SortTh('Commercial', 'commercial')}</tr></thead>
              <tbody>
                {rows.map(d => (
                  <tr key={d.id} style={{ cursor: 'pointer' }} {...rowHover} onClick={() => openFiche(d.prospect_id, d.affaire_id, 'devis', d.id)}>
                    <td style={{ ...td, ...lk }}>{d.devis_name || ('Devis #' + d.id)}</td>
                    <td style={td}>{d.prospect_name || '—'}</td>
                    <td style={td}>{d.devis_status || '—'}</td>
                    <td style={td}>{fmtEur(d.setup_amount)}</td>
                    <td style={td}>{fmtEur(d.monthly_amount)}</td>
                    <td style={td}>{fmtDate(d.quote_date)}</td>
                    <td style={td}>{d.commercial || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        );
      }

      // ---- ACTIONS (2 sections : en retard / à venir) ----
      if (type === 'actions') {
        if (loading || actions === null) return Wrap('Actions', '', commercialFilter, Empty('Chargement…'));
        const today = new Date().toISOString().slice(0, 10);
        const scoped = (actions || []).filter(a => inScope(a.commercial) && (actionTypeFilter === '__all__' || a.action_type === actionTypeFilter));
        // Tri par défaut : priorité (Haute d'abord) puis date.
        const byPrioThenDate = (a, b) => (Number(b.priority || 1) - Number(a.priority || 1)) || String(a.planned_date || '').localeCompare(String(b.planned_date || ''));
        const late = scoped.filter(a => a.planned_date && String(a.planned_date).slice(0, 10) < today).sort(byPrioThenDate);
        const upcoming = scoped.filter(a => !a.planned_date || String(a.planned_date).slice(0, 10) >= today).sort(byPrioThenDate);

        // Filtre par type, alimenté par les types réellement présents (robuste au drift historique).
        const presentTypes = Array.from(new Set((actions || []).map(a => a.action_type).filter(Boolean))).sort();
        const typeFilter = (
          <select value={actionTypeFilter} onChange={e => setActionTypeFilter(e.target.value)} style={{ padding: '6px 10px', borderRadius: '8px', border: '0.5px solid var(--tw-border)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--tw-ink)', background: 'white' }}>
            <option value="__all__">Tous les types</option>
            {presentTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        );

        // Métriques de pilotage (agrégats backend par commercial, sommés selon le scope courant).
        const agg = (stats || []).filter(s => inScope(s.commercial)).reduce((o, s) => ({
          done_week: o.done_week + Number(s.done_week || 0),
          due30_total: o.due30_total + Number(s.due30_total || 0),
          due30_done: o.due30_done + Number(s.due30_done || 0),
          overdue_count: o.overdue_count + Number(s.overdue_count || 0),
          overdue_days_sum: o.overdue_days_sum + Number(s.overdue_days_sum || 0)
        }), { done_week: 0, due30_total: 0, due30_done: 0, overdue_count: 0, overdue_days_sum: 0 });
        const compRate = agg.due30_total > 0 ? Math.round(100 * agg.due30_done / agg.due30_total) : null;
        const avgOverdue = agg.overdue_count > 0 ? Math.round(agg.overdue_days_sum / agg.overdue_count) : 0;
        const kpi = (label, value) => (
          <div style={{ flex: 1, minWidth: '130px', background: 'white', border: '0.5px solid var(--tw-border)', borderRadius: '12px', padding: '12px 16px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--tw-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--tw-ink)', marginTop: '4px' }}>{value}</div>
          </div>
        );
        const metricsStrip = (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {kpi('Faites cette semaine', agg.done_week)}
            {kpi('Taux de complétion (30j)', compRate === null ? '—' : compRate + ' %')}
            {kpi('Retard moyen', agg.overdue_count ? avgOverdue + ' j' : '—')}
            {kpi('En retard', late.length)}
          </div>
        );

        // Pastille de priorité cliquable (bascule Normale/Haute).
        const prioFlag = (a) => {
          const high = Number(a.priority) === 2;
          return <span onClick={e => { e.stopPropagation(); togglePriority(a); }} title={high ? 'Priorité haute — cliquer pour repasser en normale' : 'Priorité normale — cliquer pour passer en haute'} style={{ cursor: 'pointer', marginRight: '6px', color: high ? 'var(--danger)' : 'var(--meta)', fontSize: '13px' }}>{high ? '⚑' : '⚐'}</span>;
        };

        // Boutons d'action rapide (P1.1). stopPropagation pour ne pas déclencher l'ouverture de la fiche.
        const qBtn = { padding: '3px 8px', fontSize: '11.5px', fontWeight: 600, borderRadius: '6px', border: '0.5px solid var(--tw-border)', background: 'white', cursor: 'pointer', marginRight: '4px', whiteSpace: 'nowrap', fontFamily: 'inherit' };
        const doneBtn = { ...qBtn, color: 'var(--success)', borderColor: 'rgba(5,150,105,.35)' };
        const tableFor = (list, lateFlag) => {
          const sorted = applySort(list, { date: a => a.planned_date || '', societe: a => a.prospect_name, action: a => a.action_type });
          return (
          <table style={{ ...tableStyle, marginBottom: '24px' }}>
            <thead><tr>{SortTh('Date', 'date')}{SortTh('Société', 'societe')}{SortTh('Action', 'action')}<th style={th}>Acteur</th><th style={th}>Contact</th><th style={{ ...th, textAlign: 'right' }}>Suivi</th></tr></thead>
            <tbody>
              {sorted.map(a => (
                <tr key={a.id} style={{ cursor: 'pointer' }} {...rowHover} onClick={() => openFiche(a.prospect_id, a.affaire_id, 'prospect', a.prospect_id)}>
                  <td style={{ ...td, color: lateFlag ? 'var(--danger)' : 'var(--tw-ink)', fontWeight: lateFlag ? 600 : 400, whiteSpace: 'nowrap' }}>{fmtDate(a.planned_date)}</td>
                  <td style={{ ...td, ...lk }}>{a.prospect_name || '—'}</td>
                  <td style={td}>{prioFlag(a)}{a.action_type || '—'}</td>
                  <td style={td}>{a.actor || '—'}</td>
                  <td style={td}>{a.contact || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    <button style={doneBtn} title="Marquer cette action comme réalisée" onClick={() => openCompletion(a)}>Fait ?</button>
                    <button style={qBtn} title="Reporter à demain" onClick={() => rescheduleAction(a, plusDays(1))}>+1j</button>
                    <button style={qBtn} title="Reporter d'une semaine" onClick={() => rescheduleAction(a, plusDays(7))}>+7j</button>
                    <input type="date" title="Reprogrammer à une date précise" defaultValue={a.planned_date ? String(a.planned_date).slice(0, 10) : ''} onChange={e => rescheduleAction(a, e.target.value)} style={{ padding: '2px 6px', fontSize: '11.5px', borderRadius: '6px', border: '0.5px solid var(--tw-border)', fontFamily: 'inherit', color: 'var(--tw-ink)' }} />
                    <button style={{ ...qBtn, marginRight: 0, marginLeft: '4px' }} title="Modifier l'action" onClick={() => openEdit(a)}>✎</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          );
        };
        const lblStyle = { fontSize: '11px', color: 'var(--tw-muted)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' };
        const fldStyle = { width: '100%', padding: '8px 10px', border: '1px solid var(--tw-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', background: 'white', color: 'var(--tw-ink)', boxSizing: 'border-box' };
        return (
          <React.Fragment>
            {Wrap('Actions', `${late.length} en retard · ${upcoming.length} à venir`, <React.Fragment>{typeFilter}{commercialFilter}</React.Fragment>,
              <React.Fragment>
                {reopenable.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', background: 'var(--success-soft)', border: '1px solid rgba(5,150,105,.2)', borderRadius: '10px', padding: '8px 14px', marginBottom: '14px' }}>
                    <span style={{ fontSize: '12.5px', color: 'var(--tw-ink)', fontWeight: 600 }}>Terminé à l'instant :</span>
                    {reopenable.map(a => (
                      <span key={a.id} style={{ fontSize: '12.5px', color: 'var(--tw-slate)' }}>
                        {a.prospect_name} · {a.action_type}
                        <button onClick={() => reopenAction(a)} title="Rouvrir cette action (annuler la complétion)" style={{ marginLeft: '6px', padding: '2px 8px', borderRadius: '999px', border: '1px solid var(--tw-border)', background: 'white', color: 'var(--primary)', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Rouvrir</button>
                      </span>
                    ))}
                    <button onClick={() => setReopenable([])} title="Masquer" style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--tw-muted)', cursor: 'pointer', fontSize: '13px' }}>✕</button>
                  </div>
                )}
                {metricsStrip}
                <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--danger)', margin: '4px 0 10px' }}>⚠ En retard ({late.length})</h2>
                {late.length === 0 ? Empty('Aucune action en retard 🎉') : tableFor(late, true)}
                <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--tw-ink)', margin: '8px 0 10px' }}>À venir / en cours ({upcoming.length})</h2>
                {upcoming.length === 0 ? Empty('Aucune action à venir.') : tableFor(upcoming, false)}
              </React.Fragment>
            )}
            {completion && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,31,78,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setCompletion(null)}>
                <div style={{ background: 'white', borderRadius: 'var(--r-md)', padding: '22px 24px', width: '420px', maxWidth: '92vw', boxShadow: 'var(--sh-md)' }} onClick={e => e.stopPropagation()}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--tw-ink)', marginBottom: '4px' }}>Action terminée</h3>
                  <p style={{ fontSize: '13px', color: 'var(--tw-muted)', marginBottom: '16px' }}>{completion.action.prospect_name} — {completion.action.action_type}</p>
                  <label style={lblStyle}>Résultat de l'action (optionnel)</label>
                  <textarea value={completion.resultNote} onChange={e => setCompletion({ ...completion, resultNote: e.target.value })} rows={3} placeholder="Ex. : joint, rappeler mardi ; devis à envoyer ; pas intéressé…" style={{ ...fldStyle, marginBottom: '16px', resize: 'vertical' }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--tw-ink)', fontWeight: 600, marginBottom: '12px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={completion.createNext} onChange={e => setCompletion({ ...completion, createNext: e.target.checked })} />
                    Programmer une prochaine action
                  </label>
                  {completion.createNext && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                      <div>
                        <label style={lblStyle}>Type</label>
                        <select value={completion.nextType} onChange={e => setCompletion({ ...completion, nextType: e.target.value })} style={fldStyle}>
                          {ACTION_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={lblStyle}>Date prévue</label>
                        <input type="date" value={completion.nextDate} onChange={e => setCompletion({ ...completion, nextDate: e.target.value })} style={fldStyle} />
                      </div>
                      <div style={{ gridColumn: '1 / span 2' }}>
                        <label style={lblStyle}>Priorité</label>
                        <select value={completion.nextPriority} onChange={e => setCompletion({ ...completion, nextPriority: Number(e.target.value) })} style={fldStyle}>
                          <option value={1}>Normale</option>
                          <option value={2}>Haute</option>
                        </select>
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setCompletion(null)} style={{ padding: '8px 16px', borderRadius: '999px', border: '1px solid var(--tw-border)', background: 'white', color: 'var(--tw-slate)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
                    <button onClick={validateCompletion} style={{ padding: '8px 16px', borderRadius: '999px', border: 'none', background: 'var(--primary)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Valider</button>
                  </div>
                </div>
              </div>
            )}
            {editing && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(11,31,78,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setEditing(null)}>
                <div style={{ background: 'white', borderRadius: 'var(--r-md)', padding: '22px 24px', width: '440px', maxWidth: '92vw', boxShadow: 'var(--sh-md)' }} onClick={e => e.stopPropagation()}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--tw-ink)', marginBottom: '4px' }}>Modifier l'action</h3>
                  <p style={{ fontSize: '13px', color: 'var(--tw-muted)', marginBottom: '16px' }}>{editing.prospect_name}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <label style={lblStyle}>Type</label>
                      <select value={editing.action_type} onChange={e => setEditing({ ...editing, action_type: e.target.value })} style={fldStyle}>
                        {ACTION_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lblStyle}>Date prévue</label>
                      <input type="date" value={editing.planned_date} onChange={e => setEditing({ ...editing, planned_date: e.target.value })} style={fldStyle} />
                    </div>
                    <div>
                      <label style={lblStyle}>Acteur</label>
                      <input type="text" value={editing.actor} onChange={e => setEditing({ ...editing, actor: e.target.value })} placeholder="De…" style={fldStyle} />
                    </div>
                    <div>
                      <label style={lblStyle}>Contact</label>
                      <input type="text" value={editing.contact} onChange={e => setEditing({ ...editing, contact: e.target.value })} placeholder="Vers…" style={fldStyle} />
                    </div>
                    <div style={{ gridColumn: '1 / span 2' }}>
                      <label style={lblStyle}>Priorité</label>
                      <select value={editing.priority} onChange={e => setEditing({ ...editing, priority: Number(e.target.value) })} style={fldStyle}>
                        <option value={1}>Normale</option>
                        <option value={2}>Haute</option>
                      </select>
                    </div>
                  </div>
                  <label style={lblStyle}>Commentaire</label>
                  <textarea value={editing.completed_note} onChange={e => setEditing({ ...editing, completed_note: e.target.value })} rows={2} placeholder="Optionnel" style={{ ...fldStyle, marginBottom: '20px', resize: 'vertical' }} />
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditing(null)} style={{ padding: '8px 16px', borderRadius: '999px', border: '1px solid var(--tw-border)', background: 'white', color: 'var(--tw-slate)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
                    <button onClick={saveEdit} style={{ padding: '8px 16px', borderRadius: '999px', border: 'none', background: 'var(--primary)', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Enregistrer</button>
                  </div>
                </div>
              </div>
            )}
          </React.Fragment>
        );
      }

      return null;
    }

