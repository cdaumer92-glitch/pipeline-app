// ══════════════════════════════════════════════════════════════
// DONNÉES MÉTIER
// ══════════════════════════════════════════════════════════════

const PIPELINE_API = '/api/public/companies/search';

const MODULES_DEF = [
  { id:'biz',   label:'Biz',     sublabel:'Négoce',          color:'#1a9fdb', img:'https://raw.githubusercontent.com/cdaumer92-glitch/pipeline-app/main/assets/biz.png' },
  { id:'mixte', label:'Biz+Fab', sublabel:'Négoce + Production', color:'#1a9fdb', img:'' },
  { id:'fab',   label:'Fab',     sublabel:'Production',       color:'#1a9fdb', img:'' },
  { id:'net',   label:'Net',     sublabel:'B2B',              color:'#1a9fdb', img:'' },
  { id:'mag',   label:'Mag',     sublabel:'Magasin',          color:'#E72E7B', img:'' },
  { id:'vrp',   label:'VRP',     sublabel:'Représentant',     color:'#E72E7B', img:'' },
  { id:'col',   label:'Col',     sublabel:'Collection',       color:'#E72E7B', img:'' },
  { id:'log',   label:'Log',     sublabel:'Logistique',       color:'#FBC02D', img:'' },
  { id:'jet',   label:'Jet',     sublabel:'Inventaire',       color:'#FBC02D', img:'' },
  { id:'kub',   label:'Kub',     sublabel:'BI',               color:'#64B340', img:'' },
  { id:'flu',   label:'Flux',    sublabel:'Tiers',            color:'#607a7a', img:'' },
];

// Couleurs des modules (pour le CSS variable)
const MOD_COLORS = {biz:'#1a9fdb',mixte:'#1a9fdb',fab:'#1a9fdb',net:'#1a9fdb',mag:'#E72E7B',vrp:'#E72E7B',col:'#E72E7B',log:'#FBC02D',jet:'#FBC02D',kub:'#64B340',flu:'#607a7a'};

// ── Net paliers ───────────────────────────────────────────────
const netPaliers = [
  {min:1,  max:5,  label:'Starter (1-5)',      agents_only:251.75, both:593.00,   heberg:50},
  {min:6,  max:10, label:'Business (6-10)',    agents_only:450.50, both:778.50,   heberg:62.50},
  {min:11, max:20, label:'Pro (11-20)',         agents_only:795.00, both:1123.00,  heberg:78},
  {min:21, max:50, label:'Enterprise (21-50)', agents_only:1722.50,both:2050.50,  heberg:98},
];

function getNetAboPrix() {
  const siege = moduleState.net_siege || 0;
  const agentsVal = moduleState.net_agents_val || 0;
  if (siege === 0 && agentsVal === 0) return { prix:0, label:'' };
  if (agentsVal === 0) return { prix:328, label:'Module Net B2B — Siège' };
  const palier = netPaliers.find(p => p.max === agentsVal);
  if (!palier) return { prix:0, label:'' };
  if (siege > 0) return { prix:palier.both, label:'Net Siège + '+palier.label };
  return { prix:palier.agents_only, label:'Net '+palier.label };
}

// Synchronise net_siege (legacy, attendu 0 ou 1) avec net_siege_active (booléen UX).
// Appelé à chaque modification de la checkbox + à la restauration d'un devis.
function syncNetSiege() {
  moduleState.net_siege = moduleState.net_siege_active ? 1 : 0;
}

const tarifServeurs = {1:30,2:50,3:70,4:90,5:130,6:140,7:150,8:160,9:170,10:180,11:190,12:200,13:210,14:220,15:230,16:240,17:250,18:260,19:270,20:280,21:290,22:300,23:310,30:580};
const tarifSetupServeur = {1:200,2:200,3:200,4:595,5:595,6:595,7:800,8:800,9:800,10:800,11:1000,12:1000,13:1000,14:1000,15:1500,16:1500,17:1500,18:1500,19:1500,20:2000,21:2000,22:2000,23:2000,30:3000,40:4000,50:5000};

const sectionsData = {
  section1: { items: [
    {nom:"Module BIZ (Négoce)", prix:155, unite:"€/mois", dependModule:'biz', moduleColor:'#1a9fdb'},
    {nom:"Module BIZ et FAB", prix:223, unite:"€/mois", dependModule:'mixte', moduleColor:'#1a9fdb'},
    {nom:"Module FAB Standalone (Production seule)", prix:145.5, unite:"€/mois", dependModule:'fab', moduleColor:'#1a9fdb'},
    {nom:"Module Net B2B — Siège", prix:328, unite:"€/mois", dependModule:'net', netSiege:true, moduleColor:'#1a9fdb'},
    {nom:"Module Net B2B — Agents", prix:0, unite:"€/mois", dependModule:'net', netAgents:true, moduleColor:'#1a9fdb'},
    {nom:"Module Kub (Business Intelligence)", prix:20, unite:"€/mois", dependModule:'kub', moduleColor:'#64B340'},
    {nom:"Module Mag : Concentrateur", prix:99, unite:"€/mois", dependModule:'mag', moduleColor:'#E72E7B'},
    {nom:"Module Mag (Nb Caisses déployées)", prix:49, unite:"€/mois", dependModule:'mag', moduleColor:'#E72E7B'},
    {nom:"Module VRP (Représentant)", prix:53, unite:"€/mois", dependModule:'vrp', moduleColor:'#E72E7B'},
    {nom:"Module Col (Collection)", prix:20, unite:"€/mois", dependModule:'col', moduleColor:'#E72E7B'},
    {nom:"Module Log (Logistique)", prix:155, unite:"€/mois", dependModule:'log', moduleColor:'#FBC02D'},
    {nom:"Module Jet (Inventaire)", prix:40, unite:"€/mois", dependModule:'jet', moduleColor:'#FBC02D'},
  ]},
  section2: { items: [
    {nom:"Licence Comptabilité Sage 100", prix:1247, unite:"€/an", dependModule:'comptaSage'},
    {nom:"Intégration Moyens de Paiement", prix:285, unite:"€/an", dependModule:'comptaSage', hasCheckbox:true},
    {nom:"Licence My Report Manager", prix:720, unite:"€/an", dependKub:true, moduleColor:'#64B340', mandatory:true},
    {nom:"Licence My Report User", prix:240, unite:"€/an", dependKub:true, moduleColor:'#64B340'},
    {nom:"Licence My Report Center", prix:120, unite:"€/an", dependKub:true, moduleColor:'#64B340'},
    {nom:"Extension Kub pour Sage ou EBP", prix:720, unite:"€/an", dependKub:true, extensionKub:true, qtyFixed:1},
    {nom:"Extension Kub pour Silae - Paie", prix:720, unite:"€/an", dependKub:true, extensionKub:true, qtyFixed:1},
    {nom:"Extension Kub Multi-sources", prix:3600, unite:"€/an", dependKub:true, extensionKub:true, qtyFixed:1, exclusif:true},
  ]},
  section3: { items: [
    {nom:"Hébergement serveur TexasWin", prix:0, unite:"€/mois", calculé:true, moduleColor:'#1a9fdb'},
    {nom:"Hébergement serveur Net", prix:0, unite:"€/mois", dependNet:true, calculé:true, moduleColor:'#1a9fdb'},
    {nom:"Hébergement serveur Kub", prix:0, unite:"€/mois", dependKub:true, calculé:true, moduleColor:'#64B340'},
    {nom:"Allocation ressources Sage", prix:135, unite:"€/mois", dependSage:true, calculé:true},
    {nom:"Gestion des Flux MAG", prix:40, unite:"€/mois", dependMagConcentrateur:true, calculé:true},
    {nom:"Support MAG/Caisse déployée", prix:15, unite:"€/mois", dependMagCaisses:true, calculé:true, qtyFromMagCaisses:true},
    {nom:"Gestion des Flux", prix:40, unite:"€/mois", dependFluxTiers:true, qtyFromFluxTiers:true, calculé:true, nomDynamique:true},
    {nom:"Gestion Facturation électronique (réception)", prix:40, unite:"€/mois", dependModule:'facturationElec', fixedQty:1, moduleColor:'#007d89'},
    {nom:"+ 0,05 cts par facture reçue", prix:0, unite:"€/mois", dependModule:'facturationElec', info:true},
  ]},
  section4: { items: [
    {nom:"FAS : Installation du logiciel Texas Win", prix:1150, unite:"€", dependBizFab:true, calculé:true, moduleColor:'#1a9fdb'},
    {nom:"Mise en place hébergement TexasWin", prix:0, unite:"€", dependBizFab:true, calculé:true, setupServeur:true, moduleColor:'#1a9fdb'},
    {nom:"Mise en place hébergement Sage", prix:1150, unite:"€", dependSage:true, calculé:true},
    {nom:"Biz/Fab : Modifications d'états commerciaux", prix:1150, unite:"€", dependBizFab:true, tjm:true, defaultQty:0.5, moduleColor:'#1a9fdb'},
    {nom:"Récupération des données", prix:1150, unite:"€", dependBizFab:true, tjm:true, moduleColor:'#1a9fdb'},
    {nom:"Net : Installation et paramétrage", prix:1150, unite:"€", dependNet:true, tjm:true, defaultQty:1, moduleColor:'#1a9fdb'},
    {nom:"Net : Accompagnement Standard", prix:1150, unite:"€", dependNet:true, tjm:true, defaultQty:0.5, moduleColor:'#1a9fdb'},
    {nom:"Mise en oeuvre Connecteur Kub → MyReport", prix:2500, unite:"€", dependKub:true, forfait:true, moduleColor:'#64B340'},
    {nom:"Mag : Installation Back office Siège", prix:1150, unite:"€", dependModule:'mag', dependMagSiege:true, tjm:true, defaultQty:1, moduleColor:'#E72E7B'},
    {nom:"Mag : Installation Magasin", prix:525, unite:"€", dependModule:'mag', dependMagMagasin:true, tjm:true, defaultQtyFromMagCaisses:true, multiplier:0.5, moduleColor:'#E72E7B'},
    {nom:"VRP : Installation et paramétrage", prix:1150, unite:"€", dependVrp:true, tjm:true, defaultQty:1, moduleColor:'#E72E7B'},
    {nom:"Col : Installation et paramétrage", prix:1150, unite:"€", dependCol:true, tjm:true, defaultQty:1, moduleColor:'#E72E7B'},
    {nom:"Log : Installation et paramétrage", prix:1150, unite:"€", dependLog:true, tjm:true, defaultQty:1, moduleColor:'#FBC02D'},
    {nom:"Jet : Installation et paramétrage", prix:1150, unite:"€", dependJet:true, tjm:true, defaultQtyFromJet:true, multiplier:0.5, moduleColor:'#FBC02D'},
    {nom:"Eta : Installation et paramétrage", prix:1150, unite:"€", dependEta:true, tjm:true, defaultQty:0.5, moduleColor:'#FBC02D'},
    {nom:"Développement spécifique", prix:1150, unite:"€", tjm:true},
    {nom:"Gestion de projet et encadrement technique", prix:1150, unite:"€", tjm:true},
    {nom:"Mise en oeuvre Facturation électronique", prix:1150, unite:"€", dependModule:'facturationElec', forfait:true},
  ]},
};

const FORMATION_DATA = [
  { module:'biz', label:'Module Biz (Négoce)',    joursSd:3,   tjm:1150, maxSession:5, qtyFrom:'biz',         activeFrom:'biz' },
  { module:'fab', label:'Module Fab (Production)', joursSd:2,   tjm:1150, maxSession:5, qtyFrom:'fab',         activeFrom:'fab' },
  { module:'net', label:'Module Net (B2B)',         joursSd:1,   tjm:1150, maxSession:5, qtyFrom:'net_users',   activeFrom:'net_siege_active' },
  { module:'mag', label:'Module Mag Siège',         joursSd:1,   tjm:1150, maxSession:3, qtyFrom:null,          activeFrom:'mag', fixedQty:1 },
  { module:'mag', label:'Module Mag Magasin',       joursSd:0.5, tjm:1150, maxSession:2, qtyFrom:'mag_caisses', activeFrom:'mag_caisses' },
  { module:'vrp', label:'Module VRP',               joursSd:0.5, tjm:1150, maxSession:5, qtyFrom:'vrp',         activeFrom:'vrp' },
  { module:'col', label:'Module Col (Collection)',  joursSd:0.25,tjm:1150, maxSession:5, qtyFrom:'col',         activeFrom:'col' },
  { module:'log', label:'Module Log (Logistique)',  joursSd:5,   tjm:1150, maxSession:5, qtyFrom:'log',         activeFrom:'log' },
  { module:'jet', label:'Module Jet (Inventaire)',  joursSd:1,   tjm:1150, maxSession:3, qtyFrom:'jet',         activeFrom:'jet' },
];

// État modules actifs et quantités
const moduleState = {
  biz:0, mixte:0, fab:0, net_siege:0, net_agents:'none', kub:0,
  // PU éditable de la tuile Mixte (Biz+Fab) : par défaut 223€/user, négociable
  mixte_pu: 223,
  // Net : siège en booléen (forfait 328€, pas par user) + nb users séparé pour formation/hébergement
  net_siege_active: false,
  net_users: 0,
  mag:0, mag_caisses:0, vrp:0, col:0, log:0, jet:0,
  fluxTiers:0, comptaSage:false, facturationElec:false,
  // Lignes custom ajoutées par module (tableau d'objets {id, label, pu, qty, remise, unit})
  biz_extra: [], mixte_extra: [], fab_extra: [], net_extra: [], mag_extra: [], vrp_extra: [],
  col_extra: [], log_extra: [], jet_extra: [], kub_extra: [], flu_extra: [],
  col_extra: [], log_extra: [], jet_extra: [], kub_extra: [], flu_extra: [],
  // Aperçu Modules : remise % override par ligne (clé = ligne_key, valeur = % numérique)
  // Si la clé n'existe pas → la ligne est sans remise (0%)
  // Si la clé existe avec une valeur → applique cette remise sur la ligne
  lignes_remises_overrides: {},
  // Aperçu Modules : ordre personnalisé des lignes (drag-and-drop), liste de ligne_key
  apercuOrder: [],
  apercuOrderUserSet: false,
  // Aperçu Modules : état déplié/replié (B : déplié si ≥1 module actif, replié sinon)
  // null = jamais touché par user → comportement auto. true/false = choix manuel mémorisé.
  apercuCollapsed: null,
  // Prestations initiales ajoutées (section 4)
  extra_prestations: [],
  // Renommage personnalisé des prestations (key → label)
  customLabels: {},
  // Ordre personnalisé des prestations (tableau de keys, inclut standards + custom)
  prestationOrder: [],
  // Flag : true si l'utilisateur a explicitement réorganisé via drag-and-drop.
  // Tant que false, l'ordre par défaut (forfaits → fonctionnels → installations → pilotage) est imposé.
  // Sauvegardé avec le devis ; à la réouverture, l'ordre choisi par l'utilisateur est respecté.
  prestationOrderUserSet: false,
  // Contexte de la propale (§1 du .docx)
  // contexteChoix1 : '1' (proposition initiale) ou '2' (mise à jour de proposition existante)
  // contexteChoix2 : 'A' (client connaissant déjà le SaaS) ou 'B' (nouveau prospect)
  // contexteText1, contexteText2 : textes éventuellement modifiés par le commercial (sauvegardés tels quels)
  contexteChoix1: '',
  contexteChoix2: '',
  contexteText1: '',
  contexteText2: '',
  // Overrides formation : {moduleKey: {nb, duree}} — valeurs manuelles qui remplacent le défaut
  formationOverrides: {},
  // Concentrateur middleware standalone (indépendant de Mag)
  middlewareStandalone: false,
  // Overrides manuels de la section formation (par module)
  // Format : { biz: {jours: 4, nb: 7}, mag_siege: {jours: 1.5}, ... }
  formationOverrides: {},
};
// Option FAB partage la remise de Biz (c'est la même tuile)
// Caisses Mag partagent la remise de Mag
// Siège + agents Net partagent la remise de Net
let fluxNoms = [];
let isUpdatingFluxLines = false;

// ══════════════════════════════════════════════════════════════
// FORMAT
// ══════════════════════════════════════════════════════════════
function fmtNum(n) {
  return n.toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function fmtEur(n) { return fmtNum(n) + ' €'; }

// ══════════════════════════════════════════════════════════════
// TUILES MODULES
// ══════════════════════════════════════════════════════════════
// Config fields par module
const MODULE_FIELDS = {
  biz:   [{label:'Utilisateurs Biz seul', key:'biz', unit:'users', prix:155}],
  mixte: [{label:'Utilisateurs Biz + Fab', key:'mixte', unit:'users', prix:223}],
  fab:   [{label:'Licences FAB Standalone', key:'fab', unit:'lic', prix:145.5}],
  net: 'special', // Géré spécialement dans buildTileNet
  mag: [{label:'Caisses déployées', key:'mag_caisses', unit:'caisses', prix:49, fixed:99}],
  vrp: [{label:'Représentants VRP', key:'vrp', unit:'users', prix:53}],
  col: [{label:'Utilisateurs Col', key:'col', unit:'users', prix:20}],
  log: [{label:'Utilisateurs Log', key:'log', unit:'users', prix:155}],
  jet: [{label:'Terminaux Jet', key:'jet', unit:'term.', prix:40}],
  kub: [{label:'Utilisateurs Kub', key:'kub', unit:'users', prix:20}],
  flu: [{label:'Nombre de flux tiers', key:'fluxTiers', unit:'flux', prix:40}],
};

// Calcul brut (avant remise tuile) du total mensuel d'une tuile module
// Les lignes custom ont leur propre remise par ligne — la remise tuile ne s'applique PAS dessus
function calcTileTotalBrut(modId) {
  let total = 0;
  if (modId === 'net') {
    total = getNetAboPrix().prix;
  } else {
    const fields = MODULE_FIELDS[modId];
    if (fields && fields !== 'special') {
      fields.forEach(f => {
        const v = parseFloat(moduleState[f.key]||0);
        // Tuile Mixte : utiliser le PU éditable (mixte_pu) au lieu du PU catalogue (f.prix)
        const pu = (modId === 'mixte' && f.key === 'mixte')
          ? (parseFloat(moduleState.mixte_pu) || f.prix)
          : f.prix;
        total += v * pu;
        if (f.fixed && v > 0) total += f.fixed; // Mag concentrateur
      });
    }
  }
  return total;
}

// Total des lignes custom d'un module (net des remises de ligne)
function calcTileExtraNet(modId) {
  const extras = moduleState[modId + '_extra'] || [];
  let total = 0;
  extras.forEach(line => {
    const pu = parseFloat(line.pu) || 0;
    const qty = parseFloat(line.qty) || 0;
    const remise = parseFloat(line.remise) || 0;
    total += pu * qty * (1 - remise / 100);
  });
  return total;
}

// Total net affiché : brut module + lignes custom (avec leurs propres remises de ligne)
// La remise commerciale ne s'applique plus au niveau tuile mais ligne par ligne (lignes_remises_overrides)
function calcTileTotal(modId) {
  const brut = calcTileTotalBrut(modId);
  const netExtras = calcTileExtraNet(modId);
  return brut + netExtras;
}

function updateNetDisplay() {
  const { prix, label } = getNetAboPrix();
  const labelEl = document.getElementById('net_abo_label');
  if (labelEl) labelEl.textContent = label ? label + ' — ' + fmtNum(prix) + ' €/mois' : '';
}

function updateTileDisplay(modId) {
  const tile = document.getElementById('tile-' + modId);
  if (!tile) return;
  const hasExtras = (moduleState[modId + '_extra'] || []).length > 0;
  const active = isModuleActive(modId) || hasExtras;
  tile.classList.toggle('active', active);
  const netTotal = calcTileTotal(modId);
  const mini = tile.querySelector('.tile-mini-total');
  if (mini) {
    mini.textContent = active ? fmtNum(netTotal) + ' €/mois' : '';
  }
}

function initModulesGrid() {
  const grid = document.getElementById('modules-grid');
  grid.innerHTML = '';
  MODULES_DEF.forEach(mod => {
    const tile = document.createElement('div');
    tile.className = 'module-tile';
    tile.id = 'tile-' + mod.id;
    tile.style.setProperty('--module-color', mod.color);
    tile.innerHTML = `
      <div class="tile-badge">✓</div>
      <div class="mod-icon" style="background:${mod.color}">${mod.label}</div>
      <div class="mod-label">${mod.sublabel}</div>
      <div class="tile-mini-total"></div>`;
    tile.addEventListener('click', () => openModuleDrawer(mod.id));

    // Pour le module Flux : on enveloppe la tuile dans un wrapper qui s'étend sur 4 colonnes
    // de la grille, pour permettre d'afficher les badges des noms de flux à droite.
    // (La tuile Flux est seule sur sa ligne dans la grille 5 colonnes.)
    if (mod.id === 'flu') {
      const wrapper = document.createElement('div');
      wrapper.className = 'flux-tile-wrapper';
      wrapper.id = 'flux-tile-wrapper';
      // grid-column: span 4 → wrapper occupe 4 colonnes de la grille parent
      // grid-template-columns: 1fr 3fr → tuile = 1 cellule (largeur normale), badges = 3 cellules
      // align-items: start → la tuile garde sa hauteur naturelle (n'est pas étirée)
      wrapper.style.cssText = 'grid-column: span 4; display:grid; grid-template-columns: 1fr 3fr; align-items: start; gap:14px;';
      wrapper.appendChild(tile);
      const badges = document.createElement('div');
      badges.id = 'flux-badges';
      // Auto-flow column : remplit verticalement, puis crée une nouvelle colonne après 4 items
      // grid-auto-rows pour hauteur fixe par badge, max 4 lignes par colonne
      badges.style.cssText = 'display:grid; grid-auto-flow: column; grid-template-rows: repeat(4, auto); grid-auto-columns: max-content; gap: 6px 12px; align-content: center; align-self: stretch;';
      wrapper.appendChild(badges);
      grid.appendChild(wrapper);
    } else {
      grid.appendChild(tile);
    }
  });
}

// Mise à jour de l'affichage des badges de noms de flux à droite de la tuile Flux
function updateFluxBadges() {
  const container = document.getElementById('flux-badges');
  if (!container) return;
  const qty = moduleState.fluxTiers || 0;
  if (qty === 0) {
    container.innerHTML = '';
    return;
  }
  const badges = [];
  for (let i = 0; i < qty; i++) {
    const nom = (fluxNoms[i] && fluxNoms[i].trim()) || ('Flux ' + (i+1));
    const safe = nom.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    // Badge cliquable : data-flux-idx contient l'index (0-based) pour l'édition
    badges.push(
      `<span class="flux-badge" data-flux-idx="${i}" `
      + `onclick="startEditFluxBadge(event, ${i})" `
      + `style="display:inline-block;padding:4px 12px;background:#e7eded;color:#3a4a4a;`
      + `border-radius:12px;font-size:12px;white-space:nowrap;cursor:pointer;`
      + `border:1px solid transparent;transition:background 0.15s, border-color 0.15s;" `
      + `onmouseover="this.style.background='#d5dcdc';this.style.borderColor='#b0b8b8';" `
      + `onmouseout="this.style.background='#e7eded';this.style.borderColor='transparent';" `
      + `title="Cliquer pour modifier">${safe}</span>`
    );
  }
  container.innerHTML = badges.join('');
}

// Édition inline d'un badge Flux : remplace le span par un input, sauve à Entrée/blur,
// annule à Échap. Au clic sur le badge, on ne déclenche PAS l'ouverture du drawer
// (event.stopPropagation), pour ne pas perturber l'utilisateur.
function startEditFluxBadge(ev, idx) {
  ev.stopPropagation();
  const span = ev.currentTarget;
  const oldVal = (fluxNoms[idx] && fluxNoms[idx].trim()) || '';
  const placeholder = 'Flux ' + (idx + 1);

  const input = document.createElement('input');
  input.type = 'text';
  input.value = oldVal;
  input.placeholder = placeholder;
  input.style.cssText = 'padding:3px 10px;background:#fff;color:#3a4a4a;border-radius:12px;'
    + 'font-size:12px;border:1px solid #b0b8b8;outline:none;width:120px;';

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    fluxNoms[idx] = input.value.trim();
    refreshFluxNames();
    // Si le drawer Flux est ouvert, mettre à jour son input correspondant aussi
    const drawerInput = document.getElementById('flux_nom_' + (idx + 1));
    if (drawerInput) drawerInput.value = fluxNoms[idx];
  };
  const cancel = () => {
    if (committed) return;
    committed = true;
    updateFluxBadges(); // re-render = rétablit l'ancienne valeur depuis fluxNoms
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', commit);

  span.replaceWith(input);
  input.focus();
  input.select();
}

// ══════════════════════════════════════════════════════════════
// DRAWER CONFIG MODULE
// ══════════════════════════════════════════════════════════════
function isModuleActive(modId) {
  if (modId === 'net') {
    return (moduleState.net_siege || 0) > 0 || (moduleState.net_agents_val || 0) > 0;
  }
  if (modId === 'mag') {
    return (moduleState.mag_caisses || 0) > 0;
  }
  if (modId === 'flu') {
    return (moduleState.fluxTiers || 0) > 0;
  }
  if (modId === 'biz') {
    return (moduleState.biz || 0) > 0;
  }
  const fields = MODULE_FIELDS[modId];
  if (!Array.isArray(fields)) return false;
  return fields.some(f => (moduleState[f.key] || 0) > 0);
}

function openModuleDrawer(modId) {
  renderModuleDrawer(modId);
  document.getElementById('moduleDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
  // Focus premier input après animation
  setTimeout(() => {
    const first = document.querySelector('#moduleDrawer .d-qty');
    if (first) first.focus();
  }, 320);
}

function closeModuleDrawer() {
  document.getElementById('moduleDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

function renderModuleDrawer(modId) {
  const mod = MODULES_DEF.find(m => m.id === modId);
  const drawer = document.getElementById('moduleDrawer');
  drawer.style.setProperty('--module-color', mod.color);

  // Construire le HTML des champs selon le module
  let fieldsHtml = '';
  if (modId === 'net') {
    fieldsHtml = `
      <div class="d-field">
        <label>Siège B2B</label>
        <span class="d-pu">328 € forfait</span>
        <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:0.85rem;">
          <input type="checkbox" id="dq_net_siege" style="width:18px;height:18px;cursor:pointer;"
            ${moduleState.net_siege_active ? 'checked' : ''}
            onchange="moduleState.net_siege_active=this.checked;syncNetSiege();onDrawerChange('net')">
          <span>activé</span>
        </label>
        <span class="d-unit">forfait</span>
      </div>
      <div class="d-field">
        <label>Nb utilisateurs B2B</label>
        <span class="d-pu" style="visibility:hidden;">—</span>
        <input type="number" class="d-qty" id="dq_net_users" min="0" max="99"
          value="${moduleState.net_users || 0}"
          oninput="moduleState.net_users=parseInt(this.value)||0;onDrawerChange('net')">
        <span class="d-unit">users</span>
      </div>
      <div class="d-field">
        <label>Agents (palier)</label>
        <span class="d-pu" style="visibility:hidden;">—</span>
        <select class="d-qty" id="dq_net_agents"
          onchange="moduleState.net_agents_val=parseInt(this.value)||0;onDrawerChange('net')">
          <option value="0">Aucun</option>
          <option value="5">Starter (1-5)</option>
          <option value="10">Business (6-10)</option>
          <option value="20">Pro (11-20)</option>
          <option value="50">Enterprise (21-50)</option>
        </select>
        <span class="d-unit"></span>
      </div>
      <div id="net_abo_label" style="font-size:0.78rem;color:var(--slate);margin-top:8px;font-style:italic;"></div>`;
  } else {
    const fields = MODULE_FIELDS[modId];
    if (Array.isArray(fields)) {
      fieldsHtml = fields.map(f => {
        // Tuile Mixte (Biz+Fab) : le PU est éditable (négociable avec le client)
        // Pour les autres modules : PU en lecture seule
        const puCell = (modId === 'mixte' && f.key === 'mixte')
          ? `<input type="number" class="d-pu" id="dpu_${f.key}" min="0" step="0.01"
              style="width:80px;text-align:right;border:none;background:transparent;font:inherit;color:inherit;padding:0;"
              value="${moduleState.mixte_pu || f.prix}"
              oninput="moduleState.mixte_pu=parseFloat(this.value.replace(',','.'))||0;onDrawerChange('${modId}')"> €`
          : `<span class="d-pu">${fmtNum(f.prix)} €</span>`;
        return `
        <div class="d-field">
          <label>${f.label}${f.note ? `<span class="d-note">${f.note}</span>` : ''}</label>
          ${puCell}
          <input type="number" class="d-qty" id="dq_${f.key}" min="0" max="999"
            value="${moduleState[f.key] || 0}"
            oninput="moduleState['${f.key}']=parseFloat(this.value)||0;${modId === 'mag' ? 'moduleState.mag=(parseFloat(this.value)||0)>0?1:0;' : ''}onDrawerChange('${modId}')">
          <span class="d-unit">${f.unit}</span>
        </div>`;
      }).join('');
    }
  }

  // Section "Noms des flux" : affichée uniquement pour le module Flux quand qty > 0
  // Permet à l'utilisateur de personnaliser le nom de chaque flux (ex: "Shopify", "Joor")
  let fluxNomsHtml = '';
  if (modId === 'flu') {
    const qty = moduleState.fluxTiers || 0;
    if (qty > 0) {
      // S'assurer que fluxNoms a la bonne longueur (sans écraser les valeurs existantes)
      while (fluxNoms.length < qty) fluxNoms.push('');
      fluxNoms.length = qty;
      const rows = [];
      for (let i = 0; i < qty; i++) {
        const val = (fluxNoms[i] || '').replace(/"/g, '&quot;');
        rows.push(`
          <div class="d-field" style="grid-template-columns:80px 1fr;gap:8px;align-items:center;">
            <label>Flux ${i+1}</label>
            <input type="text" id="flux_nom_${i+1}" placeholder="ex : Shopify, Joor..."
              value="${val}"
              oninput="fluxNoms[${i}]=this.value;refreshFluxNames();"
              style="width:100%;padding:6px 10px;border:1px solid #ccc;border-radius:6px;">
          </div>`);
      }
      fluxNomsHtml = `
      <div class="d-section">
        <div class="d-section-title">Noms des flux</div>
        ${rows.join('')}
      </div>`;
    }
  }

  drawer.innerHTML = `
    <div class="drawer-header">
      <div class="d-icon">${mod.label}</div>
      <div class="d-title">
        <h2>${mod.label} — ${mod.sublabel}</h2>
        <p>Configuration du module</p>
      </div>
      <button class="d-close" onclick="closeModuleDrawer()">✕</button>
    </div>
    <div class="drawer-body">
      <div class="d-section">
        <div class="d-section-title">Utilisateurs & options</div>
        ${fieldsHtml}
      </div>
      ${fluxNomsHtml}
      <div class="d-section d-extras-box">
        <div class="d-section-title">Lignes supplémentaires</div>
        <div id="extrasContainer_${modId}"></div>
        <button type="button" class="btn-add-line" onclick="addExtraLine('${modId}')">➕ Ajouter une ligne</button>
      </div>
    </div>
    <div class="drawer-footer" id="drawerFooter">
      <div class="df-sub"><span>Sous-total</span><span class="val" id="dfSub">0,00 €/mois</span></div>
      <div class="df-total"><span class="lab">Total module</span><span class="val" id="dfTotal">0,00 €/mois</span></div>
      <div class="df-actions">
        <button class="btn-cancel" onclick="removeModuleFromDrawer('${modId}')">Retirer le module</button>
        <button class="btn-validate" onclick="closeModuleDrawer()">Valider</button>
      </div>
    </div>`;

  // Net : sélectionner la valeur actuelle dans le select
  if (modId === 'net') {
    const sel = document.getElementById('dq_net_agents');
    if (sel) sel.value = String(moduleState.net_agents_val || 0);
  }

  renderExtraLines(modId);
  updateDrawerFooter(modId);
  if (modId === 'net') updateNetDisplay();
}

function updateDrawerFooter(modId) {
  const brut = calcTileTotalBrut(modId);
  const netExtras = calcTileExtraNet(modId);
  const net = brut + netExtras;
  const footer = document.getElementById('drawerFooter');
  if (!footer) return;
  const subEl = document.getElementById('dfSub');
  const totEl = document.getElementById('dfTotal');
  // Sous-total = brut module + extras bruts (sans remises de ligne)
  const extrasBrut = (moduleState[modId + '_extra'] || []).reduce((s, l) => s + (parseFloat(l.pu)||0) * (parseFloat(l.qty)||0), 0);
  if (subEl) subEl.textContent = fmtNum(brut + extrasBrut) + ' €/mois';
  if (totEl) totEl.textContent = fmtNum(net) + ' €/mois';
}

// ══════════════════════════════════════════════════════════════
// LIGNES CUSTOM (modules + prestations)
// ══════════════════════════════════════════════════════════════
function genLineId() {
  return 'ln_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

function addExtraLine(modId) {
  if (!Array.isArray(moduleState[modId + '_extra'])) moduleState[modId + '_extra'] = [];
  moduleState[modId + '_extra'].push({
    id: genLineId(),
    label: '',
    pu: 0,
    qty: 1,
    remise: 0,
    unit: 'users'
  });
  renderExtraLines(modId);
  onDrawerChange(modId);
  // Focus sur la désignation de la ligne créée
  setTimeout(() => {
    const lines = document.querySelectorAll('#extrasContainer_' + modId + ' .extra-line input[type="text"]');
    const last = lines[lines.length - 1];
    if (last) last.focus();
  }, 10);
}

function removeExtraLine(modId, lineId) {
  const arr = moduleState[modId + '_extra'] || [];
  moduleState[modId + '_extra'] = arr.filter(l => l.id !== lineId);
  renderExtraLines(modId);
  onDrawerChange(modId);
}

function updateExtraLine(modId, lineId, field, value) {
  const arr = moduleState[modId + '_extra'] || [];
  const line = arr.find(l => l.id === lineId);
  if (!line) return;
  if (field === 'label' || field === 'unit') {
    line[field] = value;
  } else {
    line[field] = parseFloat(value) || 0;
  }
  // Re-render de la ligne pour rafraîchir le "Total ligne" en bas de la carte
  // (mais uniquement si ce n'est pas le champ label/unit → sinon on perd le focus du texte en cours de saisie)
  if (field !== 'label' && field !== 'unit') {
    const container = document.getElementById('extrasContainer_' + modId);
    if (container) {
      // Update uniquement le span total de la ligne concernée
      const lines = container.querySelectorAll('.extra-line');
      const idx = arr.findIndex(l => l.id === lineId);
      if (idx >= 0 && lines[idx]) {
        const pu = parseFloat(line.pu) || 0;
        const qty = parseFloat(line.qty) || 0;
        const remise = parseFloat(line.remise) || 0;
        const totalLigne = pu * qty * (1 - remise / 100);
        const valEl = lines[idx].querySelector('.el-total .val');
        if (valEl) valEl.textContent = fmtNum(totalLigne) + ' €/mois';
      }
    }
  }
  onDrawerChange(modId);
}

function renderExtraLines(modId) {
  const container = document.getElementById('extrasContainer_' + modId);
  if (!container) return;
  const arr = moduleState[modId + '_extra'] || [];
  if (arr.length === 0) {
    container.innerHTML = '<div style="font-size:0.78rem;color:#64748b;font-style:italic;margin-bottom:10px;">Aucune ligne personnalisée. Cliquez sur "+ Ajouter une ligne" pour en créer une.</div>';
    return;
  }
  const UNITS = ['users', 'lic', 'pièce', 'forfait', '€/mois', '€'];
  const html = arr.map(line => {
    const pu = parseFloat(line.pu) || 0;
    const qty = parseFloat(line.qty) || 0;
    const remise = parseFloat(line.remise) || 0;
    const totalLigne = pu * qty * (1 - remise / 100);
    const unitOpts = UNITS.map(u => `<option value="${u}" ${u === line.unit ? 'selected' : ''}>${u}</option>`).join('');
    return `
      <div class="extra-line">
        <div class="el-row1">
          <input type="text" placeholder="Désignation (ex: Jet — tarif volume)" value="${(line.label || '').replace(/"/g, '&quot;')}"
            oninput="updateExtraLine('${modId}', '${line.id}', 'label', this.value)">
          <button class="el-del" onclick="removeExtraLine('${modId}', '${line.id}')" title="Supprimer">🗑</button>
        </div>
        <div class="el-row2">
          <div class="el-field">
            <label>PU €</label>
            <input type="number" step="0.01" min="0" value="${pu}"
              oninput="updateExtraLine('${modId}', '${line.id}', 'pu', this.value)">
          </div>
          <div class="el-field">
            <label>Quantité</label>
            <input type="number" step="1" min="0" value="${qty}"
              oninput="updateExtraLine('${modId}', '${line.id}', 'qty', this.value)">
          </div>
          <div class="el-field">
            <label>Unité</label>
            <select onchange="updateExtraLine('${modId}', '${line.id}', 'unit', this.value)">${unitOpts}</select>
          </div>
          <div class="el-field">
            <label>Remise %</label>
            <input type="number" step="1" min="0" max="100" value="${remise}"
              oninput="updateExtraLine('${modId}', '${line.id}', 'remise', this.value)">
          </div>
        </div>
        <div class="el-total">
          <span class="lab">Total ligne</span>
          <span class="val">${fmtNum(totalLigne)} €/mois</span>
        </div>
      </div>`;
  }).join('');
  container.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
// PRESTATIONS CUSTOM (section 4)
// ══════════════════════════════════════════════════════════════
function addExtraPrestation() {
  if (!Array.isArray(moduleState.extra_prestations)) moduleState.extra_prestations = [];
  moduleState.extra_prestations.push({
    id: genLineId(),
    label: '',
    pu: 1150,     // tarif jour standard TexasWin
    qty: 1,
    remise: 0,
    unit: 'jour'
  });
  renderAllSections();
  calculate();
  // Focus sur la désignation de la ligne créée
  setTimeout(() => {
    const lines = document.querySelectorAll('#extraPrestContainer input[type="text"]');
    const last = lines[lines.length - 1];
    if (last) last.focus();
  }, 10);
}

function removeExtraPrestation(lineId) {
  moduleState.extra_prestations = (moduleState.extra_prestations || []).filter(l => l.id !== lineId);
  renderAllSections();
  calculate();
}

function updateExtraPrestation(lineId, field, value) {
  const arr = moduleState.extra_prestations || [];
  const line = arr.find(l => l.id === lineId);
  if (!line) return;
  if (field === 'label' || field === 'unit') {
    line[field] = value;
    // Le label n'affecte pas les montants : on évite le re-render qui casse le focus.
    // L'unit n'affecte pas les montants non plus.
    return;
  }
  line[field] = parseFloat(value) || 0;
  renderAllSections();
  calculate();
}

function calcExtraPrestationsTotal() {
  const arr = moduleState.extra_prestations || [];
  let total = 0;
  arr.forEach(line => {
    const pu = parseFloat(line.pu) || 0;
    const qty = parseFloat(line.qty) || 0;
    const remise = parseFloat(line.remise) || 0;
    total += pu * qty * (1 - remise / 100);
  });
  return total;
}

function onDrawerChange(modId) {
  if (modId === 'flu') updateFluxNoms();
  if (modId === 'net') updateNetDisplay();
  updateDrawerFooter(modId);
  updateTileDisplay(modId);
  renderAllSections();
  calculate();
}

function removeModuleFromDrawer(modId) {
  // Reset des champs moduleState liés à ce module
  const fields = MODULE_FIELDS[modId];
  if (Array.isArray(fields)) {
    fields.forEach(f => { moduleState[f.key] = 0; });
  }
  if (modId === 'mag') { moduleState.mag = 0; moduleState.mag_caisses = 0; }
  if (modId === 'net') {
    moduleState.net_siege = 0;
    moduleState.net_siege_active = false;
    moduleState.net_users = 0;
    moduleState.net_agents_val = 0;
  }
  if (modId === 'flu') { moduleState.fluxTiers = 0; updateFluxNoms(); }
  if (modId === 'biz') { moduleState.biz = 0; }
  if (modId === 'mixte') { moduleState.mixte = 0; moduleState.mixte_pu = 223; }
  updateTileDisplay(modId);
  renderAllSections();
  calculate();
  closeModuleDrawer();
}

// Touche Escape pour fermer
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('moduleDrawer')?.classList.contains('open')) {
    closeModuleDrawer();
  }
});

function renderModuleConfigs() {
  // Synchroniser les checkboxes globales
  const cs = document.getElementById('chk_comptaSage');
  const cf = document.getElementById('chk_factElec');
  const cm = document.getElementById('chk_middleware');
  if (cs) cs.checked = moduleState.comptaSage;
  if (cf) cf.checked = moduleState.facturationElec;
  if (cm) cm.checked = !!moduleState.middlewareStandalone;
  // Mettre à jour les mini-totaux dans les tuiles
  MODULES_DEF.forEach(mod => updateTileDisplay(mod.id));
}

function updateModQty(key, val) {
  // Conservée pour compatibilité (ancien chemin). Utilisée par certains onchange legacy.
  const v = parseFloat(val) || 0;
  moduleState[key] = v;
  if (key === 'fluxTiers') updateFluxNoms();
  if (key === 'net_siege') { updateNetDisplay(); }
  MODULES_DEF.forEach(mod => {
    const fields = MODULE_FIELDS[mod.id];
    if (Array.isArray(fields) && fields.some(f => f.key === key)) updateTileDisplay(mod.id);
  });
  renderAllSections();
  calculate();
}

// ══════════════════════════════════════════════════════════════
// FLUX NOMS
// ══════════════════════════════════════════════════════════════
function updateFluxNoms() {
  const qty = moduleState.fluxTiers || 0;

  // Cacher l'ancien panel séparé s'il existe encore dans le HTML (compat)
  // Les inputs sont désormais rendus dans le drawer Flux directement.
  const panel = document.getElementById('fluxNomsPanel');
  if (panel) panel.style.display = 'none';

  // Ajuster la longueur du tableau fluxNoms (préserver les valeurs existantes)
  while (fluxNoms.length < qty) fluxNoms.push('');
  fluxNoms.length = qty;

  // Si le drawer Flux est ouvert, le re-render pour afficher/cacher les inputs noms
  const drawer = document.getElementById('moduleDrawer');
  if (drawer && drawer.classList.contains('open')
      && drawer.querySelector('.d-icon')?.textContent === 'Flux') {
    renderModuleDrawer('flu');
  }

  refreshFluxNames();
}

function refreshFluxNames() {
  const qty = moduleState.fluxTiers || 0;
  // Compléter fluxNoms avec des valeurs par défaut "Flux N" pour les noms vides,
  // utilisé pour le rendu de la propale et des sections.
  // On ne modifie PAS le tableau fluxNoms lui-même (qui peut contenir des chaînes vides
  // que l'utilisateur veut remplir) — on construit une vue propre pour l'aval.
  for (let i = 0; i < qty; i++) {
    if (typeof fluxNoms[i] === 'undefined') fluxNoms[i] = '';
  }
  // Mettre à jour les lignes section4 flux dynamiques
  updateDynamicFluxRows();
  renderSection3();
  // Rafraîchir les badges affichés à côté de la tuile Flux dans la grille
  if (typeof updateFluxBadges === 'function') updateFluxBadges();
  calculate();
}

// ══════════════════════════════════════════════════════════════
// CALCULS HÉBERGEMENT
// ══════════════════════════════════════════════════════════════
function getMaxUsers() {
  const biz = moduleState.biz || 0;
  const mixte = moduleState.mixte || 0;
  const fab = moduleState.fab || 0;
  // Total users = Biz seul + Mixte (Biz+Fab) + Fab Standalone
  // Chaque user = 1 licence serveur (les 3 cas s'additionnent)
  return biz + mixte + fab;
}
function getKubQty() { return moduleState.kub || 0; }
function getNetSiege() { return moduleState.net_siege || 0; }

function calcHebTW() {
  const u = getMaxUsers(); if (u===0) return 0;
  const marge = (parseFloat(document.getElementById('margeHebergement')?.value)||30)/100;
  const base = tarifServeurs[u] || (u>=24&&u<=29 ? 310+(u-23)*27 : 580);
  return Math.round(base/(1-marge)/5)*5;
}
function calcSetupTW() {
  const u = getMaxUsers(); if (u===0) return 0;
  const marge = (parseFloat(document.getElementById('margeSetup')?.value)||30)/100;
  let base = tarifSetupServeur[u];
  if (!base) { if(u<=29) base=tarifSetupServeur[23]; else if(u<=39) base=tarifSetupServeur[30]; else if(u<=49) base=tarifSetupServeur[40]; else base=tarifSetupServeur[50]; }
  return Math.round(base/(1-marge)/5)*5;
}
function calcHebKub() {
  const k = getKubQty(); if (k===0) return 0;
  const marge = (parseFloat(document.getElementById('margeHebergement')?.value)||30)/100;
  const base = tarifServeurs[k] || (k>=24&&k<=29 ? 310+(k-23)*27 : 580);
  return Math.round(base/(1-marge)/5)*5;
}
function calcHebNet() {
  const siegeActif = !!moduleState.net_siege_active;
  const users = moduleState.net_users || 0;
  const agentsVal = moduleState.net_agents_val || 0;
  if (!siegeActif && agentsVal === 0) return 0;
  const marge = (parseFloat(document.getElementById('margeHebergement')?.value)||30)/100;
  if (agentsVal > 0) {
    // Agents actifs : tarif hébergement palier dédié (indépendant du nb users)
    const palier = netPaliers.find(p => p.max === agentsVal);
    const base = palier ? palier.heberg : 50;
    return Math.round(base / (1 - marge) / 5) * 5;
  }
  // Siège seul sans agents : barème tarifServeurs basé sur le nombre d'users B2B
  const u = users || 1; // fallback 1 si users non saisi
  const base = tarifServeurs[u] || (u>=24&&u<=29 ? 310+(u-23)*27 : 580);
  return Math.round(base/(1-marge)/5)*5;
}

// ══════════════════════════════════════════════════════════════
// RENDU SECTIONS
// ══════════════════════════════════════════════════════════════
// Valeurs stockées pour section3 et section4 (qty, remise)
const sectionValues = { section3: {}, section4: {} };

function renderAllSections() {
  renderSection3();
  renderSection4();
  renderSection2();
}

function renderSection3() {
  const tbody = document.getElementById('tbody-section3');
  tbody.innerHTML = '';
  const biz = moduleState.biz > 0 || moduleState.mixte > 0 || moduleState.fab > 0;
  const mag = moduleState.mag > 0;
  const magCaisses = moduleState.mag_caisses > 0;
  const kub = moduleState.kub > 0;
  const net = (moduleState.net_siege || 0) > 0 || (moduleState.net_agents_val || 0) > 0;
  const flux = moduleState.fluxTiers > 0;
  const sage = moduleState.comptaSage;
  const felec = moduleState.facturationElec;

  const hebTW   = calcHebTW();
  const hebKub  = calcHebKub();
  const maxU    = getMaxUsers();
  const kubQ    = getKubQty();

  const items = [
    { show: biz,        nom: `Hébergement serveur TexasWin (${maxU} users)`, total: hebTW,                    unite: '€/mois' },
    { show: net,        nom: 'Hébergement serveur Net' + ((moduleState.net_agents_val||0) > 0 ? ' — ' + (netPaliers.find(p=>p.max===moduleState.net_agents_val)?.label||'') : ` (${moduleState.net_users||0} users)`), total: calcHebNet(), unite: '€/mois' },
    { show: kub,        nom: `Hébergement serveur Kub (${kubQ} users)`,       total: hebKub,                  unite: '€/mois' },
    { show: sage,       nom: 'Allocation ressources Sage',                    total: 135,                     unite: '€/mois' },
    { show: mag,        nom: 'Gestion des Flux MAG',                          total: 40,                      unite: '€/mois' },
    { show: magCaisses, nom: `Support MAG — ${moduleState.mag_caisses} caisse(s)`, total: 15 * moduleState.mag_caisses, unite: '€/mois' },
    { show: flux,       nom: `Gestion des Flux (${fluxNoms.map((n,i)=>n||('Flux '+(i+1))).join(', ')})`, total: 40 * moduleState.fluxTiers, unite: '€/mois' },
    { show: felec,      nom: 'Gestion Facturation électronique (réception)',  total: 40,                      unite: '€/mois' },
    { show: moduleState.middlewareStandalone, nom: 'Concentrateur middleware multi-magasin', total: 99, unite: '€/mois' },
  ];

  items.forEach(it => {
    if (!it.show) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${it.nom}</td><td class="center">—</td><td class="center">—</td><td class="right">${fmtEur(it.total)}</td><td class="center">${it.unite}</td>`;
    tbody.appendChild(tr);
  });
  if (!tbody.children.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Aucun service actif</td></tr>';
  }
}

function renderSection4() {
  const tbody = document.getElementById('tbody-section4');
  tbody.innerHTML = '';
  const biz = moduleState.biz > 0 || moduleState.mixte > 0 || moduleState.fab > 0;
  const mag = moduleState.mag > 0;
  const net = (moduleState.net_siege || 0) > 0 || (moduleState.net_agents_val || 0) > 0;
  const kub = moduleState.kub > 0;
  const vrp = moduleState.vrp > 0;
  const col = moduleState.col > 0;
  const log = moduleState.log > 0;
  const jet = moduleState.jet > 0;
  const felec = moduleState.facturationElec;
  const sage = moduleState.comptaSage;

  const setupTW = calcSetupTW();
  const marge = (parseFloat(document.getElementById('margeSetup')?.value)||30)/100;
  const fasPrice = 1150; // Forfait fixe : pas de marge appliquée à la FAS

  // ── 1) Collecter toutes les lignes actives (standards + custom) ──
  // Ordre logique :
  //   a. Forfaits (FAS, hébergements, connecteurs Kub & Facturation élec)
  //   b. Sujets fonctionnels (modifs états, reprise données)
  //   c. Installations modules (Mag, Net, VRP, Col, Log, Jet, Flux)
  //   d. Pilotage (gestion projet, dév spécifique) en fin
  const items = [];
  // -- a. Forfaits --
  if (biz)  items.push({ key:'fas', kind:'forfait', defaultLabel:'FAS : Installation du logiciel TexasWin', prix:fasPrice });
  if (biz)  items.push({ key:'setup_tw', kind:'auto', defaultLabel:'Mise en place hébergement TexasWin', prix:setupTW });
  if (sage) items.push({ key:'setup_sage', kind:'auto', defaultLabel:'Mise en place hébergement Sage', prix:1150 });
  if (kub)  items.push({ key:'kub_connect', kind:'forfait', defaultLabel:'Mise en oeuvre Connecteur Kub → MyReport', prix:2500 });
  if (felec) items.push({ key:'felec_param', kind:'forfait', defaultLabel:'Mise en oeuvre Facturation électronique', prix:1150 });
  // -- b. Sujets fonctionnels --
  if (biz)  items.push({ key:'modif_etats', kind:'tjm', defaultLabel:"Biz/Fab : Modifications d'états commerciaux", prix:1150, defaultQty:0.5 });
  if (biz)  items.push({ key:'recup', kind:'tjm', defaultLabel:'Récupération des données', prix:1150, defaultQty:0 });
  // -- c. Installations modules --
  if (mag)  items.push({ key:'mag_siege', kind:'tjm', defaultLabel:'Mag : Installation Back office Siège', prix:1150, defaultQty:1 });
  if (mag)  items.push({ key:'mag_mag', kind:'tjm', defaultLabel:'Mag : Installation Magasin', prix:525, defaultQty: moduleState.mag_caisses * 0.5 });
  if (net)  items.push({ key:'net_install', kind:'tjm', defaultLabel:'Net : Installation et paramétrage', prix:1150, defaultQty:1 });
  if (net)  items.push({ key:'net_accom', kind:'tjm', defaultLabel:'Net : Accompagnement Standard', prix:1150, defaultQty:0.5 });
  if (vrp)  items.push({ key:'vrp_install', kind:'tjm', defaultLabel:'VRP : Installation et paramétrage', prix:1150, defaultQty:1 });
  if (col)  items.push({ key:'col_install', kind:'tjm', defaultLabel:'Col : Installation et paramétrage', prix:1150, defaultQty:1 });
  if (log)  items.push({ key:'log_install', kind:'tjm', defaultLabel:'Log : Installation et paramétrage', prix:1150, defaultQty:1 });
  if (jet)  items.push({ key:'jet_install', kind:'tjm', defaultLabel:'Jet : Installation et paramétrage', prix:1150, defaultQty: moduleState.jet * 0.5 });
  for (let i = 1; i <= (moduleState.fluxTiers||0); i++) {
    const nom = fluxNoms[i-1] || ('Flux '+i);
    items.push({ key:'flux_'+i, kind:'tjm', defaultLabel:nom+' : Installation et paramétrage', prix:1150, defaultQty:0.5 });
  }
  // -- d. Pilotage (en fin) --
  items.push({ key:'gestion_proj', kind:'tjm', defaultLabel:'Gestion de projet et encadrement technique', prix:1150, defaultQty:0 });
  items.push({ key:'dev_spec', kind:'tjm', defaultLabel:'Développement spécifique', prix:1150, defaultQty:0 });

  // Ajouter les lignes custom (kind='custom') avec key = 'custom_<id>'
  const extras = moduleState.extra_prestations || [];
  extras.forEach(line => {
    items.push({ key:'custom_'+line.id, kind:'custom', defaultLabel:'', customLine: line });
  });

  // ── 2) Appliquer l'ordre personnalisé ──
  const activeKeys = items.map(i => i.key);
  // Règle métier :
  //  - Si l'utilisateur n'a JAMAIS drag-and-droppé sur ce devis : on impose l'ordre par défaut (forfaits → fonctionnels → installations → pilotage)
  //  - Si l'utilisateur a déjà drag-and-droppé (flag prestationOrderUserSet=true) : on respecte son ordre
  //    (en nettoyant les keys obsolètes et en ajoutant les nouvelles à la fin pour gérer l'ajout/suppression de modules)
  if (moduleState.prestationOrderUserSet) {
    moduleState.prestationOrder = (moduleState.prestationOrder || []).filter(k => activeKeys.includes(k));
    activeKeys.forEach(k => {
      if (!moduleState.prestationOrder.includes(k)) moduleState.prestationOrder.push(k);
    });
  } else {
    moduleState.prestationOrder = activeKeys.slice();
  }
  // Trier items selon prestationOrder
  const orderedItems = moduleState.prestationOrder
    .map(k => items.find(i => i.key === k))
    .filter(Boolean);

  // ── 3) Rendre les lignes ──
  orderedItems.forEach(it => {
    const customLabel = moduleState.customLabels?.[it.key];
    const displayLabel = customLabel !== undefined ? customLabel : it.defaultLabel;
    const tr = document.createElement('tr');
    tr.className = 'drag-handle-row';
    tr.dataset.key = it.key;
    tr.draggable = true;

    // Label cell : poignée + input éditable (+ sous-ligne pour les custom)
    let labelCellHtml = '';
    if (it.kind === 'custom') {
      const line = it.customLine;
      const initialLabel = customLabel !== undefined ? customLabel : (line.label || '');
      labelCellHtml = `
        <div class="prest-label-cell">
          <span class="drag-handle" title="Glisser pour réorganiser">⋮⋮</span>
          <input type="text" class="prest-label-input is-custom-line" placeholder="Désignation prestation..."
            value="${initialLabel.replace(/"/g, '&quot;')}"
            oninput="setPrestationLabel('${it.key}', this.value);updateExtraPrestation('${line.id}', 'label', this.value)">
        </div>
        <div class="prest-custom-subrow">
          <span>PU €</span>
          <input type="number" step="0.01" min="0" value="${parseFloat(line.pu)||0}"
            onchange="updateExtraPrestation('${line.id}', 'pu', this.value)">
          <select onchange="updateExtraPrestation('${line.id}', 'unit', this.value)">
            ${['jour','forfait','heure','unité'].map(u => `<option value="${u}" ${u===(line.unit||'jour')?'selected':''}>${u}</option>`).join('')}
          </select>
          <button class="prest-custom-del" onclick="removeExtraPrestation('${line.id}')">🗑 Supprimer</button>
        </div>`;
    } else {
      labelCellHtml = `
        <div class="prest-label-cell">
          <span class="drag-handle" title="Glisser pour réorganiser">⋮⋮</span>
          <input type="text" class="prest-label-input" value="${displayLabel.replace(/"/g, '&quot;')}"
            oninput="setPrestationLabel('${it.key}', this.value)"
            title="Cliquer pour renommer">
        </div>`;
    }

    // Cellules qté / remise / total
    let qtyCellHtml, remiseCellHtml, totalCellHtml;
    if (it.kind === 'auto') {
      qtyCellHtml = '<td class="center">—</td>';
      remiseCellHtml = '<td class="center">—</td>';
      totalCellHtml = `<td class="right">${fmtEur(it.prix)}</td>`;
    } else if (it.kind === 'forfait') {
      qtyCellHtml = '<td class="center">Forfait</td>';
      remiseCellHtml = '<td class="center">—</td>';
      totalCellHtml = `<td class="right">${fmtEur(it.prix)}</td>`;
    } else if (it.kind === 'tjm') {
      if (sectionValues.section4[it.key] === undefined) sectionValues.section4[it.key] = { qty: it.defaultQty||0, remise: 0 };
      const sv = sectionValues.section4[it.key];
      const total = it.prix * sv.qty * (1 - sv.remise/100);
      qtyCellHtml = `<td class="center"><input type="number" class="inline-qty" value="${sv.qty}" min="0" step="0.5"
        onchange="sectionValues.section4['${it.key}'].qty=parseFloat(this.value)||0;calculate()"></td>`;
      remiseCellHtml = `<td class="center"><input type="number" class="inline-qty" value="${sv.remise}" min="0" max="100"
        onchange="sectionValues.section4['${it.key}'].remise=parseFloat(this.value)||0;calculate()"></td>`;
      totalCellHtml = `<td class="right total-s4-${it.key}">${fmtEur(total)}</td>`;
    } else if (it.kind === 'custom') {
      const line = it.customLine;
      const pu = parseFloat(line.pu) || 0;
      const qty = parseFloat(line.qty) || 0;
      const remise = parseFloat(line.remise) || 0;
      const total = pu * qty * (1 - remise/100);
      qtyCellHtml = `<td class="center"><input type="number" class="inline-qty" value="${qty}" min="0" step="0.5"
        onchange="updateExtraPrestation('${line.id}', 'qty', this.value)"></td>`;
      remiseCellHtml = `<td class="center"><input type="number" class="inline-qty" value="${remise}" min="0" max="100"
        onchange="updateExtraPrestation('${line.id}', 'remise', this.value)"></td>`;
      totalCellHtml = `<td class="right">${fmtEur(total)}</td>`;
    }

    tr.innerHTML = `<td>${labelCellHtml}</td>${qtyCellHtml}${remiseCellHtml}${totalCellHtml}`;
    if (it.kind === 'custom') tr.style.background = '#f0f9ff';
    attachDragHandlers(tr);
    tbody.appendChild(tr);
  });

  // Ligne finale : bouton d'ajout
  const trAdd = document.createElement('tr');
  trAdd.innerHTML = `<td colspan="4" style="padding:6px 0;">
    <button onclick="addExtraPrestation()" style="background:white;border:1.5px dashed #7dd3fc;color:#0369a1;border-radius:6px;padding:6px 12px;cursor:pointer;font-weight:700;font-size:0.85rem;width:100%;">
      ➕ Ajouter une ligne de prestation
    </button>
  </td>`;
  tbody.appendChild(trAdd);
}

// ── Renommage persistant d'une prestation ──
function setPrestationLabel(key, newLabel) {
  if (!moduleState.customLabels) moduleState.customLabels = {};
  // Si vide, on supprime le renommage (retour au label par défaut)
  if (!newLabel || !newLabel.trim()) {
    delete moduleState.customLabels[key];
  } else {
    moduleState.customLabels[key] = newLabel;
  }
  // Pas de re-render (sinon on perd le focus en cours de saisie)
}

// ── Drag & Drop des lignes de prestations ──
let draggedRow = null;

function attachDragHandlers(tr) {
  tr.addEventListener('dragstart', (e) => {
    draggedRow = tr;
    tr.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    // Nécessaire pour Firefox
    try { e.dataTransfer.setData('text/plain', tr.dataset.key); } catch {}
  });
  tr.addEventListener('dragend', () => {
    tr.classList.remove('dragging');
    document.querySelectorAll('#tbody-section4 tr').forEach(r => {
      r.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    draggedRow = null;
  });
  tr.addEventListener('dragover', (e) => {
    if (!draggedRow || draggedRow === tr) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = tr.getBoundingClientRect();
    const isTop = (e.clientY - rect.top) < rect.height / 2;
    tr.classList.toggle('drag-over-top', isTop);
    tr.classList.toggle('drag-over-bottom', !isTop);
  });
  tr.addEventListener('dragleave', () => {
    tr.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  tr.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!draggedRow || draggedRow === tr) return;
    const draggedKey = draggedRow.dataset.key;
    const targetKey = tr.dataset.key;
    const rect = tr.getBoundingClientRect();
    const placeBefore = (e.clientY - rect.top) < rect.height / 2;

    // Mise à jour de prestationOrder
    const order = moduleState.prestationOrder;
    const fromIdx = order.indexOf(draggedKey);
    if (fromIdx < 0) return;
    order.splice(fromIdx, 1);
    let toIdx = order.indexOf(targetKey);
    if (toIdx < 0) return;
    if (!placeBefore) toIdx += 1;
    order.splice(toIdx, 0, draggedKey);

    // Marquer que l'utilisateur a réorganisé : on respectera désormais son ordre, même au prochain rendu / réouverture
    moduleState.prestationOrderUserSet = true;

    renderSection4();
  });
}



// ─────────────────────────────────────────────────────────────
// Bug 3 : Logique métier Kub / MyReport
// Indices Section 2 : 2=Manager (mandatory), 3=User, 4=Center, 5/6/7=Extensions
// Règle : Manager + User + Center DOIT == qté Kub
// Défauts à l'activation Kub : Manager=1, User=qtéKub-1, Center=0, Extensions=0
// ─────────────────────────────────────────────────────────────
const KUB_INDEX_MANAGER = 2;
const KUB_INDEX_USER = 3;
const KUB_INDEX_CENTER = 4;
const KUB_INDEX_EXTENSIONS = [5, 6, 7]; // Sage/EBP, Silae, Multi-sources

// Pose les valeurs par défaut Kub si elles ne sont pas encore initialisées
// Appelée par renderSection2 quand Kub passe à actif
function applyKubDefaults() {
  const kubQty = moduleState.kub || 0;
  if (kubQty <= 0) return;

  // Manager : toujours 1 par défaut (cas où jamais initialisé)
  if (sectionValues['section2_' + KUB_INDEX_MANAGER] === undefined) {
    sectionValues['section2_' + KUB_INDEX_MANAGER] = { qty: 1, remise: 0, checked: true };
  }
  // User : qtéKub - 1 par défaut
  if (sectionValues['section2_' + KUB_INDEX_USER] === undefined) {
    sectionValues['section2_' + KUB_INDEX_USER] = { qty: Math.max(0, kubQty - 1), remise: 0, checked: false };
  }
  // Center : 0 par défaut
  if (sectionValues['section2_' + KUB_INDEX_CENTER] === undefined) {
    sectionValues['section2_' + KUB_INDEX_CENTER] = { qty: 0, remise: 0, checked: false };
  }
  // Extensions Kub : 0 par défaut (au lieu de qtyFixed:1)
  KUB_INDEX_EXTENSIONS.forEach(i => {
    if (sectionValues['section2_' + i] === undefined) {
      sectionValues['section2_' + i] = { qty: 0, remise: 0, checked: false };
    }
  });
}

// Vérifie la cohérence des licences MyReport.
// Retourne null si OK, sinon un message d'erreur à afficher.
function validateKubLicences() {
  const kubQty = moduleState.kub || 0;
  if (kubQty <= 0) return null; // Pas de Kub, rien à vérifier

  const qManager = sectionValues['section2_' + KUB_INDEX_MANAGER]?.qty || 0;
  const qUser = sectionValues['section2_' + KUB_INDEX_USER]?.qty || 0;
  const qCenter = sectionValues['section2_' + KUB_INDEX_CENTER]?.qty || 0;
  const total = qManager + qUser + qCenter;

  if (total !== kubQty) {
    return `Incohérence licences MyReport : Manager (${qManager}) + User (${qUser}) + Center (${qCenter}) = ${total}, mais la quantité Kub est ${kubQty}.\n\nMerci d'ajuster les quantités pour que le total soit égal à ${kubQty}.`;
  }
  return null;
}


function renderSection2() {
  const kub = moduleState.kub > 0;
  const sage = moduleState.comptaSage;
  const card = document.getElementById('card-section2');
  card.style.display = (kub || sage) ? '' : 'none';
  if (!kub && !sage) return;
  // Bug 3 : poser les défauts Kub avant le rendu
  if (kub) applyKubDefaults();
  const tbody = document.getElementById('tbody-section2');
  tbody.innerHTML = '';
  sectionsData.section2.items.forEach((item, i) => {
    const showSage = item.dependModule === 'comptaSage' && sage;
    const showKub = item.dependKub && kub;
    if (!showSage && !showKub) return;
    if (sectionValues['section2_'+i] === undefined) sectionValues['section2_'+i] = {qty: item.qtyFixed||1, remise:0, checked: item.mandatory||false};
    const sv = sectionValues['section2_'+i];
    const total = item.prix * sv.qty * (1 - sv.remise/100);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.nom}</td>
      <td class="center"><input type="number" class="inline-qty" value="${sv.qty}" min="0"
        onchange="sectionValues['section2_${i}'].qty=parseFloat(this.value)||0;calculate()"></td>
      <td class="center"><input type="number" class="inline-qty" value="${sv.remise}" min="0" max="100"
        onchange="sectionValues['section2_${i}'].remise=parseFloat(this.value)||0;calculate()"></td>
      <td class="right total-s2-${i}">${fmtEur(total)}</td>
      <td class="center">${item.unite}</td>`;
    tbody.appendChild(tr);
  });
}

function updateDynamicFluxRows() {
  // Appelé par refreshFluxNames - re-render section4
  renderSection4();
}

// ══════════════════════════════════════════════════════════════
// FORMATION
// ══════════════════════════════════════════════════════════════
function getModQtyForFormation(qtyFrom) {
  if (!qtyFrom) return 1;
  if (qtyFrom === 'net_users') return moduleState.net_users || 0;
  if (qtyFrom === 'net_siege') return moduleState.net_siege || 0; // legacy
  if (qtyFrom === 'mag_caisses') return moduleState.mag_caisses || 0;
  // Users mixtes (Biz+Fab) : comptent pour la formation Biz ET la formation Fab
  if (qtyFrom === 'biz') return (moduleState.biz || 0) + (moduleState.mixte || 0);
  if (qtyFrom === 'fab') return (moduleState.fab || 0) + (moduleState.mixte || 0);
  return moduleState[qtyFrom] || 0;
}
function isModActiveForFormation(activeFrom) {
  if (activeFrom === 'net_siege_active') return !!moduleState.net_siege_active;
  if (activeFrom === 'net_siege') return (moduleState.net_siege||0) > 0; // legacy
  if (activeFrom === 'mag_caisses') return (moduleState.mag||0)>0 && (moduleState.mag_caisses||0)>0;
  // Users mixtes (Biz+Fab) : déclenchent l'activation des formations Biz ET Fab
  if (activeFrom === 'biz') return (moduleState.biz || 0) > 0 || (moduleState.mixte || 0) > 0;
  if (activeFrom === 'fab') return (moduleState.fab || 0) > 0 || (moduleState.mixte || 0) > 0;
  // Booléens (true/false) ou nombres (>0)
  const val = moduleState[activeFrom];
  if (typeof val === 'boolean') return val;
  return (val||0) > 0;
}

function calculateFormation() {
  const tbody = document.getElementById('tbody-formation');
  const card = document.getElementById('card-formation');
  tbody.innerHTML = '';
  let total = 0;
  let hasLines = false;
  if (!moduleState.formationOverrides) moduleState.formationOverrides = {};

  FORMATION_DATA.forEach(f => {
    if (!isModActiveForFormation(f.activeFrom)) return;

    // Clé unique pour cette ligne dans les overrides (module + label si plusieurs Mag par ex.)
    const key = f.module + ':' + f.label;
    const ov = moduleState.formationOverrides[key] || {};

    // Nb apprenants : priorité à l'override manuel, sinon calcul auto (users du module)
    const nbDefault = f.fixedQty !== undefined ? f.fixedQty : getModQtyForFormation(f.qtyFrom);
    const nb = (ov.nb !== undefined && ov.nb !== null) ? ov.nb : nbDefault;
    if (!nb || nb <= 0) return;
    hasLines = true;

    // Durée : priorité à l'override, sinon joursSd par défaut
    const duree = (ov.duree !== undefined && ov.duree !== null) ? ov.duree : f.joursSd;
    const sessions = Math.max(1, Math.ceil(nb / f.maxSession));
    const joursTotal = duree * sessions;
    const cout = joursTotal * f.tjm;
    total += cout;

    const safeKey = key.replace(/'/g, "\\'");
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${f.label}</td>
      <td class="center">
        <input type="number" class="inline-qty" step="0.25" min="0"
          value="${duree}" title="Durée en jours par session"
          onchange="setFormationOverride('${safeKey}', 'duree', this.value)">
      </td>
      <td class="center">
        <input type="number" class="inline-qty" step="1" min="0"
          value="${nb}" title="Nombre d'apprenants"
          onchange="setFormationOverride('${safeKey}', 'nb', this.value)">
      </td>
      <td class="center">${sessions}</td>
      <td class="center">${joursTotal % 1 === 0 ? joursTotal : joursTotal.toFixed(2)} j</td>
      <td class="center">${f.maxSession}</td>
      <td style="text-align:right;padding-right:12px;font-weight:700;color:var(--purple)">${fmtEur(cout)}</td>`;
    tbody.appendChild(tr);
  });

  card.style.display = hasLines ? '' : 'none';
  const sideBlock = document.getElementById('sidebar-formation');

  if (hasLines) {
    const qualiopi = total * 0.15;
    const totalAvec = total + qualiopi;
    // Ligne Qualiopi
    const trQ = document.createElement('tr');
    trQ.className = 'qualiopi-row';
    trQ.innerHTML = `<td colspan="6">+ Frais de gestion Qualiopi (15%)</td><td style="text-align:right;padding-right:12px;">${fmtEur(qualiopi)}</td>`;
    tbody.appendChild(trQ);
    // Total
    const trT = document.createElement('tr');
    trT.className = 'total-row';
    trT.innerHTML = `<td colspan="6" style="font-weight:700;">Total formation (Qualiopi inclus)</td><td style="text-align:right;padding-right:12px;">${fmtEur(totalAvec)}</td>`;
    tbody.appendChild(trT);

    document.getElementById('total_formation').textContent = fmtEur(totalAvec);
    document.getElementById('totalFormationDisplay').innerHTML = fmtNum(totalAvec) + ' <span>€ HT</span>';
    sideBlock.style.display = '';
    return totalAvec;
  }
  sideBlock.style.display = 'none';
  return 0;
}

// Stocke/efface un override formation (durée ou nb apprenants)
function setFormationOverride(key, field, value) {
  if (!moduleState.formationOverrides) moduleState.formationOverrides = {};
  const v = parseFloat(value);
  if (!moduleState.formationOverrides[key]) moduleState.formationOverrides[key] = {};
  if (value === '' || value === null || isNaN(v)) {
    // Champ vidé : retour au calcul auto
    delete moduleState.formationOverrides[key][field];
    if (Object.keys(moduleState.formationOverrides[key]).length === 0) {
      delete moduleState.formationOverrides[key];
    }
  } else {
    moduleState.formationOverrides[key][field] = v;
  }
  calculate();
}

// ══════════════════════════════════════════════════════════════
// CONSTRUCTION DES LIGNES — Modules / Infrastructure / Abonnements
// ══════════════════════════════════════════════════════════════
// Factorisée pour être utilisée à la fois par :
//   - calculate() (alimentation en temps réel de l'aperçu propale)
//   - buildConfigJson() (génération du .docx)
// Retourne { lignesAbo, lignesModules, lignesInfra, totalMensuel, totalModules, totalInfra }
function buildLignesModulesInfra() {
  const lignesAbo = [];      // total combiné — conservé pour compatibilité avec l'ancien Python
  const lignesModules = [];  // modules métier (Biz, Fab, Net, Mag, VRP, Col, Log, Jet, Kub, Flu)
  const lignesInfra = [];    // infrastructure (hébergement, gestion flux, support, allocation Sage, etc.)
  const ms = moduleState;
  const ligneKey = (modId, nom) => (modId || 'infra') + '::' + nom;
  const remiseEffectiveLigne = (modId, nom) => {
    const overrides = ms.lignes_remises_overrides || {};
    const k = ligneKey(modId, nom);
    if (Object.prototype.hasOwnProperty.call(overrides, k)) {
      const v = parseFloat(overrides[k]);
      return isNaN(v) ? 0 : v;
    }
    return 0;
  };
  const addAbo = (nom, qty, pu, modId, unite) => {
    if (!unite) unite = '€/mois';
    const brut = (qty != null && pu != null) ? qty * pu : pu;
    if (brut <= 0) return;
    const r = remiseEffectiveLigne(modId, nom);
    const net = brut * (1 - r / 100);
    const ligne = { nom, montant: net, unite };
    if (qty != null && pu != null) {
      ligne.qty = qty;
      ligne.prix_unitaire = pu;
    }
    if (r > 0) { ligne.prix_brut = brut; ligne.remise_pct = r; }
    if (modId) { ligne._key = ligneKey(modId, nom); ligne._modId = modId; }
    lignesAbo.push(ligne);
    if (modId) lignesModules.push(ligne); else lignesInfra.push(ligne);
  };

  // Modules : avec qty + pu pour l'affichage propal
  addAbo('Module BIZ (Négoce)', (ms.biz||0), 155, 'biz', '€/mois/user');
  addAbo('Module BIZ et FAB', (ms.mixte||0), parseFloat(ms.mixte_pu)||223, 'mixte', '€/mois/user');
  addAbo('Module FAB Standalone (Production seule)', (ms.fab||0), 145.5, 'fab', '€/mois/user');
  // Module Net B2B : 3 cas (siège seul / agents seul / siège+agents)
  const netSiegeActif = !!ms.net_siege_active;
  const netAgentsVal = ms.net_agents_val || 0;
  if (netSiegeActif || netAgentsVal > 0) {
    const palier = netPaliers.find(p => p.max === netAgentsVal);
    if (palier && netSiegeActif) {
      addAbo(`Module Net B2B — Siège + Agents ${palier.label}`, null, palier.both, 'net', '€/mois');
    } else if (palier && !netSiegeActif) {
      addAbo(`Module Net B2B — Agents ${palier.label}`, null, palier.agents_only, 'net', '€/mois');
    } else if (netSiegeActif) {
      addAbo('Module Net B2B — Siège', null, 328, 'net', '€/mois');
    }
  }
  addAbo('Module Kub (Business Intelligence)', (ms.kub||0), 20, 'kub', '€/mois/user');
  if ((ms.mag||0)>0) addAbo('Module Mag : Concentrateur', 1, 99, 'mag', '€/mois');
  addAbo('Module Mag (Nb Caisses déployées)', (ms.mag_caisses||0), 49, 'mag', '€/mois/caisse');
  addAbo('Module VRP (Représentant)', (ms.vrp||0), 53, 'vrp', '€/mois/user');
  addAbo('Module Col (Collection)', (ms.col||0), 20, 'col', '€/mois/user');
  addAbo('Module Log (Logistique)', (ms.log||0), 155, 'log', '€/mois/user');
  addAbo('Module Jet (Inventaire)', (ms.jet||0), 40, 'jet', '€/mois/user');

  // Infrastructure : forfait sans qté/pu
  if ((ms.biz||0)>0||(ms.mixte||0)>0||(ms.fab||0)>0) addAbo('Hébergement serveur TexasWin', null, calcHebTW(), null, '€/mois');
  if ((ms.mag||0)>0) addAbo('Gestion des Flux MAG', null, 40, null, '€/mois');
  if ((ms.mag_caisses||0)>0) addAbo('Support MAG/Caisse déployée', null, 15*(ms.mag_caisses||0), null, '€/mois');
  // Noms de flux : on utilise la variable globale fluxNoms (synchronisée par le drawer)
  // Avec fallback "Flux N" pour les entrées vides
  const _fluxNomsLocal = (fluxNoms || []).map((n, i) => n || ('Flux ' + (i+1)));
  if ((ms.fluxTiers||0)>0) addAbo('Gestion des Flux ('+_fluxNomsLocal.slice(0, ms.fluxTiers).join(', ')+')', null, 40*(ms.fluxTiers||0), null, '€/mois');
  if (ms.facturationElec) addAbo('Gestion Facturation électronique (réception)', null, 40, null, '€/mois');
  if (ms.comptaSage) addAbo('Allocation ressources Sage', null, 135, null, '€/mois');
  if ((ms.kub||0)>0) addAbo('Hébergement serveur Kub', null, calcHebKub(), null, '€/mois');
  if (ms.middlewareStandalone) addAbo('Concentrateur middleware multi-magasin', null, 99, null, '€/mois');

  // Lignes custom ajoutées dans le drawer de chaque module
  ['biz','mixte','fab','net','kub','mag','vrp','col','log','jet','flu'].forEach(modId => {
    const extras = ms[modId + '_extra'] || [];
    extras.forEach(line => {
      const pu = parseFloat(line.pu) || 0;
      const qty = parseFloat(line.qty) || 0;
      const remise = parseFloat(line.remise) || 0;
      if (pu > 0 && qty > 0) {
        const brut = pu * qty;
        const net = brut * (1 - remise / 100);
        const label = line.label || (`Ligne custom ${modId.toUpperCase()}`);
        const unite = line.unit ? `€/mois/${line.unit}` : '€/mois';
        const ligne = { nom: label, qty, prix_unitaire: pu, montant: net, unite };
        if (remise > 0) { ligne.prix_brut = brut; ligne.remise_pct = remise; }
        // Clé pour permettre drag-and-drop / override sur lignes custom aussi
        ligne._key = (modId || 'infra') + '::' + label;
        ligne._modId = modId;
        lignesAbo.push(ligne);
        lignesModules.push(ligne);
      }
    });
  });

  const totalMensuel = lignesAbo.reduce((s,l)=>s+l.montant,0);
  const totalModules = lignesModules.reduce((s,l)=>s+l.montant,0);
  const totalInfra = lignesInfra.reduce((s,l)=>s+l.montant,0);

  return { lignesAbo, lignesModules, lignesInfra, totalMensuel, totalModules, totalInfra };
}


// ══════════════════════════════════════════════════════════════
// APERÇU PROPALE — MODULES (collapsible sous les tuiles)
// ══════════════════════════════════════════════════════════════
// Convertit l'unité interne (ex: '€/mois/user') vers le format affiché 'mois / user'
function uniteToFacturationLabel(unite) {
  if (!unite) return '';
  // Format interne : '€/mois', '€/mois/user', '€/mois/caisse', '€/mois/lic', '€/an', '€/an/lic'...
  // Format affiché : 'mois / forfait', 'mois / user', 'mois / caisse', 'mois / licence', 'an / licence'...
  let s = unite.replace(/^€\//, '');           // 'mois/user'
  const parts = s.split('/');                   // ['mois', 'user']
  const periode = parts[0] || 'mois';           // mois ou an
  let unit = parts[1] || 'forfait';             // user, caisse, lic, forfait, etc.
  // Normalisations cosmétiques
  if (unit === 'lic') unit = 'licence';
  if (unit === 'term.' || unit === 'term') unit = 'terminal';
  return periode + ' / ' + unit;
}

// Détermine l'état déplié/replié au chargement (B : auto si jamais touché)
function shouldApercuBeCollapsed() {
  const ms = moduleState;
  // Si l'utilisateur a fait un choix manuel, on respecte
  if (ms.apercuCollapsed === true || ms.apercuCollapsed === false) return ms.apercuCollapsed;
  // Sinon : déplié si ≥1 module actif, replié sinon
  const aucunModule = !((ms.biz||0) > 0 || (ms.fab||0) > 0
    || ms.net_siege_active || (ms.net_agents_val||0) > 0
    || (ms.kub||0) > 0 || (ms.mag||0) > 0 || (ms.mag_caisses||0) > 0
    || (ms.vrp||0) > 0 || (ms.col||0) > 0 || (ms.log||0) > 0 || (ms.jet||0) > 0);
  return aucunModule;
}

// Toggle clic sur le header → mémorise le choix manuel
function toggleApercu() {
  const wrap = document.getElementById('apercu-modules');
  if (!wrap) return;
  const wasCollapsed = wrap.classList.contains('collapsed');
  if (wasCollapsed) {
    wrap.classList.remove('collapsed');
    moduleState.apercuCollapsed = false;
  } else {
    wrap.classList.add('collapsed');
    moduleState.apercuCollapsed = true;
  }
}

// Liste des modules potentiellement actifs (pour le formulaire Remise rapide)
const APERCU_MODULES_LIST = [
  { id: 'biz', label: 'Biz' },
  { id: 'fab', label: 'Fab' },
  { id: 'net', label: 'Net' },
  { id: 'kub', label: 'Kub' },
  { id: 'mag', label: 'Mag' },
  { id: 'vrp', label: 'Vrp' },
  { id: 'col', label: 'Col' },
  { id: 'log', label: 'Log' },
  { id: 'jet', label: 'Jet' },
];

// Quels modules ont au moins une ligne dans l'aperçu courant ?
// Source de vérité : buildLignesModulesInfra() (pas de variable globale)
function getCurrentApercuKeys() {
  try {
    const r = buildLignesModulesInfra();
    return (r.lignesModules || []).map(l => l._key).filter(Boolean);
  } catch(e) {
    return [];
  }
}

function getModulesActifsApercu() {
  const keys = getCurrentApercuKeys();
  const set = new Set();
  keys.forEach(k => {
    const idx = k.indexOf('::');
    if (idx > 0) set.add(k.substring(0, idx));
  });
  return APERCU_MODULES_LIST.filter(m => set.has(m.id));
}

// Toggle du panneau Remise rapide (bouton ⚡)
function toggleRemiseRapide(ev, forceState) {
  if (ev) ev.stopPropagation();
  const panel = document.getElementById('apercu-rapide');
  const btn = document.querySelector('.ap-btn-rapide');
  if (!panel || !btn) return;
  const willOpen = (forceState !== undefined) ? forceState : (panel.style.display === 'none');
  if (willOpen) {
    // Construire la grille des modules actifs
    const modules = getModulesActifsApercu();
    const grid = document.getElementById('ap-rapide-grid');
    if (modules.length === 0) {
      grid.innerHTML = '<div style="color:var(--slate);font-size:0.85rem;font-style:italic;">Aucun module actif. Activez un module d\'abord.</div>';
    } else {
      grid.innerHTML = modules.map(m => `
        <div class="ap-rapide-cell">
          <label>${m.label}</label>
          <input type="number" min="0" max="100" step="1" placeholder="0"
            id="ap-rapide-input-${m.id}" data-modid="${m.id}">
          <span class="ap-rapide-pct">%</span>
        </div>
      `).join('');
    }
    document.getElementById('ap-rapide-warn').style.display = 'none';
    panel.style.display = 'block';
    btn.classList.add('open');
  } else {
    panel.style.display = 'none';
    btn.classList.remove('open');
  }
}

// Appliquer les remises saisies dans le formulaire Remise rapide
// Option α : écrase TOUS les overrides existants des modules concernés (avec confirmation si overrides existaient)
function applyRemiseRapide() {
  const inputs = document.querySelectorAll('#ap-rapide-grid input[data-modid]');
  if (!inputs.length) { toggleRemiseRapide(null, false); return; }

  // Récupérer les valeurs saisies (champ vide = pas d'application sur ce module)
  // Validation : non-numérique → flash rouge et on ignore. Hors plage → clamp avec flash.
  const toApply = {};   // {modId: pct}
  let hasInvalid = false;
  inputs.forEach(inp => {
    const v = inp.value.trim();
    if (v === '') return;
    const n = parseFloat(v.replace(',', '.'));
    if (isNaN(n)) {
      flashInputError(inp, 'Valeur non numérique ignorée');
      hasInvalid = true;
      return;
    }
    let clamped = n;
    let reason = null;
    if (clamped < 0) { clamped = 0; reason = 'Valeur négative ramenée à 0%'; }
    if (clamped > 100) { clamped = 100; reason = 'Valeur > 100% ramenée à 100%'; }
    if (reason) {
      flashInputError(inp, reason);
      inp.value = clamped;
    }
    toApply[inp.dataset.modid] = clamped;
  });

  if (Object.keys(toApply).length === 0) {
    const warn = document.getElementById('ap-rapide-warn');
    warn.textContent = hasInvalid ? 'Toutes les valeurs saisies sont invalides.' : 'Aucune valeur saisie.';
    warn.style.display = 'block';
    return;
  }
  // Reset warn si on en avait un précédemment
  document.getElementById('ap-rapide-warn').style.display = 'none';

  // Vérifier si des overrides existants vont être écrasés
  const overrides = moduleState.lignes_remises_overrides || (moduleState.lignes_remises_overrides = {});
  const keys = getCurrentApercuKeys();
  let nbExistingOverrides = 0;
  keys.forEach(k => {
    const idx = k.indexOf('::');
    if (idx <= 0) return;
    const modId = k.substring(0, idx);
    if (toApply.hasOwnProperty(modId) && Object.prototype.hasOwnProperty.call(overrides, k)) {
      nbExistingOverrides++;
    }
  });

  if (nbExistingOverrides > 0) {
    const ok = confirm(`Cette action va écraser ${nbExistingOverrides} remise(s) déjà saisie(s) dans l'aperçu pour les modules concernés. Continuer ?`);
    if (!ok) return;
  }

  // Appliquer : pour chaque ligne d'un module concerné, écrire l'override
  keys.forEach(k => {
    const idx = k.indexOf('::');
    if (idx <= 0) return;
    const modId = k.substring(0, idx);
    if (toApply.hasOwnProperty(modId)) {
      overrides[k] = toApply[modId];
    }
  });

  // Fermer le panneau et recalculer
  toggleRemiseRapide(null, false);
  calculate();
}

// Reset : efface tous les overrides (toutes les remises ligne saisies)
function resetAllOverrides() {
  const overrides = moduleState.lignes_remises_overrides || {};
  const nb = Object.keys(overrides).length;
  if (nb === 0) { alert('Aucune remise saisie à effacer.'); return; }
  const ok = confirm(`Effacer ${nb} remise(s) saisie(s) dans l'aperçu ? Cette action ne peut pas être annulée.`);
  if (!ok) return;
  moduleState.lignes_remises_overrides = {};
  calculate();
}

// Met à jour le % d'override d'une ligne (vide = supprime override = retour à l'héritage)
// Helper : feedback visuel court sur input avec valeur invalide ou corrigée
// Affiche un border rouge + animation shake pendant 600ms, puis nettoie.
// Le 'reason' est affiché en title (tooltip) pendant la durée du flash.
function flashInputError(inputEl, reason) {
  if (!inputEl) return;
  inputEl.classList.remove('input-error', 'input-shake');
  // Force reflow pour relancer l'animation
  void inputEl.offsetWidth;
  inputEl.classList.add('input-error', 'input-shake');
  if (reason) {
    const oldTitle = inputEl.title;
    inputEl.title = reason;
    setTimeout(() => { inputEl.title = oldTitle || ''; }, 1500);
  }
  setTimeout(() => {
    inputEl.classList.remove('input-error', 'input-shake');
  }, 600);
}

function setLigneRemiseOverride(key, valStr, inputEl) {
  const overrides = moduleState.lignes_remises_overrides || (moduleState.lignes_remises_overrides = {});
  const trimmed = (valStr == null ? '' : String(valStr).trim());
  if (trimmed === '') {
    // Champ vide → retour à l'héritage : on supprime l'override
    delete overrides[key];
  } else {
    // Validation : si non numérique → flash rouge et on ignore
    let v = parseFloat(trimmed.replace(',', '.'));
    if (isNaN(v)) {
      flashInputError(inputEl, 'Valeur non numérique ignorée');
      // Restaurer l'affichage à l'override existant (ou vide si pas d'override)
      if (inputEl) inputEl.value = (overrides[key] != null ? overrides[key] : '');
      return;
    }
    // Clamp avec feedback si la valeur a été ajustée
    let clamped = v;
    let reason = null;
    if (clamped < 0) { clamped = 0; reason = 'Valeur négative ramenée à 0%'; }
    if (clamped > 100) { clamped = 100; reason = 'Valeur > 100% ramenée à 100%'; }
    if (reason) {
      flashInputError(inputEl, reason);
      if (inputEl) inputEl.value = clamped;
    }
    overrides[key] = clamped;
  }
  calculate();  // recalcul complet (totaux sidebar, propale, etc.)
}

// Drag-and-drop : applique le réordonnancement après un drop
function applyApercuReorder(draggedKey, targetKey, position) {
  const ms = moduleState;
  // Construire l'ordre courant des lignes affichées (clés depuis buildLignesModulesInfra,
  // tri actuel = celui d'apercuOrder si user a réorganisé, sinon ordre naturel)
  let currentOrder = getCurrentApercuKeys();
  if (ms.apercuOrderUserSet && Array.isArray(ms.apercuOrder) && ms.apercuOrder.length) {
    // Réordonner currentOrder selon apercuOrder pour que les indices correspondent à l'affichage
    const inOrder = ms.apercuOrder.filter(k => currentOrder.includes(k));
    const newKeys = currentOrder.filter(k => !inOrder.includes(k));
    currentOrder = inOrder.concat(newKeys);
  }
  if (!currentOrder.includes(draggedKey) || !currentOrder.includes(targetKey)) return;
  if (draggedKey === targetKey) return;
  const idxFrom = currentOrder.indexOf(draggedKey);
  currentOrder.splice(idxFrom, 1);
  let idxTo = currentOrder.indexOf(targetKey);
  if (position === 'after') idxTo += 1;
  currentOrder.splice(idxTo, 0, draggedKey);
  ms.apercuOrder = currentOrder;
  ms.apercuOrderUserSet = true;
  calculate();
}

// Rendu principal du tableau Aperçu Modules
function renderApercuModules(lignesModules, totalModules) {
  const wrap = document.getElementById('apercu-modules');
  const tbody = document.getElementById('apercu-tbody');
  const countEl = document.getElementById('apercu-count');
  const totalEl = document.getElementById('apercu-total');
  if (!wrap || !tbody) return;

  // Affiché seulement si au moins une ligne
  if (!lignesModules || lignesModules.length === 0) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';

  // État déplié/replié
  if (shouldApercuBeCollapsed()) wrap.classList.add('collapsed');
  else wrap.classList.remove('collapsed');

  // Réordonner selon apercuOrder si l'user a explicitement réorganisé
  let lignes = lignesModules.slice();
  const ms = moduleState;
  if (ms.apercuOrderUserSet && Array.isArray(ms.apercuOrder) && ms.apercuOrder.length) {
    const ordered = [];
    const seen = new Set();
    ms.apercuOrder.forEach(k => {
      const found = lignes.find(l => l._key === k);
      if (found && !seen.has(k)) { ordered.push(found); seen.add(k); }
    });
    // Ajouter les lignes nouvelles (pas encore dans l'ordre user)
    lignes.forEach(l => { if (l._key && !seen.has(l._key)) ordered.push(l); });
    lignes = ordered;
  }

  // Header : compteur + total
  countEl.textContent = lignes.length + (lignes.length > 1 ? ' lignes' : ' ligne');
  totalEl.textContent = fmtNum(totalModules) + ' €/mois';

  // Tbody
  const overrides = ms.lignes_remises_overrides || {};
  const rows = lignes.map(l => {
    const key = l._key || '';
    const hasOverride = key && Object.prototype.hasOwnProperty.call(overrides, key);
    const remValue = hasOverride ? overrides[key] : '';
    const inheritedClass = hasOverride ? '' : 'inherited';
    // Pour les lignes infra forfaitaires (qty/prix_unitaire absents), on affiche '—'
    const qtyStr = (l.qty != null) ? l.qty : '—';
    const puStr  = (l.prix_unitaire != null) ? fmtNum(l.prix_unitaire) : '—';
    const totStr = fmtNum(l.montant);
    const factStr = uniteToFacturationLabel(l.unite);
    // Si pas de qty/pu (forfait sans détail), pas d'édition de remise (pas de sens)
    const remCell = (l.qty != null && l.prix_unitaire != null && key)
      ? `<input type="number" class="ap-rem-input ${inheritedClass}" min="0" max="100" step="1"
           placeholder="0"
           value="${remValue === '' ? '' : remValue}"
           onchange="setLigneRemiseOverride('${key.replace(/'/g, '\\\'')}', this.value, this)"
           onblur="setLigneRemiseOverride('${key.replace(/'/g, '\\\'')}', this.value, this)">`
      : '<span style="color:#cbd5e1;">—</span>';
    const grip = key
      ? `<span draggable="true" ondragstart="apercuDragStart(event,'${key.replace(/'/g, '\\\'')}')" ondragend="apercuDragEnd(event)">⋮⋮</span>`
      : '';
    return `<tr data-key="${key}" ondragover="apercuDragOver(event)" ondrop="apercuDrop(event,'${key.replace(/'/g, '\\\'')}')" ondragleave="apercuDragLeave(event)">
      <td class="ap-col-grip">${grip}</td>
      <td class="ap-col-desig">${escapeHtml(l.nom)}</td>
      <td class="ap-col-qty">${qtyStr}</td>
      <td class="ap-col-pu">${puStr}</td>
      <td class="ap-col-rem">${remCell}</td>
      <td class="ap-col-tot">${totStr}</td>
      <td class="ap-col-fact">${factStr}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

// Helper : escape HTML pour les noms de lignes
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Drag-and-drop handlers
let _apercuDragKey = null;
function apercuDragStart(ev, key) {
  _apercuDragKey = key;
  ev.dataTransfer.effectAllowed = 'move';
  // Marquer la ligne pour feedback visuel
  const tr = ev.target.closest('tr');
  if (tr) tr.classList.add('dragging');
}
function apercuDragEnd(ev) {
  document.querySelectorAll('#apercu-tbody tr').forEach(tr => {
    tr.classList.remove('dragging');
    tr.classList.remove('drag-over');
  });
  _apercuDragKey = null;
}
function apercuDragOver(ev) {
  if (!_apercuDragKey) return;
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'move';
  const tr = ev.target.closest('tr');
  if (tr && tr.dataset.key !== _apercuDragKey) tr.classList.add('drag-over');
}
function apercuDragLeave(ev) {
  const tr = ev.target.closest('tr');
  if (tr) tr.classList.remove('drag-over');
}
function apercuDrop(ev, targetKey) {
  ev.preventDefault();
  if (!_apercuDragKey || _apercuDragKey === targetKey) {
    apercuDragEnd(ev);
    return;
  }
  // Position : si le drop est dans la moitié supérieure → before, sinon → after
  const tr = ev.target.closest('tr');
  let position = 'before';
  if (tr) {
    const rect = tr.getBoundingClientRect();
    const offsetY = ev.clientY - rect.top;
    position = (offsetY > rect.height / 2) ? 'after' : 'before';
  }
  applyApercuReorder(_apercuDragKey, targetKey, position);
  apercuDragEnd(ev);
}

// ══════════════════════════════════════════════════════════════
// CALCULATE
// ══════════════════════════════════════════════════════════════
function calculate() {
  let totalMensuel = 0, totalAnnuel = 0, totalPrest = 0;

  const biz = moduleState.biz||0;
  const mixte = moduleState.mixte||0;
  const fab = moduleState.fab||0;
  const net = moduleState.net_siege||0;
  const kub = moduleState.kub||0;
  const mag = moduleState.mag||0;
  const magC = moduleState.mag_caisses||0;
  const vrp = moduleState.vrp||0;
  const col = moduleState.col||0;
  const log = moduleState.log||0;
  const jet = moduleState.jet||0;
  const flux = moduleState.fluxTiers||0;

  // Sections 1 (Modules) + 3 (Infrastructure) : calculées via buildLignesModulesInfra()
  // qui est la source unique de vérité (utilisée aussi par l'aperçu et la propale).
  // Les remises par ligne (overrides) sont prises en compte automatiquement.
  const _lmiCalc = buildLignesModulesInfra();
  const s1total = _lmiCalc.totalModules;
  totalMensuel += s1total;

  // Section 3 : infrastructure (issue du même calcul)
  const s3total = _lmiCalc.totalInfra;
  totalMensuel += s3total;

  document.getElementById('total_section1').textContent = fmtNum(s1total) + ' €/mois';
  document.getElementById('total_section3').textContent = fmtNum(s3total) + ' €/mois';

  // Section 2 : licences annuelles
  let s2total = 0;
  sectionsData.section2.items.forEach((item, i) => {
    const showKub = item.dependKub && kub > 0;
    const showSage = item.dependModule === 'comptaSage' && moduleState.comptaSage;
    if (!showKub && !showSage) return;
    const sv = sectionValues['section2_'+i];
    if (!sv) return;
    const ligneTotal = item.prix * sv.qty * (1 - sv.remise/100);
    s2total += ligneTotal;
    // Bug 1 : MAJ du total affiché sur la ligne
    const cell = document.querySelector('.total-s2-' + i);
    if (cell) cell.textContent = fmtEur(ligneTotal);
  });
  totalAnnuel += s2total;
  if (s2total > 0) document.getElementById('total_section2').textContent = fmtNum(s2total) + ' €/an';

  // Section 4 : prestations
  let s4total = 0;
  const marge = (parseFloat(document.getElementById('margeSetup')?.value)||30)/100;
  const fasP = 1150; // Forfait fixe (pas de marge sur la FAS)
  const setupP = calcSetupTW();
  if (biz>0||fab>0) s4total += fasP;
  if (biz>0||fab>0) s4total += setupP;
  if (moduleState.comptaSage) s4total += 1150;

  // Items TJM depuis sectionValues
  const tjmKeys = ['modif_etats','recup','net_install','net_accom','mag_siege','mag_mag','vrp_install','col_install','log_install','jet_install','dev_spec','gestion_proj'];
  const forfaitKeys = ['kub_connect','felec_param'];
  const forfaitPrices = {kub_connect:2500, felec_param:1150};

  Object.keys(sectionValues.section4).forEach(k => {
    const sv = sectionValues.section4[k];
    if (forfaitKeys.includes(k)) {
      // Vérif si actif
      const actif = (k==='kub_connect' && kub>0) || (k==='felec_param' && moduleState.facturationElec);
      if (actif) s4total += forfaitPrices[k];
      return;
    }
    if (k.startsWith('flux_')) {
      const idx = parseInt(k.split('_')[1]);
      if (idx <= flux) {
        const ligne = 1150 * sv.qty * (1 - sv.remise/100);
        s4total += ligne;
        // Bug 1 : MAJ du total affiché sur la ligne flux
        const cell = document.querySelector('.total-s4-' + k);
        if (cell) cell.textContent = fmtEur(ligne);
      }
      return;
    }
    const ligne = 1150 * sv.qty * (1 - sv.remise/100);
    s4total += ligne;
    // Bug 1 : MAJ du total affiché sur la ligne TJM
    const cell = document.querySelector('.total-s4-' + k);
    if (cell) cell.textContent = fmtEur(ligne);
  });

  // Prestations personnalisées ajoutées via "+ Ajouter une ligne"
  s4total += calcExtraPrestationsTotal();

  totalPrest += s4total;
  document.getElementById('total_section4').textContent = fmtNum(s4total) + ' €';

  // Formation
  const totalFormation = calculateFormation();

  // Totaux sidebar
  document.getElementById('totalMensuel').innerHTML = fmtNum(totalMensuel) + ' <span>€/mois</span>';
  document.getElementById('totalAnnuel').innerHTML = fmtNum(totalAnnuel) + ' <span>€/an</span>';
  document.getElementById('totalPrestations').innerHTML = fmtNum(totalPrest) + ' <span>€ HT</span>';

  const grandTotal = totalMensuel * 12 + totalAnnuel + totalPrest + totalFormation;
  document.getElementById('totalGeneral').textContent = fmtEur(grandTotal);

  // ── Aperçu propale Modules : rafraîchissement temps réel ──────────────
  // Réutilise _lmiCalc déjà calculé en début de fonction (évite double calcul)
  try {
    renderApercuModules(_lmiCalc.lignesModules, _lmiCalc.totalModules);
  } catch(e) {
    console.error('[apercu] erreur rendu :', e);
  }
}

// ══════════════════════════════════════════════════════════════
// SECTIONS TOGGLE
// ══════════════════════════════════════════════════════════════
function toggleSection(id) {
  const body = document.getElementById('body-' + id);
  const arrow = document.getElementById('arrow-' + id);
  const header = arrow?.closest('.card-header');
  if (!body) return;
  const isCollapsed = body.style.display === 'none';
  body.style.display = isCollapsed ? '' : 'none';
  if (arrow) arrow.style.transform = isCollapsed ? '' : 'rotate(-90deg)';
}

// ══════════════════════════════════════════════════════════════
// PIPELINE SEARCH
// ══════════════════════════════════════════════════════════════
let searchTimeout = null;

function searchPipeline(q) {
  const resultsDiv = document.getElementById('pipelineResults');
  const spinner = document.getElementById('pipelineSpinner');
  clearTimeout(searchTimeout);
  if (!q || q.length < 2) { resultsDiv.style.display = 'none'; return; }
  searchTimeout = setTimeout(async () => {
    spinner.style.display = 'block';
    try {
      const resp = await fetch(PIPELINE_API + '?q=' + encodeURIComponent(q));
      const data = await resp.json();
      spinner.style.display = 'none';
      if (!data.length) {
        resultsDiv.innerHTML = '<div class="pipeline-result-item"><div class="pipeline-result-sub">Aucun résultat</div></div>';
        resultsDiv.style.display = 'block'; return;
      }
      resultsDiv.innerHTML = data.map(c => {
        const inter = c.interlocuteurs?.[0];
        const sub = [inter?.nom, c.adresse].filter(Boolean).join(' — ');
        return `<div class="pipeline-result-item" onclick="selectCompany(${JSON.stringify(c).replace(/"/g,'&quot;')})">
          <div class="pipeline-result-name">${c.societe}</div>
          ${sub ? `<div class="pipeline-result-sub">${sub}</div>` : ''}
        </div>`;
      }).join('');
      resultsDiv.style.display = 'block';
    } catch(e) {
      spinner.style.display = 'none';
      resultsDiv.innerHTML = '<div class="pipeline-result-item"><div class="pipeline-result-sub" style="color:red">Erreur de connexion</div></div>';
      resultsDiv.style.display = 'block';
    }
  }, 350);
}

function selectCompany(company) {
  document.getElementById('societe').value = company.societe;
  if (company.adresse) document.getElementById('adresse').value = company.adresse;
  document.getElementById('pipelineResults').style.display = 'none';
  document.getElementById('pipelineSearch').value = '';

  const inters = company.interlocuteurs || [];
  if (inters.length === 0) {
    document.getElementById('contact').value = '';
  } else if (inters.length === 1) {
    const i = inters[0];
    document.getElementById('contact').value = i.nom + (i.fonction ? ', ' + i.fonction : '');
  } else {
    showContactPicker(inters);
  }
  document.getElementById('societe').classList.add('highlight');
  setTimeout(() => document.getElementById('societe').classList.remove('highlight'), 1500);
}

function showContactPicker(inters) {
  const modal = document.getElementById('contactPickerModal');
  const list = document.getElementById('contactPickerList');
  list.innerHTML = '';
  inters.forEach(i => {
    const div = document.createElement('div');
    div.className = 'contact-option';
    div.innerHTML = `<div class="c-name">${i.nom}${i.principal ? '<span class="badge-principal">★ principal</span>' : ''}</div>${i.fonction ? `<div class="c-fn">${i.fonction}</div>` : ''}`;
    div.onclick = () => {
      document.getElementById('contact').value = i.nom + (i.fonction ? ', ' + i.fonction : '');
      modal.classList.remove('open');
    };
    list.appendChild(div);
  });
  modal.classList.add('open');
}

document.addEventListener('click', e => {
  if (!e.target.closest('#pipelineSearch') && !e.target.closest('#pipelineResults'))
    document.getElementById('pipelineResults').style.display = 'none';
  if (e.target === document.getElementById('contactPickerModal'))
    document.getElementById('contactPickerModal').classList.remove('open');
});

// ══════════════════════════════════════════════════════════════
// EXPORT / IMPORT
// ══════════════════════════════════════════════════════════════
// Construit l'objet config JSON à partir de l'état courant du configurateur.
// Retourne null si la validation échoue (nom société manquant).
// Utilisé par generateProposition() (POST serveur) et l'enregistrement dans l'affaire.
function buildConfigJson() {
  const societe = document.getElementById('societe').value.trim();
  if (!societe || societe === 'Nom de la Société') { alert('Veuillez remplir le nom de la Société'); return null; }

  const parseEur = str => parseFloat((str||'0').replace(/[\s\u202f]/g,'').replace(',','.').replace(/[€]/g,'').replace('/mois','').replace('/an','')) || 0;

  // Modules retenus (utilisé pour les logos & présentation dans la propale)
  // Un user mixte (Biz+Fab) déclenche les 2 modules Biz et Fab
  const modulesRetenus = [];
  if ((moduleState.biz||0)>0 || (moduleState.mixte||0)>0) modulesRetenus.push('biz');
  if ((moduleState.fab||0)>0 || (moduleState.mixte||0)>0) modulesRetenus.push('fab');
  if ((moduleState.net_siege||0)>0) modulesRetenus.push('net');
  if ((moduleState.mag||0)>0) modulesRetenus.push('mag');
  if ((moduleState.vrp||0)>0) modulesRetenus.push('vrp');
  if ((moduleState.col||0)>0) modulesRetenus.push('col');
  if ((moduleState.log||0)>0) modulesRetenus.push('log');
  if ((moduleState.jet||0)>0) modulesRetenus.push('jet');
  if ((moduleState.kub||0)>0) modulesRetenus.push('kub');
  if ((moduleState.fluxTiers||0)>0) modulesRetenus.push('flu');

  // Lignes abonnements depuis le DOM
  // Construction factorisée (utilisée aussi par calculate() pour l'aperçu propale)
  const _lmi = buildLignesModulesInfra();
  const lignesAbo = _lmi.lignesAbo;
  const lignesModules = _lmi.lignesModules;
  const lignesInfra = _lmi.lignesInfra;
  const ms = moduleState;
  const totalMensuel = _lmi.totalMensuel;
  const totalModules = _lmi.totalModules;
  const totalInfra = _lmi.totalInfra;

  // ── Licences complémentaires (Section 2 du configurateur : Sage 100, MyReport, Extensions Kub) ──
  // Récupérées depuis sectionValues['section2_X'] et sectionsData.section2.items
  const lignesLicences = [];
  if (sectionsData && sectionsData.section2 && sectionsData.section2.items) {
    sectionsData.section2.items.forEach((item, i) => {
      const sv = sectionValues['section2_' + i];
      if (!sv || sv.qty <= 0) return;
      // Filtrer celles qui sont visibles dans le contexte courant
      const showSage = item.dependModule === 'comptaSage' && ms.comptaSage;
      const showKub = item.dependKub && (ms.kub||0) > 0;
      if (!showSage && !showKub) return;
      const prixBrut = item.prix * sv.qty;
      const net = prixBrut * (1 - sv.remise/100);
      const ligne = {
        nom: item.nom,
        qty: sv.qty,
        prix_unitaire: item.prix,
        montant: net,
        unite: item.unite || '€/an'
      };
      if (sv.remise > 0) { ligne.prix_brut = prixBrut; ligne.remise_pct = sv.remise; }
      lignesLicences.push(ligne);
    });
  }
  const totalLicences = lignesLicences.reduce((s,l)=>s+l.montant,0);

  // Lignes prestations (avec renommage et ordre personnalisé)
  // Chaque ligne porte : {nom, duree, montant, qty, prix_unitaire, unite}
  // - Forfaits : qty=1, prix_unitaire=montant, unite='€/forfait'
  // - TJM     : qty=nb jours, prix_unitaire=TJM (1150 ou 525), unite='€/jour'
  // - Custom  : qty et pu issus du formulaire
  const lignesPrest = [];
  const addP = (nom, duree, montant, qty, prix_unitaire, unite) => {
    if (montant <= 0) return;
    const ligne = { nom, duree, montant };
    if (qty != null) ligne.qty = qty;
    if (prix_unitaire != null) ligne.prix_unitaire = prix_unitaire;
    if (unite) ligne.unite = unite;
    lignesPrest.push(ligne);
  };
  const marge = (parseFloat(document.getElementById('margeSetup')?.value)||30)/100;
  const fasP = 1150; // Forfait fixe (pas de marge sur la FAS)
  const setupP = calcSetupTW();

  // Helper : applique le customLabel s'il existe, sinon le label par défaut
  const lbl = (key, defaultLabel) => (ms.customLabels && ms.customLabels[key]) ? ms.customLabels[key] : defaultLabel;

  // Map key → {kind, defaultLabel, compute: () => {duree, montant}}
  // qty=1, prix_unitaire=montant, unite='€/forfait' pour les forfaits
  const prestDef = {};
  if ((ms.biz||0)>0||(ms.fab||0)>0) {
    prestDef.fas = { defaultLabel: 'FAS : Installation TexasWin', duree: 'Forfait', montant: fasP, qty: 1, prix_unitaire: fasP, unite: '€/forfait' };
    prestDef.setup_tw = { defaultLabel: 'Mise en place hébergement TexasWin', duree: 'Forfait', montant: setupP, qty: 1, prix_unitaire: setupP, unite: '€/forfait' };
  }
  if (ms.comptaSage) {
    prestDef.setup_sage = { defaultLabel: 'Mise en place hébergement Sage', duree: 'Forfait', montant: 1150, qty: 1, prix_unitaire: 1150, unite: '€/forfait' };
  }
  // TJM depuis sectionValues
  const nomMapTjm = {
    modif_etats: "Biz/Fab : Modifications d'états commerciaux",
    recup: 'Récupération des données', net_install:'Net : Installation et paramétrage',
    net_accom:'Net : Accompagnement Standard',
    mag_siege:'Mag : Installation Back office Siège', mag_mag:'Mag : Installation Magasin',
    vrp_install:'VRP : Installation et paramétrage', col_install:'Col : Installation et paramétrage',
    log_install:'Log : Installation et paramétrage', jet_install:'Jet : Installation et paramétrage',
    dev_spec:'Développement spécifique', gestion_proj:'Gestion de projet et encadrement technique',
  };
  Object.keys(nomMapTjm).forEach(k => {
    const sv = sectionValues.section4[k];
    if (!sv || sv.qty === 0) return;
    // Utiliser 525€/j pour mag_mag (prix spécifique), 1150€/j pour le reste
    const puJour = (k === 'mag_mag') ? 525 : 1150;
    const montant = puJour * sv.qty * (1 - sv.remise/100);
    prestDef[k] = { defaultLabel: nomMapTjm[k], duree: sv.qty + ' j', montant, qty: sv.qty, prix_unitaire: puJour, unite: '€/jour' };
  });
  // Flux
  for (let i = 1; i <= (ms.fluxTiers||0); i++) {
    const sv = sectionValues.section4['flux_' + i];
    if (!sv || sv.qty === 0) continue;
    const n = fluxNoms[i-1] || ('Flux '+i);
    const montant = 1150 * sv.qty * (1 - sv.remise/100);
    prestDef['flux_'+i] = { defaultLabel: n+' : Installation et paramétrage', duree: sv.qty+' j', montant, qty: sv.qty, prix_unitaire: 1150, unite: '€/jour' };
  }
  // Forfaits
  if ((ms.kub||0) > 0) prestDef.kub_connect = { defaultLabel: 'Mise en oeuvre Connecteur Kub → MyReport', duree: 'Forfait', montant: 2500, qty: 1, prix_unitaire: 2500, unite: '€/forfait' };
  if (ms.facturationElec) prestDef.felec_param = { defaultLabel: 'Mise en oeuvre Facturation électronique', duree: 'Forfait', montant: 1150, qty: 1, prix_unitaire: 1150, unite: '€/forfait' };
  // Custom
  (ms.extra_prestations || []).forEach(line => {
    const pu = parseFloat(line.pu) || 0;
    const qty = parseFloat(line.qty) || 0;
    const remise = parseFloat(line.remise) || 0;
    if (pu > 0 && qty > 0) {
      const duree = qty + ' ' + (line.unit || 'jour') + (qty > 1 ? 's' : '');
      const montant = pu * qty * (1 - remise / 100);
      const unite = '€/' + (line.unit || 'jour');
      prestDef['custom_'+line.id] = { defaultLabel: line.label || 'Prestation personnalisée', duree, montant, qty, prix_unitaire: pu, unite };
    }
  });

  // Respecter prestationOrder (puis ajouter les clés non ordonnées à la fin)
  const orderedKeys = [];
  (ms.prestationOrder || []).forEach(k => {
    if (prestDef[k] && !orderedKeys.includes(k)) orderedKeys.push(k);
  });
  Object.keys(prestDef).forEach(k => {
    if (!orderedKeys.includes(k)) orderedKeys.push(k);
  });
  orderedKeys.forEach(k => {
    const p = prestDef[k];
    addP(lbl(k, p.defaultLabel), p.duree, p.montant, p.qty, p.prix_unitaire, p.unite);
  });

  const totalPrest = lignesPrest.reduce((s,l)=>s+l.montant,0);

  // Formation (respecte les overrides manuels de nb apprenants et durée)
  const lignesFormation = [];
  const formOv = ms.formationOverrides || {};
  FORMATION_DATA.forEach(f => {
    if (!isModActiveForFormation(f.activeFrom)) return;
    const key = f.module + ':' + f.label;
    const ov = formOv[key] || {};
    const nbDefault = f.fixedQty!==undefined ? f.fixedQty : getModQtyForFormation(f.qtyFrom);
    const nb = (ov.nb !== undefined && ov.nb !== null) ? ov.nb : nbDefault;
    if (!nb || nb <= 0) return;
    const duree = (ov.duree !== undefined && ov.duree !== null) ? ov.duree : f.joursSd;
    const sessions = Math.max(1, Math.ceil(nb/f.maxSession));
    const joursTotal = duree*sessions;
    const cout = joursTotal*f.tjm;
    lignesFormation.push({nom:f.label, jours_std:duree, sessions, jours_total:joursTotal, max_session:f.maxSession, nb_apprenants:nb, montant:cout});
  });
  const totalFormHT = lignesFormation.reduce((s,l)=>s+l.montant,0);
  const qualiopi = Math.round(totalFormHT*0.15*100)/100;
  const totalForm = Math.round((totalFormHT+qualiopi)*100)/100;

  const config = {
    societe,
    contact: document.getElementById('contact').value.trim(),
    adresse: document.getElementById('adresse').value.trim(),
    commercial: document.getElementById('commercial').value,
    margeHebergement: document.getElementById('margeHebergement').value,
    margeSetup: document.getElementById('margeSetup').value,
    modules_retenus: modulesRetenus,
    flux_noms: fluxNoms,
    nb_utilisateurs: ms.biz||ms.fab||0,
    moduleState: {...moduleState},
    propale: {
      // ── Contexte (§1 du .docx) — choix entre 1/2 et A/B avec textes éventuellement modifiés ──
      // Seulement présent si l'utilisateur a fait son choix (sinon le Python garde le template tel quel)
      ...(ms.contexteChoix1 && ms.contexteChoix2 ? {
        contexte: {
          choix1: ms.contexteChoix1, // '1' ou '2'
          text1: ms.contexteText1 || '',
          choix2: ms.contexteChoix2, // 'A' ou 'B'
          text2: ms.contexteText2 || ''
        }
      } : {}),
      // ── Sections enrichies pour le nouveau rendu .docx (5 tableaux) ──
      modules:    { lignes: lignesModules,  total_mensuel: totalModules },
      licences:   { lignes: lignesLicences, total_annuel: totalLicences },
      infra:      { lignes: lignesInfra,    total_mensuel: totalInfra },
      // ── Section abonnements conservée pour compatibilité ascendante avec l'ancien Python ──
      abonnements: { lignes: lignesAbo, total_mensuel: totalMensuel },
      prestations: { lignes: lignesPrest, total: totalPrest },
      ...(lignesFormation.length ? { formation: { lignes: lignesFormation, qualiopi, total: totalForm } } : {})
    }
  };

  return config;
}

// Génération automatique de la proposition .docx via l'API Claude (serveur)
// ─────────────────────────────────────────────────────────────
// Phrases canoniques du contexte de la propale (§1 du .docx)
// Doivent être identiques aux phrases du template Master_Propale.docx
// ─────────────────────────────────────────────────────────────
const CONTEXTE_PHRASES = {
  '1': "Notre proposition commerciale qui reprend le périmètre technique et fonctionnel, le périmètre technique et fonctionnel, la prestation de mise en œuvre ainsi que la formation pour vos utilisateurs.",
  '2': "Cette nouvelle proposition commerciale qui reprend le périmètre technique et fonctionnel de notre dernière proposition.",
  'A': "Comme nous vous l'avons indiqué, nous avons transformé notre modèle tarifaire en formule d'abonnement, éliminant ainsi la nécessité d'un investissement initial conséquent. Les avantages de ce mode de licences sont nombreux.",
  'B': "Notre modèle tarifaire en formule d'abonnement, élimine la nécessité d'un investissement initial conséquent. Les avantages de ce mode de licences sont nombreux."
};

// Quand le commercial choisit 1 ou 2, pré-remplir le textarea
function onContexteChoix1Change() {
  const choix = document.querySelector('input[name="ctxChoix1"]:checked')?.value;
  if (!choix) return;
  const ta = document.getElementById('ctxText1');
  // Si le commercial a déjà saisi un texte custom pour ce choix, on le préserve. Sinon on prend la phrase canonique.
  // Convention : on met le texte canonique uniquement si le textarea est vide ou contient l'autre choix.
  const otherCanonical = CONTEXTE_PHRASES[choix === '1' ? '2' : '1'];
  if (!ta.value.trim() || ta.value.trim() === otherCanonical) {
    ta.value = CONTEXTE_PHRASES[choix];
  }
  ta.style.display = 'block';
  updateContexteConfirmBtn();
}

function onContexteChoix2Change() {
  const choix = document.querySelector('input[name="ctxChoix2"]:checked')?.value;
  if (!choix) return;
  const ta = document.getElementById('ctxText2');
  const otherCanonical = CONTEXTE_PHRASES[choix === 'A' ? 'B' : 'A'];
  if (!ta.value.trim() || ta.value.trim() === otherCanonical) {
    ta.value = CONTEXTE_PHRASES[choix];
  }
  ta.style.display = 'block';
  updateContexteConfirmBtn();
}

// Activer le bouton "Générer" uniquement si les 2 choix sont faits ET les textes non vides
function updateContexteConfirmBtn() {
  const choix1 = document.querySelector('input[name="ctxChoix1"]:checked')?.value;
  const choix2 = document.querySelector('input[name="ctxChoix2"]:checked')?.value;
  const text1 = document.getElementById('ctxText1').value.trim();
  const text2 = document.getElementById('ctxText2').value.trim();
  const btn = document.getElementById('contexteConfirmBtn');
  const ok = choix1 && choix2 && text1 && text2;
  btn.disabled = !ok;
  btn.style.opacity = ok ? '1' : '0.5';
  btn.style.cursor = ok ? 'pointer' : 'not-allowed';
}

// Ouvre la modal de contexte (1ère étape de generateProposition)
async function generateProposition() {
  const config = buildConfigJson();
  if (!config) return;

  // Bug 3 : Validation cohérence licences MyReport (Manager + User + Center == qté Kub)
  const kubError = validateKubLicences();
  if (kubError) {
    alert('⚠️ Validation licences Kub :\n\n' + kubError);
    return;
  }

  // Pré-remplir la modal avec les valeurs sauvegardées dans moduleState (si déjà fait précédemment)
  const ms = moduleState;
  // Restaurer les choix radios
  document.querySelectorAll('input[name="ctxChoix1"]').forEach(r => r.checked = (r.value === ms.contexteChoix1));
  document.querySelectorAll('input[name="ctxChoix2"]').forEach(r => r.checked = (r.value === ms.contexteChoix2));
  // Restaurer les textes
  const ta1 = document.getElementById('ctxText1');
  const ta2 = document.getElementById('ctxText2');
  ta1.value = ms.contexteText1 || (ms.contexteChoix1 ? CONTEXTE_PHRASES[ms.contexteChoix1] : '');
  ta2.value = ms.contexteText2 || (ms.contexteChoix2 ? CONTEXTE_PHRASES[ms.contexteChoix2] : '');
  ta1.style.display = ms.contexteChoix1 ? 'block' : 'none';
  ta2.style.display = ms.contexteChoix2 ? 'block' : 'none';

  // Listeners pour activer le bouton dynamiquement quand on tape
  ta1.oninput = updateContexteConfirmBtn;
  ta2.oninput = updateContexteConfirmBtn;

  // Reset erreur éventuelle
  document.getElementById('contexteError').style.display = 'none';

  // Mettre à jour l'état du bouton
  updateContexteConfirmBtn();

  // Afficher la modal
  document.getElementById('contexteModal').classList.add('open');
}

// Validation modal : sauvegarde les choix dans moduleState et lance la vraie génération
async function confirmContexteAndGenerate() {
  const choix1 = document.querySelector('input[name="ctxChoix1"]:checked')?.value;
  const choix2 = document.querySelector('input[name="ctxChoix2"]:checked')?.value;
  const text1 = document.getElementById('ctxText1').value.trim();
  const text2 = document.getElementById('ctxText2').value.trim();

  if (!choix1 || !choix2 || !text1 || !text2) {
    const err = document.getElementById('contexteError');
    err.textContent = 'Merci de sélectionner une option dans chaque section et de vérifier les textes.';
    err.style.display = 'block';
    return;
  }

  // Sauvegarder dans moduleState (sera persisté lors de la prochaine sauvegarde du devis)
  moduleState.contexteChoix1 = choix1;
  moduleState.contexteChoix2 = choix2;
  moduleState.contexteText1 = text1;
  moduleState.contexteText2 = text2;

  // Fermer la modal
  document.getElementById('contexteModal').classList.remove('open');

  // Lancer la vraie génération
  await _doGenerateProposition();
}

// La vraie fonction de génération (extraite de l'ancienne generateProposition)
async function _doGenerateProposition() {
  const config = buildConfigJson();
  if (!config) return;

  // Afficher la modale de progression
  showProgressModal();

  try {
    // Étape 1 : Envoi de la config
    updateProgress(10, 'Envoi de la configuration...');

    // Récupérer le token JWT depuis la fenêtre parente (Pipeline app)
    let token = null;
    try {
      const userRaw = (window.parent && window.parent !== window ? window.parent : window).localStorage.getItem('user');
      if (userRaw) {
        const u = JSON.parse(userRaw);
        token = u.token;
      }
    } catch (e) {
      console.warn('Impossible de récupérer le token depuis localStorage:', e);
    }

    updateProgress(20, 'Claude analyse la configuration...');

    // Pendant que la requête tourne, on fait progresser la barre en simulé
    // (l'API ne nous donne pas de feedback de progression réel)
    const progressInterval = animateProgress(20, 97, 90000); // De 20 à 97% sur ~90 secondes (durée réaliste API)

    const apiUrl = '/api/devis/generate-proposition';
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...config, devis_id: CTX.devis_id || null }),
    });

    clearInterval(progressInterval);

    if (!res.ok) {
      let errMsg = `Erreur ${res.status}`;
      try { const j = await res.json(); if (j.error) errMsg = j.error; } catch(_) {}
      throw new Error(errMsg);
    }

    updateProgress(95, 'Téléchargement du document Word...');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `propale_${config.societe.replace(/[^a-zA-Z0-9]/g,'_')}_${new Date().toISOString().slice(0,7).replace('-','')}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    updateProgress(100, '✅ Proposition générée avec succès !');
    // Fermer la modale après 1,5s
    setTimeout(hideProgressModal, 1500);
  } catch (err) {
    console.error('Erreur génération proposition:', err);
    showProgressError(err.message);
  }
}

// ── Helpers pour la modale de progression ──
function showProgressModal() {
  let modal = document.getElementById('propaleProgressModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'propaleProgressModal';
    modal.innerHTML = `
      <div class="pp-overlay">
        <div class="pp-box">
          <div class="pp-header">
            <div class="pp-spinner"></div>
            <h3>Génération de la proposition</h3>
          </div>
          <div class="pp-status" id="ppStatus">Initialisation...</div>
          <div class="pp-bar-wrap">
            <div class="pp-bar" id="ppBar"></div>
          </div>
          <div class="pp-percent" id="ppPercent">0%</div>
          <div class="pp-hint">Cela peut prendre jusqu'à 30 secondes. Claude exécute la génération dans un environnement sécurisé.</div>
          <div class="pp-error" id="ppError" style="display:none;"></div>
          <button id="ppCloseBtn" onclick="hideProgressModal()" style="display:none;margin-top:14px;padding:8px 18px;background:#607a7a;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Fermer</button>
        </div>
      </div>
      <style>
        .pp-overlay { position:fixed; inset:0; background:rgba(0,51,102,0.45); backdrop-filter:blur(3px); z-index:10000; display:flex; align-items:center; justify-content:center; padding:20px; }
        .pp-box { background:white; border-radius:14px; box-shadow:0 20px 50px rgba(0,0,0,0.3); width:100%; max-width:460px; padding:28px; font-family:'Lato',sans-serif; }
        .pp-header { display:flex; align-items:center; gap:14px; margin-bottom:20px; }
        .pp-header h3 { margin:0; font-family:'Poppins',sans-serif; color:#003366; font-size:1.1rem; }
        .pp-spinner { width:28px; height:28px; border:3px solid #e0e0e0; border-top-color:#7b5ea7; border-radius:50%; animation:pp-spin 0.8s linear infinite; flex-shrink:0; }
        @keyframes pp-spin { to { transform:rotate(360deg); } }
        .pp-status { font-size:0.9rem; color:#607a7a; margin-bottom:10px; min-height:22px; font-weight:500; }
        .pp-bar-wrap { background:#f0f4f4; border-radius:8px; overflow:hidden; height:10px; margin-bottom:8px; }
        .pp-bar { height:100%; background:linear-gradient(90deg,#7b5ea7,#9b7bc5); border-radius:8px; width:0%; transition:width 0.4s ease; }
        .pp-percent { font-size:0.85rem; color:#7b5ea7; font-weight:700; text-align:right; margin-bottom:14px; }
        .pp-hint { font-size:0.78rem; color:#9eb5b5; font-style:italic; line-height:1.4; }
        .pp-error { background:#fee2e2; border:1px solid #fca5a5; color:#991b1b; padding:10px 12px; border-radius:8px; font-size:0.85rem; margin-top:10px; white-space:pre-wrap; word-break:break-word; }
      </style>
    `;
    document.body.appendChild(modal);
  } else {
    // Reset si réouverture
    document.getElementById('ppBar').style.width = '0%';
    document.getElementById('ppPercent').textContent = '0%';
    document.getElementById('ppStatus').textContent = 'Initialisation...';
    document.getElementById('ppError').style.display = 'none';
    document.getElementById('ppCloseBtn').style.display = 'none';
    modal.style.display = '';
  }
}

function hideProgressModal() {
  const modal = document.getElementById('propaleProgressModal');
  if (modal) modal.style.display = 'none';
}

function updateProgress(percent, status) {
  const bar = document.getElementById('ppBar');
  const pct = document.getElementById('ppPercent');
  const st = document.getElementById('ppStatus');
  if (bar) bar.style.width = percent + '%';
  if (pct) pct.textContent = Math.round(percent) + '%';
  if (st && status) st.textContent = status;
}

// Progression animée fluide entre deux % sur une durée (ms)
// Retourne l'interval ID pour pouvoir le stopper
function animateProgress(fromPct, toPct, durationMs) {
  const startTime = Date.now();
  const messages = [
    { pct: 30, msg: 'Claude exécute la skill de proposition...' },
    { pct: 45, msg: 'Préparation du template Word...' },
    { pct: 60, msg: 'Insertion des tableaux de prix...' },
    { pct: 75, msg: 'Génération de la synthèse et règlement...' },
    { pct: 88, msg: 'Finalisation du document...' },
    { pct: 95, msg: 'Encore quelques secondes...' },
  ];
  let lastMsgIdx = -1;

  return setInterval(() => {
    const elapsed = Date.now() - startTime;
    const ratio = Math.min(elapsed / durationMs, 1);
    // Courbe asymptotique : très rapide au début (~0-50% en 25% du temps), puis ralentit beaucoup
    // La progression suit 1 - (1-x)^3 jusqu'à 1, donc plus on approche du toPct, plus c'est lent
    const eased = 1 - Math.pow(1 - ratio, 3);
    const currentPct = fromPct + (toPct - fromPct) * eased;

    // Mettre à jour le message selon le palier atteint
    let msgToShow = null;
    for (let i = 0; i < messages.length; i++) {
      if (currentPct >= messages[i].pct && i > lastMsgIdx) {
        msgToShow = messages[i].msg;
        lastMsgIdx = i;
      }
    }

    updateProgress(currentPct, msgToShow || undefined);
  }, 300);
}

function showProgressError(message) {
  updateProgress(0, '');
  const err = document.getElementById('ppError');
  const st = document.getElementById('ppStatus');
  const closeBtn = document.getElementById('ppCloseBtn');
  if (st) st.textContent = '❌ Erreur lors de la génération';
  if (err) { err.style.display = 'block'; err.textContent = message; }
  if (closeBtn) closeBtn.style.display = 'inline-block';
  // Stopper le spinner (remplacer par ❌)
  const spinner = document.querySelector('.pp-spinner');
  if (spinner) { spinner.style.border = 'none'; spinner.style.animation = 'none'; spinner.innerHTML = '❌'; spinner.style.display='flex'; spinner.style.alignItems='center'; spinner.style.justifyContent='center'; spinner.style.fontSize='20px'; }
}

function exportExcel() {
  alert('Export Excel : fonctionnalité disponible dans la prochaine version.');
}

// ══════════════════════════════════════════════════════════════
// CAS A : Enregistrer le devis dans une affaire
// ══════════════════════════════════════════════════════════════
// Variables de contexte remplies depuis les paramètres URL
let CTX = { prospect_id: null, affaire_id: null, devis_id: null, societe: '', contact_list: [] };

// Récupère le token JWT depuis localStorage (partagé avec l'app principale)
function getAuthToken() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const u = JSON.parse(raw);
    return u?.token || null;
  } catch { return null; }
}

// Génère un trigramme à partir du nom de société
// Ex : "Barbara Bui" → "BAR", "TEST CDA" → "TES", "Grace & Mila" → "GRA"
function makeTrigramme(societe) {
  if (!societe) return 'XXX';
  const clean = societe
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // accents
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  return (clean.slice(0, 3) || 'XXX').padEnd(3, 'X');
}

// Format DD/MM/YY pour le nom du devis
function todayShort() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

// Extrait les 4 montants-clés depuis l'état courant du configurateur
function extractMontantsForSave() {
  // On relance calculate() pour s'assurer que les totaux sont à jour
  calculate();
  const parseMontant = (txt) => {
    if (!txt) return 0;
    const m = txt.replace(/[^0-9,.-]/g, '').replace(/\s/g, '').replace(',', '.');
    return parseFloat(m) || 0;
  };
  const monthly = parseMontant(document.getElementById('totalMensuel')?.textContent);
  const annual  = parseMontant(document.getElementById('totalAnnuel')?.textContent);
  const setup   = parseMontant(document.getElementById('totalPrestations')?.textContent);
  const training = parseMontant(document.getElementById('totalFormationDisplay')?.textContent);
  return { monthly, annual, setup, training };
}

// Construit le JSON complet du devis (utilisé pour l'enregistrement dans l'affaire)
// Version simplifiée : on n'exporte pas en fichier, on remonte juste l'objet
function buildConfigObject() {
  const ms = moduleState;
  return {
    societe: document.getElementById('societe')?.value?.trim() || '',
    contact: document.getElementById('contact')?.value?.trim() || '',
    adresse: document.getElementById('adresse')?.value?.trim() || '',
    commercial: document.getElementById('commercial')?.value || '',
    margeHebergement: document.getElementById('margeHebergement')?.value || '30',
    margeSetup: document.getElementById('margeSetup')?.value || '30',
    flux_noms: fluxNoms,
    moduleState: { ...moduleState },
    saved_at: new Date().toISOString(),
  };
}

// Ouvre la modale de confirmation avec récap
function openSaveInAffaireModal() {
  if (!CTX.affaire_id) {
    alert("Ce devis n'est pas rattaché à une affaire. Ouvrez le configurateur depuis une fiche d'affaire pour l'enregistrer.");
    return;
  }
  const societe = document.getElementById('societe')?.value?.trim() || '';
  if (!societe || societe === 'Nom de la Société') {
    alert('Veuillez renseigner le nom de la société.');
    return;
  }
  const contact = document.getElementById('contact')?.value?.trim() || '(aucun)';
  const m = extractMontantsForSave();

  const recapHtml = `
    <div><strong>Société :</strong> ${societe}</div>
    <div><strong>Contact :</strong> ${contact}</div>
    <div><strong>Affaire ID :</strong> #${CTX.affaire_id}</div>
    <hr style="border:none;border-top:1px solid #cde8e8;margin:10px 0;">
    <div><strong>Setup :</strong> ${fmtEur(m.setup)} HT</div>
    <div><strong>Abonnement mensuel :</strong> ${fmtEur(m.monthly)} HT</div>
    <div><strong>Abonnement annuel :</strong> ${fmtEur(m.annual)} HT</div>
    <div><strong>Formation :</strong> ${fmtEur(m.training)} HT</div>
  `;
  document.getElementById('saveDevisRecap').innerHTML = recapHtml;

  // Nom de devis pré-rempli : [TRIGRAMME]_DTW_DD/MM/YY
  const defaultName = `${makeTrigramme(societe)}_DTW_${todayShort()}`;
  document.getElementById('saveDevisName').value = defaultName;

  document.getElementById('saveDevisError').style.display = 'none';
  document.getElementById('saveDevisConfirmBtn').disabled = false;
  document.getElementById('saveDevisConfirmBtn').textContent = 'Enregistrer le devis';
  document.getElementById('saveDevisModal').classList.add('open');
}

// Confirme la sauvegarde : POST vers /api/affaires/:id/devis
async function confirmSaveDevis() {
  // Bug 3 : Validation cohérence licences MyReport (Manager + User + Center == qté Kub)
  const kubError = validateKubLicences();
  if (kubError) {
    alert('⚠️ Validation licences Kub :\n\n' + kubError);
    return;
  }

  const token = getAuthToken();
  if (!token) {
    showSaveError("Session expirée. Fermez cet onglet, reconnectez-vous à Pipeline, puis réouvrez le configurateur depuis l'affaire.");
    return;
  }
  const btn = document.getElementById('saveDevisConfirmBtn');
  btn.disabled = true;
  btn.textContent = 'Enregistrement...';

  const devisName = document.getElementById('saveDevisName').value.trim()
    || `${makeTrigramme(document.getElementById('societe').value)}_DTW_${todayShort()}`;

  const m = extractMontantsForSave();
  const modulesPayload = buildConfigObject();

  const today = new Date().toISOString().split('T')[0];

  const body = {
    devis_name: devisName,
    devis_status: 'En cours',
    quote_date: today,
    setup_amount: m.setup,
    monthly_amount: m.monthly,
    annual_amount: m.annual,
    training_amount: m.training,
    chance_percent: 0,
    modules: modulesPayload,
    comment: ''
  };

  try {
    const resp = await fetch(`/api/affaires/${CTX.affaire_id}/devis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    // Succès : notifier l'onglet parent + fermer
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'devis_saved', prospect_id: CTX.prospect_id, affaire_id: CTX.affaire_id }, window.location.origin);
    }
    document.getElementById('saveDevisModal').classList.remove('open');
    // Petit feedback avant fermeture
    alert('Devis enregistré ✓');
    setTimeout(() => window.close(), 200);
  } catch (err) {
    showSaveError('Erreur : ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Enregistrer le devis';
  }
}

function showSaveError(msg) {
  const el = document.getElementById('saveDevisError');
  el.textContent = msg;
  el.style.display = 'block';
}

// ── INIT : lire les paramètres URL et pré-remplir ──
async function initFromUrlParams() {
  const params = new URLSearchParams(window.location.search);
  CTX.prospect_id = params.get('prospect_id') || null;
  CTX.affaire_id = params.get('affaire_id') || null;
  CTX.devis_id = params.get('devis_id') || null;
  const societe = params.get('societe') || '';
  const adresse = params.get('adresse') || '';
  const commercial = params.get('commercial') || '';

  if (societe) {
    const input = document.getElementById('societe');
    if (input) input.value = societe;
  }
  if (adresse) {
    const input = document.getElementById('adresse');
    if (input) input.value = adresse;
  }
  if (commercial) {
    const sel = document.getElementById('commercial');
    if (sel) {
      // Matcher par valeur exacte (case-insensitive) ou par prénom
      const target = commercial.toLowerCase();
      const opts = Array.from(sel.options);
      const match = opts.find(o => o.value.toLowerCase() === target)
                 || opts.find(o => o.text.toLowerCase().includes(target));
      if (match) sel.value = match.value;
    }
  }

  // ── Mode édition : un devis_id est passé → charger le devis existant ──
  if (CTX.devis_id && CTX.prospect_id) {
    await loadDevisForEdit();
  }

  // Afficher le bouton "Enregistrer / Mettre à jour" si on a une affaire
  if (CTX.affaire_id) {
    const btn = document.getElementById('btnSaveInAffaire');
    if (btn) {
      btn.style.display = '';
      if (CTX.devis_id) {
        // Mode édition : bouton bleu "Mettre à jour le devis"
        btn.innerHTML = '🔄 Mettre à jour le devis';
        btn.style.background = '#0284c7';
        btn.style.borderColor = '#0284c7';
        btn.setAttribute('onclick', 'updateDevis()');
      }
    }
  }

  // Si on a un prospect_id et qu'on n'est PAS en édition, récupérer les contacts pour le picker
  if (CTX.prospect_id && !CTX.devis_id) {
    await fetchAndSetContacts(CTX.prospect_id);
  }
}

// ── Mode édition : charger un devis existant ──
async function loadDevisForEdit() {
  const token = getAuthToken();
  if (!token) {
    console.warn('[configurateur] pas de token pour charger le devis');
    return;
  }
  try {
    // On récupère tous les devis du prospect et on filtre par id
    const resp = await fetch(`/api/prospects/${CTX.prospect_id}/devis`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) {
      console.error('[configurateur] échec fetch devis:', resp.status);
      return;
    }
    const devisList = await resp.json();
    const devis = (devisList || []).find(d => String(d.id) === String(CTX.devis_id));
    if (!devis) {
      console.warn('[configurateur] devis non trouvé:', CTX.devis_id);
      return;
    }

    // Parser le JSON modules
    let modulesObj = devis.modules;
    if (typeof modulesObj === 'string') {
      try { modulesObj = JSON.parse(modulesObj); } catch { modulesObj = {}; }
    }
    if (!modulesObj || !modulesObj.moduleState) {
      console.warn('[configurateur] devis sans moduleState — impossible à restaurer');
      return;
    }

    // Restaurer le moduleState complet (inclut les remises)
    Object.assign(moduleState, modulesObj.moduleState);

    // Migration ascendante Net : si le devis a été sauvegardé avant l'introduction de net_siege_active/net_users
    // (= net_siege est un nombre N>0 mais net_siege_active est falsy), on bascule :
    //   net_siege: 2  →  net_siege_active: true, net_users: 2
    if ((moduleState.net_siege || 0) > 0 && !moduleState.net_siege_active) {
      moduleState.net_users = moduleState.net_siege;
      moduleState.net_siege_active = true;
    }
    // Synchroniser net_siege (legacy 0/1) avec net_siege_active
    syncNetSiege();

    // Stocker le nom actuel du devis pour qu'updateDevis() le préserve
    CTX.devis_name = devis.devis_name || '';

    // Restaurer les champs d'en-tête (société/contact/adresse/commercial/marges)
    if (modulesObj.societe) document.getElementById('societe').value = modulesObj.societe;
    if (modulesObj.contact) document.getElementById('contact').value = modulesObj.contact;
    if (modulesObj.adresse) document.getElementById('adresse').value = modulesObj.adresse;
    if (modulesObj.commercial) {
      const sel = document.getElementById('commercial');
      if (sel) {
        const target = modulesObj.commercial.toLowerCase();
        const match = Array.from(sel.options).find(o => o.value.toLowerCase() === target);
        if (match) sel.value = match.value;
      }
    }
    if (modulesObj.margeHebergement) {
      const el = document.getElementById('margeHebergement');
      if (el) el.value = modulesObj.margeHebergement;
    }
    if (modulesObj.margeSetup) {
      const el = document.getElementById('margeSetup');
      if (el) el.value = modulesObj.margeSetup;
    }

    // Restaurer les noms de flux
    if (Array.isArray(modulesObj.flux_noms)) {
      fluxNoms = modulesObj.flux_noms.slice();
    }

    // Rafraîchir l'affichage global
    MODULES_DEF.forEach(mod => updateTileDisplay(mod.id));
    renderModuleConfigs();
    if (typeof updateFluxNoms === 'function') updateFluxNoms();
    renderAllSections();
    calculate();

    // Remplir le tableau fluxNoms s'il existe (les inputs du drawer le liront depuis la variable)
    if (Array.isArray(modulesObj.flux_noms)) {
      fluxNoms = modulesObj.flux_noms.slice();
      // Re-render des sections + drawer si ouvert
      if (typeof updateFluxNoms === 'function') updateFluxNoms();
    }

    console.log('[configurateur] devis ' + CTX.devis_id + ' chargé pour édition');
  } catch (err) {
    console.error('[configurateur] erreur chargement devis:', err);
    alert('Impossible de charger le devis : ' + err.message);
  }
}

// ── Mode édition : PUT direct sans modale de confirmation ──
async function updateDevis() {
  const token = getAuthToken();
  if (!token) {
    alert("Session expirée. Fermez cet onglet et reconnectez-vous.");
    return;
  }
  if (!CTX.devis_id) {
    alert("Contexte d'édition manquant.");
    return;
  }

  const btn = document.getElementById('btnSaveInAffaire');
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Mise à jour...';

  const m = extractMontantsForSave();
  const modulesPayload = buildConfigObject();
  const today = new Date().toISOString().split('T')[0];

  // Nom du devis : on conserve celui d'origine (que l'utilisateur a pu modifier à la création)
  let devisName = CTX.devis_name || '';
  if (!devisName) {
    const societe = document.getElementById('societe')?.value?.trim() || '';
    devisName = `${makeTrigramme(societe)}_DTW_${todayShort()}`;
  }

  const body = {
    devis_name: devisName,
    devis_status: 'En cours',
    quote_date: today,
    setup_amount: m.setup,
    monthly_amount: m.monthly,
    annual_amount: m.annual,
    training_amount: m.training,
    chance_percent: 0,
    modules: modulesPayload,
    comment: '',
    affaire_id: CTX.affaire_id ? parseInt(CTX.affaire_id, 10) : null
  };

  try {
    const resp = await fetch(`/api/devis/${CTX.devis_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({
        type: 'devis_updated',
        prospect_id: CTX.prospect_id,
        affaire_id: CTX.affaire_id,
        devis_id: CTX.devis_id
      }, window.location.origin);
    }
    alert('Devis mis à jour ✓');
    setTimeout(() => window.close(), 200);
  } catch (err) {
    alert('Erreur : ' + err.message);
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

async function fetchAndSetContacts(prospectId) {
  const token = getAuthToken();
  if (!token) {
    // Pas de token, on laisse l'utilisateur saisir à la main
    console.warn('[configurateur] pas de token disponible pour charger les contacts');
    return;
  }
  try {
    const resp = await fetch(`/api/prospects/${prospectId}/interlocuteurs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!resp.ok) return;
    const inters = await resp.json();
    if (!Array.isArray(inters) || inters.length === 0) return;

    // Normaliser le format (backend peut renvoyer nom/prenom séparés)
    const normalized = inters.map(i => ({
      id: i.id,
      nom: (i.prenom || i.nom) ? [(i.prenom||'').trim(), (i.nom||'').trim()].filter(Boolean).join(' ') : (i.name || ''),
      fonction: i.fonction || '',
      principal: !!i.principal,
      decideur: !!i.decideur,
    })).filter(i => i.nom);

    if (normalized.length === 0) return;
    CTX.contact_list = normalized;

    if (normalized.length === 1) {
      const i = normalized[0];
      document.getElementById('contact').value = i.nom + (i.fonction ? ', ' + i.fonction : '');
    } else {
      // Principal d'abord
      normalized.sort((a, b) => (b.principal ? 1 : 0) - (a.principal ? 1 : 0));
      showContactPicker(normalized);
    }
  } catch (err) {
    console.error('[configurateur] fetch contacts erreur', err);
  }
}

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initModulesGrid();
  renderModuleConfigs();
  renderAllSections();
  calculate();
  // Pré-remplissage depuis les paramètres URL + fetch contacts + afficher bouton "Enregistrer dans l'affaire"
  initFromUrlParams();
});
