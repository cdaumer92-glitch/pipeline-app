import * as React from 'react';

export const I = (path, size = 14) => React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }, path);

export const ICONS = {
      chevron:    React.createElement('polyline', {points:'6 9 12 15 18 9'}),
      chevronR:   React.createElement('polyline', {points:'9 18 15 12 9 6'}),
      folder:     React.createElement('path', {d:'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'}),
      doc:        React.createElement(React.Fragment, null, React.createElement('path',{d:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'}), React.createElement('polyline',{points:'14 2 14 8 20 8'})),
      check:      React.createElement('polyline', {points:'20 6 9 17 4 12'}),
      edit:       React.createElement(React.Fragment, null, React.createElement('path',{d:'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'}), React.createElement('path',{d:'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'})),
      trash:      React.createElement(React.Fragment, null, React.createElement('path',{d:'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'})),
      attach:     React.createElement('path', {d:'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'}),
      download:   React.createElement(React.Fragment, null, React.createElement('path',{d:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'}), React.createElement('polyline',{points:'7 10 12 15 17 10'}), React.createElement('line',{x1:12,y1:15,x2:12,y2:3})),
      plus:       React.createElement('path', {d:'M12 5v14M5 12h14'}),
      alert:      React.createElement(React.Fragment, null, React.createElement('circle',{cx:12,cy:12,r:10}), React.createElement('path',{d:'M12 8v4M12 16h.01'})),
      spark:      React.createElement('path', {d:'M13 2L3 14h9l-1 8 10-12h-9l1-8z'}),
      clock:      React.createElement(React.Fragment, null, React.createElement('circle',{cx:12,cy:12,r:10}), React.createElement('polyline',{points:'12 6 12 12 16 14'})),
      mail:       React.createElement(React.Fragment, null, React.createElement('path',{d:'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z'}), React.createElement('polyline',{points:'22,6 12,13 2,6'})),
      bell:       React.createElement(React.Fragment, null, React.createElement('path',{d:'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9'}), React.createElement('path',{d:'M13.73 21a2 2 0 0 1-3.46 0'})),
      replace:    React.createElement(React.Fragment, null, React.createElement('polyline',{points:'1 4 1 10 7 10'}), React.createElement('polyline',{points:'23 20 23 14 17 14'}), React.createElement('path',{d:'M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15'})),
    };

    // Petit bouton icône réutilisable (action discrète sur card)
export const IconBtn = ({ onClick, title, color = 'var(--tw-slate)', hoverColor = 'var(--tw-ink)', hoverBg = 'var(--tw-bg)', children, danger = false }) => (
      React.createElement('button', {
        onClick: onClick,
        title: title,
        'aria-label': title,
        style: { width:'28px', height:'28px', padding:0, background:'white', border:'0.5px solid var(--tw-border)', borderRadius:'7px', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', color: color, transition:'background .15s, color .15s, border-color .15s' },
        onMouseEnter: (e) => { e.currentTarget.style.background = danger ? '#fef2f2' : hoverBg; e.currentTarget.style.color = danger ? 'var(--tw-red)' : hoverColor; e.currentTarget.style.borderColor = danger ? '#fecaca' : 'var(--tw-slate)'; },
        onMouseLeave: (e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = color; e.currentTarget.style.borderColor = 'var(--tw-border)'; }
      }, children)
    );

    // Vocabulaire contrôlé des types d'action — source unique de vérité (évite le drift
    // "Demo"/"Démo" entre les différents formulaires) et alimente le filtre de la liste Actions.

    // Badge de type de société (Suspect / Prospect / Client), au niveau module pour
    // être accessible depuis tous les composants (DashboardConsultant, Dashboard...).
    // Couleurs cohérentes avec celles utilisées ailleurs dans l'app (voir ligne ~4310).
export const typeChip = (type) => {
      const map = {
        'Suspect':  {cls:'var(--meta)', bg:'var(--surface-hover)'},
        'Prospect': {cls:'var(--warning)', bg:'var(--warning-soft)'},
        'Client':   {cls:'var(--primary)', bg:'var(--primary-soft)'},
      };
      const s = map[type] || {cls:'var(--tw-muted)', bg:'var(--surface-hover)'};
      return <span style={{fontSize:'11px',fontWeight:'600',padding:'2px 9px',borderRadius:'10px',color:s.cls,background:s.bg}}>{type||'—'}</span>;
    };

export function getActionStatus(actions) {
      if (!actions || actions.length === 0) return { hasAction: false, isLate: false, nextActionDate: null };
      
      const incompletedActions = actions.filter(a => !a.completed);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let isLate = false;
      let nextActionDate = null;
      
      // Trouver la prochaine action non complétée (la plus proche dans le futur ou la plus récente si en retard)
      if (incompletedActions.length > 0) {
        const sortedActions = incompletedActions.sort((a, b) => {
          const dateA = new Date(a.planned_date);
          const dateB = new Date(b.planned_date);
          return dateA - dateB;
        });
        nextActionDate = sortedActions[0].planned_date;
        
        const actionDate = new Date(nextActionDate);
        actionDate.setHours(0, 0, 0, 0);
        if (actionDate < today) isLate = true;
      }
      
      return { hasAction: incompletedActions.length > 0, isLate, nextActionDate };
    }

export function prospectDisplayName(p) {
      if (!p) return '';
      const ms = Array.isArray(p.marques) ? p.marques : [];
      if (ms.length > 0) return p.name + ' (' + ms.join(' / ') + ')';
      return p.name;
    }

export function getEmptyProspect() {
      return {
        id: null,
        name: '',
        marques: [],
        contact_name: '',
        email: '',
        phone: '',
        adresse: '',
        website: '',
        tel_standard: '',
        statut_societe: '',
        status: 'Prospection',
        status_date: '',
        setup_amount: 0,
        monthly_amount: 0,
        annual_amount: 0,
        training_amount: 0,
        material_amount: 0,
        chance_percent: 20,
        assigned_to: '',
        quote_date: '',
        decision_maker: '',
        solutions_en_place: '',
        notes: '',
        siren: '',
        code_naf: '',
        pdf_url: null,
        // Modules
        module_biz: 0,
        module_biz_avec_fab: 0,
        module_fab: 0,
        module_net: 0,
        module_kub: 0,
        module_mag: 0,
        module_vrp: 0,
        module_col: 0,
        module_log: 0,
        module_jet: 0,
        module_flux_tiers: 0,
        module_compta_sage: false,
        module_facturation_electronique: false
      };
    }

export function calculateTotal(prospect) {
      const monthlyAnnual = prospect.monthly_amount * 12;
      return (prospect.setup_amount || 0) + monthlyAnnual + (prospect.annual_amount || 0) + (prospect.training_amount || 0);
    }

export function formatCurrency(amount) {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
    }

export function formatNumber(num) {
      return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(num) || 0) + ' € H.T.';
    }

export function getStatusColor(status) {
      const colors = {
        'Prospection': '#999',
        'Devis': '#12a0dc',
        'Démo': '#e72c7b',
        'Négociation': '#d3a002',
        'Signé': '#3cd6b9',
        'Ajourné N+1': '#ff9800',
        'Éliminé par nous': '#888',
        'Perdu': '#e23b63'
      };
      return colors[status] || '#666';
    }

export function getProspectCountByCommercial(prospects, commercial) {
      if (commercial === 'Tous') {
        return prospects.length;
      }
      return prospects.filter(p => p.assigned_to === commercial).length;
    }

    // Calculer le statut réel à partir des affaires et devis
export function getProspectRealStatus(affaires, devisList) {
      if (!affaires || affaires.length === 0) {
        return null; // Pas d'affaire = pas de statut affiché
      }

      // Chercher toutes les affaires avec devis actifs (pas affaire Gagnée/Perdue)
      const affairesAvecDevis = [];
      
      for (const affaire of affaires) {
        if (affaire.statut_global === 'Gagné' || affaire.statut_global === 'Perdu') {
          continue; // Ignorer affaires terminées
        }
        
        // Prendre TOUS les devis de l'affaire en cours (même ceux à 100%)
        const devisAffaire = devisList.filter(d => d.affaire_id === affaire.id);
        
        if (devisAffaire.length > 0) {
          // Prendre le devis le plus récent
          const dernierDevis = devisAffaire.sort((a, b) => new Date(b.quote_date || 0) - new Date(a.quote_date || 0))[0];
          affairesAvecDevis.push({
            affaire: affaire,
            devis: dernierDevis
          });
        }
      }

      if (affairesAvecDevis.length === 0) {
        return null; // Pas de devis actif
      }

      // Si plusieurs affaires, prendre la plus récente
      affairesAvecDevis.sort((a, b) => new Date(b.devis.quote_date || 0) - new Date(a.devis.quote_date || 0));
      const affairePlusRecente = affairesAvecDevis[0];

      return {
        affaireName: affairePlusRecente.affaire.nom_affaire,
        devisStatus: affairePlusRecente.devis.devis_status,
        probability: affairePlusRecente.devis.chance_percent,
        quoteDate: affairePlusRecente.devis.quote_date
      };
    }
