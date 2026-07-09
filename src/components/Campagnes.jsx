import * as React from 'react';

    // ===================================================================
    // COMPOSANT CampagnesPage — Page envoi de campagnes Brevo (Session 2)
    // ===================================================================
    // Workflow utilisateur :
    // 1. Choisir la cible commerciale (Client/Prospect/Suspect/Tous)
    // 2. Choisir le profil (Tous / Décideurs uniquement)
    // 3. La liste filtrée s'affiche : Société (alpha) | Prénom | Nom | Fonction | Email
    //    - Case "Tout sélectionner" en en-tête
    //    - Case par ligne (les opt-out sont affichés mais décochés par défaut)
    // 4. Choisir la campagne Brevo (dropdown des brouillons)
    // 5. Bouton "Envoi de test" → envoie à c.daumer@texaswin.fr
    // 6. Bouton "Envoyer" → modal confirmation → POST /api/brevo/send-campaign
    // ===================================================================
    // COMPOSANT CampagnesVue — Cartes campagnes opt-in (En cours / Terminées)
    // Alimenté par GET /api/optin/campaigns. statut = 'en_cours' | 'terminee'.
    // ===================================================================
    function CampagnesVue({ user, API_URL, statut }) {
      const [data, setData] = React.useState(null);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState(null);
      // Contacts en attente regroupés par séquence (pour la liste dépliable par campagne)
      const [seqContacts, setSeqContacts] = React.useState({});
      const [openCards, setOpenCards] = React.useState(() => new Set());
      const [config, setConfig] = React.useState(null);   // config séquence (brevo_id par vague)
      const [processing, setProcessing] = React.useState(false);
      const [feedback, setFeedback] = React.useState(null);
      const token = () => (user && user.token) ? user.token : null;
      const authH = () => ({ 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' });

      const load = React.useCallback(() => {
        setLoading(true); setError(null);
        const H = { 'Authorization': 'Bearer ' + token() };
        Promise.all([
          fetch(`${API_URL}/optin/campaigns`, { headers: H }).then(r => r.json().then(d => ({ ok: r.ok, d }))),
          fetch(`${API_URL}/optin/sequence`, { headers: H }).then(r => r.json()).catch(() => ({})),
          fetch(`${API_URL}/optin/config`, { headers: H }).then(r => r.json()).catch(() => ({}))
        ])
          .then(([camp, seq, cfg]) => {
            if (!camp.ok) { setError(camp.d.error || 'Erreur'); }
            else setData(camp.d);
            setConfig(cfg || {});
            // Regroupe tous les contacts encore dans la séquence par sequence_id,
            // avec un libellé d'état lisible (à relancer / en attente / à clôturer).
            const buckets = [
              ...(seq.relance1 || []).map(c => ({ ...c, _etat: 'due', _lbl: 'Relance 1 à faire' })),
              ...(seq.relance2 || []).map(c => ({ ...c, _etat: 'due', _lbl: 'Relance 2 à faire' })),
              ...(seq.relanceSuivantes || []).map(c => ({ ...c, _etat: 'due', _lbl: 'Relance ' + (c.prochaine_vague || (c.etape + 1)) + ' à faire' })),
              ...(seq.cloture || []).map(c => ({ ...c, _etat: 'cloture', _lbl: 'À clôturer' })),
              ...(seq.enAttente || []).map(c => ({ ...c, _etat: 'attente', _lbl: 'En attente' }))
            ];
            const map = {};
            buckets.forEach(c => { const k = c.sequence_id || '_'; (map[k] = map[k] || []).push(c); });
            setSeqContacts(map);
          })
          .catch(e => setError('Erreur réseau: ' + e.message))
          .finally(() => setLoading(false));
      }, [API_URL]);

      React.useEffect(() => { load(); }, [load]);

      const toggleCard = (sid) => setOpenCards(s => { const n = new Set(s); n.has(sid) ? n.delete(sid) : n.add(sid); return n; });

      // brevo_id de la campagne de relance pour la vague N (1 = relance 1…)
      const brevoIdPourVague = (vague) => {
        const et = (config?.etapes_json || [])[vague - 1];
        if (et && et.brevo_id) return et.brevo_id;
        if (vague === 1) return config?.campagne_relance1_id || null;
        if (vague === 2) return config?.campagne_relance2_id || null;
        return null;
      };

      // Envoie les relances DUES d'UNE campagne. Les contacts dus peuvent être à des
      // vagues différentes → on regroupe par vague et on envoie chaque groupe avec
      // sa propre campagne Brevo, puis on avance l'étape.
      const envoyerRelancesCampagne = async (campNom, contacts) => {
        const due = contacts.filter(c => c._etat === 'due');
        if (due.length === 0) return;
        const parVague = {};
        due.forEach(c => { const v = c.prochaine_vague || (c.etape + 1); (parVague[v] = parVague[v] || []).push(c); });
        const vagues = Object.keys(parVague).map(Number).sort((a, b) => a - b);
        const manquantes = vagues.filter(v => !brevoIdPourVague(v));
        if (manquantes.length) { alert(`Aucune campagne Brevo configurée pour la relance ${manquantes.join(', ')}. Configure la séquence dans « Actions de relance groupées ».`); return; }
        if (!window.confirm(`Envoyer ${due.length} relance(s) dues pour « ${campNom} » ?`)) return;
        setProcessing(true); setFeedback(null);
        try {
          let total = 0;
          for (const v of vagues) {
            const ids = parVague[v].map(c => c.id);
            const sR = await fetch(`${API_URL}/brevo/send-campaign`, { method: 'POST', headers: authH(), body: JSON.stringify({ campaignId: parseInt(brevoIdPourVague(v)), contactIds: ids, mode: 'opt_in_request', filtres: { type: 'demande_optin' } }) });
            const sD = await sR.json();
            if (!sR.ok) throw new Error(`Relance ${v} : ${sD.error || 'envoi échoué'}`);
            await fetch(`${API_URL}/optin/avancer-etape`, { method: 'POST', headers: authH(), body: JSON.stringify({ contactIds: ids, etape_cible: v }) });
            total += ids.length;
          }
          setFeedback({ type: 'success', msg: `« ${campNom} » : ${total} relance(s) envoyée(s).` });
          load();
        } catch (e) { setFeedback({ type: 'error', msg: e.message }); } finally { setProcessing(false); }
      };

      // Clôture les contacts d'UNE campagne arrivés en bout de séquence.
      const cloturerCampagne = async (campNom, contacts) => {
        const aClore = contacts.filter(c => c._etat === 'cloture');
        if (aClore.length === 0) return;
        if (!window.confirm(`Clôturer ${aClore.length} contact(s) pour « ${campNom} » ? Ils retournent en « non sollicité » et ne seront plus relancés.`)) return;
        setProcessing(true); setFeedback(null);
        try {
          const ids = aClore.map(c => c.id);
          const r = await fetch(`${API_URL}/optin/cloturer`, { method: 'POST', headers: authH(), body: JSON.stringify({ contactIds: ids }) });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || 'Erreur clôture');
          setFeedback({ type: 'success', msg: `« ${campNom} » : ${d.cloture || ids.length} contact(s) clôturé(s).` });
          load();
        } catch (e) { setFeedback({ type: 'error', msg: e.message }); } finally { setProcessing(false); }
      };

      const fmtD = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
      const fmtDM = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '—';

      const Stat = ({ n, k, color }) => (
        <div style={{flex: 1, minWidth: '92px', background: 'var(--tw-bg)', borderRadius: '11px', padding: '13px 14px'}}>
          <div style={{fontSize: '22px', fontWeight: 800, lineHeight: 1, color: color || 'var(--tw-ink)'}}>{n}</div>
          <div style={{fontSize: '11px', color: 'var(--tw-muted)', marginTop: '5px'}}>{k}</div>
        </div>
      );

      // Stepper : Mail 1 + N relances + Clôture
      const renderStepper = (camp) => {
        const sentEtapes = new Set((camp.vagues || []).map(v => v.etape));
        const dateByEtape = {};
        (camp.vagues || []).forEach(v => { dateByEtape[v.etape] = v.date; });
        const steps = [{ cap: 'Mail 1', etape: 0 }];
        for (let i = 1; i <= (camp.nb_relances_config || 0); i++) steps.push({ cap: 'Relance ' + i, etape: i });
        steps.push({ cap: 'Clôture', etape: (camp.nb_relances_config || 0) + 1, final: true });
        const nextEtape = (camp.statut === 'terminee') ? -1 : (camp.prochaine_vague != null ? camp.prochaine_vague : -1);
        return (
          <div style={{display: 'flex', alignItems: 'center', margin: '16px 0 4px'}}>
            {steps.map((s, idx) => {
              const done = sentEtapes.has(s.etape);
              const current = !done && s.etape === nextEtape;
              const dot = done ? '✓' : (s.final ? '★' : String(s.etape + 1));
              const bg = done ? 'var(--tw-green)' : current ? 'var(--tw-teal)' : '#fff';
              const bd = done ? 'var(--tw-green)' : current ? 'var(--tw-teal)' : 'var(--tw-border)';
              const col = (done || current) ? '#fff' : 'var(--tw-muted)';
              return (
                <React.Fragment key={idx}>
                  <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', width: '90px', flexShrink: 0}}>
                    <div style={{width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, background: bg, border: '2px solid ' + bd, color: col, boxShadow: current ? '0 0 0 4px #e6f5f5' : 'none'}}>{dot}</div>
                    <div style={{fontSize: '11px', fontWeight: 600, marginTop: '6px', color: 'var(--tw-slate)', textAlign: 'center'}}>{s.cap}</div>
                    <div style={{fontSize: '10px', color: 'var(--tw-muted)'}}>{done ? fmtDM(dateByEtape[s.etape]) : (current ? 'à venir' : '—')}</div>
                  </div>
                  {idx < steps.length - 1 && <div style={{flex: 1, height: '3px', background: done ? 'var(--tw-green)' : 'var(--tw-border)', marginTop: '-28px', borderRadius: '2px'}}></div>}
                </React.Fragment>
              );
            })}
          </div>
        );
      };

      if (loading) return <div style={{padding: '30px', textAlign: 'center', color: 'var(--tw-muted)', fontSize: '13px'}}>Chargement…</div>;
      if (error) return <div style={{padding: '20px', color: '#a52d2d', fontSize: '13px'}}>Erreur : {error}</div>;
      const list = (data && (statut === 'terminee' ? data.terminees : data.en_cours)) || [];
      if (list.length === 0) return <div style={{padding: '40px 20px', textAlign: 'center', color: 'var(--tw-muted)', fontSize: '13px'}}>{statut === 'terminee' ? 'Aucune campagne terminée pour le moment.' : 'Aucune campagne en cours. Lance-en une depuis « Créer une campagne ».'}</div>;

      return (
        <div>
          {feedback && (
            <div style={{padding: '11px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', background: feedback.type === 'success' ? '#e6f7ec' : '#fde8e8', color: feedback.type === 'success' ? '#0d7d39' : '#a52d2d'}}>{feedback.msg}</div>
          )}
          {list.map(camp => (
            <div key={camp.sequence_id} style={{background: '#fff', border: '1px solid var(--tw-border)', borderRadius: '14px', padding: '22px', marginBottom: '18px', boxShadow: '0 1px 2px rgba(20,40,40,.03)'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px'}}>
                <div>
                  <div style={{fontSize: '16px', fontWeight: 700, color: 'var(--tw-ink)'}}>🎯 {camp.nom}
                    <span style={{fontSize: '11px', fontWeight: 700, padding: '3px 11px', borderRadius: '20px', marginLeft: '10px', background: statut === 'terminee' ? '#e6f7ec' : '#eaf6ff', color: statut === 'terminee' ? 'var(--tw-green)' : '#1a6aa8'}}>{statut === 'terminee' ? 'Terminée' : 'En cours'}</span>
                  </div>
                  <div style={{fontSize: '12px', color: 'var(--tw-muted)', marginTop: '3px'}}>
                    {statut === 'terminee' ? `${fmtD(camp.date_debut)} → ${fmtD(camp.date_fin)}` : `Démarrée le ${fmtD(camp.date_debut)}`} · {camp.nb_contacts} contact{camp.nb_contacts > 1 ? 's' : ''} · {(camp.vagues || []).length} mail{(camp.vagues || []).length > 1 ? 's' : ''} envoyé{(camp.vagues || []).length > 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {renderStepper(camp)}

              <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '18px'}}>
                <Stat n={camp.nb_contacts} k="Contacts" />
                <Stat n={camp.nb_optin} k="Opt-in obtenus" color="var(--tw-teal)" />
                <Stat n={camp.nb_en_attente} k="En attente" color="var(--tw-orange)" />
                <Stat n={camp.taux_conversion + '%'} k="Taux conversion" color="var(--tw-green)" />
              </div>

              {statut !== 'terminee' && (
                <div style={{display: 'flex', alignItems: 'center', gap: '14px', background: '#eef9f6', border: '1px solid #cfe9e2', borderRadius: '11px', padding: '13px 16px', marginTop: '18px'}}>
                  {camp.nb_due > 0 ? (
                    <div style={{fontSize: '13px', fontWeight: 600, color: '#0a5c4f'}}>📨 <b>{camp.nb_due} contact{camp.nb_due > 1 ? 's' : ''}</b> sans réaction → relance {camp.prochaine_vague} à envoyer. <span style={{fontWeight: 400, color: 'var(--tw-slate)'}}>(bouton « Envoyer les relances dues » ci-dessous)</span></div>
                  ) : camp.echeance_prochaine ? (
                    <div style={{fontSize: '13px', fontWeight: 600, color: '#0a5c4f'}}>⏳ Prochaine relance (Relance {camp.prochaine_vague}) à prévoir vers le <b>{fmtD(camp.echeance_prochaine)}</b>.</div>
                  ) : (
                    <div style={{fontSize: '13px', fontWeight: 600, color: '#0a5c4f'}}>{camp.nb_en_attente} contact{camp.nb_en_attente > 1 ? 's' : ''} en attente de réponse.</div>
                  )}
                </div>
              )}

              {/* Liste dépliable des contacts de CETTE campagne */}
              {(() => {
                const contacts = seqContacts[camp.sequence_id] || [];
                const open = openCards.has(camp.sequence_id);
                const nbDue = contacts.filter(c => c._etat === 'due').length;
                const nbClore = contacts.filter(c => c._etat === 'cloture').length;
                const etatStyle = (e) => e === 'due' ? { c: 'var(--primary)', bg: 'var(--primary-soft)' } : e === 'cloture' ? { c: 'var(--danger)', bg: 'var(--danger-soft)' } : { c: 'var(--warning)', bg: 'var(--warning-soft)' };
                return (
                  <div style={{marginTop: '14px'}}>
                    {/* Barre d'actions PROPRES à cette campagne */}
                    {statut !== 'terminee' && (nbDue > 0 || nbClore > 0) && (
                      <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px'}}>
                        {nbDue > 0 && (
                          <button onClick={() => envoyerRelancesCampagne(camp.nom, contacts)} disabled={processing} style={{padding: '8px 14px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', cursor: processing ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 600}}>📨 Envoyer les relances dues ({nbDue})</button>
                        )}
                        {nbClore > 0 && (
                          <button onClick={() => cloturerCampagne(camp.nom, contacts)} disabled={processing} style={{padding: '8px 14px', background: 'white', color: '#a52d2d', border: '1px solid #a52d2d', borderRadius: '8px', cursor: processing ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 600}}>Clôturer ({nbClore})</button>
                        )}
                      </div>
                    )}
                    <button onClick={() => toggleCard(camp.sequence_id)} disabled={contacts.length === 0} style={{display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'space-between', padding: '11px 14px', background: '#f7f9fa', border: '1px solid var(--tw-border)', borderRadius: '10px', cursor: contacts.length === 0 ? 'default' : 'pointer', fontSize: '13px', fontWeight: 600, color: contacts.length === 0 ? 'var(--tw-muted)' : 'var(--tw-ink)'}}>
                      <span>👥 Contacts en cours dans cette campagne ({contacts.length})</span>
                      {contacts.length > 0 && <span style={{fontSize: '12px', color: 'var(--tw-muted)'}}>{open ? '▲ masquer' : '▼ voir'}</span>}
                    </button>
                    {open && contacts.length > 0 && (
                      <div style={{border: '1px solid var(--tw-border)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '6px 0', marginTop: '-4px', overflowX: 'auto'}}>
                        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '12px'}}>
                          <thead>
                            <tr style={{borderBottom: '1px solid var(--tw-border)', textAlign: 'left'}}>
                              <th style={{padding: '7px 12px', fontWeight: 600, color: 'var(--tw-slate)'}}>Société</th>
                              <th style={{padding: '7px 12px', fontWeight: 600, color: 'var(--tw-slate)'}}>Contact</th>
                              <th style={{padding: '7px 12px', fontWeight: 600, color: 'var(--tw-slate)'}}>Email</th>
                              <th style={{padding: '7px 12px', fontWeight: 600, color: 'var(--tw-slate)'}}>État</th>
                              <th style={{padding: '7px 12px', fontWeight: 600, color: 'var(--tw-slate)'}}>Échéance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contacts.map(c => { const s = etatStyle(c._etat); return (
                              <tr key={c.id} style={{borderBottom: '0.5px solid var(--tw-border)'}}>
                                <td style={{padding: '7px 12px', color: 'var(--tw-ink)', fontWeight: 500}}>{c.societe}</td>
                                <td style={{padding: '7px 12px', color: 'var(--tw-slate)'}}>{[c.prenom, c.nom].filter(Boolean).join(' ') || '—'}</td>
                                <td style={{padding: '7px 12px', color: 'var(--tw-slate)'}}>{c.email}</td>
                                <td style={{padding: '7px 12px'}}><span style={{fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '20px', background: s.bg, color: s.c, whiteSpace: 'nowrap'}}>{c._lbl}</span></td>
                                <td style={{padding: '7px 12px', color: 'var(--tw-muted)', whiteSpace: 'nowrap'}}>{fmtD(c.echeance)}</td>
                              </tr>
                            ); })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      );
    }

    // ===================================================================
    // COMPOSANT CampagnesHistorique — Historique + stats des envois
    // ===================================================================
    function CampagnesHistorique({ user, API_URL }) {
      const [envois, setEnvois] = React.useState([]);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [expandedId, setExpandedId] = React.useState(null);
      const [statsCache, setStatsCache] = React.useState({});
      const [statsLoading, setStatsLoading] = React.useState(null);

      const token = () => (user && user.token) ? user.token : null;

      React.useEffect(() => {
        setLoading(true);
        setError(null);
        fetch(`${API_URL}/brevo/envois?limit=100`, { headers: { 'Authorization': 'Bearer ' + token() } })
          .then(r => r.json().then(data => ({ ok: r.ok, data })))
          .then(({ ok, data }) => {
            if (!ok) { setError(data.error || 'Erreur de chargement'); setEnvois([]); }
            else setEnvois(data.envois || []);
          })
          .catch(err => { setError('Erreur réseau: ' + err.message); setEnvois([]); })
          .finally(() => setLoading(false));
      }, [API_URL]);

      const loadStats = (brevoCampaignId) => {
        if (!brevoCampaignId || statsCache[brevoCampaignId]) return;
        setStatsLoading(brevoCampaignId);
        fetch(`${API_URL}/brevo/campaign-stats/${brevoCampaignId}`, { headers: { 'Authorization': 'Bearer ' + token() } })
          .then(r => r.json().then(data => ({ ok: r.ok, data })))
          .then(({ ok, data }) => { if (ok) setStatsCache(prev => ({ ...prev, [brevoCampaignId]: data })); })
          .catch(err => console.error('Stats error:', err))
          .finally(() => setStatsLoading(null));
      };

      const toggleExpand = (envoi) => {
        const cid = envoi.brevo_campaign_id_envoi || envoi.brevo_campaign_id_source;
        if (expandedId === envoi.id) setExpandedId(null);
        else { setExpandedId(envoi.id); loadStats(cid); }
      };

      // Archive un envoi (soft delete) : le retire de la liste affichée.
      // La ligne reste en BDD (traçabilité RGPD), elle est juste masquée.
      const archiveEnvoi = (envoiId, e) => {
        e.stopPropagation(); // évite de déplier la ligne au clic sur le bouton
        if (!window.confirm('Archiver cet envoi ? Il sera masqué de l\'historique (mais conservé en base pour la traçabilité).')) return;
        fetch(`${API_URL}/brevo/envois/${envoiId}/archive`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ archived: true })
        })
          .then(r => r.json().then(data => ({ ok: r.ok, data })))
          .then(({ ok }) => {
            if (ok) setEnvois(prev => prev.filter(x => x.id !== envoiId));
          })
          .catch(err => alert('Erreur : ' + err.message));
      };

      const statutBadge = (statut) => {
        const map = {
          'sent': { label: 'Envoyé', bg: 'var(--success-soft)', col: 'var(--success)' },
          'sent_unverified': { label: 'Envoyé (non vérifié)', bg: 'var(--warning-soft)', col: 'var(--warning)' },
          'failed': { label: 'Échec', bg: 'var(--danger-soft)', col: 'var(--danger)' },
          'failed_after_send': { label: 'Suspendu', bg: 'var(--danger-soft)', col: 'var(--danger)' },
          'pending': { label: 'En attente', bg: 'var(--surface-hover)', col: 'var(--text-2)' }
        };
        const s = map[statut] || { label: statut, bg: 'var(--surface-hover)', col: 'var(--text-2)' };
        return <span style={{fontSize:'11px', color:s.col, background:s.bg, padding:'2px 8px', borderRadius:'4px', fontWeight:500}}>{s.label}</span>;
      };

      const fmtDate = (d) => d ? new Date(d).toLocaleString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
      const fmtDateShort = (d) => d ? new Date(d).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
      // +N jours ouvrés (indicatif : ignore les jours fériés ; le serveur applique le calcul exact)
      const addBusinessDays = (d, n) => { const r = new Date(d); let a = 0; while (a < n) { r.setDate(r.getDate()+1); const w = r.getDay(); if (w !== 0 && w !== 6) a++; } return r; };
      // Non-réactifs = délivrés mais ni ouverts ni cliqués, non désabonnés (cible d'une éventuelle relance)
      const countNonReactifs = (st) => (st && Array.isArray(st.recipients)) ? st.recipients.filter(r => r.delivered && !r.opened && !r.clicked && !r.unsubscribed).length : null;

      // Bloc "stats agrégées + détail par destinataire" d'un envoi (réutilisé pour chaque mail et les envois isolés)
      const renderStatsDetail = (envoi) => {
        if (envoi.statut === 'failed' || envoi.statut === 'failed_after_send')
          return <div style={{fontSize:'13px', color:'#a52d2d'}}>{envoi.erreur_message || 'Envoi échoué'}</div>;
        const cid = envoi.brevo_campaign_id_envoi || envoi.brevo_campaign_id_source;
        const stats = statsCache[cid];
        if (!stats) return <div style={{fontSize:'13px', color:'var(--tw-muted)'}}>Chargement des statistiques Brevo…</div>;
        return (
          <div>
            {stats.aggregated ? (
              <div style={{display:'flex', gap:'24px', flexWrap:'wrap', marginBottom:'16px'}}>
                <div><div style={{fontSize:'22px', fontWeight:700, color:'var(--tw-ink)'}}>{stats.aggregated.delivered}</div><div style={{fontSize:'11px', color:'var(--tw-muted)'}}>Délivrés ({stats.aggregated.tauxDelivrabilite}%)</div></div>
                <div><div style={{fontSize:'22px', fontWeight:700, color:'#0d7d39'}}>{stats.aggregated.uniqueOpens}</div><div style={{fontSize:'11px', color:'var(--tw-muted)'}}>Ouvertures ({stats.aggregated.tauxOuverture}%)</div></div>
                <div><div style={{fontSize:'22px', fontWeight:700, color:'var(--primary)'}}>{stats.aggregated.uniqueClicks}</div><div style={{fontSize:'11px', color:'var(--tw-muted)'}}>Clics ({stats.aggregated.tauxClic}%)</div></div>
                <div><div style={{fontSize:'22px', fontWeight:700, color:'#a52d2d'}}>{stats.aggregated.hardBounces + stats.aggregated.softBounces}</div><div style={{fontSize:'11px', color:'var(--tw-muted)'}}>Bounces</div></div>
                <div><div style={{fontSize:'22px', fontWeight:700, color:'#b97800'}}>{stats.aggregated.unsubscriptions}</div><div style={{fontSize:'11px', color:'var(--tw-muted)'}}>Désabos</div></div>
              </div>
            ) : (
              <div style={{fontSize:'13px', color:'var(--tw-muted)', marginBottom:'12px'}}>Stats Brevo indisponibles{stats.brevo_error ? ` (${stats.brevo_error})` : ''}.</div>
            )}
            {stats.recipients && stats.recipients.length > 0 ? (
              <div style={{marginTop:'8px'}}>
                <div style={{fontSize:'12px', fontWeight:600, color:'var(--tw-slate)', marginBottom:'8px', textTransform:'uppercase', letterSpacing:'0.5px'}}>Détail par destinataire</div>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%', borderCollapse:'collapse', fontSize:'12px'}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid var(--tw-border)', textAlign:'left'}}>
                        <th style={{padding:'6px 8px', fontWeight:600, color:'var(--tw-slate)'}}>Prénom</th>
                        <th style={{padding:'6px 8px', fontWeight:600, color:'var(--tw-slate)'}}>Nom</th>
                        <th style={{padding:'6px 8px', fontWeight:600, color:'var(--tw-slate)'}}>Email</th>
                        <th style={{padding:'6px 8px', fontWeight:600, color:'var(--tw-slate)', textAlign:'center'}}>Délivré</th>
                        <th style={{padding:'6px 8px', fontWeight:600, color:'var(--tw-slate)', textAlign:'center'}}>Ouvert</th>
                        <th style={{padding:'6px 8px', fontWeight:600, color:'var(--tw-slate)', textAlign:'center'}}>Cliqué</th>
                        <th style={{padding:'6px 8px', fontWeight:600, color:'var(--tw-slate)', textAlign:'center'}}>Bounce</th>
                        <th style={{padding:'6px 8px', fontWeight:600, color:'var(--tw-slate)', textAlign:'center'}}>Désabo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recipients.map((r, i) => {
                        const check = (on, color) => on ? <span style={{color, fontWeight:700}}>✓</span> : <span style={{color:'var(--tw-border)'}}>—</span>;
                        return (
                          <tr key={i} style={{borderBottom:'0.5px solid var(--tw-border)', background: r.bounced ? '#fef9f9' : 'white'}}>
                            <td style={{padding:'6px 8px', color:'var(--tw-slate)'}}>{r.prenom || ''}</td>
                            <td style={{padding:'6px 8px', color:'var(--tw-ink)', fontWeight:500}}>{r.nom || ''}</td>
                            <td style={{padding:'6px 8px', color:'var(--tw-slate)'}}>{r.email}</td>
                            <td style={{padding:'6px 8px', textAlign:'center'}}>{check(r.delivered, '#0d7d39')}</td>
                            <td style={{padding:'6px 8px', textAlign:'center'}}>{check(r.opened, '#0d7d39')}</td>
                            <td style={{padding:'6px 8px', textAlign:'center'}}>{check(r.clicked, 'var(--primary)')}</td>
                            <td style={{padding:'6px 8px', textAlign:'center'}}>{check(r.bounced, '#a52d2d')}</td>
                            <td style={{padding:'6px 8px', textAlign:'center'}}>{check(r.unsubscribed, '#b97800')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              stats.aggregated && <div style={{fontSize:'12px', color:'var(--tw-muted)', fontStyle:'italic', marginTop:'8px'}}>Détail par destinataire pas encore disponible (événements webhook en cours de réception).</div>
            )}
          </div>
        );
      };

      // Carte d'un envoi ISOLÉ (campagne hors séquence opt-in) — comportement historique
      const renderEnvoiCard = (e) => {
        const isExpanded = expandedId === e.id;
        return (
          <div key={e.id} style={{border:'0.5px solid var(--tw-border)', borderRadius:'10px', marginBottom:'10px', overflow:'hidden', background:'white'}}>
            <div onClick={() => toggleExpand(e)} style={{padding:'14px 18px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px'}}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:'14px', fontWeight:600, color:'var(--tw-ink)'}}>
                  {e.campagne_nom || `Campagne #${e.brevo_campaign_id_source}`}
                  <span style={{fontSize:'12px', color:'var(--tw-muted)', fontWeight:400, marginLeft:'8px'}}>#{e.brevo_campaign_id_source}</span>
                </div>
                <div style={{fontSize:'12px', color:'var(--tw-muted)', marginTop:'3px'}}>
                  {e.campagne_objet && <span>"{e.campagne_objet}" · </span>}
                  {fmtDate(e.sent_at || e.created_at)}
                  {e.envoye_par_nom && <span> · par {e.envoye_par_nom}</span>}
                </div>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:'10px', flexShrink:0}}>
                <span style={{fontSize:'12px', color:'var(--tw-slate)'}}>{e.nb_contacts_envoyes} envoyé{e.nb_contacts_envoyes > 1 ? 's' : ''}</span>
                {statutBadge(e.statut)}
                <button onClick={(ev) => archiveEnvoi(e.id, ev)} title="Archiver cet envoi (le masquer de l'historique)" style={{background:'transparent', border:'none', cursor:'pointer', color:'var(--tw-muted)', fontSize:'14px', padding:'2px 6px', borderRadius:'4px', lineHeight:1}}>🗑</button>
                <span style={{color:'var(--tw-muted)', fontSize:'12px'}}>{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>
            {isExpanded && (
              <div style={{borderTop:'0.5px solid var(--tw-border)', padding:'16px 18px', background:'var(--tw-bg)'}}>
                {renderStatsDetail(e)}
              </div>
            )}
          </div>
        );
      };

      // Ouvre/ferme une SÉQUENCE et charge les stats de TOUS ses mails
      const toggleSequence = (seq) => {
        if (expandedId === seq.sid) { setExpandedId(null); return; }
        setExpandedId(seq.sid);
        seq.mails.forEach(m => loadStats(m.brevo_campaign_id_envoi || m.brevo_campaign_id_source));
      };

      // Carte d'une SÉQUENCE opt-in (Mail 1 + relances regroupés en timeline)
      const renderSequenceCard = (seq) => {
        const isExp = expandedId === seq.sid;
        const nbMails = seq.mails.length;
        const startDate = seq.first.sent_at || seq.first.created_at;
        // Nom de campagne sans le suffixe "Mail N" pour un titre propre
        const campName = (seq.first.campagne_nom || 'Campagne opt-in').replace(/\s*-?\s*Mail\s*\d+\s*$/i, '').trim() || 'Campagne opt-in';
        const complete = (seq.last.sequence_etape || 0) >= 2; // Mail 3 envoyé = séquence complète
        const lastCid = seq.last.brevo_campaign_id_envoi || seq.last.brevo_campaign_id_source;
        const nonReactifs = countNonReactifs(statsCache[lastCid]);
        const allDone = (nonReactifs === 0);
        return (
          <div key={seq.sid} style={{border:'0.5px solid var(--tw-border)', borderRadius:'10px', marginBottom:'10px', overflow:'hidden', background:'white'}}>
            <div onClick={() => toggleSequence(seq)} style={{padding:'14px 18px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px'}}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:'14px', fontWeight:600, color:'var(--tw-ink)'}}>
                  🎯 {campName}
                  <span style={{fontSize:'12px', color:'var(--tw-muted)', fontWeight:400, marginLeft:'8px'}}>séquence opt-in</span>
                </div>
                <div style={{fontSize:'12px', color:'var(--tw-muted)', marginTop:'3px'}}>
                  Démarrée le {fmtDateShort(startDate)} · {nbMails} mail{nbMails > 1 ? 's' : ''} envoyé{nbMails > 1 ? 's' : ''}
                </div>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:'10px', flexShrink:0}}>
                <span style={{fontSize:'11px', fontWeight:600, padding:'2px 8px', borderRadius:'10px', background: (complete || allDone) ? '#e6f7ec' : '#eef4fb', color: (complete || allDone) ? '#0d7d39' : '#1a6aa8'}}>
                  {(complete || allDone) ? 'Terminée' : `Étape ${nbMails}/3`}
                </span>
                <span style={{color:'var(--tw-muted)', fontSize:'12px'}}>{isExp ? '▲' : '▼'}</span>
              </div>
            </div>
            {isExp && (
              <div style={{borderTop:'0.5px solid var(--tw-border)', padding:'16px 18px', background:'var(--tw-bg)'}}>
                {seq.mails.map(m => {
                  const etape = m.sequence_etape || 0;
                  const mStats = statsCache[m.brevo_campaign_id_envoi || m.brevo_campaign_id_source];
                  const sentTo = (mStats && mStats.recipients) ? mStats.recipients.length : m.nb_contacts_envoyes;
                  return (
                    <div key={m.id} style={{marginBottom:'18px', paddingBottom:'14px', borderBottom:'1px dashed var(--tw-border)'}}>
                      <div style={{fontSize:'13px', fontWeight:700, color:'var(--tw-ink)', marginBottom:'8px'}}>
                        Mail n°{etape + 1}
                        <span style={{fontWeight:400, color:'var(--tw-muted)', marginLeft:'8px'}}>· envoyé le {fmtDateShort(m.sent_at || m.created_at)}</span>
                        {etape > 0 && <span style={{fontWeight:400, color:'var(--tw-muted)'}}> · aux {sentTo} personne{sentTo > 1 ? 's' : ''} sans réaction au Mail n°{etape}</span>}
                      </div>
                      {renderStatsDetail(m)}
                    </div>
                  );
                })}
                <div style={{fontSize:'13px', fontWeight:500, padding:'10px 12px', borderRadius:'8px', background:'white', border:'1px solid var(--tw-border)'}}>
                  {complete ? (
                    <span style={{color:'#5a6573'}}>🏁 Séquence terminée (3 mails). Les contacts restés sans réaction ont leur emailing commercial invalidé.</span>
                  ) : nonReactifs == null ? (
                    <span style={{color:'var(--tw-muted)'}}>Calcul des non-réactifs…</span>
                  ) : nonReactifs === 0 ? (
                    <span style={{color:'#0d7d39'}}>✅ Tout le monde a interagi — séquence terminée, pas de Mail n°{nbMails + 1}.</span>
                  ) : (
                    <span style={{color:'#1a6aa8'}}>📨 {nonReactifs} personne{nonReactifs > 1 ? 's' : ''} sans réaction → prochain envoi (Mail n°{nbMails + 1}) à prévoir vers le {fmtDateShort(addBusinessDays(seq.last.sent_at || seq.last.created_at, 5))}.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      };

      // ── Regroupement : séquences opt-in (par sequence_id) vs envois isolés ──
      const seqMap = {};
      const standalone = [];
      for (const ev of envois) {
        if (ev.sequence_id) (seqMap[ev.sequence_id] = seqMap[ev.sequence_id] || []).push(ev);
        else standalone.push(ev);
      }
      const sequences = Object.keys(seqMap).map(sid => {
        const mails = seqMap[sid].slice().sort((a, b) => (a.sequence_etape || 0) - (b.sequence_etape || 0));
        return { sid, mails, first: mails[0], last: mails[mails.length - 1] };
      }).sort((a, b) => new Date(b.first.sent_at || b.first.created_at) - new Date(a.first.sent_at || a.first.created_at));
      const totalGroups = sequences.length + standalone.length;

      return (
        <div>
          <div style={{fontSize:'14px', fontWeight:600, color:'var(--tw-ink)', marginBottom:'16px'}}>
            Historique des envois {totalGroups > 0 && <span style={{color:'var(--tw-muted)', fontWeight:400}}>({totalGroups})</span>}
          </div>
          {loading && <div style={{color:'var(--tw-muted)', fontSize:'13px', padding:'20px', textAlign:'center'}}>Chargement…</div>}
          {error && <div style={{color:'#a52d2d', fontSize:'13px', padding:'20px'}}>Erreur : {error}</div>}
          {!loading && !error && totalGroups === 0 && (
            <div style={{color:'var(--tw-muted)', fontSize:'13px', padding:'40px 20px', textAlign:'center'}}>Aucun envoi enregistré pour le moment</div>
          )}
          {sequences.map(renderSequenceCard)}
          {standalone.map(renderEnvoiCard)}
        </div>
      );
    }

    // ===================================================================
    // COMPOSANT CampagnesRelances — Séquence de relance opt-in (semi-auto)
    // ===================================================================
    function CampagnesRelances({ user, API_URL, mode = 'all' }) {
      const [seq, setSeq] = React.useState(null);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [config, setConfig] = React.useState(null);
      const [campagnesBrevo, setCampagnesBrevo] = React.useState([]);
      const [processing, setProcessing] = React.useState(false);
      const [feedback, setFeedback] = React.useState(null);
      // Constructeur de séquence : liste éditable des vagues de relance
      // [{ brevo_id, brevo_nom, delai_jours_ouvres }]. Index 0 = relance 1.
      const [etapes, setEtapes] = React.useState([]);
      const [etapesDirty, setEtapesDirty] = React.useState(false);
      const [savingEtapes, setSavingEtapes] = React.useState(false);

      const token = () => (user && user.token) ? user.token : null;
      const authH = () => ({ 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' });

      // Chargement initial : config + séquence + liste campagnes Brevo (pour le sélecteur de config)
      const loadAll = React.useCallback(() => {
        setLoading(true);
        setError(null);
        Promise.all([
          fetch(`${API_URL}/optin/sequence`, { headers: authH() }).then(r => r.json()),
          fetch(`${API_URL}/optin/config`, { headers: authH() }).then(r => r.json()),
          fetch(`${API_URL}/brevo/campaigns`, { headers: authH() }).then(r => r.json()).catch(() => ({ campaigns: [] }))
        ])
          .then(([seqData, cfgData, campData]) => {
            if (seqData.error) { setError(seqData.error); }
            else setSeq(seqData);
            setConfig(cfgData || {});
            setCampagnesBrevo(campData.campaigns || campData.campagnes || []);
          })
          .catch(err => setError('Erreur réseau: ' + err.message))
          .finally(() => setLoading(false));
      }, [API_URL]);

      React.useEffect(() => { loadAll(); }, [loadAll]);

      // Initialise le constructeur de vagues quand la config arrive.
      // Source : config.etapes_json (nouveau format) ; repli sur relance1/relance2 (ancien).
      React.useEffect(() => {
        if (!config) return;
        let init = [];
        if (Array.isArray(config.etapes_json) && config.etapes_json.length) {
          init = config.etapes_json.map(e => ({
            brevo_id: e.brevo_id || null,
            brevo_nom: e.brevo_nom || null,
            delai_jours_ouvres: parseInt(e.delai_jours_ouvres) || 5
          }));
        } else {
          const d = config.delai_jours_ouvres || 5;
          if (config.campagne_relance1_id) init.push({ brevo_id: config.campagne_relance1_id, brevo_nom: config.campagne_relance1_nom, delai_jours_ouvres: d });
          if (config.campagne_relance2_id) init.push({ brevo_id: config.campagne_relance2_id, brevo_nom: config.campagne_relance2_nom, delai_jours_ouvres: d });
        }
        setEtapes(init);
        setEtapesDirty(false);
      }, [config]);

      // ── Handlers du constructeur de séquence ──
      const addWave = () => { setEtapes(prev => [...prev, { brevo_id: null, brevo_nom: null, delai_jours_ouvres: 5 }]); setEtapesDirty(true); };
      const removeWave = (i) => { setEtapes(prev => prev.filter((_, j) => j !== i)); setEtapesDirty(true); };
      const updateWave = (i, patch) => { setEtapes(prev => prev.map((e, j) => j === i ? { ...e, ...patch } : e)); setEtapesDirty(true); };
      const saveEtapes = async () => {
        const clean = etapes.filter(e => e.brevo_id);
        setSavingEtapes(true);
        setFeedback(null);
        try {
          const r = await fetch(`${API_URL}/optin/config`, {
            method: 'POST', headers: authH(),
            body: JSON.stringify({ etapes: clean })
          });
          const data = await r.json();
          if (!r.ok) { setFeedback({ type: 'error', msg: data.error || 'Erreur enregistrement séquence' }); }
          else {
            setFeedback({ type: 'success', msg: `Séquence enregistrée (${clean.length} vague${clean.length > 1 ? 's' : ''} de relance).` });
            setEtapesDirty(false);
            if (data.config) setConfig(data.config);
            loadAll();
          }
        } catch (err) {
          setFeedback({ type: 'error', msg: 'Erreur : ' + err.message });
        } finally {
          setSavingEtapes(false);
        }
      };

      // Exécute une relance : envoie via send-campaign PUIS avance l'étape.
      // numVague = 1 (relance 1), 2 (relance 2), … N (séquence flexible)
      const lancerRelance = async (numVague, contacts) => {
        const et = (config?.etapes_json || [])[numVague - 1];
        const campId = et ? et.brevo_id
          : (numVague === 1 ? config?.campagne_relance1_id : numVague === 2 ? config?.campagne_relance2_id : null);
        if (!campId) {
          alert(`Aucune campagne configurée pour la relance ${numVague}. Configure-la dans la séquence ci-dessus.`);
          return;
        }
        if (!window.confirm(`Envoyer la relance ${numVague} à ${contacts.length} contact(s) ?`)) return;
        setProcessing(true);
        setFeedback(null);
        try {
          const ids = contacts.map(c => c.id);
          // 1. Envoi via send-campaign (mode opt_in_request, mécanique éprouvée)
          const sendRes = await fetch(`${API_URL}/brevo/send-campaign`, {
            method: 'POST', headers: authH(),
            body: JSON.stringify({ campaignId: parseInt(campId), contactIds: ids, mode: 'opt_in_request', filtres: { type: 'demande_optin' } })
          });
          const sendData = await sendRes.json();
          if (!sendRes.ok) {
            setFeedback({ type: 'error', msg: `Échec envoi : ${sendData.error || 'erreur inconnue'}` });
            setProcessing(false);
            return;
          }
          // 2. Avancer l'étape (seulement si envoi OK)
          await fetch(`${API_URL}/optin/avancer-etape`, {
            method: 'POST', headers: authH(),
            body: JSON.stringify({ contactIds: ids, etape_cible: numVague })
          });
          setFeedback({ type: 'success', msg: `Relance ${numVague} envoyée à ${ids.length} contact(s). Statut Brevo : ${sendData.statut_brevo || 'envoyé'}.` });
          loadAll(); // recharge la séquence
        } catch (err) {
          setFeedback({ type: 'error', msg: 'Erreur : ' + err.message });
        } finally {
          setProcessing(false);
        }
      };

      // Clôture : décoche demande_optin pour les contacts donnés
      const cloturer = async (contacts) => {
        if (!window.confirm(`Clôturer la séquence pour ${contacts.length} contact(s) ? Ils retourneront en "non sollicité" et ne seront plus relancés.`)) return;
        setProcessing(true);
        setFeedback(null);
        try {
          const ids = contacts.map(c => c.id);
          const r = await fetch(`${API_URL}/optin/cloturer`, {
            method: 'POST', headers: authH(),
            body: JSON.stringify({ contactIds: ids })
          });
          const data = await r.json();
          if (!r.ok) { setFeedback({ type: 'error', msg: data.error || 'Erreur clôture' }); }
          else { setFeedback({ type: 'success', msg: `${data.cloture} contact(s) clôturé(s).` }); loadAll(); }
        } catch (err) {
          setFeedback({ type: 'error', msg: 'Erreur : ' + err.message });
        } finally {
          setProcessing(false);
        }
      };

      const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

      // Rendu d'une liste de contacts avec bouton d'action groupée
      const renderGroupe = (titre, desc, contacts, couleur, actionLabel, onAction) => (
        <div style={{background: 'white', border: '0.5px solid var(--tw-border)', borderRadius: '12px', padding: '20px', marginBottom: '16px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: contacts.length ? '14px' : '0'}}>
            <div>
              <div style={{fontSize: '15px', fontWeight: 600, color: couleur}}>{titre} <span style={{color: 'var(--tw-muted)', fontWeight: 400}}>({contacts.length})</span></div>
              <div style={{fontSize: '12px', color: 'var(--tw-muted)', marginTop: '2px'}}>{desc}</div>
            </div>
            {contacts.length > 0 && (
              <button onClick={() => onAction(contacts)} disabled={processing} style={{padding: '8px 16px', background: couleur, color: 'white', border: 'none', borderRadius: '8px', cursor: processing ? 'wait' : 'pointer', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap'}}>{actionLabel}</button>
            )}
          </div>
          {contacts.length > 0 ? (
            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '12px'}}>
              <thead>
                <tr style={{borderBottom: '1px solid var(--tw-border)', textAlign: 'left'}}>
                  <th style={{padding: '6px 8px', fontWeight: 600, color: 'var(--tw-slate)'}}>Société</th>
                  <th style={{padding: '6px 8px', fontWeight: 600, color: 'var(--tw-slate)'}}>Prénom</th>
                  <th style={{padding: '6px 8px', fontWeight: 600, color: 'var(--tw-slate)'}}>Nom</th>
                  <th style={{padding: '6px 8px', fontWeight: 600, color: 'var(--tw-slate)'}}>Email</th>
                  <th style={{padding: '6px 8px', fontWeight: 600, color: 'var(--tw-slate)'}}>Dernier envoi</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id} style={{borderBottom: '0.5px solid var(--tw-border)'}}>
                    <td style={{padding: '6px 8px', color: 'var(--tw-ink)', fontWeight: 500}}>{c.societe}</td>
                    <td style={{padding: '6px 8px', color: 'var(--tw-slate)'}}>{c.prenom || ''}</td>
                    <td style={{padding: '6px 8px', color: 'var(--tw-slate)'}}>{c.nom || ''}</td>
                    <td style={{padding: '6px 8px', color: 'var(--tw-slate)'}}>{c.email}</td>
                    <td style={{padding: '6px 8px', color: 'var(--tw-muted)'}}>{fmtDate(c.dernier_envoi_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{fontSize: '12px', color: 'var(--tw-muted)', fontStyle: 'italic', marginTop: '8px'}}>Aucun contact dans ce groupe pour le moment.</div>
          )}
        </div>
      );

      if (loading) return <div style={{padding: '40px', textAlign: 'center', color: 'var(--tw-muted)'}}>Chargement de la séquence…</div>;
      if (error) return <div style={{padding: '20px', color: '#a52d2d', fontSize: '13px'}}>Erreur : {error}</div>;

      // Liste des campagnes Brevo pour les sélecteurs de config
      const campOptions = campagnesBrevo.map(c => ({ id: c.id, nom: c.name || c.nom || `Campagne #${c.id}` }));

      return (
        <div>
          {/* Feedback */}
          {feedback && (
            <div style={{padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', background: feedback.type === 'success' ? '#e6f7ec' : '#fde8e8', color: feedback.type === 'success' ? '#0d7d39' : '#a52d2d'}}>{feedback.msg}</div>
          )}

          {/* CONFIG : constructeur de séquence (N vagues) — masqué en mode 'actions' */}
          {(mode !== 'actions') && (
          <div style={{background: 'var(--tw-bg)', border: '0.5px solid var(--tw-border)', borderRadius: '12px', padding: '20px', marginBottom: '20px'}}>
            <div style={{fontSize: '14px', fontWeight: 600, color: 'var(--tw-ink)', marginBottom: '4px'}}>Séquence de relances</div>
            <div style={{fontSize: '12px', color: 'var(--tw-muted)', marginBottom: '14px'}}>
              Le <strong>Mail 1</strong> est ta campagne initiale (envoyée depuis « Demandes d'opt-in »). Ajoute ensuite autant de relances que tu veux : chacune = un email Brevo (brouillon, avec {'{{ contact.OPTIN_LINK }}'}) + un délai en jours ouvrés après l'envoi précédent.
            </div>
            {etapes.length === 0 && (
              <div style={{fontSize: '12px', color: 'var(--tw-muted)', fontStyle: 'italic', marginBottom: '10px'}}>Aucune relance configurée. Clique « + Ajouter une vague ».</div>
            )}
            {etapes.map((et, i) => (
              <div key={i} style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap'}}>
                <span style={{fontSize: '12px', fontWeight: 700, color: 'var(--tw-ink)', minWidth: '120px'}}>Relance {i + 1} <span style={{color: 'var(--tw-muted)', fontWeight: 400}}>(Mail {i + 2})</span></span>
                <select value={et.brevo_id || ''}
                  onChange={(e) => { const o = campOptions.find(o => String(o.id) === e.target.value); updateWave(i, { brevo_id: o ? o.id : null, brevo_nom: o ? o.nom : null }); }}
                  style={{flex: 1, minWidth: '200px', padding: '8px 10px', border: '0.5px solid var(--tw-border)', borderRadius: '8px', fontSize: '13px'}}>
                  <option value="">— Choisir l'email Brevo —</option>
                  {campOptions.map(o => <option key={o.id} value={o.id}>#{o.id} · {o.nom}</option>)}
                </select>
                <span style={{fontSize: '12px', color: 'var(--tw-slate)', display: 'flex', alignItems: 'center', gap: '6px'}}>
                  Délai <input type="number" min="1" value={et.delai_jours_ouvres}
                    onChange={(e) => updateWave(i, { delai_jours_ouvres: parseInt(e.target.value) || 1 })}
                    style={{width: '56px', padding: '6px 8px', border: '0.5px solid var(--tw-border)', borderRadius: '6px', fontSize: '13px', textAlign: 'center'}} /> j ouvrés
                </span>
                <button onClick={() => removeWave(i)} title="Supprimer cette vague" style={{background: 'transparent', border: 'none', color: '#a52d2d', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: '0 4px'}}>×</button>
              </div>
            ))}
            <div style={{display: 'flex', gap: '10px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap'}}>
              <button onClick={addWave} style={{padding: '7px 14px', background: 'white', color: 'var(--tw-teal)', border: '1px solid var(--tw-teal)', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600}}>+ Ajouter une vague</button>
              <button onClick={saveEtapes} disabled={!etapesDirty || savingEtapes} style={{padding: '7px 16px', background: (!etapesDirty || savingEtapes) ? '#ccc' : 'var(--tw-teal)', color: 'white', border: 'none', borderRadius: '8px', cursor: (!etapesDirty || savingEtapes) ? 'default' : 'pointer', fontSize: '13px', fontWeight: 600}}>
                {savingEtapes ? 'Enregistrement…' : 'Enregistrer la séquence'}
              </button>
              {etapesDirty && <span style={{fontSize: '12px', color: '#b97800'}}>Modifications non enregistrées</span>}
            </div>
          </div>
          )}

          {/* GROUPES + EN ATTENTE : masqués en mode 'builder' (réservés à l'onglet « En cours ») */}
          {(mode !== 'builder') && (<React.Fragment>
          {/* GROUPES */}
          {renderGroupe(
            'Relances à faire — 1ère relance',
            'Contacts dont la demande initiale date de plus de ' + (seq?.delai_jours_ouvres || 5) + ' jours ouvrés, sans réponse.',
            seq?.relance1 || [], 'var(--primary)', 'Envoyer la 1ère relance',
            (contacts) => lancerRelance(1, contacts)
          )}
          {renderGroupe(
            'Relances à faire — Relance 2',
            'Contacts relancés une fois, sans réponse depuis le délai configuré.',
            seq?.relance2 || [], '#b97800', 'Envoyer la relance 2',
            (contacts) => lancerRelance(2, contacts)
          )}
          {/* Vagues 3+ (séquence flexible) : un groupe par vague, regroupé par prochaine relance */}
          {(() => {
            const rs = seq?.relanceSuivantes || [];
            const byVague = {};
            rs.forEach(c => { const v = c.prochaine_vague || (c.etape + 1); (byVague[v] = byVague[v] || []).push(c); });
            return Object.keys(byVague).sort((a, b) => a - b).map(v => renderGroupe(
              `Relances à faire — Relance ${v}`,
              `Contacts sans réaction depuis la relance ${parseInt(v) - 1}.`,
              byVague[v], '#b06e2a', `Envoyer la relance ${v}`,
              (contacts) => lancerRelance(parseInt(v), contacts)
            ));
          })()}
          {renderGroupe(
            'À clôturer',
            'Contacts sans réponse après toutes les relances. Les clôturer les retire de la séquence (retour "non sollicité").',
            seq?.cloture || [], '#a52d2d', 'Clôturer (décocher)',
            (contacts) => cloturer(contacts)
          )}

          {/* EN ATTENTE (informatif, pas d'action) */}
          {seq?.enAttente && seq.enAttente.length > 0 && (
            <div style={{background: 'white', border: '0.5px solid var(--tw-border)', borderRadius: '12px', padding: '20px', marginBottom: '16px'}}>
              <div style={{fontSize: '15px', fontWeight: 600, color: 'var(--tw-slate)'}}>En attente <span style={{color: 'var(--tw-muted)', fontWeight: 400}}>({seq.enAttente.length})</span></div>
              <div style={{fontSize: '12px', color: 'var(--tw-muted)', marginTop: '2px', marginBottom: '12px'}}>Contacts dans la séquence dont le délai n'est pas encore écoulé. Ils apparaîtront dans les groupes ci-dessus le moment venu.</div>
              <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '12px'}}>
                <thead>
                  <tr style={{borderBottom: '1px solid var(--tw-border)', textAlign: 'left'}}>
                    <th style={{padding: '6px 8px', fontWeight: 600, color: 'var(--tw-slate)'}}>Société</th>
                    <th style={{padding: '6px 8px', fontWeight: 600, color: 'var(--tw-slate)'}}>Contact</th>
                    <th style={{padding: '6px 8px', fontWeight: 600, color: 'var(--tw-slate)'}}>Prochaine action</th>
                    <th style={{padding: '6px 8px', fontWeight: 600, color: 'var(--tw-slate)'}}>Éligible le</th>
                  </tr>
                </thead>
                <tbody>
                  {seq.enAttente.map(c => (
                    <tr key={c.id} style={{borderBottom: '0.5px solid var(--tw-border)'}}>
                      <td style={{padding: '6px 8px', color: 'var(--tw-ink)', fontWeight: 500}}>{c.societe}</td>
                      <td style={{padding: '6px 8px', color: 'var(--tw-slate)'}}>{[c.prenom, c.nom].filter(Boolean).join(' ')}</td>
                      <td style={{padding: '6px 8px', color: 'var(--tw-muted)'}}>{c.prochaine === 'relance1' ? '1ère relance' : c.prochaine === 'relance2' ? 'Dernière relance' : 'Clôture'}</td>
                      <td style={{padding: '6px 8px', color: 'var(--tw-muted)'}}>{fmtDate(c.echeance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </React.Fragment>)}
        </div>
      );
    }

    // ===================================================================
    // COMPOSANT CampagnesLancement — colonne gauche : créer / lancer une campagne opt-in
    // ===================================================================
    function CampagnesLancement({ user, API_URL, onLaunched }) {
      const [defs, setDefs] = React.useState([]);
      const [campaignsBrevo, setCampaignsBrevo] = React.useState([]);
      const [feedback, setFeedback] = React.useState(null);
      const [creating, setCreating] = React.useState(false);
      const [editId, setEditId] = React.useState(null);
      const [nom, setNom] = React.useState('');
      const [etapes, setEtapes] = React.useState([{ brevo_id: null, brevo_nom: null, delai_jours_ouvres: 0 }]);
      const [launchingId, setLaunchingId] = React.useState(null);
      const [saving, setSaving] = React.useState(false);
      const [launchModal, setLaunchModal] = React.useState(null); // { def, mail1_brevo_id, mail1_nom, contacts }
      const [launchSel, setLaunchSel] = React.useState(new Set());
      const [launchSending, setLaunchSending] = React.useState(false);
      const token = () => (user && user.token) ? user.token : '';
      const authH = () => ({ 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' });

      const load = React.useCallback(() => {
        Promise.all([
          fetch(`${API_URL}/optin/campaign-defs`, { headers: authH() }).then(r => r.json()).catch(() => ({ campagnes: [] })),
          fetch(`${API_URL}/brevo/campaigns`, { headers: authH() }).then(r => r.json()).catch(() => ({ campaigns: [] }))
        ]).then(([d, c]) => { setDefs(d.campagnes || []); setCampaignsBrevo(c.campaigns || c.campagnes || []); });
      }, [API_URL]);
      React.useEffect(() => { load(); }, [load]);

      const campOptions = campaignsBrevo.map(c => ({ id: c.id, nom: c.name || c.nom || `Campagne #${c.id}` }));
      const brevoNom = (id) => { const o = campOptions.find(o => String(o.id) === String(id)); return o ? o.nom : (id ? `#${id}` : ''); };

      const startCreate = () => { setCreating(true); setEditId(null); setNom(''); setEtapes([{ brevo_id: null, brevo_nom: null, delai_jours_ouvres: 0 }]); setFeedback(null); };
      const startEdit = (def) => { setCreating(true); setEditId(def.id); setNom(def.nom); setEtapes((def.etapes_json || []).map(e => ({ brevo_id: e.brevo_id, brevo_nom: e.brevo_nom, delai_jours_ouvres: e.delai_jours_ouvres || 5 }))); setFeedback(null); };
      const addMail = () => setEtapes(p => [...p, { brevo_id: null, brevo_nom: null, delai_jours_ouvres: 5 }]);
      const removeMail = (i) => setEtapes(p => p.filter((_, j) => j !== i));
      const updMail = (i, patch) => setEtapes(p => p.map((e, j) => j === i ? { ...e, ...patch } : e));

      const saveCampaign = async () => {
        if (!nom.trim()) { setFeedback({ type: 'error', msg: 'Donne un nom à la campagne.' }); return; }
        const clean = etapes.filter(e => e.brevo_id);
        if (clean.length === 0) { setFeedback({ type: 'error', msg: 'Choisis au moins le Mail 1.' }); return; }
        setSaving(true);
        try {
          const body = { nom: nom.trim(), etapes: clean };
          if (editId) body.id = editId;
          const r = await fetch(`${API_URL}/optin/campaign-defs`, { method: 'POST', headers: authH(), body: JSON.stringify(body) });
          const d = await r.json();
          if (!r.ok) { setFeedback({ type: 'error', msg: d.error || 'Erreur enregistrement' }); }
          else { setFeedback({ type: 'success', msg: `Campagne « ${nom.trim()} » enregistrée.` }); setCreating(false); load(); }
        } catch (e) { setFeedback({ type: 'error', msg: e.message }); } finally { setSaving(false); }
      };

      const deleteCampaign = async (def) => {
        if (!window.confirm(`Supprimer la campagne « ${def.nom} » ?`)) return;
        await fetch(`${API_URL}/optin/campaign-defs/${def.id}`, { method: 'DELETE', headers: authH() });
        load();
      };

      const launch = async (def) => {
        setLaunchingId(def.id); setFeedback(null);
        try {
          const aR = await fetch(`${API_URL}/optin/campaign-defs/${def.id}/activate`, { method: 'POST', headers: authH() });
          const aD = await aR.json();
          if (!aR.ok) throw new Error(aD.error || 'Activation impossible');
          if (!aD.mail1_brevo_id) throw new Error('Le Mail 1 n\'est pas défini dans cette campagne.');
          const audR = await fetch(`${API_URL}/brevo/audience?type=demande_optin`, { headers: authH() });
          const audD = await audR.json();
          const contacts = audD.contacts || [];
          if (contacts.length === 0) throw new Error('Aucun contact non-sollicité à cibler.');
          // Étape de sélection : on ouvre la modale, l'envoi se fait après validation
          setLaunchModal({ def, mail1_brevo_id: aD.mail1_brevo_id, mail1_nom: aD.mail1_nom, contacts });
          setLaunchSel(new Set(contacts.map(c => c.id)));
        } catch (e) { setFeedback({ type: 'error', msg: e.message }); } finally { setLaunchingId(null); }
      };

      const toggleSel = (id) => setLaunchSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
      const confirmLaunch = async () => {
        const ids = [...launchSel];
        if (ids.length === 0) { setFeedback({ type: 'error', msg: 'Sélectionne au moins un contact.' }); return; }
        setLaunchSending(true);
        try {
          const sR = await fetch(`${API_URL}/brevo/send-campaign`, { method: 'POST', headers: authH(), body: JSON.stringify({ campaignId: launchModal.mail1_brevo_id, contactIds: ids, mode: 'opt_in_request', filtres: { type: 'demande_optin', campagne: launchModal.def.nom } }) });
          const sD = await sR.json();
          if (!sR.ok) throw new Error(sD.error || 'Envoi du Mail 1 échoué');
          const nom = launchModal.def.nom;
          // Marque la définition comme lancée : elle quitte la liste "Lancer une campagne".
          await fetch(`${API_URL}/optin/campaign-defs/${launchModal.def.id}/mark-launched`, { method: 'POST', headers: authH() }).catch(() => {});
          setLaunchModal(null);
          setFeedback({ type: 'success', msg: `« ${nom} » lancée : Mail 1 envoyé à ${ids.length} contact(s).` });
          load();
          if (onLaunched) onLaunched();
        } catch (e) { setFeedback({ type: 'error', msg: e.message }); } finally { setLaunchSending(false); }
      };

      const inputS = { width: '100%', padding: '8px 10px', border: '1px solid var(--tw-border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit' };

      return (
        <div>
          {feedback && (
            <div style={{padding: '11px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', background: feedback.type === 'success' ? '#e6f7ec' : '#fde8e8', color: feedback.type === 'success' ? '#0d7d39' : '#a52d2d'}}>{feedback.msg}</div>
          )}

          {/* Formulaire création / édition */}
          {creating ? (
            <div style={{background: '#fff', border: '1px solid var(--tw-border)', borderRadius: '14px', padding: '20px', marginBottom: '18px'}}>
              <div style={{fontSize: '15px', fontWeight: 700, marginBottom: '14px'}}>{editId ? 'Modifier la campagne' : 'Nouvelle campagne'}</div>
              <label style={{fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tw-muted)', display: 'block', marginBottom: '6px'}}>Nom de la campagne</label>
              <input value={nom} onChange={e => setNom(e.target.value)} placeholder="ex. Opt-in textile — juin 2026" style={{...inputS, marginBottom: '16px'}} />
              <label style={{fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tw-muted)', display: 'block', marginBottom: '8px'}}>Emails de la séquence (dans l'ordre)</label>
              {etapes.map((et, i) => (
                <div key={i} style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '9px', flexWrap: 'wrap'}}>
                  <span style={{fontSize: '12px', fontWeight: 700, color: i === 0 ? 'var(--tw-teal)' : 'var(--tw-slate)', minWidth: '64px'}}>{i === 0 ? 'Mail 1' : 'Mail ' + (i + 1)}</span>
                  <select value={et.brevo_id || ''} onChange={e => { const o = campOptions.find(o => String(o.id) === e.target.value); updMail(i, { brevo_id: o ? o.id : null, brevo_nom: o ? o.nom : null }); }} style={{flex: 1, minWidth: '150px', ...inputS}}>
                    <option value="">— Choisir l'email Brevo —</option>
                    {campOptions.map(o => <option key={o.id} value={o.id}>#{o.id} · {o.nom}</option>)}
                  </select>
                  {i === 0 ? (
                    <span style={{fontSize: '11px', color: 'var(--tw-muted)', minWidth: '92px'}}>envoi immédiat</span>
                  ) : (
                    <span style={{fontSize: '12px', color: 'var(--tw-slate)', display: 'flex', alignItems: 'center', gap: '5px'}}>après <input type="number" min="1" value={et.delai_jours_ouvres} onChange={e => updMail(i, { delai_jours_ouvres: parseInt(e.target.value) || 1 })} style={{width: '48px', padding: '5px', border: '1px solid var(--tw-border)', borderRadius: '6px', fontSize: '13px', textAlign: 'center'}} /> j</span>
                  )}
                  {i > 0 && <button onClick={() => removeMail(i)} style={{background: 'transparent', border: 'none', color: '#a52d2d', cursor: 'pointer', fontSize: '17px', lineHeight: 1}}>×</button>}
                </div>
              ))}
              <button onClick={addMail} style={{padding: '6px 12px', background: 'white', color: 'var(--tw-teal)', border: '1px solid var(--tw-teal)', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, marginTop: '4px'}}>+ Ajouter un mail (relance)</button>
              <div style={{display: 'flex', gap: '8px', marginTop: '18px'}}>
                <button onClick={saveCampaign} disabled={saving} style={{padding: '9px 18px', background: 'var(--tw-teal)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600}}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
                <button onClick={() => setCreating(false)} style={{padding: '9px 16px', background: 'white', color: 'var(--tw-slate)', border: '1px solid var(--tw-border)', borderRadius: '8px', cursor: 'pointer', fontSize: '13px'}}>Annuler</button>
              </div>
            </div>
          ) : (
            <button onClick={startCreate} style={{width: '100%', padding: '14px', background: 'var(--tw-teal)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '14px', fontWeight: 700, marginBottom: '18px'}}>+ Créer une campagne</button>
          )}

          {/* Liste des campagnes à lancer */}
          <div style={{fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tw-muted)', marginBottom: '10px'}}>Lancer une campagne</div>
          {defs.length === 0 ? (
            <div style={{fontSize: '13px', color: 'var(--tw-muted)', fontStyle: 'italic', padding: '16px', background: '#fff', border: '1px dashed var(--tw-border)', borderRadius: '12px'}}>Aucune campagne. Crée-en une ci-dessus.</div>
          ) : defs.map(def => (
            <div key={def.id} style={{background: '#fff', border: '1px solid var(--tw-border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '10px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px'}}>
                <div style={{minWidth: 0}}>
                  <div style={{fontSize: '14px', fontWeight: 700, color: 'var(--tw-ink)'}}>{def.nom}</div>
                  <div style={{fontSize: '12px', color: 'var(--tw-muted)', marginTop: '2px'}}>{(def.etapes_json || []).length} mail{(def.etapes_json || []).length > 1 ? 's' : ''} · {Math.max(0, (def.etapes_json || []).length - 1)} relance{Math.max(0, (def.etapes_json || []).length - 1) > 1 ? 's' : ''}</div>
                </div>
                <div style={{display: 'flex', gap: '6px', flexShrink: 0}}>
                  <button onClick={() => startEdit(def)} title="Modifier" style={{background: 'transparent', border: '1px solid var(--tw-border)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px', color: 'var(--tw-slate)'}}>✏️</button>
                  <button onClick={() => deleteCampaign(def)} title="Supprimer" style={{background: 'transparent', border: '1px solid var(--tw-border)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px', color: '#a52d2d'}}>🗑</button>
                  <button onClick={() => launch(def)} disabled={launchingId === def.id} style={{padding: '6px 14px', background: 'var(--tw-teal)', color: 'white', border: 'none', borderRadius: '8px', cursor: launchingId === def.id ? 'wait' : 'pointer', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap'}}>{launchingId === def.id ? '⏳' : '🚀 Lancer'}</button>
                </div>
              </div>
              <div style={{fontSize: '11px', color: 'var(--tw-slate)', marginTop: '8px'}}>{(def.etapes_json || []).map((e, i) => `${i === 0 ? 'M1' : 'M' + (i + 1)}: ${brevoNom(e.brevo_id)}`).join('  →  ')}</div>
            </div>
          ))}

          {/* MODALE de sélection des destinataires avant lancement du Mail 1 */}
          {launchModal && (
            <div onClick={(e) => { if (e.target === e.currentTarget) setLaunchModal(null); }} style={{position: 'fixed', inset: 0, background: 'rgba(20,30,30,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'}}>
              <div style={{background: '#fff', borderRadius: '14px', width: '600px', maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
                <div style={{padding: '18px 22px', borderBottom: '1px solid var(--tw-border)'}}>
                  <div style={{fontSize: '16px', fontWeight: 700}}>🚀 Lancer « {launchModal.def.nom} »</div>
                  <div style={{fontSize: '12px', color: 'var(--tw-muted)', marginTop: '3px'}}>Coche les contacts qui recevront le <b>Mail 1</b>. Les relances suivront automatiquement la séquence pour ceux qui ne réagissent pas.</div>
                </div>
                <div style={{padding: '10px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--tw-border)'}}>
                  <div style={{fontSize: '13px', fontWeight: 600, color: 'var(--tw-teal)'}}>{launchSel.size} / {launchModal.contacts.length} sélectionné{launchSel.size > 1 ? 's' : ''}</div>
                  <div style={{display: 'flex', gap: '8px'}}>
                    <button onClick={() => setLaunchSel(new Set(launchModal.contacts.map(c => c.id)))} style={{fontSize: '12px', padding: '4px 10px', border: '1px solid var(--tw-border)', borderRadius: '6px', background: '#fff', cursor: 'pointer', color: 'var(--tw-slate)'}}>Tout cocher</button>
                    <button onClick={() => setLaunchSel(new Set())} style={{fontSize: '12px', padding: '4px 10px', border: '1px solid var(--tw-border)', borderRadius: '6px', background: '#fff', cursor: 'pointer', color: 'var(--tw-slate)'}}>Tout décocher</button>
                  </div>
                </div>
                <div style={{overflowY: 'auto', padding: '6px 16px', flex: 1}}>
                  {launchModal.contacts.map(c => (
                    <label key={c.id} style={{display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 4px', borderBottom: '0.5px solid var(--tw-border)', cursor: 'pointer', fontSize: '13px'}}>
                      <input type="checkbox" checked={launchSel.has(c.id)} onChange={() => toggleSel(c.id)} />
                      <span style={{flex: '0 0 150px', fontWeight: 600, color: 'var(--tw-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{c.societe || '—'}</span>
                      <span style={{flex: '0 0 140px', color: 'var(--tw-slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{[c.prenom, c.nom].filter(Boolean).join(' ')}</span>
                      <span style={{flex: 1, color: 'var(--tw-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{c.email}</span>
                    </label>
                  ))}
                </div>
                <div style={{padding: '14px 22px', borderTop: '1px solid var(--tw-border)', display: 'flex', justifyContent: 'flex-end', gap: '10px'}}>
                  <button onClick={() => setLaunchModal(null)} style={{padding: '9px 16px', background: '#fff', color: 'var(--tw-slate)', border: '1px solid var(--tw-border)', borderRadius: '8px', cursor: 'pointer', fontSize: '13px'}}>Annuler</button>
                  <button onClick={confirmLaunch} disabled={launchSending || launchSel.size === 0} style={{padding: '9px 18px', background: (launchSending || launchSel.size === 0) ? '#ccc' : 'var(--tw-teal)', color: '#fff', border: 'none', borderRadius: '8px', cursor: (launchSending || launchSel.size === 0) ? 'default' : 'pointer', fontSize: '13px', fontWeight: 700}}>{launchSending ? 'Envoi…' : `🚀 Envoyer le Mail 1 à ${launchSel.size} contact(s)`}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    export function CampagnesPage({ user, API_URL, onClose }) {
      const [activeView, setActiveView] = React.useState('optin');
      const [refreshKey, setRefreshKey] = React.useState(0);
      const [showActions, setShowActions] = React.useState(false); // accordéon des actions globales de relance
      const [typeCible, setTypeCible] = React.useState('prospect'); // client|prospect|suspect|prospect_suspect|all
      const [decideursOnly, setDecideursOnly] = React.useState(false);
      const [audience, setAudience] = React.useState([]);
      const [audienceLoading, setAudienceLoading] = React.useState(false);
      const [audienceError, setAudienceError] = React.useState(null);
      const [selectedIds, setSelectedIds] = React.useState(new Set());
      const [campaigns, setCampaigns] = React.useState([]);
      const [campaignsLoading, setCampaignsLoading] = React.useState(false);
      const [campaignsError, setCampaignsError] = React.useState(null);
      const [selectedCampaignId, setSelectedCampaignId] = React.useState('');
      const [confirmOpen, setConfirmOpen] = React.useState(false);
      const [sending, setSending] = React.useState(false);
      const [sendResult, setSendResult] = React.useState(null);
      const [testSending, setTestSending] = React.useState(false);
      const [testResult, setTestResult] = React.useState(null);

      const token = () => (user && user.token) ? user.token : null;

      // Charge l'audience à chaque changement de filtre
      React.useEffect(() => {
        let cancelled = false;
        setAudienceLoading(true);
        setAudienceError(null);
        const url = `${API_URL}/brevo/audience?type=${encodeURIComponent(typeCible)}&decideur_only=${decideursOnly ? 'true' : 'false'}`;
        fetch(url, { headers: { 'Authorization': 'Bearer ' + token() } })
          .then(r => r.json().then(data => ({ ok: r.ok, status: r.status, data })))
          .then(({ ok, data }) => {
            if (cancelled) return;
            if (!ok) {
              setAudienceError(data.error || 'Erreur de chargement');
              setAudience([]);
              setSelectedIds(new Set());
            } else {
              setAudience(data.contacts || []);
              // Sélection par défaut différenciée selon le mode :
              //  - Cible normale : on coche les opt-in (RGPD-safe)
              //  - Cible demande_optin : on coche TOUT (puisque tous sont opt-out par
              //    définition et qu'on veut justement leur demander leur consentement)
              const ids = (data.contacts || []).filter(c =>
                typeCible === 'demande_optin' ? true : c.accept_emailing === true
              ).map(c => c.id);
              setSelectedIds(new Set(ids));
            }
          })
          .catch(err => {
            if (!cancelled) {
              setAudienceError('Erreur réseau: ' + err.message);
              setAudience([]);
              setSelectedIds(new Set());
            }
          })
          .finally(() => { if (!cancelled) setAudienceLoading(false); });
        return () => { cancelled = true; };
      }, [typeCible, decideursOnly, API_URL]);

      // Charge les campagnes Brevo brouillons une seule fois
      React.useEffect(() => {
        setCampaignsLoading(true);
        setCampaignsError(null);
        fetch(`${API_URL}/brevo/campaigns?status=draft`, { headers: { 'Authorization': 'Bearer ' + token() } })
          .then(r => r.json().then(data => ({ ok: r.ok, data })))
          .then(({ ok, data }) => {
            if (!ok) {
              setCampaignsError(data.error || 'Erreur de chargement');
              setCampaigns([]);
            } else {
              setCampaigns(data.campaigns || []);
            }
          })
          .catch(err => {
            setCampaignsError('Erreur réseau: ' + err.message);
            setCampaigns([]);
          })
          .finally(() => setCampaignsLoading(false));
      }, [API_URL]);

      // Compteurs utiles pour l'affichage (3 états RGPD distincts)
      const isOptinMode = typeCible === 'demande_optin';
      const totalContacts = audience.length;
      const optInCount = audience.filter(c => c.accept_emailing === true).length;
      const optOutCount = audience.filter(c => c.accept_emailing !== true && c.emailing_unsubscribed_at).length;
      const nonSolliciteCount = audience.filter(c => c.accept_emailing !== true && !c.emailing_unsubscribed_at).length;
      const selectedCount = selectedIds.size;
      // En mode demande_optin : "tout sélectionner" coche tout (les opt-out sont la cible).
      // En mode normal : "tout sélectionner" coche seulement les opt-in (RGPD).
      const selectablePool = isOptinMode
        ? audience
        : audience.filter(c => c.accept_emailing === true);
      const allSelectablePoolSelected = selectablePool.length > 0 && selectablePool.every(c => selectedIds.has(c.id));

      // Toggle case "Tout sélectionner" : selon le mode
      const toggleAll = () => {
        if (allSelectablePoolSelected) {
          setSelectedIds(new Set());
        } else {
          setSelectedIds(new Set(selectablePool.map(c => c.id)));
        }
      };

      // Toggle une ligne individuelle
      const toggleOne = (id) => {
        setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id); else next.add(id);
          return next;
        });
      };

      // --- ENVOI DE TEST ---
      const handleSendTest = () => {
        if (!selectedCampaignId) {
          setTestResult({ ok: false, error: 'Choisis une campagne d\'abord' });
          return;
        }
        setTestSending(true);
        setTestResult(null);
        fetch(`${API_URL}/brevo/send-test`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: parseInt(selectedCampaignId) })
        })
          .then(r => r.json().then(data => ({ ok: r.ok, data })))
          .then(({ ok, data }) => {
            setTestResult(ok ? { ok: true, sent_to: data.sent_to } : { ok: false, error: data.error || 'Erreur inconnue' });
          })
          .catch(err => setTestResult({ ok: false, error: 'Erreur réseau: ' + err.message }))
          .finally(() => setTestSending(false));
      };

      // --- ENVOI RÉEL ---
      const handleSendReal = () => {
        setSending(true);
        setSendResult(null);
        fetch(`${API_URL}/brevo/send-campaign`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignId: parseInt(selectedCampaignId),
            contactIds: Array.from(selectedIds),
            filtres: { type: typeCible, decideurs_only: decideursOnly },
            // Si cible = demande_optin → mode 'opt_in_request' côté serveur
            // (autorise l'envoi à des contacts opt-out, voir documentation backend)
            mode: isOptinMode ? 'opt_in_request' : 'normal'
          })
        })
          .then(r => r.json().then(data => ({ ok: r.ok, status: r.status, data })))
          .then(({ ok, data }) => {
            setSendResult(ok ? { ok: true, data } : { ok: false, error: data.error, detail: data.detail, audit_id: data.audit_id });
          })
          .catch(err => setSendResult({ ok: false, error: 'Erreur réseau: ' + err.message }))
          .finally(() => {
            setSending(false);
            setConfirmOpen(false);
          });
      };

      const canSend = selectedCampaignId && selectedCount > 0 && !sending;

      return (
        <div style={{padding:'24px 32px', maxWidth:'1280px', margin:'0 auto'}}>
          {/* HEADER */}
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px'}}>
            <div>
              <h2 style={{margin:0, fontSize:'22px', color:'var(--tw-ink)', fontWeight:600}}>Campagnes Marketing</h2>
              <div style={{fontSize:'13px', color:'var(--tw-muted)', marginTop:'4px'}}>Envoi de campagnes Brevo aux contacts CRM</div>
            </div>
            <button onClick={onClose} style={{padding:'8px 16px', background:'transparent', border:'0.5px solid var(--tw-border)', borderRadius:'8px', cursor:'pointer', fontSize:'13px', color:'var(--tw-slate)'}}>Fermer</button>
          </div>

          {/* ONGLETS : 2 modes clairs */}
          <div style={{display:'flex', gap:'4px', marginBottom:'20px', borderBottom:'1px solid var(--tw-border)', flexWrap:'wrap'}}>
            {[
              {v:'optin',   label:'🎯 Campagnes opt-in'},
              {v:'envoyer', label:'✉️ Envoi direct (newsletter)'}
            ].map(t => (
              <button key={t.v} onClick={() => setActiveView(t.v)} style={{padding:'10px 18px', background:'transparent', border:'none', borderBottom: activeView===t.v ? '2px solid var(--tw-teal)' : '2px solid transparent', cursor:'pointer', fontSize:'14px', fontWeight: activeView===t.v ? 600 : 400, color: activeView===t.v ? 'var(--tw-teal)' : 'var(--tw-slate)', marginBottom:'-1px'}}>{t.label}</button>
            ))}
          </div>

          {activeView === 'optin' ? (
            <div style={{display:'flex', gap:'22px', alignItems:'flex-start', flexWrap:'wrap'}}>
              {/* Colonne gauche : créer / lancer */}
              <div style={{flex:'1 1 340px', minWidth:'310px', maxWidth:'440px'}}>
                <div style={{fontSize:'13px', fontWeight:700, color:'var(--tw-ink)', marginBottom:'12px'}}>Créer / lancer une campagne</div>
                <CampagnesLancement user={user} API_URL={API_URL} onLaunched={() => setRefreshKey(k => k + 1)} />
              </div>
              {/* Colonne droite : en cours + actions + historique */}
              <div style={{flex:'2 1 460px', minWidth:'360px'}}>
                <div style={{fontSize:'13px', fontWeight:700, color:'var(--tw-ink)', marginBottom:'12px'}}>🚀 Campagnes en cours</div>
                <CampagnesVue key={'vue'+refreshKey} user={user} API_URL={API_URL} statut="en_cours" />

                {/* Accordéon : actions globales de relance (toutes campagnes confondues) */}
                <div style={{marginTop:'20px', border:'1px solid var(--tw-border)', borderRadius:'12px', overflow:'hidden'}}>
                  <button onClick={() => setShowActions(v => !v)} style={{display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%', padding:'14px 16px', background:'#f7f9fa', border:'none', cursor:'pointer', fontSize:'13px', fontWeight:700, color:'var(--tw-ink)', textAlign:'left'}}>
                    <span>🔧 Actions de relance groupées <span style={{fontWeight:400, color:'var(--tw-muted)'}}>— envoyer les relances dues / clôturer (toutes campagnes)</span></span>
                    <span style={{fontSize:'12px', color:'var(--tw-muted)', whiteSpace:'nowrap'}}>{showActions ? '▲ masquer' : '▼ ouvrir'}</span>
                  </button>
                  {showActions && (
                    <div style={{padding:'16px', borderTop:'1px solid var(--tw-border)'}}>
                      <CampagnesRelances key={'act'+refreshKey} user={user} API_URL={API_URL} mode="actions" />
                    </div>
                  )}
                </div>

                <div style={{marginTop:'26px'}}>
                  <CampagnesHistorique key={'hist'+refreshKey} user={user} API_URL={API_URL} />
                </div>
              </div>
            </div>
          ) : (
          <React.Fragment>
          {/* FILTRES */}
          <div style={{background:'white', border:'0.5px solid var(--tw-border)', borderRadius:'12px', padding:'20px', marginBottom:'20px'}}>
            <div style={{display:'flex', gap:'40px', flexWrap:'wrap'}}>
              {/* Filtre 1 : Cible */}
              <div>
                <div style={{fontSize:'12px', fontWeight:600, color:'var(--tw-slate)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'10px'}}>Cible commerciale</div>
                <div style={{display:'flex', gap:'8px', flexWrap:'wrap'}}>
                  {[
                    {v:'client', label:'Clients'},
                    {v:'prospect', label:'Prospects'},
                    {v:'suspect', label:'Suspects'},
                    {v:'prospect_suspect', label:'Prospects + Suspects'},
                    {v:'all', label:'Tous'},
                    {v:'demande_optin', label:'Demandes d\'opt-in', special:true}
                  ].map(opt => (
                    <label key={opt.v} style={{display:'flex', alignItems:'center', gap:'6px', padding:'6px 12px', border: opt.special ? '0.5px solid #b97800' : '0.5px solid var(--tw-border)', borderRadius:'8px', cursor:'pointer', fontSize:'13px', background: typeCible===opt.v ? (opt.special ? '#fef5e7' : 'var(--tw-teal-light)') : 'white', color: typeCible===opt.v ? (opt.special ? '#b97800' : 'var(--tw-teal)') : (opt.special ? '#b97800' : 'var(--tw-ink)'), fontWeight: typeCible===opt.v ? 600 : 400}}>
                      <input type="radio" name="type_cible" value={opt.v} checked={typeCible===opt.v} onChange={() => setTypeCible(opt.v)} style={{display:'none'}} />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Filtre 2 : Profil */}
              <div>
                <div style={{fontSize:'12px', fontWeight:600, color:'var(--tw-slate)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'10px'}}>Profil interlocuteur</div>
                <div style={{display:'flex', gap:'8px'}}>
                  <label style={{display:'flex', alignItems:'center', gap:'6px', padding:'6px 12px', border:'0.5px solid var(--tw-border)', borderRadius:'8px', cursor:'pointer', fontSize:'13px', background: !decideursOnly ? 'var(--tw-teal-light)' : 'white', color: !decideursOnly ? 'var(--tw-teal)' : 'var(--tw-ink)', fontWeight: !decideursOnly ? 600 : 400}}>
                    <input type="radio" name="profil" checked={!decideursOnly} onChange={() => setDecideursOnly(false)} style={{display:'none'}} />
                    Tous les contacts
                  </label>
                  <label style={{display:'flex', alignItems:'center', gap:'6px', padding:'6px 12px', border:'0.5px solid var(--tw-border)', borderRadius:'8px', cursor:'pointer', fontSize:'13px', background: decideursOnly ? 'var(--tw-teal-light)' : 'white', color: decideursOnly ? 'var(--tw-teal)' : 'var(--tw-ink)', fontWeight: decideursOnly ? 600 : 400}}>
                    <input type="radio" name="profil" checked={decideursOnly} onChange={() => setDecideursOnly(true)} style={{display:'none'}} />
                    Décideurs uniquement
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* BANDEAU INFO : Mode demande d'opt-in */}
          {isOptinMode && (
            <div style={{background:'#fef5e7', border:'0.5px solid #b97800', borderRadius:'12px', padding:'14px 18px', marginBottom:'20px', display:'flex', gap:'12px', alignItems:'flex-start'}}>
              <div style={{color:'#b97800', fontSize:'18px', lineHeight:1}}>⚠️</div>
              <div style={{fontSize:'13px', color:'#704a00', lineHeight:1.5}}>
                <div style={{fontWeight:600, marginBottom:'4px'}}>Mode demande d'opt-in</div>
                <div>Cette liste contient tous les contacts <strong>Suspect/Prospect non-sollicités</strong> (jamais opt-in, jamais opt-out, et jamais encore sollicités). En envoyant, ils sont automatiquement marqués <em>« Demande d'opt-in »</em> et entrent dans la séquence — pas besoin de cocher les fiches une par une. Les contacts déjà dans une séquence opt-in en cours sont exclus. La campagne doit contenir un lien <code style={{background:'#fff8eb', padding:'1px 6px', borderRadius:'3px', fontSize:'12px'}}>{'{{contact.OPTIN_LINK}}'}</code> pour générer le lien de confirmation unique par contact. À la confirmation, ils basculeront en opt-in automatiquement.</div>
              </div>
            </div>
          )}

          {/* LISTE CONTACTS */}
          <div style={{background:'white', border:'0.5px solid var(--tw-border)', borderRadius:'12px', overflow:'hidden', marginBottom:'20px'}}>
            <div style={{padding:'14px 20px', borderBottom:'0.5px solid var(--tw-border)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div style={{display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap'}}>
                <div style={{fontSize:'14px', fontWeight:600, color:'var(--tw-ink)'}}>
                  Contacts {totalContacts > 0 && <span style={{color:'var(--tw-muted)', fontWeight:400, marginLeft:'4px'}}>({totalContacts} · {selectedCount} sélectionnés)</span>}
                </div>
                {totalContacts > 0 && !isOptinMode && (
                  <div style={{display:'flex', gap:'6px', alignItems:'center'}}>
                    {optInCount > 0 && (
                      <span style={{fontSize:'11px', color:'#0d7d39', background:'#e6f7ec', padding:'2px 8px', borderRadius:'4px', fontWeight:500}}>{optInCount} opt-in</span>
                    )}
                    {nonSolliciteCount > 0 && (
                      <span title="Aucune demande de consentement encore envoyée" style={{fontSize:'11px', color:'#5a6573', background:'#f1f4f7', padding:'2px 8px', borderRadius:'4px', fontWeight:500}}>{nonSolliciteCount} non sollicités</span>
                    )}
                    {optOutCount > 0 && (
                      <span title="Contacts qui se sont désabonnés explicitement" style={{fontSize:'11px', color:'#a52d2d', background:'#fde8e8', padding:'2px 8px', borderRadius:'4px', fontWeight:500}}>{optOutCount} opt-out</span>
                    )}
                  </div>
                )}
              </div>
              {audienceLoading && <div style={{fontSize:'12px', color:'var(--tw-muted)'}}>Chargement…</div>}
            </div>
            {audienceError && (
              <div style={{padding:'20px', color:'#a52d2d', fontSize:'13px'}}>Erreur : {audienceError}</div>
            )}
            {!audienceError && !audienceLoading && totalContacts === 0 && (
              <div style={{padding:'40px 20px', color:'var(--tw-muted)', fontSize:'13px', textAlign:'center'}}>Aucun contact ne correspond à ces critères</div>
            )}
            {!audienceError && totalContacts > 0 && (
              <div style={{maxHeight:'420px', overflowY:'auto'}}>
                <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px'}}>
                  <thead>
                    <tr style={{background:'var(--tw-bg)', position:'sticky', top:0, zIndex:1}}>
                      <th style={{padding:'10px 12px', textAlign:'left', borderBottom:'0.5px solid var(--tw-border)', width:'40px'}}>
                        <input type="checkbox" checked={allSelectablePoolSelected} onChange={toggleAll} title={isOptinMode ? "Sélectionner tous les contacts (mode demande d'opt-in)" : "Sélectionner tous les contacts opt-in"} />
                      </th>
                      <th style={{padding:'10px 12px', textAlign:'left', borderBottom:'0.5px solid var(--tw-border)', fontWeight:600, color:'var(--tw-slate)'}}>Société</th>
                      <th style={{padding:'10px 12px', textAlign:'left', borderBottom:'0.5px solid var(--tw-border)', fontWeight:600, color:'var(--tw-slate)'}}>Prénom</th>
                      <th style={{padding:'10px 12px', textAlign:'left', borderBottom:'0.5px solid var(--tw-border)', fontWeight:600, color:'var(--tw-slate)'}}>Nom</th>
                      <th style={{padding:'10px 12px', textAlign:'left', borderBottom:'0.5px solid var(--tw-border)', fontWeight:600, color:'var(--tw-slate)'}}>Fonction</th>
                      <th style={{padding:'10px 12px', textAlign:'left', borderBottom:'0.5px solid var(--tw-border)', fontWeight:600, color:'var(--tw-slate)'}}>Email</th>
                      <th style={{padding:'10px 12px', textAlign:'left', borderBottom:'0.5px solid var(--tw-border)', fontWeight:600, color:'var(--tw-slate)'}}>RGPD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audience.map(c => {
                      // 3 états RGPD distincts (clarification CNIL) :
                      //  - opt-in : accept_emailing=true → vert
                      //  - opt-out : accept_emailing=false ET emailing_unsubscribed_at non-null → rouge
                      //  - non sollicité : accept_emailing=false ET emailing_unsubscribed_at NULL → gris
                      const rgpdStatus = c.accept_emailing === true ? 'optin'
                        : (c.emailing_unsubscribed_at ? 'optout' : 'non_sollicite');
                      const isSelected = selectedIds.has(c.id);
                      // Fond de ligne : rouge clair pour opt-out, neutre pour non sollicité
                      const rowBg = rgpdStatus === 'optout' ? '#fef9f9' : 'white';
                      return (
                        <tr key={c.id} style={{borderBottom:'0.5px solid var(--tw-border)', background: rowBg}}>
                          <td style={{padding:'8px 12px'}}>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleOne(c.id)} />
                          </td>
                          <td style={{padding:'8px 12px', color:'var(--tw-ink)', fontWeight:500}}>{c.societe}</td>
                          <td style={{padding:'8px 12px', color:'var(--tw-slate)'}}>{c.prenom || ''}</td>
                          <td style={{padding:'8px 12px', color:'var(--tw-slate)'}}>{c.nom || ''}</td>
                          <td style={{padding:'8px 12px', color:'var(--tw-muted)'}}>{c.fonction || ''}</td>
                          <td style={{padding:'8px 12px', color:'var(--tw-slate)'}}>{c.email}</td>
                          <td style={{padding:'8px 12px'}}>
                            {rgpdStatus === 'optin' && (
                              <span style={{fontSize:'11px', color:'#0d7d39', background:'#e6f7ec', padding:'2px 8px', borderRadius:'4px', fontWeight:500}}>Opt-in</span>
                            )}
                            {rgpdStatus === 'optout' && (
                              <span title={`Désabonné le ${new Date(c.emailing_unsubscribed_at).toLocaleDateString('fr-FR')}${c.emailing_unsubscribed_source ? ' via ' + c.emailing_unsubscribed_source : ''}`} style={{fontSize:'11px', color:'#a52d2d', background:'#fde8e8', padding:'2px 8px', borderRadius:'4px', fontWeight:500}}>Opt-out</span>
                            )}
                            {rgpdStatus === 'non_sollicite' && (
                              <span title="Aucune demande de consentement envoyée à ce contact à ce jour. Ce contact n'est pas opt-out (il ne s'est jamais désabonné), il est simplement en attente de sollicitation." style={{fontSize:'11px', color:'#5a6573', background:'#f1f4f7', padding:'2px 8px', borderRadius:'4px', fontWeight:500}}>Non sollicité</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* CAMPAGNE + ACTIONS */}
          <div style={{background:'white', border:'0.5px solid var(--tw-border)', borderRadius:'12px', padding:'20px'}}>
            <div style={{fontSize:'12px', fontWeight:600, color:'var(--tw-slate)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'10px'}}>Campagne Brevo à envoyer</div>
            {campaignsError && <div style={{color:'#a52d2d', fontSize:'13px', marginBottom:'10px'}}>Erreur : {campaignsError}</div>}
            {campaignsLoading && <div style={{color:'var(--tw-muted)', fontSize:'13px', marginBottom:'10px'}}>Chargement des campagnes…</div>}
            <select
              value={selectedCampaignId}
              onChange={(e) => { setSelectedCampaignId(e.target.value); setTestResult(null); }}
              disabled={campaignsLoading || campaigns.length === 0}
              style={{width:'100%', padding:'10px 12px', fontSize:'13px', border:'0.5px solid var(--tw-border)', borderRadius:'8px', background:'white', color:'var(--tw-ink)', marginBottom:'16px'}}
            >
              <option value="">— Sélectionner une campagne (brouillon uniquement) —</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>#{c.id} · {c.name} · "{c.subject}"</option>
              ))}
            </select>
            {!campaignsLoading && campaigns.length === 0 && !campaignsError && (
              <div style={{fontSize:'12px', color:'var(--tw-muted)', marginBottom:'16px', fontStyle:'italic'}}>
                Aucune campagne en brouillon. Crée-en une dans Brevo (Marketing → Campagnes → Nouvelle).
              </div>
            )}

            {/* Actions */}
            <div style={{display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap'}}>
              <button
                onClick={handleSendTest}
                disabled={!selectedCampaignId || testSending}
                style={{padding:'10px 18px', background:'transparent', border:'0.5px solid var(--tw-border)', borderRadius:'8px', cursor: selectedCampaignId && !testSending ? 'pointer' : 'not-allowed', fontSize:'13px', color:'var(--tw-ink)', fontWeight:500, opacity: selectedCampaignId && !testSending ? 1 : 0.5}}
              >
                {testSending ? 'Envoi du test…' : 'Envoi de test à c.daumer@texaswin.fr'}
              </button>
              <button
                onClick={() => setConfirmOpen(true)}
                disabled={!canSend}
                style={{padding:'10px 24px', background: canSend ? 'var(--tw-ink)' : 'var(--tw-border)', color:'white', border:'none', borderRadius:'8px', cursor: canSend ? 'pointer' : 'not-allowed', fontSize:'13px', fontWeight:600}}
              >
                Envoyer la campagne aux {selectedCount} contact{selectedCount > 1 ? 's' : ''}
              </button>
            </div>

            {/* Retour test */}
            {testResult && (
              <div style={{marginTop:'12px', padding:'10px 14px', borderRadius:'6px', fontSize:'13px', background: testResult.ok ? '#e6f7ec' : '#fde8e8', color: testResult.ok ? '#0d7d39' : '#a52d2d'}}>
                {testResult.ok
                  ? `Test envoyé à ${testResult.sent_to}. Vérifie ta boîte dans 1-2 min.`
                  : `Erreur test : ${testResult.error}`
                }
              </div>
            )}

            {/* Retour envoi réel */}
            {sendResult && (
              <div style={{marginTop:'12px', padding:'12px 16px', borderRadius:'8px', fontSize:'13px', background: sendResult.ok ? '#e6f7ec' : '#fde8e8', color: sendResult.ok ? '#0d7d39' : '#a52d2d'}}>
                {sendResult.ok ? (
                  <div>
                    <div style={{fontWeight:600, marginBottom:'4px'}}>Campagne envoyée avec succès</div>
                    <div>Audit #{sendResult.data.audit_id} · {sendResult.data.nb_contacts_envoyes} contact(s) · Statut Brevo : {sendResult.data.brevo_status}</div>
                  </div>
                ) : (
                  <div>
                    <div style={{fontWeight:600, marginBottom:'4px'}}>Erreur d'envoi</div>
                    <div>{sendResult.error}</div>
                    {sendResult.detail && sendResult.detail.opt_out && sendResult.detail.opt_out.length > 0 && (
                      <div style={{marginTop:'6px', fontSize:'12px'}}>
                        Contacts opt-out détectés : {sendResult.detail.opt_out.map(c => c.email).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          </React.Fragment>
          )}

          {/* MODAL CONFIRMATION */}
          {confirmOpen && (
            <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999}}>
              <div style={{background:'white', padding:'28px', borderRadius:'12px', maxWidth:'480px', width:'90%', boxShadow:'0 10px 40px rgba(0,0,0,0.3)'}}>
                <h3 style={{margin:'0 0 12px 0', fontSize:'18px', color:'var(--tw-ink)'}}>Confirmer l'envoi</h3>
                <p style={{margin:'0 0 8px 0', fontSize:'14px', color:'var(--tw-slate)', lineHeight:1.5}}>
                  Tu es sur le point d'envoyer la campagne <strong>#{selectedCampaignId}</strong> à <strong>{selectedCount} contact{selectedCount > 1 ? 's' : ''}</strong>.
                </p>
                <p style={{margin:'0 0 20px 0', fontSize:'13px', color:'var(--tw-muted)'}}>
                  Cette action est irréversible. Les contacts opt-out seront automatiquement exclus côté serveur.
                </p>
                <div style={{display:'flex', gap:'10px', justifyContent:'flex-end'}}>
                  <button onClick={() => setConfirmOpen(false)} disabled={sending} style={{padding:'8px 16px', background:'transparent', border:'0.5px solid var(--tw-border)', borderRadius:'8px', cursor:'pointer', fontSize:'13px'}}>Annuler</button>
                  <button onClick={handleSendReal} disabled={sending} style={{padding:'8px 20px', background:'var(--tw-ink)', color:'white', border:'none', borderRadius:'8px', cursor: sending ? 'wait' : 'pointer', fontSize:'13px', fontWeight:600}}>
                    {sending ? 'Envoi en cours…' : 'Confirmer l\'envoi'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
