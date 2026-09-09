// ============================================================
// Suivi de travaux d'instrumentation — app.js
// L'application fonctionne entièrement HORS SERVEUR.
// Toute la persistance (brouillon, fichiers, cases cochées,
// approbations) passe par IndexedDB. La sauvegarde durable et
// volontaire se fait dans un dossier choisi par l'utilisateur via
// la File System Access API (Chrome/Edge de bureau). server.js
// n'est plus appelé par le flux principal — il reste disponible
// pour une future fonction de synchronisation, isolée et facultative.
// ============================================================

// ---------- Listes de vérification (reflètent les fiches PDF) ----------
const CHECKLISTS = {
  installation: {
    identification: [
      ['identification.tmsFils', 'TMS sur tous les fils'],
      ['identification.tagsStainless', 'Tags de stainless sur tous les câbles et joyplugs'],
      ['identification.cartesPlastique', 'Cartes de plastique sur chaque élément de champ'],
      ['identification.plaquetteEquipement', 'Plaquette d\u2019identification à l\u2019équipement'],
    ],
    plans: [
      ['plans.planBoucle', 'Plan de la boucle mis à jour'],
      ['plans.plansBjis', 'Plans des BJIs mis à jour'],
      ['plans.plansAlimentations', 'Plans des alimentations électriques mis à jour, si nécessaire'],
      ['plans.ficheHpm', 'Fiche du HPM corrigée'],
      ['plans.plansDiagrammes', 'Plans des diagrammes de procédé mis à jour'],
      ['plans.sama', 'SAMA corrigé avec l\u2019ingénieur de système'],
      ['plans.remisePanneau', 'Mise à jour remise dans le panneau concerné'],
    ],
    programmation: [
      ['programmation.collaboration', 'Collaboration avec l\u2019ingénieur de système'],
      ['programmation.contournement', 'Contournement de programme réalisé'],
      ['programmation.calibration', 'Calibration des équipements et étalonnage au TDC'],
      ['programmation.modifsCl', 'Ajouts ou modifications au programme CL'],
    ],
    systeme: [
      ['systeme.immpower', 'Mise à jour dans Immpower'],
      ['systeme.nouvelleLoc', 'Nouvelle localisation ajoutée'],
      ['systeme.coordonnees', 'Coordonnées X-Y-Z ajoutées ou corrigées'],
      ['systeme.hierarchie', 'Hiérarchie mise à jour (-INST, -DEM, etc.)'],
      ['systeme.nouveauxItems', 'Nouveaux items de pièces de rechange ajoutés'],
      ['systeme.codeSpecs', 'Code de spécifications créé, si nécessaire'],
      ['systeme.liensPieces', 'Liens avec pièces de rechange et inventaire ajoutés'],
      ['systeme.routeEntretien', 'Route d\u2019entretien créée ou corrigée'],
      ['systeme.livretMaj', 'Livret d\u2019instrumentation mis à jour'],
      ['systeme.docNouvelItem', 'Documentation ajoutée pour un nouvel item'],
    ],
    information: [
      ['information.rapportActivite', 'Rapport d\u2019activité détaillé complété, si requis'],
      ['information.bibliotheque', 'Documents ajoutés à la bibliothèque et index mis à jour'],
      ['information.aviserProduction', 'Production avisée que le travail est terminé, si requis'],
    ],
    securite: [
      ['securite.cadenassage', 'Fiches de cadenassage : opérations avisées'],
      ['securite.nettoyage', 'Lieux de travail nettoyés'],
      ['securite.armoiresRousseau', 'Matériel utilisé recommandé aux armoires Rousseau'],
      ['securite.materiauxTrop', 'Matériaux en trop retournés au magasin'],
    ],
  },
  demantelement: {
    identification: [],
    plans: [
      ['plans.planBoucle', 'Plan de la boucle mis à jour'],
      ['plans.ficheHpm', 'Fiche du HPM corrigée'],
      ['plans.plansAlimentation', 'Plans de l\u2019alimentation mis à jour, si nécessaire'],
      ['plans.plansBjis', 'Plans des BJIs mis à jour'],
      ['plans.plansDiagramme', 'Plans du diagramme de procédé mis à jour'],
      ['plans.sama', 'SAMA corrigé avec l\u2019ingénieur de système'],
      ['plans.remisePanneau', 'Mise à jour remise dans le panneau concerné'],
    ],
    programmation: [
      ['programmation.collaboration', 'Collaboration avec l\u2019ingénieur de système'],
      ['programmation.forcesContournement', 'Forces et/ou contournement de programme'],
      ['programmation.modifsCl', 'Ajouts ou modifications au programme CL'],
      ['programmation.backupReseau', 'Backup du programme sur réseau'],
    ],
    systeme: [
      ['systeme.immpowerInactif', 'Immpower mis inactif et/ou corrigé'],
      ['systeme.localisation', 'Localisation mise à jour'],
      ['systeme.hierarchie', 'Hiérarchie mise à jour (-INST, -DEM, etc.)'],
      ['systeme.liensPieces', 'Liens avec pièces de rechange et inventaire mis à jour'],
      ['systeme.routeEntretien', 'Route d\u2019entretien détruite et/ou corrigée'],
    ],
    information: [
      ['information.rapportActivite', 'Rapport d\u2019activité détaillé complété, si requis'],
      ['information.bibliotheque', 'Documents ajoutés à la bibliothèque et index mis à jour'],
      ['information.aviserProduction', 'Production avisée que le travail est terminé, si requis'],
    ],
    securite: [
      ['securite.cadenassage', 'Fiches de cadenassage : opérations avisées pour modification'],
      ['securite.bji', 'BJI : trous des câbles enlevés bouchés'],
      ['securite.nettoyage', 'Lieux de travail nettoyés'],
      ['securite.materiauxRecuperes', 'Matériaux récupérés retournés au magasin'],
    ],
  },
};

const UPLOAD_TABS = ['mise-a-jour'];
const ATTACH_GROUPS = ['plans', 'programmation', 'systeme', 'information'];
const GROUP_LABELS = {
  identification: 'IDENTIFICATION', plans: 'PLANS', programmation: 'PROGRAMMATION',
  systeme: 'MISES À JOUR SYSTÈME', information: 'INFORMATION', securite: 'SÉCURITÉ ET GÉNÉRAL',
};

const state = {
  mode: null,               // 'installation' | 'demantelement'
  numero: null,
  isNewDraft: false,
  currentTab: 'identification',
  rootDirHandle: null,      // dossier racine choisi par l'utilisateur sur cet appareil
  dossierDirHandle: null,   // sous-dossier <numero> à l'intérieur du dossier racine
  draft: null,              // objet de suivi complet, persistant en IndexedDB
  showOnlyIncomplete: false, // préférence d'affichage, non sauvegardée dans le dossier
  checklistFilter: 'toutes', // préférence d'affichage, non sauvegardée dans le dossier
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---------- Icônes SVG des onglets (traits fins, style professionnel) ----------
const ICONS = {
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  shieldCheck: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  tag: '<path d="M20.59 13.41L11 3.83A2 2 0 0 0 9.59 3.24H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.58a2 2 0 0 0 2.82 0l4.6-4.6a2 2 0 0 0 0-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/>',
  alertTriangle: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  messageCircle: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  moreHorizontal: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  arrowDown: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  share2: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14" y2="17"/><line x1="14" y1="20" x2="14" y2="20.01"/><line x1="17" y1="14" x2="20" y2="14"/><line x1="20" y1="17" x2="17" y2="17"/><line x1="17" y1="20" x2="20" y2="20"/>',
  keyboard: '<rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6" y2="8.01"/><line x1="10" y1="8" x2="10" y2="8.01"/><line x1="14" y1="8" x2="14" y2="8.01"/><line x1="18" y1="8" x2="18" y2="8.01"/><line x1="6" y1="12" x2="6" y2="12.01"/><line x1="10" y1="12" x2="10" y2="12.01"/><line x1="14" y1="12" x2="14" y2="12.01"/><line x1="18" y1="12" x2="18" y2="12.01"/><line x1="7" y1="16" x2="17" y2="16"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
};
$$('.tab-icon[data-icon], .icon-inline[data-icon]').forEach((span) => {
  const inner = ICONS[span.dataset.icon];
  if (inner) span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
});

// Génère une icône SVG à la volée pour du contenu créé dynamiquement (menus, listes).
function iconSvg(name, size = 15) {
  const inner = ICONS[name];
  if (!inner) return '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}" style="vertical-align:-3px;margin-right:6px;flex-shrink:0;">${inner}</svg>`;
}

// ---------- Splash screen (3 secondes, avec clic de secours) ----------
function hideSplash() {
  const splash = document.getElementById('splashScreen');
  const app = document.getElementById('app');
  if (app) app.classList.remove('app-hidden');
  if (splash) {
    splash.classList.add('splash-hide');
    setTimeout(() => splash.remove(), 550);
  }
}
const splashDonePromise = new Promise((resolve) => {
  let done = false;
  const finish = () => { if (done) return; done = true; hideSplash(); resolve(); };
  setTimeout(finish, 3000);
  const splashEl = document.getElementById('splashScreen');
  if (splashEl) splashEl.addEventListener('click', finish);
});

// ---------- Détection hors ligne / en ligne ----------
function updateOfflineIndicator() {
  const pill = document.getElementById('wsOfflinePill');
  if (pill) pill.classList.toggle('hidden', navigator.onLine);
  updateMobileSaveStatus();
}
window.addEventListener('online', () => { updateOfflineIndicator(); toast('Connexion rétablie.'); });
window.addEventListener('offline', () => { updateOfflineIndicator(); toast('Hors ligne — vos modifications restent conservées sur cet appareil.', 4500); });

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ---------- Theme toggle ----------
(function () {
  const root = document.documentElement;
  let theme = 'dark'; // industriel : sombre par défaut, PC et mobile
  root.setAttribute('data-theme', theme);
  $('#themeToggle').addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', theme);
  });
})();

// ---------- Toast ----------
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- Fenêtre modale générique ----------
// ---------- Raccourcis clavier simples (PC) ----------
document.addEventListener('keydown', (e) => {
  const isTyping = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
  const modalOpen = !$('#modalOverlay').classList.contains('hidden');
  const searchOpen = !$('#searchOverlay').classList.contains('hidden');
  const panelOpen = $('#taskPanel') && !$('#taskPanel').classList.contains('hidden');

  if (e.key === 'Escape') {
    if (searchOpen) { closeSearch(); return; }
    if (modalOpen) { $('#modalCancel')?.click(); return; }
    if (panelOpen) { closeTaskPanel(); return; }
    return;
  }
  if (isTyping) return; // les raccourcis suivants sont désactivés pendant la saisie de texte
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (state.draft) $('#btnSaveFolder')?.click();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openSearch();
  } else if (e.key === '?') {
    if (state.draft) showShortcutsHelp();
  }
});

function showModal({ title, bodyHtml, confirmLabel = 'Confirmer' }) {
  return new Promise((resolve) => {
    const overlay = $('#modalOverlay');
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHtml;
    $('#modalConfirm').textContent = confirmLabel;
    overlay.classList.remove('hidden');

    function cleanup(confirmed) {
      overlay.classList.add('hidden');
      $('#modalConfirm').removeEventListener('click', onConfirm);
      $('#modalCancel').removeEventListener('click', onCancel);
      resolve(confirmed);
    }
    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }
    $('#modalConfirm').addEventListener('click', onConfirm);
    $('#modalCancel').addEventListener('click', onCancel);
  });
}

async function askNaReason() {
  const confirmed = await showModal({
    title: 'Marquer comme non applicable',
    bodyHtml: '<label style="font-size:var(--text-sm);color:var(--color-text-muted);">Raison (optionnel)</label><textarea id="modalNaReason" rows="3" placeholder="ex. Aucune alimentation électrique sur ce point"></textarea>',
    confirmLabel: 'Marquer N/A',
  });
  if (!confirmed) return null;
  return $('#modalNaReason').value.trim();
}

async function askNcReason() {
  const confirmed = await showModal({
    title: 'Marquer comme non conforme',
    bodyHtml: `
      <label style="font-size:var(--text-sm);color:var(--color-text-muted);">Gravité</label>
      <select id="modalNcGravite" style="width:100%;margin-top:4px;margin-bottom:var(--space-3);">
        <option value="mineure">Mineure</option>
        <option value="majeure">Majeure</option>
        <option value="critique">Critique</option>
      </select>
      <label style="font-size:var(--text-sm);color:var(--color-text-muted);">Raison (optionnel)</label>
      <textarea id="modalNaReason" rows="2" placeholder="ex. Câblage ne respecte pas le plan"></textarea>
      <label style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:var(--space-3);display:block;">Zone / équipement (optionnel)</label>
      <input type="text" id="modalNcZone" placeholder="ex. Secteur pâte, FT-4407">
      <label style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:var(--space-3);display:block;">Action corrective (optionnel)</label>
      <textarea id="modalNcAction" rows="2" placeholder="ex. Remplacer le câble"></textarea>
      <label style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:var(--space-3);display:block;">Responsable (optionnel)</label>
      <input type="text" id="modalNcResponsable" placeholder="ex. Carl Tremblay">`,
    confirmLabel: 'Marquer non conforme',
  });
  if (!confirmed) return null;
  return {
    reason: $('#modalNaReason').value.trim(),
    gravite: $('#modalNcGravite').value,
    zone: $('#modalNcZone').value.trim(),
    actionCorrective: $('#modalNcAction').value.trim(),
    responsable: $('#modalNcResponsable').value.trim(),
    dateCreation: new Date().toISOString(),
  };
}

// ============================================================
// Stockage local — IndexedDB (brouillons + fichiers, un enregistrement
// par numéro de localisation, blobs de fichiers inclus)
// ============================================================
const DB_NAME = 'suivi-instrumentation';
const DB_STORE = 'dossiers';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) {
        req.result.createObjectStore(DB_STORE, { keyPath: 'localisation' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(numero) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const r = tx.objectStore(DB_STORE).get(numero);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  } catch (err) { return null; }
}

async function dbPut(draft) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(draft);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) { return false; }
}

function generateId() {
  return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function newVpoItem() {
  return { id: generateId(), texte: '', statut: null, raison: '', gravite: '', obligatoire: false, resolu: false, zone: '', actionCorrective: '', responsable: '', dateCreation: '', dateValidation: '', validePar: '', numero: '' };
}

function newDraft(numero, mode) {
  const now = new Date().toISOString();
  return {
    schemaVersion: 5,
    application: 'Gestion responsable',
    localisation: numero,
    mode,
    creeLe: now,
    modifieLe: now,
    champs: {},
    liens: {},
    casesCochees: {},
    casesRaisons: {},
    casesGravites: {},
    casesNcDetails: {},
    casesFichiers: {},
    casesPreuveRequise: {},
    casesNotes: {},
    ncFichiers: {},
    ncSeq: 0,
    files: Object.fromEntries(UPLOAD_TABS.map((o) => [o, []])),
    vpoItems: [newVpoItem()],
    ncExtra: [],
    approbations: [],
    journal: [],
    derniereSauvegardeOfficielle: null,
    meta: { source: 'pwa', modeSauvegarde: 'brouillon-local' },
  };
}

function nextNcId() {
  state.draft.ncSeq = (state.draft.ncSeq || 0) + 1;
  return 'NC-' + String(state.draft.ncSeq).padStart(2, '0');
}

function normalizeDraft(d) {
  if (!d.champs) d.champs = {};
  if (!d.liens) d.liens = {};
  if (!d.casesCochees) d.casesCochees = {};
  if (!d.casesRaisons) d.casesRaisons = {};
  if (!d.casesGravites) d.casesGravites = {};
  if (!d.casesNcDetails) d.casesNcDetails = {};
  if (!d.casesFichiers) d.casesFichiers = {};
  if (!d.casesPreuveRequise) d.casesPreuveRequise = {};
  if (!d.casesNotes) d.casesNotes = {};
  if (!d.ncFichiers) d.ncFichiers = {};
  if (d.ncSeq === undefined) d.ncSeq = 0;
  if (!d.files) d.files = {};
  UPLOAD_TABS.forEach((o) => { if (!d.files[o]) d.files[o] = []; });
  if (!d.vpoItems || !d.vpoItems.length) d.vpoItems = [newVpoItem()];
  d.vpoItems.forEach((it) => {
    if (it.obligatoire === undefined) it.obligatoire = false;
    if (it.resolu === undefined) it.resolu = false;
    if (it.zone === undefined) it.zone = '';
    if (it.actionCorrective === undefined) it.actionCorrective = '';
    if (it.responsable === undefined) it.responsable = '';
    if (it.dateCreation === undefined) it.dateCreation = '';
    if (it.numero === undefined) it.numero = '';
    if (it.dateValidation === undefined) it.dateValidation = '';
    if (it.validePar === undefined) it.validePar = '';
  });
  if (!d.ncExtra) d.ncExtra = [];
  d.ncExtra.forEach((it) => {
    if (it.gravite === undefined) it.gravite = 'mineure';
    if (it.resolu === undefined) it.resolu = false;
    if (it.zone === undefined) it.zone = '';
    if (it.actionCorrective === undefined) it.actionCorrective = '';
    if (it.responsable === undefined) it.responsable = '';
    if (it.dateCreation === undefined) it.dateCreation = new Date().toISOString();
    if (it.numero === undefined) it.numero = '';
  });
  if (!d.approbations) d.approbations = [];
  if (!d.journal) d.journal = [];
  if (d.derniereSauvegardeOfficielle === undefined) d.derniereSauvegardeOfficielle = null;
  if (d.derniereExportRapport === undefined) d.derniereExportRapport = null;

  // Attribution rétroactive des identifiants NC-xx manquants (compatibilité anciens dossiers)
  const groupsForId = CHECKLISTS[d.mode] || {};
  Object.entries(groupsForId).forEach(([group, items]) => items.forEach(([name]) => {
    if (d.casesCochees[name] === 'nc') {
      if (!d.casesNcDetails[name]) d.casesNcDetails[name] = {};
      if (!d.casesNcDetails[name].numero) {
        d.ncSeq = (d.ncSeq || 0) + 1;
        d.casesNcDetails[name].numero = 'NC-' + String(d.ncSeq).padStart(2, '0');
      }
    }
  }));
  d.vpoItems.forEach((it) => {
    if (it.statut === 'nc' && !it.numero) {
      d.ncSeq = (d.ncSeq || 0) + 1;
      it.numero = 'NC-' + String(d.ncSeq).padStart(2, '0');
    }
  });
  d.ncExtra.forEach((it) => {
    if (it.texte && it.texte.trim() && !it.numero) {
      d.ncSeq = (d.ncSeq || 0) + 1;
      it.numero = 'NC-' + String(d.ncSeq).padStart(2, '0');
    }
  });

  return d;
}

function logActivity(text) {
  if (!state.draft) return;
  if (!state.draft.journal) state.draft.journal = [];
  state.draft.journal.push({ at: new Date().toISOString(), text });
  if (state.draft.journal.length > 200) state.draft.journal = state.draft.journal.slice(-200);
}

let persistTimer;
function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    if (!state.draft) return;
    state.draft.modifieLe = new Date().toISOString();
    await dbPut(state.draft);
    updateMobileSaveStatus();
  }, 400);
}

// Petit état compact en haut sur mobile : "Enregistré à HH:MM" ou "Hors ligne".
// Le hors ligne prend priorité visuellement (info la plus utile sur le terrain).
function updateMobileSaveStatus() {
  const el = document.getElementById('mobileSaveStatus');
  if (!el) return;
  if (!navigator.onLine) {
    el.textContent = 'Hors ligne — conservé sur cet appareil';
    el.classList.add('offline');
    return;
  }
  el.classList.remove('offline');
  if (state.draft && state.draft.modifieLe) {
    el.textContent = `Enregistré à ${new Date(state.draft.modifieLe).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    el.textContent = 'Nouveau dossier';
  }
}

// ---------- Étape 1 : choix du type ----------
function selectMode(mode) {
  state.mode = mode;
  document.getElementById('app').setAttribute('data-mode', mode);

  const label = mode === 'installation' ? "Suivi d'installation" : "Démantèlement TEI";
  $('#modeBadge').textContent = label;
  $('#modeBadge').classList.remove('hidden');
  $('#brandSub').textContent = label;
  $('#homeBtn').classList.remove('hidden');
  $('#step2Kicker').textContent = `Étape 2 · ${label}`;
  $('#step2Title').textContent = mode === 'installation'
    ? "Localisation de l'équipement à installer"
    : "Localisation de l'équipement à démanteler";

  $('#screenChoice').classList.add('hidden');
  $('#screenDossier').classList.remove('hidden');
}

$$('.choice-card').forEach((card) => {
  card.addEventListener('click', () => {
    selectMode(card.dataset.choice);
    $('#numLoc').focus();
  });
});

$('#homeBtn').addEventListener('click', () => location.reload());

$('#topbarMenuBtn').addEventListener('click', async () => {
  const dossierOuvert = !$('#homeBtn').classList.contains('hidden');
  const choice = await showChoiceModal('Menu', `
    <div style="display:flex;flex-direction:column;gap:var(--space-2);">
      <button type="button" class="btn btn-outline" id="menuChoixTheme" style="width:100%;justify-content:flex-start;">Changer de thème (clair/sombre)</button>
      ${dossierOuvert ? '<button type="button" class="btn btn-outline" id="menuChoixNouveau" style="width:100%;justify-content:flex-start;">Nouveau dossier</button>' : ''}
    </div>
  `, dossierOuvert ? ['menuChoixTheme', 'menuChoixNouveau'] : ['menuChoixTheme']);
  if (choice === 'menuChoixTheme') $('#themeToggle').click();
  else if (choice === 'menuChoixNouveau') location.reload();
});

// Vérification avant fermeture : partagée entre le bouton PC et le bouton mobile.
// Recalcule toujours à la demande — jamais de donnée figée d'un rendu précédent.
function computeChecklistOnlyProgress() {
  const groups = CHECKLISTS[state.draft.mode] || {};
  let total = 0, done = 0;
  Object.values(groups).forEach((items) => items.forEach(([name]) => {
    total += 1;
    const v = state.draft.casesCochees[name];
    if (v === true || v === 'na') done += 1;
  }));
  return { done, total };
}

function computeProofSummary() {
  const groups = CHECKLISTS[state.draft.mode] || {};
  let total = 0, satisfied = 0;
  Object.entries(groups).forEach(([, items]) => items.forEach(([name]) => {
    if (state.draft.casesPreuveRequise[name]) {
      total++;
      if (state.draft.casesCochees[name] === true && (state.draft.casesFichiers[name] || []).length) satisfied++;
    }
  }));
  return { satisfied, total };
}

// Journal de remise / fermeture — réutilise entièrement les données existantes.
// Affiche « Non renseigné » plutôt que d'inventer une information absente.
function computeHandoffSummary() {
  const d = state.draft;
  const checklistProg = computeChecklistOnlyProgress();
  const proof = computeProofSummary();
  const vpo = computeVpoStats();
  const nc = computeNcStats();
  const docCountTotal = Object.values(d.casesFichiers || {}).reduce((s, a) => s + a.length, 0)
    + (d.files['mise-a-jour'] || []).length
    + Object.values(d.ncFichiers || {}).reduce((s, a) => s + a.length, 0);
  const lastApprobation = (d.approbations || [])[d.approbations.length - 1];

  return {
    travailCompletePar: d.champs.employe || 'Non renseigné',
    verifiePar: lastApprobation ? lastApprobation.nom : 'Non renseigné',
    tachesTerminees: `${checklistProg.done} / ${checklistProg.total}`,
    documentsRemis: docCountTotal,
    preuvesSatisfaites: `${proof.satisfied} / ${proof.total}`,
    vpoFermees: `${vpo.evalues} / ${vpo.total}`,
    ncResolues: `${nc.resolues} / ${nc.resolues + nc.total}`,
    rapportExporte: d.derniereExportRapport ? `Oui — ${new Date(d.derniereExportRapport).toLocaleString('fr-CA')}` : 'Non',
    derniereSauvegarde: d.derniereSauvegardeOfficielle
      ? new Date(d.derniereSauvegardeOfficielle.at).toLocaleString('fr-CA')
      : (d.modifieLe ? new Date(d.modifieLe).toLocaleString('fr-CA') + ' (brouillon local)' : 'Non renseigné'),
  };
}

async function showClosureCheckModal() {
  if (!state.draft) return;
  const items = computeClosureItems();
  const globalStatus = computeGlobalStatus();
  const checklistProg = computeChecklistOnlyProgress();
  const proofSummary = computeProofSummary();
  const vpo = computeVpoStats();
  const nc = computeNcStats();
  const docCountTotal = Object.values(state.draft.casesFichiers || {}).reduce((s, a) => s + a.length, 0)
    + (state.draft.files['mise-a-jour'] || []).length
    + Object.values(state.draft.ncFichiers || {}).reduce((s, a) => s + a.length, 0);

  const summaryHtml = `
    <div class="tp-status-badge" style="margin-bottom:var(--space-4);">${escapeHtml(globalStatus.label)}</div>
    <div class="closure-summary-grid">
      <div>Checklist obligatoire<br><strong>${checklistProg.done} / ${checklistProg.total}</strong></div>
      <div>Preuves requises<br><strong>${proofSummary.satisfied} / ${proofSummary.total}</strong></div>
      <div>VPO<br><strong>${vpo.evalues} / ${vpo.total}</strong></div>
      <div>Non-conformités ouvertes<br><strong>${nc.total}</strong></div>
      <div>Documentation<br><strong>${docCountTotal} document${docCountTotal > 1 ? 's' : ''}</strong></div>
      <div>Validation de fermeture<br><strong>${items.length === 0 ? 'Prête' : 'En attente'}</strong></div>
    </div>
  `;

  if (!items.length) {
    await showModal({
      title: 'Dossier prêt',
      bodyHtml: `${summaryHtml}<p style="color:var(--color-success);margin-top:var(--space-4);">Toutes les conditions sont remplies pour la fermeture.</p>`,
      confirmLabel: 'Fermer',
    });
    return;
  }
  const bodyHtml = `
    ${summaryHtml}
    <div style="display:flex;flex-direction:column;gap:var(--space-3);">
      ${items.map((it, i) => `
        <div style="border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:var(--space-3);">
          <div style="font-size:var(--text-sm);"><strong>${i + 1}.</strong> ${escapeHtml(it.label)} — ${escapeHtml(it.detail)}</div>
          <button type="button" class="btn btn-outline" id="closureItem${i}" style="margin-top:var(--space-2);width:100%;">${escapeHtml(it.buttonLabel)}</button>
        </div>
      `).join('')}
    </div>
  `;
  const choiceIds = items.map((_, i) => `closureItem${i}`);
  const choice = await showChoiceModal(`Contrôle de complétude : ${items.length} élément${items.length > 1 ? 's' : ''} à corriger`, bodyHtml, choiceIds);
  if (choice) {
    const idx = parseInt(choice.replace('closureItem', ''), 10);
    selectTab(items[idx].tab);
  }
}
$('#btnClosureCheckPc').addEventListener('click', showClosureCheckModal);

// Ajouter une note : réutilise le champ Commentaires existant (onglet Commentaire),
// pas de nouvelle structure de données.
$('#btnAddNote').addEventListener('click', async () => {
  if (!state.draft) return;
  const current = state.draft.champs.commentaires || '';
  const confirmed = await showModal({
    title: 'Ajouter une note',
    bodyHtml: `<textarea id="modalDossierNote" rows="6" placeholder="Note sur ce dossier…">${escapeHtml(current)}</textarea>`,
    confirmLabel: 'Enregistrer',
  });
  if (!confirmed) return;
  const val = $('#modalDossierNote').value;
  state.draft.champs.commentaires = val;
  $('#fldCommentaires').value = val;
  schedulePersist();
  toast('Note enregistrée.');
});

// Menu ⋯ de l'en-tête du dossier : regroupe les fonctions secondaires
// (QR, import, export, partage, impression, historique) réutilisant les
// mécanismes déjà existants — aucune nouvelle logique.
$('#btnMoreMenuPc').addEventListener('click', async () => {
  if (!state.draft) return;
  const choice = await showChoiceModal('Options du dossier', `
    <div style="display:flex;flex-direction:column;gap:var(--space-2);">
      <button type="button" class="btn btn-outline" id="menuQr" style="width:100%;justify-content:flex-start;">${iconSvg('qr')}QR du dossier</button>
      <button type="button" class="btn btn-outline" id="menuExporter" style="width:100%;justify-content:flex-start;">${iconSvg('arrowDown')}Exporter le rapport de chantier</button>
      <button type="button" class="btn btn-outline" id="menuPartager" style="width:100%;justify-content:flex-start;">${iconSvg('share2')}Partager le dossier</button>
      <button type="button" class="btn btn-outline" id="menuImprimer" style="width:100%;justify-content:flex-start;">${iconSvg('printer')}Imprimer</button>
      <button type="button" class="btn btn-outline" id="menuHistorique" style="width:100%;justify-content:flex-start;">${iconSvg('clock')}Historique / activité récente</button>
      <button type="button" class="btn btn-outline" id="menuRaccourcis" style="width:100%;justify-content:flex-start;">${iconSvg('keyboard')}Raccourcis clavier</button>
    </div>
  `, ['menuQr', 'menuExporter', 'menuPartager', 'menuImprimer', 'menuHistorique', 'menuRaccourcis']);
  if (choice === 'menuQr') showQrModal();
  else if (choice === 'menuExporter') exportDashboardFile();
  else if (choice === 'menuPartager') shareDossierLink();
  else if (choice === 'menuImprimer') window.print();
  else if (choice === 'menuHistorique') selectTab('apercu');
  else if (choice === 'menuRaccourcis') showShortcutsHelp();
});

function showShortcutsHelp() {
  showModal({
    title: 'Raccourcis clavier',
    bodyHtml: `
      <div style="display:flex;flex-direction:column;gap:var(--space-2);font-size:var(--text-sm);">
        <div><span class="tp-status-badge" style="font-family:var(--font-mono);">Ctrl/Cmd + S</span> Enregistrer le dossier</div>
        <div><span class="tp-status-badge" style="font-family:var(--font-mono);">Ctrl/Cmd + K</span> Recherche interne</div>
        <div><span class="tp-status-badge" style="font-family:var(--font-mono);">Échap</span> Fermer la recherche, une fenêtre ou le panneau de tâche</div>
        <div><span class="tp-status-badge" style="font-family:var(--font-mono);">?</span> Afficher ce rappel</div>
      </div>
    `,
    confirmLabel: 'Fermer',
  });
}

// ---------- Emplacement local du dossier (File System Access API) ----------
const FS_ACCESS_SUPPORTED = 'showDirectoryPicker' in window;
if (!FS_ACCESS_SUPPORTED) {
  $('#folderStatus').textContent = 'La sauvegarde dans un dossier est disponible dans Chrome ou Edge sur ordinateur.';
}

async function pickSaveFolder() {
  if (!FS_ACCESS_SUPPORTED) {
    toast('Cette fonction est disponible dans Chrome ou Edge sur ordinateur.', 4000);
    return false;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    state.rootDirHandle = handle;
    $('#folderStatus').classList.remove('err');
    $('#folderStatus').classList.add('ok');
    $('#folderStatus').textContent = `Emplacement choisi : ${handle.name}.`;
    toast(`Emplacement « ${handle.name} » retenu.`);
    return true;
  } catch (err) {
    if (err && err.name === 'AbortError') return false; // l'utilisateur a fermé le sélecteur — rien à signaler
    console.error('Erreur showDirectoryPicker:', err);
    toast(`Impossible d\u2019ouvrir le sélecteur de dossier : ${(err && err.message) || (err && err.name) || 'erreur inconnue'}`, 6000);
    return false;
  }
}
$('#btnChooseFolder').addEventListener('click', pickSaveFolder);

function isTaskDone(name) {
  const v = state.draft.casesCochees[name];
  return v === true || v === 'na';
}

function computeProgress() {
  if (!state.draft) return { done: 0, total: 0, pct: 100 };
  const groups = CHECKLISTS[state.draft.mode] || {};
  let total = 0, done = 0;
  Object.values(groups).forEach((items) => {
    items.forEach(([name]) => { total += 1; if (isTaskDone(name)) done += 1; });
  });
  (state.draft.vpoItems || []).forEach((item) => {
    if (!item.texte || !item.texte.trim()) return;
    total += 1;
    if (item.statut === 'conforme' || item.statut === 'nc') done += 1;
  });
  const pct = total ? (done / total) * 100 : 100;
  return { done, total, pct };
}

function computeStatutLabel(done, total) {
  let statut = 'Brouillon';
  if (done > 0) statut = 'En cours';
  if (total > 0 && done === total) statut = 'Terminé';
  return statut;
}

// Statut global à 6 états, calculé entièrement à partir des données existantes
// (aucune nouvelle structure). « Archivé » n'est pas atteignable : aucune action
// d'archivage distincte n'existe dans l'architecture actuelle — plutôt que
// d'inventer un déclencheur, ce niveau reste documenté comme limite connue.
function computeGlobalStatus() {
  if (!state.draft) return { key: 'brouillon', label: 'Brouillon' };
  const { done, total } = computeProgress();
  const nc = computeNcStats();
  const vpo = computeVpoStats();
  const preuve = computeProofStats();
  const closure = computeClosureVerdict();

  if (done === 0) return { key: 'brouillon', label: 'Brouillon' };
  if (nc.total > 0 || preuve.manquantes > 0) return { key: 'attente-correction', label: 'En attente de correction' };
  if (closure.ready) {
    return state.draft.derniereSauvegardeOfficielle
      ? { key: 'termine', label: 'Terminé' }
      : { key: 'pret', label: 'Prêt à fermer' };
  }
  if (total > 0 && done === total && vpo.pendingObligatoire > 0) return { key: 'validation', label: 'En validation' };
  return { key: 'en-cours', label: 'En cours' };
}

function updateProgressPill() {
  const pill = $('#wsProgressPill');
  if (pill && state.draft) {
    const { pct } = computeProgress();
    pill.textContent = `${Math.round(pct)} %`;
    const hue = Math.max(0, Math.min(120, (pct / 100) * 120));
    pill.style.background = `hsl(${hue}, 70%, 45%)`;
  }
  renderApercu();
  updateMobileSummary();
  renderMobileResumeBody();
  if (!$('#checklistContextBar')?.classList.contains('hidden')) updateChecklistContextBar(true);
}

function computeNcStats() {
  const groups = CHECKLISTS[state.draft.mode] || {};
  let total = 0, critique = 0, majeure = 0, mineure = 0, resolues = 0;
  Object.entries(groups).forEach(([group, items]) => items.forEach(([name]) => {
    if (state.draft.casesCochees[name] === 'nc') {
      const details = state.draft.casesNcDetails[name];
      if (details && details.resolu) { resolues++; return; }
      total++;
      const g = state.draft.casesGravites[name];
      if (g === 'critique') critique++; else if (g === 'majeure') majeure++; else mineure++;
    }
  }));
  (state.draft.vpoItems || []).forEach((it) => {
    if (it.statut === 'nc') {
      if (it.resolu) { resolues++; return; }
      total++;
      if (it.gravite === 'critique') critique++; else if (it.gravite === 'majeure') majeure++; else mineure++;
    }
  });
  (state.draft.ncExtra || []).forEach((it) => {
    if (it.texte && it.texte.trim()) {
      if (it.resolu) { resolues++; return; }
      total++;
      if (it.gravite === 'critique') critique++; else if (it.gravite === 'majeure') majeure++; else mineure++;
    }
  });
  return { total, critique, majeure, mineure, resolues };
}

function computeVpoStats() {
  const filled = (state.draft.vpoItems || []).filter((it) => it.texte && it.texte.trim());
  const evalues = filled.filter((it) => it.statut === 'conforme' || it.statut === 'nc').length;
  const pendingAll = filled.filter((it) => !it.statut);
  const pendingObligatoire = pendingAll.filter((it) => it.obligatoire).length;
  const pendingOptionnel = pendingAll.length - pendingObligatoire;
  return { total: filled.length, evalues, pending: pendingAll.length, pendingObligatoire, pendingOptionnel };
}

function computeDossierStatus() {
  const { done, total, pct } = computeProgress();
  const nc = computeNcStats();
  if (nc.critique > 0) {
    return { level: 'rouge', text: `Blocage actif — ${nc.critique} non-conformité${nc.critique > 1 ? 's' : ''} critique${nc.critique > 1 ? 's' : ''} à traiter` };
  }
  if (nc.total > 0) {
    return { level: 'ambre', text: `Attention requise — ${nc.total} non-conformité${nc.total > 1 ? 's' : ''} ouverte${nc.total > 1 ? 's' : ''}` };
  }
  if (pct >= 100) {
    return { level: 'bleu', text: 'Prêt pour révision — toutes les tâches sont complétées' };
  }
  if (pct >= 60) {
    return { level: 'vert', text: `Intervention en bonne voie — ${done} tâche${done > 1 ? 's' : ''} sur ${total} complétées` };
  }
  if (pct > 0) {
    return { level: 'ambre', text: `Attention requise — ${total - done} tâche(s) restante(s)` };
  }
  return { level: 'ambre', text: 'Dossier démarré — aucune tâche complétée pour l\u2019instant' };
}

function computeNextAction() {
  const groups = CHECKLISTS[state.draft.mode] || {};
  for (const [group, items] of Object.entries(groups)) {
    for (const [name, label] of items) {
      if (state.draft.casesCochees[name] === 'nc' && state.draft.casesGravites[name] === 'critique'
        && !(state.draft.casesNcDetails[name] && state.draft.casesNcDetails[name].resolu)) {
        return { text: `Traiter la non-conformité critique : ${label}`, tab: 'non-conformite' };
      }
    }
  }
  const vpoPendingObligatoire = (state.draft.vpoItems || []).find((it) => it.texte && it.texte.trim() && !it.statut && it.obligatoire);
  if (vpoPendingObligatoire) return { text: `Évaluer le VPO obligatoire : ${vpoPendingObligatoire.texte}`, tab: 'vpo' };
  for (const [group, items] of Object.entries(groups)) {
    for (const [name, label] of items) {
      if (!isTaskDone(name)) return { text: `Compléter : ${label}`, tab: group };
    }
  }
  const vpoPending = (state.draft.vpoItems || []).find((it) => it.texte && it.texte.trim() && !it.statut);
  if (vpoPending) return { text: `Évaluer le VPO : ${vpoPending.texte}`, tab: 'vpo' };
  for (const [group, items] of Object.entries(groups)) {
    if (!ATTACH_GROUPS.includes(group)) continue;
    for (const [name, label] of items) {
      const requise = !!state.draft.casesPreuveRequise[name];
      const checked = state.draft.casesCochees[name] === true;
      const files = state.draft.casesFichiers[name] || [];
      if (requise && checked && !files.length) return { text: `Joindre la preuve manquante : ${label}`, tab: group };
    }
  }
  for (const [group, items] of Object.entries(groups)) {
    for (const [name, label] of items) {
      if (state.draft.casesCochees[name] === 'nc') return { text: `Traiter la non-conformité : ${label}`, tab: 'non-conformite' };
    }
  }
  if (!(state.draft.champs.employeeName || '').trim()) {
    return { text: 'Entrer le nom de l\u2019employé et sauvegarder le dossier', tab: 'approbation' };
  }
  return { text: 'Dossier prêt — sauvegardez-le officiellement', tab: 'approbation' };
}

function computeProofStats() {
  const groups = CHECKLISTS[state.draft.mode] || {};
  let manquantes = 0;
  Object.entries(groups).forEach(([group, items]) => {
    if (!ATTACH_GROUPS.includes(group)) return;
    items.forEach(([name]) => {
      const requise = !!state.draft.casesPreuveRequise[name];
      const checked = state.draft.casesCochees[name] === true;
      const files = state.draft.casesFichiers[name] || [];
      if (requise && checked && !files.length) manquantes++;
    });
  });
  return { manquantes };
}

function computeClosureVerdict() {
  const { done, total } = computeProgress();
  const incomplete = total - done;
  const nc = computeNcStats();
  const vpo = computeVpoStats();
  const preuve = computeProofStats();
  const problems = [];
  if (incomplete > 0) problems.push(`${incomplete} tâche${incomplete > 1 ? 's' : ''} incomplète${incomplete > 1 ? 's' : ''}`);
  if (vpo.pendingObligatoire > 0) problems.push(`${vpo.pendingObligatoire} VPO obligatoire${vpo.pendingObligatoire > 1 ? 's' : ''} non évalué${vpo.pendingObligatoire > 1 ? 's' : ''}`);
  if (nc.total > 0) problems.push(`${nc.total} non-conformité${nc.total > 1 ? 's' : ''} ouverte${nc.total > 1 ? 's' : ''}`);
  if (preuve.manquantes > 0) problems.push(`${preuve.manquantes} preuve${preuve.manquantes > 1 ? 's' : ''} manquante${preuve.manquantes > 1 ? 's' : ''}`);
  if (!problems.length) {
    let text = 'Dossier prêt pour révision : toutes les tâches sont complétées, les VPO obligatoires sont évalués et aucune non-conformité n\u2019est ouverte.';
    if (vpo.pendingOptionnel > 0) text += ` (Note : ${vpo.pendingOptionnel} VPO non obligatoire${vpo.pendingOptionnel > 1 ? 's' : ''} encore non évalué${vpo.pendingOptionnel > 1 ? 's' : ''}.)`;
    return { ready: true, text };
  }
  return { ready: false, text: `Dossier non prêt à fermer : ${problems.join(', ')}.`, problems };
}

// Version détaillée, élément par élément, pour la fenêtre de vérification avant
// fermeture : chaque ligne pointe directement vers la tâche, VPO ou NC concernée.
function computeClosureItems() {
  if (!state.draft) return [];
  const items = [];
  const groups = CHECKLISTS[state.draft.mode] || {};
  Object.entries(groups).forEach(([group, tasks]) => {
    tasks.forEach(([name, label]) => {
      const val = state.draft.casesCochees[name];
      if (val !== true && val !== 'na' && val !== 'nc') {
        items.push({ label, detail: 'tâche incomplète', tab: group, buttonLabel: 'Ouvrir la tâche' });
      } else if (val === true && state.draft.casesPreuveRequise[name] && !(state.draft.casesFichiers[name] || []).length) {
        items.push({ label, detail: 'preuve manquante', tab: group, buttonLabel: 'Ouvrir la tâche' });
      } else if (val === 'nc' && !(state.draft.casesNcDetails[name]?.resolu)) {
        const numero = state.draft.casesNcDetails[name]?.numero || '';
        items.push({ label: `${numero ? numero + ' — ' : ''}${label}`, detail: 'non-conformité ouverte', tab: 'non-conformite', buttonLabel: 'Ouvrir la non-conformité' });
      }
    });
  });
  (state.draft.vpoItems || []).forEach((it) => {
    if (!it.texte || !it.texte.trim()) return;
    if (it.statut === 'nc' && !it.resolu) {
      items.push({ label: `${it.numero ? it.numero + ' — ' : ''}${it.texte}`, detail: 'non-conformité ouverte', tab: 'vpo', buttonLabel: 'Ouvrir la VPO' });
    } else if (it.obligatoire && !it.statut) {
      items.push({ label: it.texte, detail: 'validation requise', tab: 'vpo', buttonLabel: 'Ouvrir la VPO' });
    }
  });
  (state.draft.ncExtra || []).forEach((it) => {
    if (it.texte && it.texte.trim() && !it.resolu) {
      items.push({ label: `${it.numero ? it.numero + ' — ' : ''}${it.texte}`, detail: 'non-conformité ouverte', tab: 'non-conformite', buttonLabel: 'Ouvrir la non-conformité' });
    }
  });
  return items;
}

const PRIORITE_LABEL = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' };

const DOCUMENTS_FILTER_LABELS = {
  toutes: 'Toutes', plans: 'Plans', photos: 'Photos', 'preuve-requise': 'Preuves requises',
  vpo: 'VPO', nc: 'Non-conformités', 'non-classe': 'Non classés',
};
function renderDocuments() {
  const container = $('#documentsContent');
  if (!container || !state.draft) return;
  const d = state.draft;
  const groups = CHECKLISTS[d.mode] || {};
  const allDocs = [];

  Object.entries(groups).forEach(([group, items]) => {
    items.forEach(([name, label]) => {
      const files = d.casesFichiers[name] || [];
      const preuveReq = !!d.casesPreuveRequise[name];
      files.forEach((f) => {
        let category = 'non-classe';
        if (preuveReq) category = 'preuve-requise';
        else if (group === 'plans') category = 'plans';
        allDocs.push({
          file: f, category, tab: group, link: `${GROUP_LABELS[group] || group} — ${label}`,
          date: f.uploadedAt,
          preuveStatus: preuveReq ? (d.casesCochees[name] === true ? 'satisfaite' : 'manquante') : 'non-requise',
        });
      });
    });
  });

  (d.files['mise-a-jour'] || []).forEach((f) => {
    allDocs.push({ file: f, category: 'photos', tab: 'mise-a-jour', link: 'Mise à jour', date: f.uploadedAt, preuveStatus: 'non-requise' });
  });

  const vpoNumeros = new Set((d.vpoItems || []).filter((it) => it.numero).map((it) => it.numero));
  Object.entries(d.ncFichiers || {}).forEach(([numero, files]) => {
    const category = vpoNumeros.has(numero) ? 'vpo' : 'nc';
    files.forEach((f) => allDocs.push({ file: f, category, tab: category === 'vpo' ? 'vpo' : 'non-conformite', link: numero, date: f.uploadedAt, preuveStatus: 'non-requise' }));
  });

  if (!allDocs.length) {
    container.innerHTML = '<div class="empty-state">Aucun document ou photo déposé pour l\u2019instant.</div>';
    return;
  }

  const currentFilter = state.documentsFilter || 'toutes';
  const filtered = currentFilter === 'toutes' ? allDocs : allDocs.filter((doc) => doc.category === currentFilter);
  const PROOF_LABEL = { satisfaite: 'Preuve satisfaite', manquante: 'Preuve manquante', 'non-requise': 'Preuve non requise' };

  const filterBarHtml = `
    <div class="checklist-filter-bar" style="margin-bottom:var(--space-4);">
      <label for="documentsFilterSelect">Filtrer :</label>
      <select id="documentsFilterSelect">
        ${Object.entries(DOCUMENTS_FILTER_LABELS).map(([k, l]) => {
          const count = k === 'toutes' ? allDocs.length : allDocs.filter((x) => x.category === k).length;
          return `<option value="${k}"${currentFilter === k ? ' selected' : ''}>${l} (${count})</option>`;
        }).join('')}
      </select>
    </div>`;

  container.innerHTML = filterBarHtml + (filtered.length ? `<div class="doc-list-rich">${filtered.map((doc, i) => `
    <div class="doc-row-rich" data-share-file-idx="${i}">
      ${isImageFile(doc.file.name)
        ? `<img src="${URL.createObjectURL(doc.file.blob)}" class="thumb-lg" alt="${escapeHtml(doc.file.name)}" data-doc-enlarge="${i}">`
        : `<span class="ext-badge">${extBadge(doc.file.name)}</span>`}
      <div class="doc-row-info">
        <div class="doc-row-name">${escapeHtml(doc.file.name)}</div>
        <div class="doc-row-meta">${escapeHtml(doc.link)} · ${fmtSize(doc.file.size)}${doc.date ? ' · ' + new Date(doc.date).toLocaleDateString('fr-CA') : ''}${doc.file.partages && doc.file.partages.length ? ` · ${formatShareSummary(doc.file.partages)}` : ''}</div>
        <div class="doc-row-proof proof-${doc.preuveStatus}">${PROOF_LABEL[doc.preuveStatus]}</div>
      </div>
      ${isImageFile(doc.file.name) ? `<button type="button" class="btn btn-tertiary" data-doc-share="${i}">Partager</button>` : ''}
      <button type="button" class="btn btn-tertiary doc-dl-btn" data-doc-name="${escapeHtml(doc.file.name)}">Télécharger</button>
      <button type="button" class="btn btn-tertiary" data-doc-jump="${doc.tab}">Ouvrir</button>
    </div>`).join('')}</div>` : '<div class="empty-state">Aucun document pour ce filtre.</div>');

  attachShareHistoryClicks(container, (row) => filtered[Number(row.dataset.shareFileIdx)]?.file);
  $$('[data-doc-enlarge]', container).forEach((img) => {
    img.addEventListener('click', () => openImageLightbox(filtered[Number(img.dataset.docEnlarge)].file));
  });
  $$('[data-doc-share]', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      const doc = filtered[Number(btn.dataset.docShare)];
      sharePhoto(doc.file, doc.link, renderDocuments);
    });
  });
  $('#documentsFilterSelect').addEventListener('change', (e) => {
    state.documentsFilter = e.target.value;
    renderDocuments();
  });
  $$('[data-doc-jump]', container).forEach((btn) => btn.addEventListener('click', () => selectTab(btn.dataset.docJump)));
  $$('.doc-dl-btn', container).forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const doc = filtered[i];
      const url = URL.createObjectURL(doc.file.blob);
      const a = document.createElement('a');
      a.href = url; a.download = doc.file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
  });
}

function renderApercu() {
  const container = $('#apercuContent');
  if (!container || !state.draft) return;
  const d = state.draft;
  const { done, total, pct } = computeProgress();
  const groups = CHECKLISTS[d.mode] || {};
  const status = computeDossierStatus();
  const globalStatus = computeGlobalStatus();
  const handoff = computeHandoffSummary();
  const nextAction = computeNextAction();
  const closure = computeClosureVerdict();
  const nc = computeNcStats();
  const vpo = computeVpoStats();
  const preuve = computeProofStats();

  const titre = [d.champs.type, d.champs.tag].filter(Boolean).join(' — ')
    || (d.mode === 'installation' ? "Suivi d'installation" : 'Démantèlement TEI');
  const secteur = d.champs.desc || '';
  const responsable = d.champs.employe || '';
  const echeance = d.champs.dateFin || d.champs.dateDebut || '';
  const priorite = d.champs.priorite || 'normale';

  const groupStats = Object.entries(groups).map(([group, items]) => {
    if (!items.length) return null;
    const doneCount = items.filter(([name]) => isTaskDone(name)).length;
    return { group, label: GROUP_LABELS[group] || group, pct: (doneCount / items.length) * 100, count: `${doneCount}/${items.length}` };
  }).filter(Boolean);

  const vpoFilled = (d.vpoItems || []).filter((it) => it.texte && it.texte.trim());
  if (vpoFilled.length) {
    const vpoDone = vpoFilled.filter((it) => it.statut === 'conforme' || it.statut === 'nc').length;
    groupStats.push({ group: 'vpo', label: 'VPO', pct: (vpoDone / vpoFilled.length) * 100, count: `${vpoDone}/${vpoFilled.length}` });
  }

  const docCount = Object.values(d.casesFichiers || {}).reduce((s, arr) => s + arr.length, 0)
    + (d.files['mise-a-jour'] || []).length
    + Object.values(d.ncFichiers || {}).reduce((s, arr) => s + arr.length, 0);

  const ringsHtml = groupStats.map((g) => `
    <div class="ring-card" data-apercu-jump="${g.group}">
      ${ringSvg(g.pct, 96, 8)}
      <div class="ring-card-label">${escapeHtml(g.label)}</div>
      <div class="ring-card-count">${g.count} tâches</div>
    </div>`).join('');

  const journalHtml = (d.journal || []).slice().reverse().slice(0, 15).map((j) => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-body">
        <div>${escapeHtml(j.text)}</div>
        <div class="timeline-date">${new Date(j.at).toLocaleString('fr-CA')}</div>
      </div>
    </div>`).join('') || '<p class="empty">Aucune activité enregistrée pour l\u2019instant.</p>';

  container.innerHTML = `
    <div class="global-status-line"><span class="tp-status-badge">${escapeHtml(globalStatus.label)}</span></div>
    <div class="status-banner status-${status.level}">${escapeHtml(status.text)}</div>
    <div class="closure-card ${closure.ready ? 'closure-ready' : 'closure-blocked'}">
      <div class="closure-title">Vérification avant fermeture</div>
      <div class="closure-text">${escapeHtml(closure.text)}</div>
      ${!closure.ready ? `<div class="closure-actions">
        ${(total - done) > 0 ? `<button type="button" class="btn btn-outline" data-apercu-jump="${groupStats.find((g) => g.pct < 100)?.group || 'identification'}">Voir les tâches incomplètes</button>` : ''}
        ${vpo.pendingObligatoire > 0 ? `<button type="button" class="btn btn-outline" data-apercu-jump="vpo">Voir les VPO</button>` : ''}
        ${nc.total > 0 ? `<button type="button" class="btn btn-outline" data-apercu-jump="non-conformite">Voir les non-conformités</button>` : ''}
        ${preuve.manquantes > 0 ? `<button type="button" class="btn btn-outline" data-apercu-jump="documents">Voir les preuves manquantes</button>` : ''}
      </div>` : ''}
    </div>

    <button type="button" class="btn btn-primary btn-start-intervention" id="btnStartIntervention"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">${ICONS.play}</svg> Démarrer l'intervention</button>

    <div class="next-action-card">
      <div class="next-action-body">
        <div class="next-action-kicker">Prochaine action</div>
        <div class="next-action-text">${escapeHtml(nextAction.text)}</div>
      </div>
      <button type="button" class="btn btn-primary" data-apercu-jump="${nextAction.tab}">Ouvrir la tâche</button>
    </div>

    <div class="vpo-nc-summary-row">
      <div class="vpo-nc-summary-item" data-apercu-jump="vpo">
        <div class="num">${vpo.pending}</div><div class="lbl">VPO ouvertes</div>
      </div>
      <div class="vpo-nc-summary-item" data-apercu-jump="non-conformite">
        <div class="num" style="color:${nc.total ? 'var(--color-error)' : 'var(--color-success)'};">${nc.total}</div><div class="lbl">Non-conformités</div>
      </div>
    </div>

    <div class="panel-title" style="font-size: var(--text-base); margin: var(--space-6) 0 var(--space-3);">Progression par section</div>
    <div class="hero-ring" style="margin-bottom: var(--space-5);">
      ${ringSvg(pct, 110, 10)}
      <div>
        <div class="hero-ring-label">Progression globale</div>
        <div class="hero-ring-count">${done} / ${total} tâches</div>
      </div>
    </div>
    <div class="rings-grid">${ringsHtml}</div>

    <div class="incomplete-filter-row">
      <label class="incomplete-filter-toggle">
        <input type="checkbox" id="toggleIncompleteOnly" ${state.checklistFilter === 'reste-a-faire' ? 'checked' : ''}>
        N'afficher que les tâches incomplètes dans les listes
      </label>
    </div>

    <div id="timelineSection">
      <div class="panel-title" style="font-size: var(--text-base); margin: var(--space-6) 0 var(--space-3);">Activité récente</div>
      <div class="timeline">${journalHtml}</div>
    </div>

    <div class="panel-title" style="font-size: var(--text-base); margin: var(--space-6) 0 var(--space-3);">Remise du dossier</div>
    <div class="handoff-grid">
      <div>Travail complété par<br><strong>${escapeHtml(handoff.travailCompletePar)}</strong></div>
      <div>Vérifié par<br><strong>${escapeHtml(handoff.verifiePar)}</strong></div>
      <div>Tâches terminées<br><strong>${handoff.tachesTerminees}</strong></div>
      <div>Documents remis<br><strong>${handoff.documentsRemis}</strong></div>
      <div>Preuves satisfaites<br><strong>${handoff.preuvesSatisfaites}</strong></div>
      <div>VPO fermées<br><strong>${handoff.vpoFermees}</strong></div>
      <div>Non-conformités résolues<br><strong>${handoff.ncResolues}</strong></div>
      <div>Rapport exporté<br><strong>${escapeHtml(handoff.rapportExporte)}</strong></div>
      <div>Dernière sauvegarde<br><strong>${escapeHtml(handoff.derniereSauvegarde)}</strong></div>
    </div>

    <div class="panel-title" style="font-size: var(--text-base); margin: var(--space-6) 0 var(--space-3);">Rapport de chantier et outils</div>
    <div class="stat-row" style="margin-bottom: var(--space-4);">
      <div class="stat-card"><div class="num">${docCount}</div><div class="lbl">Documents / photos</div></div>
      <div class="stat-card"><div class="num">${(d.approbations || []).length}</div><div class="lbl">Sauvegardes officielles</div></div>
    </div>
    <div class="tools-row">
      <button type="button" class="btn btn-outline" id="btnExportApercu">Exporter le rapport de chantier</button>
      <button type="button" class="btn btn-outline" id="btnShareApercu">Partager</button>
      <button type="button" class="btn btn-outline" id="btnPrintApercu">Imprimer</button>
    </div>

    <button type="button" class="btn-closure-check-mobile" id="btnClosureCheckMobile"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">${closure.ready ? ICONS.checkCircle : ICONS.alertTriangle}</svg> Vérification avant fermeture</button>
  `;

  $$('[data-apercu-jump]', container).forEach((card) => {
    card.addEventListener('click', () => selectTab(card.dataset.apercuJump));
  });

  const toggle = $('#toggleIncompleteOnly', container);
  if (toggle) {
    toggle.addEventListener('change', () => {
      state.checklistFilter = toggle.checked ? 'reste-a-faire' : 'toutes';
      renderAllChecklists();
    });
  }

  const printBtn = $('#btnPrintApercu', container);
  if (printBtn) printBtn.addEventListener('click', () => window.print());

  const startIvBtn = $('#btnStartIntervention', container);
  if (startIvBtn) startIvBtn.addEventListener('click', startInterventionMode);

  const closureCheckBtn = $('#btnClosureCheckMobile', container);
  if (closureCheckBtn) closureCheckBtn.addEventListener('click', showClosureCheckModal);

  const exportBtn = $('#btnExportApercu', container);
  if (exportBtn) exportBtn.addEventListener('click', exportDashboardFile);

  const shareBtn = $('#btnShareApercu', container);
  if (shareBtn) shareBtn.addEventListener('click', shareDossierLink);
}

// Retire les caractères interdits dans un nom de fichier sur Windows/Mac/Linux
// (/ \ : * ? " < > |), qui peuvent autrement casser le téléchargement ou faire
// que le fichier soit enregistré sans la bonne extension .html.
// Ajoute toujours le préfixe BT devant le numéro de bon de travail à
// l'affichage, sans le dupliquer si l'utilisateur l'a déjà tapé lui-même.
function formatBt(bt) {
  if (!bt) return '';
  return /^bt/i.test(bt.trim()) ? bt.trim() : `BT${bt.trim()}`;
}

function sanitizeFilename(str) {
  return String(str || '').replace(/[/\\:*?"<>|]/g, '-').trim();
}

function exportDashboardFile() {
  if (!state.draft) return;
  const filename = `Dashboard - ${sanitizeFilename(state.numero || 'dossier')}${state.draft.champs.bt ? ' (' + sanitizeFilename(formatBt(state.draft.champs.bt)) + ')' : ''}.html`;
  const blob = new Blob([buildDashboardHtml()], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  state.draft.derniereExportRapport = new Date().toISOString();
  schedulePersist();
  const heure = new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
  toast(`${filename} — Rapport HTML — ${heure}`, 3800);
}

async function shareDossierLink() {
  if (!state.draft) return;
  const url = buildDossierUrl();
  const titre = [state.draft.champs.type, state.draft.champs.tag].filter(Boolean).join(' — ') || 'dossier';
  const shareData = { title: `Dossier ${state.numero}`, text: `Suivi TEI — ${titre}`, url };
  if (navigator.share) {
    try { await navigator.share(shareData); } catch (err) { /* annulé par l'utilisateur */ }
  } else if (navigator.clipboard) {
    try { await navigator.clipboard.writeText(url); toast('Lien copié dans le presse-papiers.'); }
    catch (err) { toast('Impossible de copier le lien automatiquement.', 4000); }
  } else {
    toast(url, 6000);
  }
}

function renderNonConformites() {
  const el = $('#ncSummary');
  if (!el || !state.draft) return;
  const groups = CHECKLISTS[state.draft.mode] || {};
  const rows = [];
  Object.entries(groups).forEach(([group, items]) => {
    items.forEach(([name, label]) => {
      if (state.draft.casesCochees[name] === 'nc') {
        const details = state.draft.casesNcDetails[name] || {};
        rows.push({
          kind: 'checklist', key: name, numero: details.numero || '', section: GROUP_LABELS[group] || group, label,
          reason: state.draft.casesRaisons[name] || '', gravite: state.draft.casesGravites[name] || '',
          zone: details.zone || '', actionCorrective: details.actionCorrective || '',
          responsable: details.responsable || '', dateCreation: details.dateCreation || '',
          resolu: !!details.resolu,
        });
      }
    });
  });
  (state.draft.vpoItems || []).forEach((item) => {
    if (item.statut === 'nc') {
      rows.push({
        kind: 'vpo', key: item.id, numero: item.numero || '', section: 'VPO', label: item.texte || '(sans description)',
        reason: item.raison || '', gravite: item.gravite || '', zone: item.zone || '',
        actionCorrective: item.actionCorrective || '', responsable: item.responsable || '',
        dateCreation: item.dateCreation || '', resolu: !!item.resolu,
      });
    }
  });
  (state.draft.ncExtra || []).forEach((item) => {
    if (item.texte && item.texte.trim()) {
      rows.push({
        kind: 'ncextra', key: item.id, numero: item.numero || '', section: 'AJOUT MANUEL', label: item.texte,
        reason: '', gravite: item.gravite || 'mineure', zone: item.zone || '',
        actionCorrective: item.actionCorrective || '', responsable: item.responsable || '',
        dateCreation: item.dateCreation || '', resolu: !!item.resolu,
      });
    }
  });

  if (!rows.length) {
    el.innerHTML = '<div class="empty-state">Aucune non-conformité relevée pour ce dossier.</div>';
    return;
  }

  const GRAVITE_LABEL = {
    critique: '<span class="gravite-dot gravite-critique"></span>Critique',
    majeure: '<span class="gravite-dot gravite-majeure"></span>Majeure',
    mineure: '<span class="gravite-dot gravite-mineure"></span>Mineure',
  };
  const order = { critique: 0, majeure: 1, mineure: 2 };
  rows.sort((a, b) => (a.resolu === b.resolu ? (order[a.gravite] ?? 3) - (order[b.gravite] ?? 3) : (a.resolu ? 1 : -1)));

  el.innerHTML = rows.map((r) => {
    const files = state.draft.ncFichiers[r.numero] || [];
    const filesHtml = files.length ? `<div class="attachments">${files.map((f, i) => {
      return isImageFile(f.name)
        ? `<img src="${URL.createObjectURL(f.blob)}" class="thumb-lg" alt="${escapeHtml(f.name)}" title="${escapeHtml(f.name)}" data-nc-file-enlarge="${r.numero}::${i}">`
        : `<span class="doc-link"><span class="icon-inline" data-icon="folder" style="margin-right:4px;"></span>${escapeHtml(f.name)}</span>`;
    }).join('')}</div>` : '';
    return `
    <div class="nc-summary-item${r.gravite ? ' gravite-' + r.gravite : ''}${r.resolu ? ' nc-resolue' : ''}" data-nc-kind="${r.kind}" data-nc-key="${r.key}">
      <div class="nc-summary-header">
        <div class="nc-section">${r.numero ? `<strong>${r.numero}</strong> · ` : ''}${r.section}${r.gravite ? ` · ${GRAVITE_LABEL[r.gravite] || r.gravite}` : ''}</div>
        <span class="nc-statut-badge ${r.resolu ? 'nc-statut-resolue' : 'nc-statut-ouverte'}">${r.resolu ? 'Résolue' : 'Ouverte'}</span>
      </div>
      <div class="nc-label">${escapeHtml(r.label)}</div>
      ${r.zone ? `<div class="nc-meta">Zone / équipement : ${escapeHtml(r.zone)}</div>` : ''}
      ${r.reason ? `<div class="nc-reason">Raison : ${escapeHtml(r.reason)}</div>` : ''}
      ${r.actionCorrective ? `<div class="nc-meta">Action corrective : ${escapeHtml(r.actionCorrective)}</div>` : ''}
      ${r.responsable ? `<div class="nc-meta">Responsable : ${escapeHtml(r.responsable)}</div>` : ''}
      ${r.dateCreation ? `<div class="nc-meta">Créée le ${new Date(r.dateCreation).toLocaleString('fr-CA')}</div>` : ''}
      ${filesHtml}
      <div class="nc-card-actions">
        ${r.numero ? `<button type="button" class="btn btn-outline btn-nc-add-photo" data-nc-numero-btn="${r.numero}"><span class="icon-inline" data-icon="camera" style="margin-right:4px;"></span>Ajouter une photo</button>
        <button type="button" class="btn btn-outline btn-nc-paste-photo" data-nc-numero-paste="${r.numero}">Coller</button>
        <input type="file" class="hidden" data-nc-photo-input="${r.numero}" accept="image/*" multiple>` : ''}
        <button type="button" class="btn btn-outline btn-nc-toggle-resolu">${r.resolu ? 'Rouvrir' : 'Marquer résolue'}</button>
      </div>
    </div>`;
  }).join('');

  $$('[data-nc-file-enlarge]', el).forEach((img) => {
    img.addEventListener('click', () => {
      const [numero, idx] = img.dataset.ncFileEnlarge.split('::');
      openImageLightbox((state.draft.ncFichiers[numero] || [])[Number(idx)]);
    });
  });
  $$('.btn-nc-add-photo', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = el.querySelector(`[data-nc-photo-input="${btn.dataset.ncNumeroBtn}"]`);
      if (input) input.click();
    });
  });
  $$('[data-nc-photo-input]', el).forEach((input) => {
    input.addEventListener('change', () => attachFilesToNc(input.dataset.ncPhotoInput, input.files));
  });
  $$('.btn-nc-paste-photo', el).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const file = await readImageFromClipboard();
      if (file) await attachFilesToNc(btn.dataset.ncNumeroPaste, [file]);
    });
  });

  $$('.btn-nc-toggle-resolu', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-nc-kind]');
      const kind = card.dataset.ncKind;
      const key = card.dataset.ncKey;
      if (kind === 'checklist') {
        if (!state.draft.casesNcDetails[key]) state.draft.casesNcDetails[key] = {};
        state.draft.casesNcDetails[key].resolu = !state.draft.casesNcDetails[key].resolu;
      } else if (kind === 'vpo') {
        const item = findVpoItem(key);
        if (item) item.resolu = !item.resolu;
      } else if (kind === 'ncextra') {
        const item = (state.draft.ncExtra || []).find((it) => it.id === key);
        if (item) item.resolu = !item.resolu;
      }
      schedulePersist();
      renderNonConformites();
      updateProgressPill();
    });
  });
}

async function attachFilesToNc(numero, fileList) {
  if (!fileList || !fileList.length || !numero || !state.draft) return;
  if (!state.draft.ncFichiers[numero]) state.draft.ncFichiers[numero] = [];
  Array.from(fileList).forEach((f) => {
    state.draft.ncFichiers[numero].push({ name: f.name, size: f.size, type: f.type, uploadedAt: new Date().toISOString(), blob: f });
  });
  logActivity(`Photo ajoutée à la non-conformité ${numero}`);
  await dbPut(state.draft);
  renderNonConformites();
  updateFilesCount();
  toast(`${fileList.length} photo(s) ajoutée(s) à ${numero}.`);
}

$('#btnSaveFolder').addEventListener('click', async () => {
  if (!FS_ACCESS_SUPPORTED) {
    toast('La sauvegarde dans un dossier est disponible dans Chrome ou Edge sur ordinateur.', 4000);
    return;
  }
  if (!state.rootDirHandle && !state.dossierDirHandle) {
    const chosen = await pickSaveFolder();
    if (!chosen) return; // l'utilisateur a fermé le sélecteur sans choisir
  }
  const { done, total, pct } = computeProgress();
  if (pct < 100) {
    const confirmed = await showModal({
      title: 'Dossier incomplet',
      bodyHtml: `<p style="font-size:var(--text-sm);color:var(--color-text-muted);">Il reste <strong>${total - done}</strong> tâche(s) non cochée(s) ou non marquée(s) N/A. Dans le cadre de la gestion du changement, chaque tâche doit normalement être complétée avant la fermeture du dossier.</p><p style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:var(--space-3);">Vous pouvez tout de même sauvegarder ce dossier partiel.</p>`,
      confirmLabel: 'Sauvegarder quand même',
    });
    if (!confirmed) return;
  }
  const nom = $('#fldEmployeeName').value.trim();
  const role = $('#fldRole').value;
  if (!nom || !role) {
    toast('Entrez le nom de l\u2019employé et choisissez son rôle (onglet Approbation) avant de sauvegarder.', 4500);
    selectTab('approbation');
    flashField('#fldEmployeeName', '#fldRole');
    return;
  }

  const now = new Date();
  const record = { nom, role, at: now.toISOString() };
  state.draft.approbations.push(record);
  state.draft.derniereSauvegardeOfficielle = record;
  state.draft.champs.employeeName = nom;
  state.draft.champs.employeeRole = role;
  logActivity(`Dossier sauvegardé officiellement par ${nom} (${role})`);

  try {
    if (state.rootDirHandle) {
      // Emplacement racine choisi : nouveau dossier daté (permet de voir l'évolution).
      await ensureLocalDossierFolder(now);
    }
    // Sinon, state.dossierDirHandle pointe déjà vers le dossier importé — on réécrit dedans.
    await writeEverythingToDisk(now);

    // Le nom de l'employé doit être retapé à chaque sauvegarde officielle
    // (traçabilité : jamais réutilisé silencieusement d'une sauvegarde à l'autre).
    state.draft.champs.employeeName = '';
    $('#fldEmployeeName').value = '';

    await dbPut(state.draft);
    refreshApprovals();
    updateApprobationBadge();
    const label = state.rootDirHandle ? folderName(now) : (state.dossierDirHandle.name || state.numero);
    toast(`Dossier ${label} sauvegardé avec succès.`);
  } catch (err) {
    toast('Impossible d\u2019écrire dans ce dossier. Vérifiez l\u2019autorisation et réessayez.', 4500);
  }
});

// Bouton Enregistrer version mobile : déclenche exactement la même action
// (même confirmation, même écriture sur disque) que le bouton du haut.
$('#btnSaveFolderMobile').addEventListener('click', () => $('#btnSaveFolder').click());
$('#btnStartInterventionHeader').addEventListener('click', startInterventionMode);

function updateMobileSummary() {
  const el = $('#wsSummaryMobile');
  if (!el || !state.draft) return;
  const d = state.draft;
  const { done, total } = computeProgress();
  const titre = [d.champs.type, d.champs.tag].filter(Boolean).join(' — ')
    || (d.mode === 'installation' ? "Suivi d'installation" : 'Démantèlement TEI');

  const statutLabel = computeGlobalStatus().label;

  const priorite = d.champs.priorite || 'normale';
  const prioBadge = (priorite === 'haute' || priorite === 'urgente')
    ? `<span class="mobile-priority-tag priorite-${priorite}">${escapeHtml(PRIORITE_LABEL[priorite] || priorite)}</span>` : '';

  const docTotal = Object.values(d.files || {}).reduce((s, arr) => s + arr.length, 0)
    + Object.values(d.casesFichiers || {}).reduce((s, arr) => s + arr.length, 0)
    + Object.values(d.ncFichiers || {}).reduce((s, arr) => s + arr.length, 0);

  const saveText = !navigator.onLine
    ? 'Hors ligne'
    : (d.modifieLe ? `Enregistré à ${new Date(d.modifieLe).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}` : 'Non enregistré');

  el.innerHTML = `
    <div class="ws-summary-line1">
      <span class="ws-summary-id">${escapeHtml(state.numero || '')}${d.champs.bt ? ' · ' + escapeHtml(formatBt(d.champs.bt)) : ''}</span>
      <span class="ws-summary-status">${statutLabel}</span>
      ${prioBadge}
    </div>
    <div class="ws-summary-line2">${escapeHtml(titre)}</div>
    <div class="ws-summary-line3">${done}/${total} tâches · ${docTotal} document${docTotal > 1 ? 's' : ''} · ${saveText}</div>
  `;
}

function renderMobileResumeBody() {
  const el = $('#mobileResumeBody');
  if (!el || !state.draft) return;
  const list = buildInterventionTaskList();
  const idx = list.findIndex((t) => state.draft.casesCochees[t.name] !== true);
  const nc = computeNcStats();
  const vpo = computeVpoStats();

  const nextTaskHtml = idx !== -1 ? `
    <div class="mobile-next-task">
      <div class="mnt-kicker">Prochaine tâche</div>
      <div class="mnt-title">${escapeHtml(list[idx].label)}</div>
      <div class="mnt-meta">${escapeHtml(GROUP_LABELS[list[idx].group] || list[idx].group)} · Étape ${idx + 1} sur ${list.length}</div>
    </div>` : `<div class="mobile-next-task mnt-done">Checklist complétée.</div>`;

  el.innerHTML = `
    ${nextTaskHtml}
    <div class="mobile-control-lines">
      <div>VPO ouvertes : ${vpo.pending}</div>
      <div>Non-conformités : ${nc.total}</div>
    </div>
  `;
}

// ---------- Navigation mobile par catégories (Aperçu / Exécution / Terrain / Qualité / Dossier) ----------
const TAB_CATEGORIES = {
  apercu: 'resume',
  identification: 'checklist', plans: 'checklist', programmation: 'checklist',
  systeme: 'checklist', information: 'checklist', securite: 'checklist',
  vpo: 'ecarts', 'non-conformite': 'ecarts',
  'mise-a-jour': 'plus', documents: 'plus', commentaire: 'plus', approbation: 'plus',
};

function mobileFilterTabsByCategory(catId) {
  const tabBtns = $$('.tab-btn');
  let visibleCount = 0;
  tabBtns.forEach((btn) => {
    const belongs = TAB_CATEGORIES[btn.dataset.tab] === catId;
    btn.classList.toggle('mobile-hidden-tab', !belongs);
    if (belongs) visibleCount += 1;
  });
  const subNav = $('.tabs-nav');
  if (subNav) subNav.classList.toggle('single-tab-category', visibleCount <= 1);
}

// Affine la hauteur réelle de la seule barre fixe qui reste (category-nav) via une
// variable CSS. Ceci est une AMÉLIORATION seulement : le CSS de base (--mobile-nav-height
// avec une valeur de secours généreuse, voir style.css) protège déjà correctement
// l'interface même si ce code ne s'exécute jamais ou s'exécute en retard.
function refineMobileNavHeight() {
  if (window.innerWidth > 680) return;
  const categoryNav = document.querySelector('.category-nav');
  if (!categoryNav || !categoryNav.offsetHeight) return;
  document.documentElement.style.setProperty('--mobile-nav-height', categoryNav.offsetHeight + 'px');
}
window.addEventListener('resize', refineMobileNavHeight);
window.addEventListener('load', refineMobileNavHeight);
document.addEventListener('DOMContentLoaded', refineMobileNavHeight);
window.addEventListener('orientationchange', refineMobileNavHeight);

if (window.ResizeObserver) {
  const navHeightObserver = new ResizeObserver(() => refineMobileNavHeight());
  document.querySelectorAll('.category-nav').forEach((el) => navHeightObserver.observe(el));
}

$$('.category-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const cat = btn.dataset.category;
    const firstTab = Object.entries(TAB_CATEGORIES).find(([, c]) => c === cat)?.[0];
    if (firstTab) selectTab(firstTab);
  });
});

function selectTab(tab) {
  $$('.tab-btn').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'));
  $$('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
  state.currentTab = tab;
  window.scrollTo({ top: 0, behavior: 'auto' });

  const cat = TAB_CATEGORIES[tab];
  if (cat) {
    $$('.category-btn').forEach((b) => b.classList.toggle('active', b.dataset.category === cat));
    mobileFilterTabsByCategory(cat);
  }
  updateChecklistContextBar(cat === 'checklist');
}

function updateChecklistContextBar(visible) {
  const bar = $('#checklistContextBar');
  if (!bar) return;
  bar.classList.toggle('hidden', !visible);
  if (!visible || !state.draft) return;
  const d = state.draft;
  const { done, total } = computeProgress();
  const nc = computeNcStats();
  const vpo = computeVpoStats();
  const parts = [
    d.champs.desc,
    d.mode === 'installation' ? 'Installation' : 'Démantèlement',
  ].filter(Boolean);
  const statsParts = [
    `${done}/${total} tâches`,
    vpo.pending > 0 ? `${vpo.pending} VPO ouverte${vpo.pending > 1 ? 's' : ''}` : null,
    nc.total > 0 ? `${nc.total} NC ouverte${nc.total > 1 ? 's' : ''}` : null,
    computeGlobalStatus().label,
  ].filter(Boolean);
  bar.textContent = `${parts.join(' · ')} — ${statsParts.join(' · ')}`;
}

function flashField(...selectors) {
  selectors.forEach((selector, i) => {
    const el = $(selector);
    if (!el) return;
    el.classList.remove('flash-field');
    void el.offsetWidth; // force le redémarrage de l'animation
    el.classList.add('flash-field');
    if (i === 0) el.focus();
    setTimeout(() => el.classList.remove('flash-field'), 5000);
  });
}

function updateApprobationBadge() {
  const btn = $('.tab-btn[data-tab="approbation"]');
  if (!btn || !state.draft) return;
  const manque = !(state.draft.champs.employeeName || '').trim() || !(state.draft.champs.employeeRole || '').trim();
  btn.classList.toggle('needs-attention', manque);
}

function folderName(date) {
  const bt = sanitizeFilename(formatBt((state.draft && state.draft.champs.bt) || ''));
  const numero = sanitizeFilename(state.numero || '');
  const ds = (date || new Date()).toISOString().slice(0, 10);
  return bt ? `${numero} (${bt}) - ${ds}` : `${numero} - ${ds}`;
}

async function ensureLocalDossierFolder(date) {
  if (!state.rootDirHandle || !state.numero) return;
  state.dossierDirHandle = await state.rootDirHandle.getDirectoryHandle(folderName(date), { create: true });
  for (const sub of ['Documents', 'Photos', 'Exports']) {
    await state.dossierDirHandle.getDirectoryHandle(sub, { create: true });
  }
  const pill = $('#wsFolderPill');
  if (pill) pill.textContent = `Lié : ${state.rootDirHandle.name}/${folderName(date)}`;
}

// Pré-remplit le B.T. si un brouillon existe déjà pour ce numéro
$('#numLoc').addEventListener('blur', async () => {
  const numero = $('#numLoc').value.trim().toUpperCase();
  if (!numero) return;
  const existing = await dbGet(numero);
  if (existing && existing.champs && existing.champs.bt) {
    $('#numBt').value = existing.champs.bt;
  }
});

// Écrit tout le contenu du brouillon (suivi.json, resume.txt, documents par
// tâche, photos de mise à jour) sur le disque. N'est appelé QUE lors de la
// sauvegarde officielle (100 % des tâches cochées ou N/A + nom d'employé).
async function writeEverythingToDisk(date) {
  if (!state.dossierDirHandle || !state.draft) return;

  const jsonHandle = await state.dossierDirHandle.getFileHandle('suivi.json', { create: true });
  const w1 = await jsonHandle.createWritable();
  await w1.write(JSON.stringify(state.draft, (k, v) => (k === 'blob' ? undefined : v), 2));
  await w1.close();

  const resumeHandle = await state.dossierDirHandle.getFileHandle('resume.txt', { create: true });
  const w2 = await resumeHandle.createWritable();
  await w2.write(buildResumeText());
  await w2.close();

  // Archive versionnée : conserve un instantané horodaté de chaque sauvegarde
  // officielle, pour pouvoir comparer l'évolution entre les versions.
  try {
    const histDir = await state.dossierDirHandle.getDirectoryHandle('Historique', { create: true });
    const stamp = (date || new Date()).toISOString().replace(/[:.]/g, '-');
    const jh = await histDir.getFileHandle(`suivi_${stamp}.json`, { create: true });
    const wj = await jh.createWritable();
    await wj.write(JSON.stringify(state.draft, (k, v) => (k === 'blob' ? undefined : v), 2));
    await wj.close();
    const rh = await histDir.getFileHandle(`resume_${stamp}.txt`, { create: true });
    const wr = await rh.createWritable();
    await wr.write(buildResumeText());
    await wr.close();
  } catch (err) { /* best effort */ }

  const docsDir = await state.dossierDirHandle.getDirectoryHandle('Documents', { create: true });
  for (const [name, files] of Object.entries(state.draft.casesFichiers || {})) {
    for (const f of files) {
      try {
        const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fh = await docsDir.getFileHandle(`${name}__${safe}`, { create: true });
        const w = await fh.createWritable();
        await w.write(f.blob);
        await w.close();
      } catch (err) { /* best effort par fichier */ }
    }
  }

  const photosDir = await state.dossierDirHandle.getDirectoryHandle('Photos', { create: true });
  for (const f of (state.draft.files['mise-a-jour'] || [])) {
    try {
      const safe = (f.storedAs || f.name).replace(/[^a-zA-Z0-9._-]/g, '_');
      const fh = await photosDir.getFileHandle(safe, { create: true });
      const w = await fh.createWritable();
      await w.write(f.blob);
      await w.close();
    } catch (err) { /* best effort par fichier */ }
  }

  try {
    const ncDir = await state.dossierDirHandle.getDirectoryHandle('NonConformites', { create: true });
    for (const [numero, files] of Object.entries(state.draft.ncFichiers || {})) {
      for (const f of files) {
        try {
          const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const fh = await ncDir.getFileHandle(`${numero}__${safe}`, { create: true });
          const w = await fh.createWritable();
          await w.write(f.blob);
          await w.close();
        } catch (err) { /* best effort par fichier */ }
      }
    }
  } catch (err) { /* best effort */ }

  try {
    const dashName = `Dashboard - ${folderName(date)}.html`;
    const dashHandle = await state.dossierDirHandle.getFileHandle(dashName, { create: true });
    const w3 = await dashHandle.createWritable();
    await w3.write(buildDashboardHtml());
    await w3.close();
  } catch (err) { /* best effort */ }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function isImageFile(filename) {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(filename);
}

function ringSvg(pct, size, stroke) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  const hue = Math.max(0, Math.min(120, (clamped / 100) * 120));
  const color = `hsl(${hue}, 72%, 52%)`;
  const fontSize = Math.round(size * 0.22);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="ring-svg">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#232b36" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" stroke-linecap="round"
      transform="rotate(-90 ${size / 2} ${size / 2})" style="transition: stroke-dashoffset 0.5s ease, stroke 0.5s ease;"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="#eef1f4">${Math.round(clamped)}%</text>
  </svg>`;
}

function buildDashboardHtml() {
  const d = state.draft;
  const modeLabel = d.mode === 'installation' ? "Suivi d'installation" : 'Démantèlement TEI';
  const { done, total, pct } = computeProgress();
  const groups = CHECKLISTS[d.mode];

  const statusDotFor = (v) => {
    if (v === true) return { cls: 'st-done', icon: '\u2713' };
    if (v === 'na') return { cls: 'st-na', icon: 'N/A' };
    if (v === 'nc') return { cls: 'st-nc', icon: '!' };
    return { cls: 'st-pending', icon: '' };
  };

  const attachmentsHtml = (files, baseHref) => {
    if (!files || !files.length) return '';
    return `<div class="attachments">${files.map((f) => {
      const safeStored = (f.storedAs || f.name).replace(/[^a-zA-Z0-9._-]/g, '_');
      const href = `${baseHref}${safeStored}`;
      return isImageFile(f.name)
        ? `<a href="${href}" target="_blank" class="thumb-link" title="${escapeHtml(f.name)}"><img src="${href}" class="thumb" alt="${escapeHtml(f.name)}"></a>`
        : `<a href="${href}" target="_blank" class="doc-link">${escapeHtml(f.name)}</a>`;
    }).join('')}</div>`;
  };

  // ---- Anneaux par section (cliquables -> sautent à la section, avec flash) ----
  const groupStats = Object.entries(groups).map(([group, items]) => {
    if (!items.length) return null;
    const doneCount = items.filter(([name]) => isTaskDone(name)).length;
    return { group, label: GROUP_LABELS[group] || group, pct: (doneCount / items.length) * 100, count: `${doneCount}/${items.length}` };
  }).filter(Boolean);

  const vpoFilled = (d.vpoItems || []).filter((it) => it.texte && it.texte.trim());
  const hasVpo = vpoFilled.length > 0;
  if (hasVpo) {
    const vpoDone = vpoFilled.filter((it) => it.statut === 'conforme' || it.statut === 'nc').length;
    groupStats.push({ group: 'vpo', label: 'VPO', pct: (vpoDone / vpoFilled.length) * 100, count: `${vpoDone}/${vpoFilled.length}` });
  }

  const ringsHtml = groupStats.map((g) => `
    <div class="ring-card" onclick="jumpToSection('sec-${g.group}')" role="button" tabindex="0">
      ${ringSvg(g.pct, 104, 9)}
      <div class="ring-card-label">${escapeHtml(g.label)}</div>
      <div class="ring-card-count">${g.count} tâches</div>
    </div>`).join('');

  // ---- Sections détaillées par tâche (redessinées, fermées par défaut) ----
  const taskRowHtml = (label, v, reasonRaw, filesHtml) => {
    const st = statusDotFor(v);
    const reason = reasonRaw ? `<div class="task-reason">Raison : ${escapeHtml(reasonRaw)}</div>` : '';
    return `<div class="task-row ${st.cls}">
      <div class="task-dot">${st.icon}</div>
      <div class="task-body">
        <div class="task-label">${escapeHtml(label)}</div>
        ${reason}
        ${filesHtml || ''}
      </div>
    </div>`;
  };

  const sectionsHtml = groupStats.map((g) => {
    const items = groups[g.group];
    const rows = items.map(([name, label]) => {
      const v = d.casesCochees[name];
      const reason = (v === 'na' || v === 'nc') ? d.casesRaisons[name] : '';
      const files = d.casesFichiers[name] || [];
      const filesHtml = attachmentsHtml(files, `Documents/${name}__`);
      return taskRowHtml(label, v, reason, filesHtml);
    }).join('');
    return `<details class="section-card" id="sec-${g.group}">
      <summary><span>${g.label}</span><span class="section-pct">${Math.round(g.pct)} %</span></summary>
      <div class="task-list">${rows}</div>
    </details>`;
  }).join('');

  // ---- VPO détaillé ----
  const vpoHtml = hasVpo ? (() => {
    const vpoDone = vpoFilled.filter((it) => it.statut === 'conforme' || it.statut === 'nc').length;
    const vpoPct = (vpoDone / vpoFilled.length) * 100;
    const rows = vpoFilled.map((it) => {
      const v = it.statut === 'conforme' ? true : it.statut === 'nc' ? 'nc' : false;
      return taskRowHtml(it.texte, v, it.statut === 'nc' ? it.raison : '', '');
    }).join('');
    return `<details class="section-card" id="sec-vpo">
      <summary><span>VPO — Vérification pré-opérationnelle</span><span class="section-pct">${Math.round(vpoPct)} %</span></summary>
      <div class="task-list">${rows}</div>
    </details>`;
  })() : '';

  // ---- Non-conformités ----
  const GRAVITE_TAG = { critique: 'Critique', majeure: 'Majeure', mineure: 'Mineure' };
  const ncItems = [];
  let ncResoluesCount = 0;
  Object.entries(groups).forEach(([group, items]) => items.forEach(([name, label]) => {
    if (d.casesCochees[name] === 'nc') {
      const det = d.casesNcDetails[name] || {};
      if (det.resolu) { ncResoluesCount++; return; }
      ncItems.push({ numero: det.numero || '', section: GROUP_LABELS[group] || group, label, reason: d.casesRaisons[name] || '', gravite: d.casesGravites[name] || '' });
    }
  }));
  (d.vpoItems || []).forEach((it) => {
    if (it.statut === 'nc') {
      if (it.resolu) { ncResoluesCount++; return; }
      ncItems.push({ numero: it.numero || '', section: 'VPO', label: it.texte || '(sans description)', reason: it.raison || '', gravite: it.gravite || '' });
    }
  });
  (d.ncExtra || []).forEach((it) => {
    if (it.texte && it.texte.trim()) {
      if (it.resolu) { ncResoluesCount++; return; }
      ncItems.push({ numero: it.numero || '', section: 'AJOUT MANUEL', label: it.texte, reason: '', gravite: it.gravite || '' });
    }
  });
  const ncBanner = ncItems.length
    ? `<div class="nc-banner nc-banner-alert">
        <div class="nc-banner-title">${ncItems.length} non-conformité${ncItems.length > 1 ? 's' : ''} ouverte${ncItems.length > 1 ? 's' : ''}${ncResoluesCount ? ` (+ ${ncResoluesCount} résolue${ncResoluesCount > 1 ? 's' : ''})` : ''}</div>
        <ul class="nc-list">${ncItems.map((r) => `<li>${r.numero ? `<strong>${r.numero}</strong> — ` : ''}${escapeHtml(r.section)}${r.gravite ? ` · ${GRAVITE_TAG[r.gravite] || r.gravite}` : ''} — ${escapeHtml(r.label)}${r.reason ? ` <span class="reason-inline">(${escapeHtml(r.reason)})</span>` : ''}</li>`).join('')}</ul>
      </div>`
    : `<div class="nc-banner nc-banner-ok">Aucune non-conformité ouverte pour ce dossier.${ncResoluesCount ? ` (${ncResoluesCount} résolue${ncResoluesCount > 1 ? 's' : ''})` : ''}</div>`;

  const closureVerdict = computeClosureVerdict();
  const closureHtml = `<div class="nc-banner ${closureVerdict.ready ? 'nc-banner-ok' : 'nc-banner-alert'}"><div class="nc-banner-title">Vérification avant fermeture</div>${escapeHtml(closureVerdict.text)}</div>`;

  // ---- Documents / photos ----
  const docCount = Object.values(d.casesFichiers || {}).reduce((s, arr) => s + arr.length, 0)
    + Object.values(d.ncFichiers || {}).reduce((s, arr) => s + arr.length, 0);
  const photos = d.files['mise-a-jour'] || [];
  const photosHtml = photos.length ? attachmentsHtml(photos, 'Photos/') : '<p class="empty">Aucune image de mise à jour.</p>';

  // ---- Historique ----
  const histHtml = (d.approbations || []).length
    ? `<div class="timeline">${d.approbations.slice().reverse().map((a) => `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-body">
            <strong>${escapeHtml(a.nom)}</strong> <span class="timeline-role">${escapeHtml(a.role)}</span>
            <div class="timeline-date">${new Date(a.at).toLocaleString('fr-CA')}</div>
          </div>
        </div>`).join('')}</div>`
    : '<p class="empty">Aucune sauvegarde officielle enregistrée.</p>';

  const titre = `${escapeHtml(d.localisation)}${d.champs.bt ? ' (' + escapeHtml(formatBt(d.champs.bt)) + ')' : ''}`;
  const appUrl = buildDossierUrl();
  const qrSvg = generateQrSvg(appUrl);
  const statutLabel = pct >= 100 ? 'Terminé' : pct > 0 ? 'En cours' : 'Non commencé';
  const statutClass = pct >= 100 ? 'status-done' : pct > 0 ? 'status-progress' : 'status-new';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rapport de chantier \u2014 ${titre}</title>
<style>
  :root {
    --bg: #10151b; --surface: #171d25; --surface-2: #1e2630; --border: #333e4b;
    --text: #e7ebef; --text-muted: #99a6b5; --accent: #ff8f3f; --accent-soft: rgba(255,143,63,0.14);
  }
  @media print {
    :root {
      --bg: #ffffff; --surface: #f7f7f5; --surface-2: #eeeeeb; --border: #d8d8d2;
      --text: #1c1c1a; --text-muted: #5c5c56; --accent: #b85a1f; --accent-soft: rgba(184,90,31,0.10);
    }
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    background: var(--bg);
    color: var(--text); margin: 0; padding: 40px 32px 64px;
  }
  .wrap { max-width: 1080px; margin: 0 auto; }
  .hero { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 32px; }
  .hero-left h1 { margin: 0 0 6px; font-size: 26px; letter-spacing: -0.01em; }
  .hero-sub { color: var(--text-muted); font-size: 14px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .status-done { background: rgba(74,222,128,0.15); color: #4ade80; }
  .status-progress { background: rgba(234,179,8,0.15); color: #eab308; }
  .status-new { background: rgba(138,151,166,0.15); color: var(--text-muted); }
  .hero-actions { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .open-app-link {
    display: inline-flex; align-items: center; gap: 8px; background: var(--accent); color: #10151b; font-weight: 700;
    padding: 12px 22px; border-radius: 10px; text-decoration: none; font-size: 14px; box-shadow: 0 8px 24px rgba(255,122,26,0.25);
  }
  .open-app-link:hover { background: #ffab6b; }
  .qr-card { background: #fff; border-radius: 12px; padding: 8px; display: flex; align-items: center; justify-content: center; }
  .qr-card svg { display: block; width: 78px; height: 78px; }
  .qr-wrap { display: flex; align-items: center; gap: 10px; }
  .qr-caption { font-size: 11px; color: var(--text-muted); max-width: 90px; line-height: 1.3; }

  .hero-ring { display: flex; align-items: center; gap: 28px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 24px 32px; }
  .hero-ring-label { font-size: 14px; color: var(--text-muted); }
  .hero-ring-count { font-size: 26px; font-weight: 700; margin-top: 4px; }

  .stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 32px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; }
  .stat-card .num { font-size: 24px; font-weight: 700; }
  .stat-card .lbl { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

  h2.section-title { font-size: 15px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); margin: 40px 0 16px; }

  .rings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 16px; margin-bottom: 8px; }
  .ring-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; transition: transform 0.15s, border-color 0.15s; }
  .ring-card:hover { transform: translateY(-3px); border-color: var(--accent); }
  .ring-card-label { font-size: 12px; font-weight: 600; text-align: center; }
  .ring-card-count { font-size: 11px; color: var(--text-muted); font-family: ui-monospace, "SF Mono", Consolas, monospace; }

  .nc-banner { border-radius: 14px; padding: 18px 22px; margin-bottom: 8px; }
  .nc-banner-alert { background: rgba(214,69,69,0.1); border: 1px solid rgba(214,69,69,0.4); }
  .nc-banner-ok { background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.35); color: #4ade80; font-weight: 600; }
  .nc-banner-title { color: #f87171; font-weight: 700; margin-bottom: 8px; }
  .nc-list { color: #f0a8a8; list-style: none; padding-left: 0; margin: 0; }
  .nc-list li { margin-bottom: 6px; font-size: 14px; }
  .reason-inline { color: var(--text-muted); font-style: italic; }

  details.section-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; margin-bottom: 12px; overflow: hidden; scroll-margin-top: 24px; }
  details.section-card summary {
    cursor: pointer; padding: 16px 20px; font-weight: 700; font-size: 14px; list-style: none;
    display: flex; align-items: center; justify-content: space-between; background: var(--surface-2);
    gap: 12px;
  }
  details.section-card summary::-webkit-details-marker { display: none; }
  details.section-card summary::before { content: '\u25b8'; color: var(--text-muted); margin-right: 10px; transition: transform 0.2s; display: inline-block; }
  details.section-card[open] summary::before { transform: rotate(90deg); }
  details.section-card summary span:first-child { flex: 1; display: flex; align-items: center; }
  .section-pct { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 13px; color: var(--accent); background: var(--accent-soft); padding: 3px 10px; border-radius: 999px; }

  @keyframes flashHighlight {
    0%, 100% { box-shadow: none; }
    12%, 55% { box-shadow: 0 0 0 3px var(--accent), 0 0 30px rgba(255,122,26,0.55); }
  }
  details.section-card.flash { animation: flashHighlight 1.7s ease; }

  .task-list { padding: 8px; display: flex; flex-direction: column; gap: 6px; }
  .task-row { display: flex; gap: 12px; padding: 12px 14px; border-radius: 10px; background: var(--surface-2); border: 1px solid transparent; }
  .task-row.st-done { border-color: rgba(74,222,128,0.35); }
  .task-row.st-na { border-color: rgba(234,179,8,0.35); }
  .task-row.st-nc { border-color: rgba(248,113,113,0.4); background: rgba(214,69,69,0.06); }
  .task-dot {
    width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; margin-top: 1px;
  }
  .st-done .task-dot { background: rgba(74,222,128,0.18); color: #4ade80; }
  .st-na .task-dot { background: rgba(234,179,8,0.18); color: #eab308; font-size: 9px; }
  .st-nc .task-dot { background: rgba(248,113,113,0.2); color: #f87171; }
  .st-pending .task-dot { background: #232b36; border: 2px solid #384151; }
  .task-label { font-size: 13.5px; font-weight: 500; }
  .task-reason { font-size: 12px; color: var(--text-muted); font-style: italic; margin-top: 4px; }
  .attachments { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .thumb { width: 60px; height: 60px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); transition: transform 0.15s; }
  .thumb:hover { transform: scale(1.08); }
  .doc-link, .thumb-link { color: #5eb8ff; text-decoration: none; font-size: 12.5px; }

  .timeline { display: flex; flex-direction: column; gap: 4px; }
  .timeline-item { display: flex; gap: 14px; padding: 12px 4px; border-bottom: 1px solid var(--border); }
  .timeline-item:last-child { border-bottom: none; }
  .timeline-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); margin-top: 6px; flex-shrink: 0; }
  .timeline-role { color: var(--text-muted); font-size: 12.5px; }
  .timeline-date { font-size: 12px; color: var(--text-muted); font-family: ui-monospace, "SF Mono", Consolas, monospace; margin-top: 2px; }

  .empty { color: var(--text-muted); font-style: italic; font-size: 14px; }
  .comment-box { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px 22px; white-space: pre-wrap; font-size: 14px; line-height: 1.6; }
  .footer-note { text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 48px; padding-bottom: 8px; }
  .footer-note b { color: rgba(255,255,255,0.75); }
</style></head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="hero-left">
        <h1>${titre}</h1>
        <div class="hero-sub">
          <span class="status-pill ${statutClass}">${statutLabel}</span>
          <span>${escapeHtml(modeLabel)}</span>
          <span>\u00b7 généré le ${new Date().toLocaleString('fr-CA')}</span>
        </div>
      </div>
      <div class="hero-actions">
        <div class="qr-wrap">
          <div class="qr-card">${qrSvg || ''}</div>
          <div class="qr-caption">Scannez pour rouvrir ce dossier</div>
        </div>
        <a class="open-app-link" href="${appUrl}">\u21a9 Ouvrir dans l\u2019application</a>
      </div>
    </div>

    <div class="hero-ring">
      ${ringSvg(pct, 150, 14)}
      <div>
        <div class="hero-ring-label">Progression globale</div>
        <div class="hero-ring-count">${done} / ${total} tâches</div>
      </div>
    </div>

    <div class="stat-row" style="margin-top:24px;">
      <div class="stat-card"><div class="num">${done}/${total}</div><div class="lbl">Tâches complétées</div></div>
      <div class="stat-card"><div class="num">${docCount + photos.length}</div><div class="lbl">Documents / photos</div></div>
      <div class="stat-card"><div class="num" style="color:${ncItems.length ? '#f87171' : '#4ade80'};">${ncItems.length}</div><div class="lbl">Non-conformités</div></div>
      <div class="stat-card"><div class="num">${(d.approbations || []).length}</div><div class="lbl">Sauvegardes officielles</div></div>
    </div>

    <h2 class="section-title">Progression par section — cliquez pour voir le détail</h2>
    <div class="rings-grid">${ringsHtml}</div>

    <h2 class="section-title">Vérification avant fermeture</h2>
    ${closureHtml}

    <h2 class="section-title">Non-conformités</h2>
    ${ncBanner}

    <h2 class="section-title">Détail des tâches</h2>
    ${sectionsHtml}
    ${vpoHtml}

    <h2 class="section-title">Images et documents de mise à jour</h2>
    ${photosHtml}

    <h2 class="section-title">Historique des sauvegardes officielles</h2>
    ${histHtml}

    ${d.champs.commentaires ? `<h2 class="section-title">Commentaires</h2><div class="comment-box">${escapeHtml(d.champs.commentaires)}</div>` : ''}

    <div class="footer-note"><b>\u00a9 2026 Carl Desrochers — CTR.</b> Conception, idée originale et développement intégral de ce logiciel. Tous droits réservés — reproduction ou distribution interdite sans autorisation.</div>
  </div>

  <script>
    function jumpToSection(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.open = true;
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(function () { el.classList.remove('flash'); }, 1700);
    }
  </script>
</body></html>`;
}

function buildResumeText() {
  const d = state.draft;
  const modeLabel = d.mode === 'installation' ? "Suivi d'installation" : 'Démantèlement TEI';
  const groups = CHECKLISTS[d.mode];
  const { done, total } = computeProgress();

  const lines = [];
  lines.push('GESTION RESPONSABLE — SUIVI DE TRAVAUX');
  lines.push('=======================================');
  lines.push('');
  lines.push(`Type d\u2019intervention : ${modeLabel}`);
  lines.push(`Localisation : ${d.localisation}${d.champs.bt ? ' (' + formatBt(d.champs.bt) + ')' : ''}`);
  if (d.derniereSauvegardeOfficielle) {
    const off = d.derniereSauvegardeOfficielle;
    const dt = new Date(off.at);
    lines.push(`Sauvegardée officiellement par : ${off.nom} (${off.role})`);
    lines.push(`Date de sauvegarde (non modifiable) : ${dt.toLocaleDateString('fr-CA')} ${dt.toLocaleTimeString('fr-CA')}`);
  }
  lines.push('');
  lines.push(`Employé : ${d.champs.employe || ''}`);
  lines.push(`Chargé de projet : ${d.champs.chargeProjet || ''}`);
  lines.push(`Contracteur : ${d.champs.contracteur || ''}`);
  lines.push(`Date de début : ${d.champs.dateDebut || ''}`);
  lines.push(`Date de fin : ${d.champs.dateFin || ''}`);
  lines.push(`État général : ${d.champs.etatGeneral || ''}`);
  lines.push(`Priorité : ${PRIORITE_LABEL[d.champs.priorite] || 'Normale'}`);
  lines.push('');
  lines.push(`Tâches terminées : ${done} / ${total}`);
  lines.push('');

  const verdict = computeClosureVerdict();
  lines.push(verdict.ready ? 'ASSISTANT DE CLÔTURE : PRÊT' : 'ASSISTANT DE CLÔTURE : NON PRÊT');
  lines.push(verdict.text);
  lines.push('');

  Object.entries(groups).forEach(([group, items]) => {
    if (!items.length) return;
    const title = GROUP_LABELS[group] || group.toUpperCase();
    lines.push(title);
    lines.push('-'.repeat(title.length));
    items.forEach(([name, label]) => {
      const v = d.casesCochees[name];
      const mark = v === true ? 'X' : v === 'na' ? 'N/A' : v === 'nc' ? '!' : ' ';
      const numero = v === 'nc' && d.casesNcDetails[name] && d.casesNcDetails[name].numero ? ` (${d.casesNcDetails[name].numero})` : '';
      lines.push(`[${mark}] ${label}${numero}`);
      if (v === 'nc' && d.casesGravites[name]) lines.push(`      \u2192 gravité : ${d.casesGravites[name]}`);
      if ((v === 'na' || v === 'nc') && d.casesRaisons[name]) lines.push(`      \u2192 raison : ${d.casesRaisons[name]}`);
    });
    lines.push('');
  });

  const vpoFilled = (d.vpoItems || []).filter((it) => it.texte && it.texte.trim());
  if (vpoFilled.length) {
    lines.push('VPO — VÉRIFICATION PRÉ-OPÉRATIONNELLE');
    lines.push('---------------------------------------');
    vpoFilled.forEach((it) => {
      const mark = it.statut === 'conforme' ? 'C' : it.statut === 'nc' ? '!' : ' ';
      lines.push(`[${mark}] ${it.texte}`);
      if (it.statut === 'nc' && it.gravite) lines.push(`      \u2192 gravité : ${it.gravite}`);
      if (it.statut === 'nc' && it.raison) lines.push(`      \u2192 raison : ${it.raison}`);
    });
    lines.push('');
  }

  const ncExtraFilled = (d.ncExtra || []).filter((it) => it.texte && it.texte.trim());
  if (ncExtraFilled.length) {
    lines.push('NON-CONFORMITÉS AJOUTÉES MANUELLEMENT');
    lines.push('---------------------------------------');
    ncExtraFilled.forEach((it) => lines.push(`[!] ${it.texte}`));
    lines.push('');
  }

  if (d.champs.commentaires) {
    lines.push('COMMENTAIRES / NOTES');
    lines.push('---------------------');
    lines.push(d.champs.commentaires);
    lines.push('');
  }

  return lines.join('\n');
}

// ---------- Étape 2 : ouvrir / créer le dossier localement ----------
$('#btnOuvrirDossier').addEventListener('click', ouvrirDossier);
$('#numLoc').addEventListener('keydown', (e) => { if (e.key === 'Enter') ouvrirDossier(); });

const NUMERO_PATTERN = /^[A-Za-z0-9-]+$/;

$('#numLoc').addEventListener('input', () => {
  const el = $('#numLoc');
  let val = el.value;
  // Insère automatiquement un tiret après les 3 premiers caractères, pour
  // respecter le format habituel (ex. 888-FT-8888), sans le dupliquer si le
  // trait a déjà été tapé manuellement.
  if (val.length === 3 && !val.includes('-')) {
    val += '-';
    el.value = val;
  }
  const trimmed = val.trim();
  if (!trimmed) { el.classList.remove('invalid', 'valid'); return; }
  const ok = NUMERO_PATTERN.test(trimmed);
  el.classList.toggle('invalid', !ok);
  el.classList.toggle('valid', ok);
});

$('#numBt').addEventListener('input', () => {
  const el = $('#numBt');
  const val = el.value.trim();
  el.classList.toggle('valid', !!val);
  el.classList.remove('invalid');
});

async function ouvrirDossier() {
  const numero = $('#numLoc').value.trim().toUpperCase();
  const statusEl = $('#dossierStatus');
  if (!numero) {
    statusEl.classList.remove('hidden', 'ok', 'new');
    statusEl.classList.add('err');
    statusEl.textContent = 'Entrez d\u2019abord le numéro de localisation.';
    return;
  }
  if (!NUMERO_PATTERN.test(numero)) {
    statusEl.classList.remove('hidden', 'ok', 'new');
    statusEl.classList.add('err');
    statusEl.textContent = 'Le numéro de localisation ne peut contenir que des lettres, des chiffres et des tirets.';
    $('#numLoc').classList.add('invalid');
    $('#numLoc').focus();
    return;
  }

  const bt = $('#numBt').value.trim().toUpperCase();
  if (!bt) {
    statusEl.classList.remove('hidden', 'ok', 'new');
    statusEl.classList.add('err');
    statusEl.textContent = 'Entrez le B.T. (n\u2019importe quel contenu est accepté).';
    $('#numBt').classList.add('invalid');
    $('#numBt').focus();
    return;
  }

  statusEl.classList.remove('hidden', 'ok', 'err');
  statusEl.textContent = 'Ouverture du dossier local…';

  const existing = await dbGet(numero);
  if (existing) {
    state.draft = normalizeDraft(existing);
    state.isNewDraft = false;
    state.draft.champs.bt = bt;
  } else {
    state.draft = newDraft(numero, state.mode);
    state.draft.champs.bt = bt;
    state.isNewDraft = true;
    await dbPut(state.draft);
  }
  state.numero = numero;

  statusEl.classList.remove('new', 'ok');
  statusEl.classList.add(state.isNewDraft ? 'new' : 'ok');
  statusEl.textContent = state.isNewDraft
    ? `Nouveau dossier créé localement pour ${numero}.`
    : `Dossier existant repris — dernière sauvegarde ${new Date(state.draft.modifieLe).toLocaleString('fr-CA')}.`;

  setTimeout(() => openWorkspace(), 400);
}

// ---------- Étape 3 : espace de travail ----------
function openWorkspace() {
  const d = state.draft;
  $('#screenDossier').classList.add('hidden');
  $('#screenWorkspace').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'auto' });

  $('#wsNum').textContent = state.numero + (d.champs.bt ? ` · ${formatBt(d.champs.bt)}` : '');
  const titreHeader = [d.champs.type, d.champs.tag].filter(Boolean).join(' — ')
    || (d.mode === 'installation' ? "Suivi d'installation" : 'Démantèlement TEI');
  $('#wsTitle').textContent = titreHeader;
  const { done: doneHeader, total: totalHeader } = computeProgress();
  $('#wsStatusBadge').textContent = computeGlobalStatus().label;
  const metaParts = [];
  if (d.champs.desc) metaParts.push(d.champs.desc);
  if (d.champs.employe) metaParts.push(`Responsable : ${d.champs.employe}`);
  metaParts.push(`Mise à jour : ${new Date(d.modifieLe || d.creeLe).toLocaleString('fr-CA')}`);
  $('#wsMeta').textContent = metaParts.join(' · ');

  $$('[data-link]').forEach((input) => { input.value = d.liens[input.dataset.link] || ''; });
  updateLinkTargets();

  $('#fldTag').value = d.champs.tag || '';
  $('#fldType').value = d.champs.type || '';
  $('#fldDesc').value = d.champs.desc || '';
  $('#fldEmploye').value = d.champs.employe || '';
  $('#fldChargeProjet').value = d.champs.chargeProjet || '';
  $('#fldContracteur').value = d.champs.contracteur || '';
  $('#fldDateDebut').value = d.champs.dateDebut || '';
  $('#fldDateFin').value = d.champs.dateFin || '';
  $('#fldEtatGeneral').value = d.champs.etatGeneral || '';
  $('#fldPriorite').value = d.champs.priorite || 'normale';
  $('#fldCommentaires').value = d.champs.commentaires || '';
  $('#fldEmployeeName').value = d.champs.employeeName || '';
  $('#fldRole').value = d.champs.employeeRole || '';

  renderAllChecklists();
  renderVpoList();
  renderNcExtraList();
  refreshAllFileLists();
  refreshApprovals();
  updateFilesCount();
  updateProgressPill();
  renderNonConformites();
  updateApprobationBadge();
  renderQrThumb();
  updateOfflineIndicator();
  selectTab('apercu');
}

// ---------- Onglets ----------
$$('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => selectTab(btn.dataset.tab));
});

// ---------- Cases à cocher ----------
// ---------- Actions de tâche partagées (utilisées par la checklist ET le mode intervention) ----------
// Une seule logique par action — jamais dupliquée entre les deux interfaces.
async function taskToggleNA(name) {
  const isCurrentlyNa = state.draft.casesCochees[name] === 'na';
  if (isCurrentlyNa) {
    state.draft.casesCochees[name] = false;
    delete state.draft.casesRaisons[name];
  } else {
    const reason = await askNaReason();
    if (reason === null) return false;
    state.draft.casesCochees[name] = 'na';
    state.draft.casesRaisons[name] = reason;
  }
  schedulePersist();
  return true;
}

async function taskToggleNC(name, label) {
  const isCurrentlyNc = state.draft.casesCochees[name] === 'nc';
  if (isCurrentlyNc) {
    state.draft.casesCochees[name] = false;
    delete state.draft.casesRaisons[name];
    delete state.draft.casesGravites[name];
    delete state.draft.casesNcDetails[name];
  } else {
    const result = await askNcReason();
    if (result === null) return false;
    state.draft.casesCochees[name] = 'nc';
    state.draft.casesRaisons[name] = result.reason;
    state.draft.casesGravites[name] = result.gravite;
    state.draft.casesNcDetails[name] = {
      zone: result.zone, actionCorrective: result.actionCorrective,
      responsable: result.responsable, dateCreation: result.dateCreation, resolu: false,
      numero: nextNcId(),
    };
    logActivity(`Non-conformité (${result.gravite}) relevée : ${label || name}`);
  }
  schedulePersist();
  return true;
}

async function taskQuickNote(name) {
  const current = state.draft.casesNotes[name] || '';
  const confirmed = await showModal({
    title: 'Commentaire rapide',
    bodyHtml: `<textarea id="modalTaskNote" rows="3" placeholder="Note sur cette tâche…">${escapeHtml(current)}</textarea>`,
    confirmLabel: 'Enregistrer',
  });
  if (!confirmed) return false;
  const val = $('#modalTaskNote').value.trim();
  if (val) state.draft.casesNotes[name] = val; else delete state.draft.casesNotes[name];
  schedulePersist();
  return true;
}

function taskSetDone(name, label, done) {
  state.draft.casesCochees[name] = done;
  if (done) {
    delete state.draft.casesRaisons[name];
    delete state.draft.casesGravites[name];
    logActivity(`Tâche complétée : ${label || name}`);
  }
  schedulePersist();
}

// Filtre de checklist — « Reste à faire » est une définition composite qui
// réutilise les données déjà existantes (aucune nouvelle structure).
const CHECKLIST_FILTER_LABELS = {
  toutes: 'Toutes', 'reste-a-faire': 'Reste à faire', 'a-faire': 'À faire',
  bloquees: 'Bloquées', 'preuve-manquante': 'Preuve manquante', terminees: 'Terminées', na: 'Non applicables',
};
function taskMatchesFilter(name, filterKey) {
  const val = state.draft.casesCochees[name];
  const preuveManquante = val === true && state.draft.casesPreuveRequise[name] && !(state.draft.casesFichiers[name] || []).length;
  switch (filterKey) {
    case 'reste-a-faire': return (val !== true && val !== 'na') || preuveManquante;
    case 'a-faire': return val !== true && val !== 'na' && val !== 'nc';
    case 'bloquees': return val === 'nc';
    case 'preuve-manquante': return preuveManquante;
    case 'terminees': return val === true;
    case 'na': return val === 'na';
    default: return true;
  }
}

function wireChecklistFilterSelect(container, group) {
  $$('[data-checklist-filter]', container).forEach((sel) => {
    sel.addEventListener('change', () => {
      state.checklistFilter = sel.value;
      Object.keys(CHECKLISTS[state.draft.mode] || {}).forEach((g) => renderChecklist(g));
    });
  });
}

function renderChecklist(group) {
  const container = $(`[data-checklist="${group}"]`);
  if (!container) return;
  const allItems = (CHECKLISTS[state.draft.mode] && CHECKLISTS[state.draft.mode][group]) || [];
  if (!allItems.length) {
    container.innerHTML = '<div class="empty-state">Aucune tâche prévue pour ce type d\u2019intervention dans cette section.</div>';
    updateChecklistProgress(group, 0, 0);
    return;
  }
  const filterBarHtml = `
    <div class="checklist-filter-bar">
      <label for="checklistFilterSelect-${group}">Filtrer :</label>
      <select id="checklistFilterSelect-${group}" data-checklist-filter="${group}">
        ${Object.entries(CHECKLIST_FILTER_LABELS).map(([k, l]) => `<option value="${k}"${state.checklistFilter === k ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>`;
  const items = allItems.filter(([name]) => taskMatchesFilter(name, state.checklistFilter));
  if (!items.length) {
    container.innerHTML = filterBarHtml + '<div class="empty-state">Aucune tâche ne correspond à ce filtre.</div>';
    updateChecklistProgress(group, allItems.filter(([n]) => state.draft.casesCochees[n] === true).length, allItems.length);
    wireChecklistFilterSelect(container, group);
    return;
  }
  const canAttach = ATTACH_GROUPS.includes(group);

  container.innerHTML = filterBarHtml + items.map(([name, label]) => {
    const val = state.draft.casesCochees[name];
    const checked = val === true;
    const isNa = val === 'na';
    const isNc = val === 'nc';
    const files = (state.draft.casesFichiers[name] || []);
    const reason = state.draft.casesRaisons[name] || '';
    const note = state.draft.casesNotes[name] || '';
    const ncNumero = isNc && state.draft.casesNcDetails[name] ? state.draft.casesNcDetails[name].numero : '';
    const preuveRequise = canAttach && !!state.draft.casesPreuveRequise[name];
    const preuveManquante = preuveRequise && checked && !files.length;
    return `
      <div class="checklist-item-wrap${checked ? ' checked' : ''}${isNa ? ' na' : ''}${isNc ? ' nc' : ''}${preuveManquante ? ' preuve-manquante' : ''}" data-item-wrap="${name}">
        <div class="checklist-item-row">
          <input type="checkbox" class="ci-checkbox" ${checked ? 'checked' : ''} data-name="${name}">
          <span class="ci-label" data-name="${name}" data-task-detail="${name}" title="Voir les détails de la tâche">${label}${preuveRequise ? ' <span class="preuve-required-tag" title="Preuve requise">!</span>' : ''}${ncNumero ? ` <span class="nc-xref">${ncNumero}</span>` : ''}</span>
          <div class="ci-actions">
            ${canAttach ? `<span class="ci-attach-count" data-attach-count="${name}">${files.length ? files.length : ''}</span>` : ''}
            <button type="button" class="btn-note${note ? ' active' : ''}" data-note="${name}" title="Ajouter un commentaire rapide">${note ? '' : ''}</button>
            ${canAttach ? `<button type="button" class="btn-preuve${preuveRequise ? ' active' : ''}" data-preuve="${name}" title="Exiger une preuve pour cette tâche">Preuve requise</button>` : ''}
            <button type="button" class="btn-na" data-na="${name}">N/A</button>
            <button type="button" class="btn-nc" data-nc="${name}">Non conforme</button>
          </div>
        </div>
        ${(isNa || isNc) && reason ? `<div class="na-reason">Raison : ${reason}</div>` : ''}
        ${note ? `<div class="na-reason ci-note-text"><span class="icon-inline" data-icon="messageCircle" style="margin-right:4px;"></span>${escapeHtml(note)}</div>` : ''}
        ${preuveManquante ? `<div class="na-reason preuve-warning"><span class="icon-inline" data-icon="alertTriangle" style="margin-right:4px;"></span>Preuve requise mais aucun document joint</div>` : ''}
        ${canAttach ? `
        <div class="checklist-item-drawer${checked ? '' : ' hidden'}" data-drawer="${name}">
          <div class="dropzone-mini" data-item-dropzone="${name}">
            <span class="dz-text-desktop">Glissez-déposez un document, cliquez pour parcourir, ou</span>
            <span class="dz-text-mobile"><span class="icon-inline" data-icon="camera" style="margin-right:4px;"></span>Prendre une photo</span>
            <button type="button" class="btn btn-outline dz-snagit-btn" data-item-snagit="${name}">utiliser Snagit</button>
            <button type="button" class="btn btn-outline dz-snagit-btn" data-item-paste="${name}">Coller</button>
            <input type="file" data-item-file-input="${name}" capture="environment" multiple class="hidden">
          </div>
          <div class="file-list-mini" data-item-file-list="${name}"></div>
        </div>` : ''}
      </div>`;
  }).join('');

  wireChecklistFilterSelect(container, group);

  $$('.ci-checkbox', container).forEach((cb) => {
    cb.addEventListener('change', () => {
      const name = cb.dataset.name;
      const label = cb.closest('[data-item-wrap]')?.querySelector('.ci-label')?.textContent || name;
      taskSetDone(name, label, cb.checked);
      const wrap = container.querySelector(`[data-item-wrap="${name}"]`);
      if (wrap) { wrap.classList.toggle('checked', cb.checked); wrap.classList.remove('na', 'nc'); }
      const drawer = container.querySelector(`[data-drawer="${name}"]`);
      if (drawer) drawer.classList.toggle('hidden', !cb.checked);
      refreshChecklistProgressFor(group);
      updateProgressPill();
      renderNonConformites();
    });
  });

  $$('.ci-label', container).forEach((lbl) => {
    lbl.addEventListener('click', () => {
      const drawer = container.querySelector(`[data-drawer="${lbl.dataset.name}"]`);
      if (drawer) drawer.classList.toggle('hidden');
    });
  });

  $$('.btn-na', container).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.na;
      const changed = await taskToggleNA(name);
      if (!changed) return;
      renderChecklist(group);
      refreshChecklistProgressFor(group);
      updateProgressPill();
      renderNonConformites();
    });
  });

  $$('.btn-nc', container).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.nc;
      const label = btn.closest('[data-item-wrap]')?.querySelector('.ci-label')?.textContent || name;
      const changed = await taskToggleNC(name, label);
      if (!changed) return;
      renderChecklist(group);
      refreshChecklistProgressFor(group);
      updateProgressPill();
      renderNonConformites();
    });
  });

  $$('.btn-preuve', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.preuve;
      state.draft.casesPreuveRequise[name] = !state.draft.casesPreuveRequise[name];
      schedulePersist();
      renderChecklist(group);
      updateProgressPill();
    });
  });

  $$('.btn-note', container).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.note;
      const changed = await taskQuickNote(name);
      if (!changed) return;
      renderChecklist(group);
    });
  });

  $$('[data-task-detail]', container).forEach((label) => {
    label.addEventListener('click', () => {
      if (window.innerWidth <= 680) return; // le panneau latéral reste réservé au PC
      openTaskPanel(group, label.dataset.taskDetail);
    });
  });

  if (canAttach) {
    items.forEach(([name]) => {
      const dz = container.querySelector(`[data-item-dropzone="${name}"]`);
      if (!dz) return;
      const input = dz.querySelector('input[type="file"]');
      dz.addEventListener('click', (e) => {
        if (e.target === input || e.target.closest('button')) return;
        input.click();
      });
      input.addEventListener('change', () => attachFilesToTask(group, name, input.files));
      ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
      ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
      dz.addEventListener('drop', (e) => attachFilesToTask(group, name, e.dataTransfer.files));
      const snagitBtn = dz.querySelector('[data-item-snagit]');
      if (snagitBtn) {
        snagitBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.location.href = 'snagit://capture';
          toast('Ouverture de Snagit… capturez, puis glissez l\u2019image ici.', 4000);
        });
      }
      const pasteBtn = dz.querySelector('[data-item-paste]');
      if (pasteBtn) {
        pasteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const file = await readImageFromClipboard();
          if (file) await attachFilesToTask(group, name, [file]);
        });
      }
      renderItemFileList(group, name);
    });
  }

  refreshChecklistProgressFor(group);
}

// Lit une image du presse-papiers et la retourne comme File — réutilisée par
// tous les points d'attache (checklist, non-conformités, panneau de tâche).
async function readImageFromClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    toast('Le collage direct n\u2019est pas supporté par ce navigateur. Essayez Ctrl+V, ou glissez-déposez l\u2019image.', 4000);
    return null;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imgType = item.types.find((t) => t.startsWith('image/'));
      if (imgType) {
        const blob = await item.getType(imgType);
        const ext = imgType.split('/')[1] || 'png';
        return new File([blob], `presse-papiers-${Date.now()}.${ext}`, { type: imgType });
      }
    }
    toast('Aucune image trouvée dans le presse-papiers.');
    return null;
  } catch (err) {
    toast('Impossible de lire le presse-papiers (autorisation refusée). Essayez Ctrl+V ou le glisser-déposer.', 4000);
    return null;
  }
}

async function attachFilesToTask(group, name, fileList) {
  if (!fileList || !fileList.length) return;
  if (!state.draft.casesFichiers[name]) state.draft.casesFichiers[name] = [];
  Array.from(fileList).forEach((f) => {
    state.draft.casesFichiers[name].push({
      name: f.name, size: f.size, type: f.type, uploadedAt: new Date().toISOString(), blob: f,
    });
  });
  logActivity(`${fileList.length} document(s) ajouté(s) (${GROUP_LABELS[group] || group})`);
  await dbPut(state.draft);
  renderItemFileList(group, name);
  updateFilesCount();
  updateProgressPill();
  toast(`${fileList.length} document(s) joint(s) à la tâche.`);
}

function renderItemFileList(group, name) {
  const container = $(`[data-checklist="${group}"]`);
  if (!container) return;
  const listEl = container.querySelector(`[data-item-file-list="${name}"]`);
  const countEl = container.querySelector(`[data-attach-count="${name}"]`);
  const files = state.draft.casesFichiers[name] || [];
  if (countEl) countEl.textContent = files.length ? `${files.length}` : '';
  if (!listEl) return;
  listEl.innerHTML = files.length ? files.map((f, i) => `
    <div class="file-row file-row-lg" data-share-file-idx="${i}">
      ${isImageFile(f.name)
        ? `<img src="${URL.createObjectURL(f.blob)}" class="thumb-lg" alt="${escapeHtml(f.name)}" data-file-enlarge="${name}::${i}">`
        : `<span class="ext-badge">${extBadge(f.name)}</span>`}
      <div class="file-row-info">
        <span class="file-name">${escapeHtml(f.name)}</span>
        <span class="file-meta">${fmtSize(f.size)}${f.partages && f.partages.length ? ` · ${formatShareSummary(f.partages)}` : ''}</span>
      </div>
      ${isImageFile(f.name) ? `<button type="button" class="btn btn-tertiary" data-file-share="${name}::${i}">Partager</button>` : ''}
    </div>`).join('') : '';

  attachShareHistoryClicks(listEl, (row) => files[Number(row.dataset.shareFileIdx)]);
  $$('[data-file-enlarge]', listEl).forEach((img) => {
    img.addEventListener('click', () => {
      const [, idx] = img.dataset.fileEnlarge.split('::');
      openImageLightbox(files[Number(idx)]);
    });
  });
  $$('[data-file-share]', listEl).forEach((btn) => {
    btn.addEventListener('click', () => {
      const [, idx] = btn.dataset.fileShare.split('::');
      const label = (CHECKLISTS[state.draft.mode][group] || []).find(([n]) => n === name)?.[1] || name;
      sharePhoto(files[Number(idx)], `Tâche : ${label}`, () => renderItemFileList(group, name), label);
    });
  });
}

// Affiche une image jointe en grand, dans une fenêtre simple.
function openImageLightbox(file) {
  const url = URL.createObjectURL(file.blob);
  showModal({
    title: file.name,
    bodyHtml: `<img src="${url}" style="max-width:100%;border-radius:var(--radius-sm);display:block;">`,
    confirmLabel: 'Fermer',
  });
}

// Partage une photo par le partage natif de l'appareil (qui PEUT joindre le
// fichier) avec repli sur un courriel pré-rempli si non supporté (un
// navigateur ne peut jamais joindre un fichier automatiquement à un mailto:).
// Garde un historique (date, destinataire) sur le fichier lui-même — une trace
// de l'intention de partage, pas une confirmation de livraison.
// Résumé du dernier partage (nom + date/heure), avec accès au détail complet
// si plus d'un partage a été fait sur ce fichier.
function formatShareSummary(partages) {
  if (!partages || !partages.length) return '';
  const last = partages[partages.length - 1];
  const when = new Date(last.date).toLocaleString('fr-CA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const reste = partages.length - 1;
  return `partagé à ${escapeHtml(last.destinataire)} le ${when}${reste > 0 ? ` <span class="share-history-more" data-share-more="1">(+${reste} autre${reste > 1 ? 's' : ''})</span>` : ''}`;
}

function showShareHistoryModal(fileName, partages) {
  showModal({
    title: `Historique de partage — ${fileName}`,
    bodyHtml: `
      <div style="display:flex;flex-direction:column;gap:var(--space-2);">
        ${partages.slice().reverse().map((p) => {
          const when = new Date(p.date).toLocaleString('fr-CA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          return `<div style="font-size:var(--text-sm);padding:var(--space-2);background:var(--color-surface-2);border-radius:var(--radius-sm);">
            <strong>${escapeHtml(p.destinataire)}</strong>${p.email ? ` · ${escapeHtml(p.email)}` : ''}<br>
            <span style="color:var(--color-text-muted);">${when} · ${escapeHtml(p.methode)}</span>
          </div>`;
        }).join('')}
      </div>
    `,
    confirmLabel: 'Fermer',
  });
}

function attachShareHistoryClicks(container, fileGetter) {
  $$('[data-share-more]', container).forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = el.closest('[data-share-file-idx]');
      const f = fileGetter(row);
      if (f && f.partages) showShareHistoryModal(f.name, f.partages);
    });
  });
}

// Dessine une petite image "carré vert" imitant la tâche cochée dans l'app,
// jointe en second fichier avec la photo. Note : une page web ne peut jamais
// insérer une image directement DANS le corps d'un courriel (par partage
// natif ou mailto) — seulement comme pièce jointe séparée. C'est une limite
// technique des deux méthodes, pas une limite du navigateur en particulier.
function generateTaskConfirmationCard(label, numero, bt) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 900; canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(null); return; }
    ctx.fillStyle = '#16321f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#43b06b';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    ctx.fillStyle = '#43b06b';
    ctx.beginPath();
    ctx.roundRect(48, 60, 72, 72, 12);
    ctx.fill();
    ctx.strokeStyle = '#0d1f13';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(68, 96);
    ctx.lineTo(82, 112);
    ctx.lineTo(112, 78);
    ctx.stroke();
    ctx.fillStyle = '#e7ebef';
    ctx.font = '600 34px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    wrapCanvasText(ctx, label, 150, 100, canvas.width - 190, 40);
    ctx.fillStyle = '#99a6b5';
    ctx.font = '26px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    const dossierLigne = [numero, bt ? formatBt(bt) : ''].filter(Boolean).join('  ·  ');
    ctx.fillText(dossierLigne, 150, 165);
    ctx.fillStyle = '#5d6b7a';
    ctx.font = '20px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.fillText('Suivi TEI — tâche à corriger', 48, 240);
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let lineY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, lineY);
}

async function sharePhoto(file, contextLabel, onUpdate, subjectLabel) {
  const confirmed = await showModal({
    title: 'Partager cette photo',
    bodyHtml: `
      <p style="font-size:var(--text-sm);color:var(--color-text-muted);margin-bottom:var(--space-3);">${escapeHtml(contextLabel)}</p>
      <div class="field"><label>Nom du destinataire</label><input type="text" id="shareDestName" placeholder="Ex. : Carl Tremblay"></div>
      <div class="field" style="margin-top:var(--space-2);"><label>Courriel (optionnel, pour le repli)</label><input type="email" id="shareDestEmail" placeholder="nom@exemple.com"></div>
    `,
    confirmLabel: 'Partager',
  });
  if (!confirmed) return;
  const destName = $('#shareDestName').value.trim();
  const destEmail = $('#shareDestEmail').value.trim();
  if (!destName) { toast('Nom du destinataire requis.'); return; }

  // Sujet visé : "Libellé de la tâche - NUMERO-BTxxxx" (ex. Mise à jour dans
  // Immpower - 811-LV-7051A-BT1234567). Certains clients courriel (Outlook
  // via le partage natif de Windows, notamment) n'utilisent pas ce champ
  // pour l'objet du message même quand on le fournit — c'est une limite de
  // l'intégration de partage de l'OS, pas quelque chose qu'une page web peut
  // forcer.
  const numero = state.numero || '';
  const btPart = state.draft && state.draft.champs.bt ? '-' + formatBt(state.draft.champs.bt) : '';
  const sujetTexte = `${subjectLabel || contextLabel} - ${numero}${btPart}`;
  const dossierLabel = state.draft && state.draft.champs.bt ? `${numero} (${formatBt(state.draft.champs.bt)})` : numero;

  const files = [file.blob instanceof File ? file.blob : new File([file.blob], file.name, { type: file.type })];
  // Carte verte de confirmation jointe en second fichier, avec la photo.
  if (subjectLabel) {
    try {
      const cardBlob = await generateTaskConfirmationCard(subjectLabel, numero, state.draft && state.draft.champs.bt);
      if (cardBlob) files.push(new File([cardBlob], 'confirmation-tache.png', { type: 'image/png' }));
    } catch (err) {
      console.error('Erreur lors de la génération de la carte de confirmation :', err);
    }
  }

  // Message professionnel demandant une correction, avec vouvoiement et
  // formule de politesse — pour un envoi à un collègue ou un contracteur.
  const messageTexte = `Bonjour ${destName},\n\nEn révisant le dossier ${dossierLabel}, une information doit être corrigée concernant la tâche « ${subjectLabel || contextLabel} ». Vous trouverez en pièce jointe la photo concernée à des fins de référence.\n\nPourriez-vous mettre à jour cette information dans les meilleurs délais ?\n\nMerci de votre collaboration.\n\nCordialement,\nSuivi TEI`;

  const shareData = { files, title: sujetTexte, text: messageTexte };
  let methode = 'inconnue';
  try {
    if (navigator.canShare && navigator.canShare({ files: shareData.files })) {
      await navigator.share(shareData);
      methode = 'Partage natif';
    } else {
      throw new Error('non supporté');
    }
  } catch (err) {
    // Repli : ouvre un courriel pré-rempli. Les fichiers doivent être joints
    // manuellement — aucune API web ne permet de les joindre à un mailto:
    // automatiquement.
    const sujet = encodeURIComponent(sujetTexte);
    const corps = encodeURIComponent(`${messageTexte}\n\n(Merci de joindre manuellement les fichiers téléchargés séparément à ce courriel.)`);
    window.location.href = `mailto:${destEmail}?subject=${sujet}&body=${corps}`;
    methode = 'Courriel (pièce jointe à ajouter manuellement)';
    toast('Le fichier n\u2019a pas pu être joint automatiquement — un navigateur ne peut jamais le faire par courriel. Téléchargez-le puis joignez-le manuellement.', 6000);
  }

  if (!file.partages) file.partages = [];
  file.partages.push({ date: new Date().toISOString(), destinataire: destName, email: destEmail || null, methode });
  logActivity(`Photo « ${file.name} » partagée avec ${destName} (${methode})`);
  schedulePersist();
  if (onUpdate) onUpdate();
}

function refreshChecklistProgressFor(group) {
  const items = (CHECKLISTS[state.draft.mode] && CHECKLISTS[state.draft.mode][group]) || [];
  const done = items.filter(([n]) => isTaskDone(n)).length;
  updateChecklistProgress(group, done, items.length);
}

function updateChecklistProgress(group, done, total) {
  const el = $(`[data-checklist-progress="${group}"]`);
  if (el) el.textContent = total ? `${done} / ${total} tâche(s) complétée(s)` : '';
}

function renderAllChecklists() {
  ['identification', 'plans', 'programmation', 'systeme', 'information', 'securite'].forEach(renderChecklist);
}

// ---------- Onglet VPO : liste dynamique (conforme / non conforme) ----------
function findVpoItem(id) {
  return (state.draft.vpoItems || []).find((it) => it.id === id);
}

function renderVpoList() {
  const container = $('#vpoList');
  if (!container || !state.draft) return;
  const items = state.draft.vpoItems || [];

  container.innerHTML = items.map((item) => {
    const pending = item.texte && item.texte.trim() && !item.statut;
    let impact = '';
    if (pending && item.obligatoire) impact = '<div class="vpo-impact vpo-impact-block"><span class="icon-inline" data-icon="alertTriangle" style="margin-right:4px;"></span>Ce VPO empêche la fermeture du dossier</div>';
    else if (pending) impact = '<div class="vpo-impact vpo-impact-soft">Validation recommandée avant l\u2019étape suivante</div>';
    const validationInfo = item.statut && item.dateValidation
      ? `<div class="na-reason" style="margin-left:8px;">${item.numero ? `<strong>${item.numero}</strong> · ` : ''}${item.statut === 'conforme' ? 'Validé' : 'Évalué'} par ${escapeHtml(item.validePar || 'inconnu')} le ${new Date(item.dateValidation).toLocaleString('fr-CA')}</div>`
      : '';
    return `
    <div class="vpo-row" data-vpo-id="${item.id}">
      <div class="vpo-status">
        <button type="button" class="btn-obligatoire${item.obligatoire ? ' active' : ''}" data-vpo-obligatoire="${item.id}" title="Marquer ce VPO comme obligatoire">Obligatoire</button>
        <button type="button" class="btn-conforme${item.statut === 'conforme' ? ' active' : ''}" data-vpo-conforme="${item.id}">Conforme</button>
        <button type="button" class="btn-nc-vpo${item.statut === 'nc' ? ' active' : ''}" data-vpo-nc="${item.id}">Non conforme</button>
      </div>
      <input type="text" class="vpo-input" data-vpo-text="${item.id}" placeholder="Décrire le point vérifié…" value="${escapeHtml(item.texte || '')}">
      <button type="button" class="btn-vpo-remove" data-vpo-remove="${item.id}" title="Retirer cette ligne">✕</button>
    </div>
    ${item.statut === 'nc' && item.raison ? `<div class="na-reason" style="margin-left:8px;">Raison : ${escapeHtml(item.raison)}</div>` : ''}
    ${validationInfo}
    ${impact}
  `; }).join('');

  $$('[data-vpo-obligatoire]', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = findVpoItem(btn.dataset.vpoObligatoire);
      if (!item) return;
      item.obligatoire = !item.obligatoire;
      schedulePersist();
      renderVpoList();
      updateProgressPill();
    });
  });

  $$('[data-vpo-text]', container).forEach((input) => {
    input.addEventListener('input', () => {
      const item = findVpoItem(input.dataset.vpoText);
      if (!item) return;
      item.texte = input.value;
      schedulePersist();
      updateProgressPill();
    });
  });

  $$('[data-vpo-conforme]', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = findVpoItem(btn.dataset.vpoConforme);
      if (!item) return;
      if (item.statut === 'conforme') {
        item.statut = null;
        item.dateValidation = '';
        item.validePar = '';
      } else {
        item.statut = 'conforme';
        item.raison = '';
        item.dateValidation = new Date().toISOString();
        item.validePar = (state.draft.champs.employeeName || '').trim();
        logActivity(`VPO validé conforme : ${item.texte || '(sans description)'}`);
      }
      schedulePersist();
      renderVpoList();
      updateProgressPill();
      renderNonConformites();
    });
  });

  $$('[data-vpo-nc]', container).forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = findVpoItem(btn.dataset.vpoNc);
      if (!item) return;
      if (item.statut === 'nc') {
        item.statut = null;
        item.raison = '';
        item.gravite = '';
        item.dateValidation = '';
        item.validePar = '';
      } else {
        const result = await askNcReason();
        if (result === null) return;
        item.statut = 'nc';
        item.raison = result.reason;
        item.gravite = result.gravite;
        item.zone = result.zone;
        item.actionCorrective = result.actionCorrective;
        item.responsable = result.responsable;
        item.dateCreation = result.dateCreation;
        item.numero = nextNcId();
        item.resolu = false;
        item.dateValidation = new Date().toISOString();
        item.validePar = (state.draft.champs.employeeName || '').trim();
        logActivity(`Non-conformité VPO (${result.gravite}) relevée : ${item.texte || '(sans description)'}`);
      }
      schedulePersist();
      renderVpoList();
      updateProgressPill();
      renderNonConformites();
    });
  });

  $$('[data-vpo-remove]', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.draft.vpoItems = state.draft.vpoItems.filter((it) => it.id !== btn.dataset.vpoRemove);
      if (!state.draft.vpoItems.length) state.draft.vpoItems.push(newVpoItem());
      schedulePersist();
      renderVpoList();
      updateProgressPill();
      renderNonConformites();
    });
  });
}

$('#btnAddVpo').addEventListener('click', () => {
  if (!state.draft) return;
  state.draft.vpoItems.push(newVpoItem());
  schedulePersist();
  renderVpoList();
});

// ---------- Onglet Non-conformité : ajout manuel de lignes ----------
function findNcExtraItem(id) {
  return (state.draft.ncExtra || []).find((it) => it.id === id);
}

function renderNcExtraList() {
  const container = $('#ncExtraList');
  if (!container || !state.draft) return;
  const items = state.draft.ncExtra || [];
  container.innerHTML = items.map((item) => `
    <div class="vpo-row" data-ncextra-id="${item.id}">
      <select class="ncextra-gravite" data-ncextra-gravite="${item.id}">
        <option value="mineure"${item.gravite === 'mineure' ? ' selected' : ''}>Mineure</option>
        <option value="majeure"${item.gravite === 'majeure' ? ' selected' : ''}>Majeure</option>
        <option value="critique"${item.gravite === 'critique' ? ' selected' : ''}>Critique</option>
      </select>
      <input type="text" class="vpo-input" data-ncextra-text="${item.id}" placeholder="Décrire la non-conformité…" value="${escapeHtml(item.texte || '')}">
      <button type="button" class="btn-vpo-remove" data-ncextra-remove="${item.id}" title="Retirer cette ligne">✕</button>
    </div>`).join('');

  $$('[data-ncextra-gravite]', container).forEach((sel) => {
    sel.addEventListener('change', () => {
      const item = findNcExtraItem(sel.dataset.ncextraGravite);
      if (!item) return;
      item.gravite = sel.value;
      schedulePersist();
      renderNonConformites();
    });
  });
  $$('[data-ncextra-text]', container).forEach((input) => {
    input.addEventListener('input', () => {
      const item = findNcExtraItem(input.dataset.ncextraText);
      if (!item) return;
      item.texte = input.value;
      schedulePersist();
      renderNonConformites();
    });
  });
  $$('[data-ncextra-remove]', container).forEach((btn) => {
    btn.addEventListener('click', () => {
      state.draft.ncExtra = state.draft.ncExtra.filter((it) => it.id !== btn.dataset.ncextraRemove);
      schedulePersist();
      renderNcExtraList();
      renderNonConformites();
    });
  });
}

$('#btnAddNcExtra').addEventListener('click', () => {
  if (!state.draft) return;
  state.draft.ncExtra.push({ id: generateId(), texte: '', gravite: 'mineure', resolu: false, zone: '', actionCorrective: '', responsable: '', dateCreation: new Date().toISOString(), numero: nextNcId() });
  schedulePersist();
  renderNcExtraList();
});

// ---------- Onglet Identification : liens hypertextes ----------
function updateLinkTargets() {
  $$('[data-link]').forEach((input) => {
    const key = input.dataset.link;
    const target = $(`[data-open-link="${key}"]`);
    if (target) target.href = input.value || '#';
  });
}
$$('[data-link]').forEach((input) => {
  input.addEventListener('input', () => {
    updateLinkTargets();
    if (!state.draft) return;
    state.draft.liens[input.dataset.link] = input.value;
    schedulePersist();
  });
});

['fldTag', 'fldType', 'fldDesc'].forEach((id) => {
  document.getElementById(id).addEventListener('change', () => {
    if (!state.draft) return;
    state.draft.champs.tag = $('#fldTag').value;
    state.draft.champs.type = $('#fldType').value;
    state.draft.champs.desc = $('#fldDesc').value;
    toast('Fiche d\u2019identification enregistrée.');
    schedulePersist();
  });
});

// ---------- Onglet Sécurité et général : champs généraux ----------
const GENERAL_FIELD_MAP = {
  fldEmploye: 'employe', fldChargeProjet: 'chargeProjet', fldContracteur: 'contracteur',
  fldDateDebut: 'dateDebut', fldDateFin: 'dateFin', fldEtatGeneral: 'etatGeneral', fldCommentaires: 'commentaires',
  fldEmployeeName: 'employeeName', fldRole: 'employeeRole', fldPriorite: 'priorite',
};
Object.keys(GENERAL_FIELD_MAP).forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', () => {
    if (!state.draft) return;
    state.draft.champs[GENERAL_FIELD_MAP[id]] = el.value;
    schedulePersist();
    if (id === 'fldEmployeeName') updateApprobationBadge();
  });
});

// ---------- Dropzones génériques (Plans / Programmation / Mise à jour / Information) ----------
function extBadge(filename) {
  const ext = (filename.split('.').pop() || '').toUpperCase();
  return ext.length > 5 ? 'FICHIER' : ext;
}
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

async function uploadFiles(onglet, files) {
  if (!state.numero) { toast('Entrez d\u2019abord un numéro de localisation.'); return; }
  if (!files || !files.length) return;

  for (const f of Array.from(files)) {
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedAs = `${Date.now()}-${safe}`;
    state.draft.files[onglet].push({
      name: f.name, storedAs, size: f.size, type: f.type,
      uploadedAt: new Date().toISOString(), blob: f,
    });
  }

  await dbPut(state.draft);
  toast(`${files.length} document(s) enregistré(s) localement dans « ${onglet} ».`);
  refreshFileList(onglet);
  updateFilesCount();
}

function refreshFileList(onglet) {
  const listEl = $(`[data-file-list="${onglet}"]`);
  if (!listEl || !state.draft) return;
  const files = state.draft.files[onglet] || [];
  if (!files.length) { listEl.innerHTML = '<div class="empty-state">Aucun document déposé pour l\'instant.</div>'; return; }
  listEl.innerHTML = files.map((f) => `
    <div class="file-row">
      <span class="ext-badge">${extBadge(f.name)}</span>
      <span class="file-name">${f.name}</span>
      <span class="file-meta">${fmtSize(f.size)} · ${new Date(f.uploadedAt).toLocaleDateString('fr-CA')}</span>
    </div>`).join('');
}

function refreshAllFileLists() {
  UPLOAD_TABS.forEach(refreshFileList);
}

function updateFilesCount() {
  if (!state.draft) return;
  const tabTotal = Object.values(state.draft.files || {}).reduce((sum, arr) => sum + arr.length, 0);
  const taskTotal = Object.values(state.draft.casesFichiers || {}).reduce((sum, arr) => sum + arr.length, 0);
  const ncTotal = Object.values(state.draft.ncFichiers || {}).reduce((sum, arr) => sum + arr.length, 0);
  const wsFilesCountEl = $('#wsFilesCount');
  if (wsFilesCountEl) wsFilesCountEl.textContent = `${tabTotal + taskTotal + ncTotal} document(s)`;
  renderApercu();
  renderDocuments();
}

$$('.dropzone').forEach((zone) => {
  const onglet = zone.dataset.dropzone;
  const input = zone.querySelector('input[type="file"]');
  zone.addEventListener('click', (e) => { if (e.target !== input) input.click(); });
  input.addEventListener('change', () => uploadFiles(onglet, input.files));
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('dragover'); }));
  zone.addEventListener('drop', (e) => uploadFiles(onglet, e.dataTransfer.files));
});

// ---------- Snagit + outil d'annotation ----------
const canvas = $('#annotateCanvas');
const ctx = canvas.getContext('2d');
let drawing = false, currentTool = 'pen', lastX = 0, lastY = 0, startX = 0, startY = 0;

function resetCanvas() {
  if (!ctx) return;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-surface-2') || '#1e2630';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#555f6b';
  ctx.font = '14px Inter, sans-serif';
  ctx.fillStyle = '#7a8694';
  ctx.textAlign = 'center';
  ctx.fillText('Chargez une capture Snagit ou une image pour commencer l\'annotation', canvas.width / 2, canvas.height / 2);
}
resetCanvas();

$('#btnSnagit').addEventListener('click', () => {
  const attempted = 'snagit://capture';
  window.location.href = attempted;
  toast("Ouverture de Snagit… si rien ne se passe, capturez puis utilisez « Charger une image existante ».", 4000);
});

function loadImageBlobIntoCanvas(blob) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(blob);
}

$('#btnLoadImage').addEventListener('click', () => $('#loadImageInput').click());
$('#loadImageInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  loadImageBlobIntoCanvas(file);
});

// ---------- Collage direct depuis le presse-papiers ----------
$('#btnPasteClipboard').addEventListener('click', async () => {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    toast("Le collage direct n'est pas supporté par ce navigateur. Utilisez Ctrl+V dans cet onglet, ou glissez-déposez l'image.", 4000);
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    let found = false;
    for (const item of items) {
      const imgType = item.types.find((t) => t.startsWith('image/'));
      if (imgType) {
        const blob = await item.getType(imgType);
        loadImageBlobIntoCanvas(blob);
        toast('Image collée depuis le presse-papiers.');
        found = true;
        break;
      }
    }
    if (!found) toast('Aucune image trouvée dans le presse-papiers.');
  } catch (err) {
    toast('Impossible de lire le presse-papiers (autorisation refusée). Essayez Ctrl+V ou le glisser-déposer.', 4000);
  }
});

document.addEventListener('paste', (e) => {
  if (state.currentTab !== 'mise-a-jour' || $('#screenWorkspace').classList.contains('hidden')) return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (blob) {
        loadImageBlobIntoCanvas(blob);
        toast('Image collée depuis le presse-papiers.');
      }
      e.preventDefault();
      break;
    }
  }
});

$$('[data-tool]').forEach((btn) => btn.addEventListener('click', () => {
  currentTool = btn.dataset.tool;
  $$('[data-tool]').forEach((b) => b.classList.remove('btn-primary'));
  btn.classList.add('btn-primary');
}));

$('#btnClearCanvas').addEventListener('click', resetCanvas);

function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
}

function startDraw(e) {
  drawing = true;
  const p = canvasPos(e);
  lastX = startX = p.x; lastY = startY = p.y;
  if (currentTool === 'text') {
    const txt = prompt('Texte de l\'annotation :');
    if (txt) { ctx.fillStyle = '#ff7a1a'; ctx.font = 'bold 16px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(txt, p.x, p.y); }
    drawing = false;
  }
}
function moveDraw(e) {
  if (!drawing) return;
  const p = canvasPos(e);
  if (currentTool === 'pen') {
    ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastX = p.x; lastY = p.y;
  }
}
function endDraw(e) {
  if (!drawing) return;
  if (currentTool === 'arrow') {
    const p = canvasPos(e);
    drawArrow(startX, startY, p.x, p.y);
  }
  drawing = false;
}
function drawArrow(x1, y1, x2, y2) {
  const headlen = 14, angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = '#ff7a1a'; ctx.fillStyle = '#ff7a1a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill();
}
canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', moveDraw);
canvas.addEventListener('mouseup', endDraw);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e); });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); moveDraw(e); });
canvas.addEventListener('touchend', endDraw);

$('#btnSaveAnnotated').addEventListener('click', () => {
  if (!state.numero) { toast("Créez d'abord un dossier."); return; }
  canvas.toBlob(async (blob) => {
    const filename = `capture-annotee-${Date.now()}.png`;
    const namedBlob = new File([blob], filename, { type: 'image/png' });
    await uploadFiles('mise-a-jour', [namedBlob]);
  }, 'image/png');
});

// ---------- Approbation : le nom/rôle sont persistés comme champs généraux
// (voir GENERAL_FIELD_MAP) et lus au moment de la sauvegarde officielle ----------
function refreshApprovals() {
  const el = $('#approvalHistory');
  const list = state.draft ? state.draft.approbations : [];
  if (!list || !list.length) { el.innerHTML = '<div class="empty-state">Aucune sauvegarde officielle enregistrée pour ce dossier.</div>'; return; }
  el.innerHTML = list.slice().reverse().map((a) => `
    <div class="approval-row">
      <span class="badge-ok">✓</span>
      <span class="who">${a.nom} <span style="color:var(--color-text-faint);font-weight:400;">(${a.role})</span></span>
      <span class="when">${new Date(a.at).toLocaleString('fr-CA')}</span>
    </div>`).join('');
}

// ---------- Code QR : retrouver rapidement ce dossier ----------
function buildDossierUrl() {
  const base = location.origin + location.pathname;
  const params = new URLSearchParams({
    mode: state.draft.mode,
    numero: state.numero,
    bt: state.draft.champs.bt || '',
  });
  return `${base}?${params.toString()}`;
}

function generateQrSvg(text) {
  if (typeof qrcode === 'undefined') return '';
  for (let type = 4; type <= 40; type++) {
    try {
      const qr = qrcode(type, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag(4, 4);
    } catch (err) {
      // ce type est trop petit pour la donnée — on essaie le suivant
    }
  }
  return '';
}

function renderQrThumb() {
  const btn = $('#btnShowQrPlus');
  if (!btn || !state.numero || !state.draft) return;
  btn.innerHTML = generateQrSvg(buildDossierUrl());
}

function showQrModal() {
  if (!state.numero || !state.draft) { toast('Ouvrez d\u2019abord un dossier.'); return; }
  const url = buildDossierUrl();
  const svg = generateQrSvg(url);
  const off = state.draft.derniereSauvegardeOfficielle;
  const statusHtml = off
    ? `<p style="font-size:var(--text-sm);color:var(--color-success);">\u2705 Ce dossier a été sauvegardé sur le réseau le ${new Date(off.at).toLocaleString('fr-CA')}. Ce code pointe vers cette sauvegarde.</p>`
    : `<p style="font-size:var(--text-sm);color:var(--color-warning, #eab308);">\u26a0 Ce dossier n\u2019a pas encore été sauvegardé sur le réseau (bouton \u00ab Sauvegarder le dossier \u00bb). Ce code permet de reprendre sur cet appareil, mais ne trouvera rien sur un autre appareil tant qu\u2019une sauvegarde officielle n\u2019aura pas été faite.</p>`;
  showModal({
    title: 'Code QR du dossier',
    bodyHtml: `
      <p style="font-size:var(--text-sm);color:var(--color-text-muted);">Scannez ce code pour rouvrir directement ce dossier — sur cet appareil instantanément, ou sur un autre appareil en important la dernière sauvegarde réseau.</p>
      ${statusHtml}
      <div style="background:#fff;padding:12px;border-radius:8px;display:flex;justify-content:center;margin:var(--space-3) 0;">${svg || '<span style="color:#900;">Erreur de génération du code QR.</span>'}</div>
      <input type="text" readonly value="${url}" onclick="this.select()" style="font-family:var(--font-mono);font-size:11px;">
    `,
    confirmLabel: 'Fermer',
  });
}
$('#btnShowQrPlus').addEventListener('click', showQrModal);
$('#btnExportPlus').addEventListener('click', exportDashboardFile);
$('#btnSharePlus').addEventListener('click', shareDossierLink);

// ---------- Import depuis un dossier réseau existant (vraie synchronisation) ----------
async function readBlobFromDir(dirHandle, filename) {
  try {
    const fh = await dirHandle.getFileHandle(filename);
    return await fh.getFile();
  } catch (err) { return null; }
}

// L'utilisateur choisit directement le dossier (celui qu'il préfère) dans le sélecteur ;
// les champs Numéro de localisation et B.T. sont ensuite remplis automatiquement à
// partir de ce qui est lu dans suivi.json. Rien n'ouvre l'espace de travail ici —
// c'est le bouton « Continuer » qui le fait, une fois les champs vérifiés.
async function importDossierFromPickedFolder(expectedNumero) {
  if (!FS_ACCESS_SUPPORTED) {
    toast('L\u2019import réseau nécessite Chrome ou Edge sur ordinateur.', 4000);
    return false;
  }
  try {
    const folder = await window.showDirectoryPicker({ mode: 'readwrite' });
    const jsonFile = await (await folder.getFileHandle('suivi.json')).getFile();
    const draft = normalizeDraft(JSON.parse(await jsonFile.text()));

    // ---- Aperçu avant import : montrer l'essentiel avant de toucher aux données locales ----
    const groupsPreview = CHECKLISTS[draft.mode] || {};
    let taskTotal = 0, taskDone = 0;
    Object.values(groupsPreview).forEach((items) => items.forEach(([name]) => {
      taskTotal += 1;
      if (draft.casesCochees[name] === true) taskDone += 1;
    }));
    const vpoCount = (draft.vpoItems || []).filter((it) => it.texte && it.texte.trim()).length;
    const ncCount = Object.values(draft.casesNcDetails || {}).length
      + (draft.vpoItems || []).filter((it) => it.statut === 'nc').length
      + (draft.ncExtra || []).filter((it) => it.texte && it.texte.trim()).length;
    const docCount = Object.values(draft.casesFichiers || {}).reduce((s, a) => s + a.length, 0) + (draft.files['mise-a-jour'] || []).length;
    const remplaceExistant = !!(state.draft && (state.numero || state.draft.localisation) && state.draft.creeLe);

    const confirmed = await showModal({
      title: 'Aperçu du dossier à importer',
      bodyHtml: `
        <div class="closure-summary-grid" style="margin-bottom:var(--space-3);">
          <div>Localisation<br><strong>${escapeHtml(draft.localisation || '—')}</strong></div>
          <div>B.T.<br><strong>${escapeHtml(draft.champs.bt ? formatBt(draft.champs.bt) : '—')}</strong></div>
          <div>Type<br><strong>${draft.mode === 'installation' ? 'Installation' : 'Démantèlement'}</strong></div>
          <div>Créé le<br><strong>${draft.creeLe ? new Date(draft.creeLe).toLocaleDateString('fr-CA') : '—'}</strong></div>
          <div>Dernière sauvegarde<br><strong>${draft.derniereSauvegardeOfficielle ? new Date(draft.derniereSauvegardeOfficielle.at).toLocaleDateString('fr-CA') : (draft.modifieLe ? new Date(draft.modifieLe).toLocaleDateString('fr-CA') : '—')}</strong></div>
          <div>Tâches<br><strong>${taskDone} / ${taskTotal}</strong></div>
          <div>VPO<br><strong>${vpoCount}</strong></div>
          <div>Non-conformités<br><strong>${ncCount}</strong></div>
          <div>Documents / photos<br><strong>${docCount}</strong></div>
        </div>
        ${remplaceExistant ? `<p style="color:var(--color-warning, #eab308);font-size:var(--text-sm);">Le dossier actuellement ouvert (${escapeHtml(state.numero || state.draft.localisation)}) sera remplacé par cet import dans l\u2019espace de travail.</p>` : ''}
      `,
      confirmLabel: remplaceExistant ? 'Remplacer et importer' : 'Importer',
    });
    if (!confirmed) return false;

    const docsDir = await folder.getDirectoryHandle('Documents', { create: false }).catch(() => null);
    if (docsDir) {
      for (const [name, files] of Object.entries(draft.casesFichiers || {})) {
        for (const f of files) {
          const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const blob = await readBlobFromDir(docsDir, `${name}__${safe}`);
          if (blob) f.blob = blob;
        }
      }
    }
    const photosDir = await folder.getDirectoryHandle('Photos', { create: false }).catch(() => null);
    if (photosDir) {
      for (const f of (draft.files['mise-a-jour'] || [])) {
        const safe = (f.storedAs || f.name).replace(/[^a-zA-Z0-9._-]/g, '_');
        const blob = await readBlobFromDir(photosDir, safe);
        if (blob) f.blob = blob;
      }
    }

    if (expectedNumero && draft.localisation !== expectedNumero) {
      toast(`Attention : ce dossier correspond à ${draft.localisation}, pas à ${expectedNumero}.`, 5500);
    }

    // Toujours vider le nom ET le rôle de l'employé à l'import, même s'ils
    // étaient restés dans le fichier importé — la traçabilité exige de les
    // retaper/choisir à chaque fois, peu importe si le dossier est nouveau
    // ou repris.
    draft.champs.employeeName = '';
    draft.champs.employeeRole = '';

    // Remplit les champs visibles de l'écran d'identification
    $('#numLoc').value = draft.localisation;
    $('#numBt').value = draft.champs.bt || '';
    $('#numLoc').dispatchEvent(new Event('input'));
    $('#numBt').dispatchEvent(new Event('input'));

    state.draft = draft;
    state.numero = draft.localisation;
    state.isNewDraft = false;
    state.dossierDirHandle = folder; // les futures sauvegardes réécrivent ce même dossier
    await dbPut(state.draft);

    const statusEl = $('#dossierStatus');
    statusEl.classList.remove('hidden', 'err', 'new');
    statusEl.classList.add('ok');
    statusEl.textContent = `Dossier importé : ${draft.localisation}${draft.champs.bt ? ' (' + formatBt(draft.champs.bt) + ')' : ''}. Cliquez sur Continuer pour l\u2019ouvrir.`;
    toast(`Dossier ${state.numero} importé avec succès.`, 4000);
    return true;
  } catch (err) {
    if (err && err.name === 'AbortError') return false;
    console.error('Erreur importDossierFromPickedFolder:', err);
    if (err && err.name === 'NotFoundError') {
      toast('Ce dossier ne contient pas de fichier suivi.json valide.', 4500);
    } else {
      toast(`Impossible d\u2019importer ce dossier : ${(err && err.message) || (err && err.name) || 'erreur inconnue'}`, 6000);
    }
    return false;
  }
}

$('#btnImportNetwork').addEventListener('click', () => importDossierFromPickedFolder());

// ---------- Reprise automatique via un lien/QR scanné ----------
(async function autoResumeFromUrl() {
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode');
  const numero = params.get('numero');
  const bt = params.get('bt') || '';
  if (mode !== 'installation' && mode !== 'demantelement') return;
  if (!numero) return;

  selectMode(mode);
  $('#numLoc').value = numero;
  $('#numBt').value = bt;
  if (bt) $('#numBt').dispatchEvent(new Event('input'));
  $('#numLoc').dispatchEvent(new Event('input'));

  // Nettoyer l'URL pour ne pas reprendre automatiquement à chaque rechargement futur
  history.replaceState({}, '', location.pathname);

  if (!NUMERO_PATTERN.test(numero)) {
    toast('Le numéro de localisation contient des caractères invalides.', 4000);
    return;
  }
  if (!bt) {
    toast('Complétez le B.T. pour continuer.', 4000);
    return;
  }

  // Sur cet appareil, un brouillon local existe déjà : on l'ouvre directement (le plus rapide).
  const existing = await dbGet(numero);
  if (existing) {
    ouvrirDossier();
    return;
  }

  // Nouvel appareil : proposer d'importer les vraies données depuis le dossier réseau.
  await splashDonePromise;
  const confirmed = await showModal({
    title: 'Reprendre ce dossier',
    bodyHtml: `<p style="font-size:var(--text-sm);color:var(--color-text-muted);">Aucun brouillon local n\u2019existe sur cet appareil pour <strong>${numero}${bt ? ' (' + bt + ')' : ''}</strong>. Choisissez le dossier réseau où il a été sauvegardé pour l\u2019importer.</p>`,
    confirmLabel: 'Choisir le dossier',
  });
  if (confirmed) {
    const ok = await importDossierFromPickedFolder(numero);
    if (ok) ouvrirDossier();
  } else {
    toast('Cliquez sur Continuer pour démarrer un nouveau brouillon local.', 4500);
  }
})();

// ==================== MODE INTERVENTION (mobile — une tâche à la fois) ====================
// Réutilise entièrement les fonctions déjà existantes (taskSetDone, taskToggleNA,
// taskToggleNC, taskQuickNote, attachFilesToTask, askNcReason, newVpoItem, nextNcId) —
// aucune logique parallèle : le mode intervention est une simple autre FAÇON de
// naviguer et déclencher exactement les mêmes actions que la checklist normale.
let ivTaskList = [];
let ivIndex = 0;

function buildInterventionTaskList() {
  const groups = CHECKLISTS[state.draft.mode] || {};
  const list = [];
  Object.entries(groups).forEach(([group, items]) => {
    items.forEach(([name, label]) => list.push({ group, name, label }));
  });
  return list;
}

function startInterventionMode() {
  if (!state.draft) return;
  ivTaskList = buildInterventionTaskList();
  if (!ivTaskList.length) { toast('Aucune tâche dans ce dossier.'); return; }
  const firstIncomplete = ivTaskList.findIndex((t) => state.draft.casesCochees[t.name] !== true);
  ivIndex = firstIncomplete === -1 ? 0 : firstIncomplete;
  $('#interventionMode').classList.remove('hidden');
  renderInterventionStep();
}

function exitInterventionMode() {
  $('#interventionMode').classList.add('hidden');
  $('#ivPhotoConfirm').classList.add('hidden');
  // Rafraîchit toutes les vues qui pourraient avoir changé pendant l'intervention.
  const groups = CHECKLISTS[state.draft.mode] || {};
  Object.keys(groups).forEach((g) => renderChecklist(g));
  renderApercu();
  renderNonConformites();
  renderVpoList();
  updateProgressPill();
  updateFilesCount();
}

function renderInterventionStep() {
  const task = ivTaskList[ivIndex];
  if (!task || !state.draft) return;
  const d = state.draft;
  $('#ivBt').textContent = `${formatBt(d.champs.bt) || '—'} · ${[d.champs.type, d.champs.tag].filter(Boolean).join(' — ') || d.localisation}`;
  const doneCount = ivTaskList.filter((t) => d.casesCochees[t.name] === true).length;
  $('#ivProgress').textContent = `${doneCount} / ${ivTaskList.length} tâches complétées`;
  $('#ivStep').textContent = `Tâche ${ivIndex + 1} sur ${ivTaskList.length}`;
  $('#ivSection').textContent = GROUP_LABELS[task.group] || task.group;
  $('#ivTaskLabel').textContent = task.label;

  const note = d.casesNotes[task.name];
  const noteEl = $('#ivTaskNote');
  if (note) { noteEl.textContent = note; noteEl.classList.remove('hidden'); }
  else { noteEl.classList.add('hidden'); }

  $('#ivPhotoConfirm').classList.add('hidden');

  const val = d.casesCochees[task.name];
  const doneBtn = $('#btnIvDone');
  const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>';
  if (val === true) {
    doneBtn.innerHTML = `${checkSvg} Fait — toucher pour annuler`;
    doneBtn.classList.add('iv-done-active');
  } else {
    doneBtn.innerHTML = `${checkSvg} Marquer fait`;
    doneBtn.classList.remove('iv-done-active');
  }

  $('#btnIvPrev').disabled = ivIndex === 0;
  $('#btnIvNext').disabled = ivIndex === ivTaskList.length - 1;
}

// Choix à deux options réutilisant la même fenêtre modale que le reste de l'app
// (même overlay, mêmes styles) — seule la façon de résoudre le choix diffère
// du confirmer/annuler binaire habituel.
function showChoiceModal(title, bodyHtml, choiceIds) {
  return new Promise((resolve) => {
    const overlay = $('#modalOverlay');
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = bodyHtml;
    $('#modalConfirm').classList.add('hidden');
    overlay.classList.remove('hidden');

    const handlers = [];
    function cleanup(value) {
      overlay.classList.add('hidden');
      $('#modalConfirm').classList.remove('hidden');
      handlers.forEach(({ el, fn }) => el.removeEventListener('click', fn));
      $('#modalCancel').removeEventListener('click', onCancel);
      resolve(value);
    }
    function onCancel() { cleanup(null); }
    $('#modalCancel').addEventListener('click', onCancel);
    choiceIds.forEach((id) => {
      const el = $('#' + id);
      if (!el) return;
      const fn = () => cleanup(id);
      handlers.push({ el, fn });
      el.addEventListener('click', fn);
    });
  });
}

async function reportEcartForTask(name, label) {
  const choice = await showChoiceModal('Signaler un écart', `
    <p style="font-size:var(--text-sm);color:var(--color-text-muted);margin-bottom:var(--space-3);">Lié à : <strong>${escapeHtml(label)}</strong></p>
    <div style="display:flex;flex-direction:column;gap:var(--space-2);">
      <button type="button" class="btn btn-outline" id="ecartChoixNc" style="width:100%;">Non-conformité sur cette tâche</button>
      <button type="button" class="btn btn-outline" id="ecartChoixVpo" style="width:100%;">Nouveau point VPO lié</button>
    </div>
  `, ['ecartChoixNc', 'ecartChoixVpo']);

  if (choice === 'ecartChoixNc') {
    await taskToggleNC(name, label);
    renderNonConformites();
  } else if (choice === 'ecartChoixVpo') {
    const result = await askNcReason();
    if (result === null) return;
    const item = newVpoItem();
    item.texte = `Écart lié à : ${label}`;
    item.statut = 'nc';
    item.raison = result.reason;
    item.gravite = result.gravite;
    item.zone = result.zone;
    item.actionCorrective = result.actionCorrective;
    item.responsable = result.responsable;
    item.dateCreation = result.dateCreation;
    item.numero = nextNcId();
    item.resolu = false;
    item.dateValidation = new Date().toISOString();
    item.validePar = (state.draft.champs.employeeName || '').trim();
    state.draft.vpoItems.push(item);
    logActivity(`Non-conformité VPO (${result.gravite}) relevée depuis le mode intervention : ${item.texte}`);
    schedulePersist();
    renderVpoList();
    renderNonConformites();
  }
  updateProgressPill();
}

// ---- Câblage (une seule fois — les éléments du mode intervention ne sont jamais recréés) ----
$('#btnCloseIntervention').addEventListener('click', exitInterventionMode);

$('#btnIvPrev').addEventListener('click', () => {
  if (ivIndex > 0) { ivIndex--; renderInterventionStep(); }
});
$('#btnIvNext').addEventListener('click', () => {
  if (ivIndex < ivTaskList.length - 1) { ivIndex++; renderInterventionStep(); }
});

$('#btnIvDone').addEventListener('click', () => {
  const task = ivTaskList[ivIndex];
  if (!task) return;
  const currentlyDone = state.draft.casesCochees[task.name] === true;
  taskSetDone(task.name, task.label, !currentlyDone);
  renderInterventionStep();
  if (!currentlyDone && ivIndex < ivTaskList.length - 1) {
    setTimeout(() => { ivIndex++; renderInterventionStep(); }, 350);
  }
});

$('#btnIvNote').addEventListener('click', async () => {
  const task = ivTaskList[ivIndex];
  if (!task) return;
  const changed = await taskQuickNote(task.name);
  if (changed) renderInterventionStep();
});

$('#btnIvEcart').addEventListener('click', async () => {
  const task = ivTaskList[ivIndex];
  if (!task) return;
  await reportEcartForTask(task.name, task.label);
  renderInterventionStep();
});

$('#btnIvPhoto').addEventListener('click', () => { $('#ivPhotoInput').click(); });
$('#ivPhotoInput').addEventListener('change', async () => {
  const task = ivTaskList[ivIndex];
  const input = $('#ivPhotoInput');
  if (!task || !input.files || !input.files.length) return;
  await attachFilesToTask(task.group, task.name, input.files);
  input.value = '';
  $('#ivPhotoConfirm').classList.remove('hidden');
});
$('#btnIvViewPhoto').addEventListener('click', () => {
  const task = ivTaskList[ivIndex];
  if (!task) return;
  const files = state.draft.casesFichiers[task.name] || [];
  const last = files[files.length - 1];
  if (!last) return;
  if (isImageFile(last.name)) {
    showModal({ title: last.name, bodyHtml: `<img src="${URL.createObjectURL(last.blob)}" style="max-width:100%;border-radius:8px;">`, confirmLabel: 'Fermer' });
  } else {
    toast('Document non visualisable directement (pas une image).');
  }
});
$('#btnIvAddNoteAfterPhoto').addEventListener('click', async () => {
  const task = ivTaskList[ivIndex];
  if (!task) return;
  const changed = await taskQuickNote(task.name);
  if (changed) renderInterventionStep();
});

// ==================== RECHERCHE INTERNE (PC — Ctrl/Cmd+K) ====================
// Construit un index à partir des données déjà existantes — aucune structure
// parallèle : tâches, VPO, NC, documents et notes proviennent tous de state.draft.
function buildSearchIndex() {
  if (!state.draft) return [];
  const d = state.draft;
  const groups = CHECKLISTS[d.mode] || {};
  const index = [];

  Object.entries(groups).forEach(([group, tasks]) => {
    tasks.forEach(([name, label]) => {
      index.push({ type: 'Tâche', text: label, sub: GROUP_LABELS[group] || group, tab: group });
      const note = d.casesNotes[name];
      if (note) index.push({ type: 'Note', text: note, sub: `Note sur : ${label}`, tab: group });
      if (d.casesCochees[name] === 'nc') {
        const det = d.casesNcDetails[name] || {};
        index.push({ type: det.numero || 'NC', text: label, sub: 'Non-conformité (tâche)', tab: 'non-conformite' });
      }
      (d.casesFichiers[name] || []).forEach((f) => {
        index.push({ type: 'Document', text: f.name, sub: `Lié à : ${label}`, tab: 'documents' });
      });
    });
  });

  (d.vpoItems || []).forEach((it) => {
    if (!it.texte || !it.texte.trim()) return;
    index.push({ type: it.numero || 'VPO', text: it.texte, sub: it.statut === 'nc' ? 'VPO — non-conformité' : 'VPO', tab: 'vpo' });
    if (it.raison) index.push({ type: 'Note', text: it.raison, sub: `Raison — ${it.numero || 'VPO'}`, tab: 'vpo' });
  });

  (d.ncExtra || []).forEach((it) => {
    if (!it.texte || !it.texte.trim()) return;
    index.push({ type: it.numero || 'NC', text: it.texte, sub: 'Non-conformité', tab: 'non-conformite' });
  });

  (d.files['mise-a-jour'] || []).forEach((f) => index.push({ type: 'Document', text: f.name, sub: 'Photo de mise à jour', tab: 'mise-a-jour' }));
  Object.entries(d.ncFichiers || {}).forEach(([numero, files]) => {
    files.forEach((f) => index.push({ type: 'Document', text: f.name, sub: `Photo — ${numero}`, tab: 'non-conformite' }));
  });

  if (d.champs.bt) index.push({ type: 'BT', text: formatBt(d.champs.bt), sub: 'Identité du dossier', tab: 'identification' });
  if (d.champs.tag) index.push({ type: 'Tag', text: d.champs.tag, sub: 'Identité du dossier', tab: 'identification' });
  if (state.numero) index.push({ type: 'Localisation', text: state.numero, sub: 'Identité du dossier', tab: 'identification' });

  return index;
}

function runSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return buildSearchIndex()
    .filter((item) => item.text.toLowerCase().includes(q) || (item.sub || '').toLowerCase().includes(q) || (item.type || '').toLowerCase().includes(q))
    .slice(0, 30);
}

function renderSearchResults(results, query) {
  const el = $('#searchResults');
  if (!query.trim()) { el.innerHTML = ''; return; }
  if (!results.length) { el.innerHTML = '<div class="search-empty">Aucun résultat.</div>'; return; }
  el.innerHTML = results.map((r, i) => `
    <button type="button" class="search-result-row" data-search-idx="${i}">
      <span class="sr-type">${escapeHtml(r.type)}</span>
      <span class="sr-text">${escapeHtml(r.text)}</span>
      <span class="sr-sub">${escapeHtml(r.sub || '')}</span>
    </button>`).join('');
  $$('.search-result-row', el).forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = results[parseInt(btn.dataset.searchIdx, 10)];
      closeSearch();
      selectTab(r.tab);
    });
  });
}

function openSearch() {
  if (!state.draft) { toast('Ouvrez d\u2019abord un dossier.'); return; }
  $('#searchOverlay').classList.remove('hidden');
  $('#searchInput').value = '';
  $('#searchResults').innerHTML = '';
  $('#searchInput').focus();
}
function closeSearch() {
  $('#searchOverlay').classList.add('hidden');
}
$('#searchInput').addEventListener('input', () => {
  const q = $('#searchInput').value;
  renderSearchResults(runSearch(q), q);
});
$('#searchOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'searchOverlay') closeSearch();
});

// ==================== PANNEAU LATÉRAL DE TÂCHE (PC seulement) ====================
// Réutilise entièrement les fonctions et données de la checklist existante —
// aucun deuxième système de tâches ou de preuves.
let taskPanelCurrent = null; // { group, name }

function openTaskPanel(group, name) {
  if (!state.draft) return;
  taskPanelCurrent = { group, name };
  $('#taskPanel').classList.remove('hidden');
  renderTaskPanelBody();
}
function closeTaskPanel() {
  $('#taskPanel').classList.add('hidden');
  taskPanelCurrent = null;
}
$('#btnCloseTaskPanel').addEventListener('click', closeTaskPanel);

function renderTaskPanelBody() {
  if (!taskPanelCurrent || !state.draft) return;
  const { group, name } = taskPanelCurrent;
  const d = state.draft;
  const groups = CHECKLISTS[d.mode] || {};
  const items = groups[group] || [];
  const found = items.find(([n]) => n === name);
  const label = found ? found[1] : name;

  $('#tpSection').textContent = GROUP_LABELS[group] || group;
  $('#tpTitle').textContent = label;

  const val = d.casesCochees[name];
  const statutLabel = val === true ? 'Fait' : val === 'na' ? 'Non applicable' : val === 'nc' ? 'Non-conformité' : 'À faire';
  const statutColor = val === true ? 'var(--color-success)' : val === 'nc' ? 'var(--color-error)' : val === 'na' ? 'var(--color-text-muted)' : 'var(--color-warning)';

  const preuveRequise = !!d.casesPreuveRequise[name];
  const files = d.casesFichiers[name] || [];
  const note = d.casesNotes[name] || '';
  const ncDetail = val === 'nc' ? (d.casesNcDetails[name] || {}) : null;

  const filesHtml = files.length
    ? files.map((f) => `<div class="tp-history-item">${escapeHtml(f.name)} — ${fmtSize(f.size)}</div>`).join('')
    : '<div class="tp-empty">Aucun document lié.</div>';

  // Historique — approximatif, basé sur le journal d'activité existant (aucune
  // structure de suivi par tâche n'existe séparément).
  const historyEntries = (d.journal || []).filter((j) => j.text && j.text.includes(label)).slice(-6).reverse();
  const historyHtml = historyEntries.length
    ? historyEntries.map((j) => `<div class="tp-history-item">${new Date(j.at).toLocaleString('fr-CA')} — ${escapeHtml(j.text)}</div>`).join('')
    : '<div class="tp-empty">Aucun évènement journalisé pour cette tâche.</div>';

  $('#taskPanelBody').innerHTML = `
    <div>
      <span class="tp-status-badge" style="color:${statutColor};border-color:${statutColor};">${statutLabel}</span>
      ${preuveRequise ? '<span class="tp-status-badge" style="margin-left:6px;">Preuve requise</span>' : ''}
    </div>

    <div class="tp-actions-row">
      <button type="button" class="btn btn-primary" id="tpBtnDone">${val === true ? 'Annuler « Fait »' : 'Marquer fait'}</button>
      <button type="button" class="btn btn-outline" id="tpBtnNote">${note ? 'Modifier la note' : 'Ajouter une note'}</button>
      <button type="button" class="btn btn-outline" id="tpBtnDoc">Ajouter un document</button>
      <button type="button" class="btn btn-outline" id="tpBtnPaste">Coller</button>
      <input type="file" id="tpFileInput" multiple class="hidden">
    </div>

    ${ncDetail ? `
    <div>
      <div class="tp-block-title">Non-conformité${ncDetail.numero ? ' — ' + escapeHtml(ncDetail.numero) : ''}</div>
      <div class="tp-note-box">
        ${ncDetail.zone ? `Zone : ${escapeHtml(ncDetail.zone)}<br>` : ''}
        ${d.casesGravites[name] ? `Gravité : ${escapeHtml(d.casesGravites[name])}<br>` : ''}
        ${d.casesRaisons[name] ? `Raison : ${escapeHtml(d.casesRaisons[name])}<br>` : ''}
        ${ncDetail.actionCorrective ? `Action corrective : ${escapeHtml(ncDetail.actionCorrective)}<br>` : ''}
        ${ncDetail.responsable ? `Responsable : ${escapeHtml(ncDetail.responsable)}` : ''}
      </div>
    </div>` : ''}

    <div>
      <div class="tp-block-title">Note</div>
      ${note ? `<div class="tp-note-box">${escapeHtml(note)}</div>` : '<div class="tp-empty">Aucune note.</div>'}
    </div>

    <div>
      <div class="tp-block-title">Documents liés (${files.length})</div>
      ${filesHtml}
    </div>

    <div>
      <div class="tp-block-title">Historique</div>
      ${historyHtml}
    </div>
  `;

  $('#tpBtnDone').addEventListener('click', () => {
    taskSetDone(name, label, val !== true);
    renderChecklist(group);
    refreshChecklistProgressFor(group);
    updateProgressPill();
    renderTaskPanelBody();
  });
  $('#tpBtnNote').addEventListener('click', async () => {
    const changed = await taskQuickNote(name);
    if (changed) { renderChecklist(group); renderTaskPanelBody(); }
  });
  $('#tpBtnDoc').addEventListener('click', () => $('#tpFileInput').click());
  $('#tpBtnPaste').addEventListener('click', async () => {
    const file = await readImageFromClipboard();
    if (!file) return;
    await attachFilesToTask(group, name, [file]);
    renderChecklist(group);
    renderTaskPanelBody();
  });
  $('#tpFileInput').addEventListener('change', async (e) => {
    if (!e.target.files || !e.target.files.length) return;
    await attachFilesToTask(group, name, e.target.files);
    e.target.value = '';
    renderChecklist(group);
    renderTaskPanelBody();
  });
}
