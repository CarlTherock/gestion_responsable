// ============================================================
// Suivi de travaux d'instrumentation — app.js
// ============================================================
const API = 'port/8000'.startsWith('__') ? 'http://localhost:8000' : 'port/8000';

const state = {
  mode: null,          // 'installation' | 'demantelement'
  numero: null,
  dossierCreated: false,
  currentTab: 'identification',
  rootDirHandle: null,     // dossier racine choisi par l'utilisateur sur cet appareil
  dossierDirHandle: null,  // sous-dossier <numero> à l'intérieur du dossier racine
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ---------- Theme toggle ----------
(function () {
  const root = document.documentElement;
  let theme = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'dark'; // industrial default = dark
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

// ---------- Étape 1 : choix du type ----------
$$('.choice-card').forEach((card) => {
  card.addEventListener('click', () => {
    state.mode = card.dataset.choice;
    document.getElementById('app').setAttribute('data-mode', state.mode);

    const label = state.mode === 'installation' ? "Suivi d'installation" : "Démantèlement d'instrumentation";
    $('#modeBadge').textContent = label;
    $('#modeBadge').classList.remove('hidden');
    $('#brandSub').textContent = label;
    $('#homeBtn').classList.remove('hidden');
    $('#step2Kicker').textContent = `Étape 2 · ${label}`;
    $('#step2Title').textContent = state.mode === 'installation'
      ? "Localisation de l'instrument à installer"
      : "Localisation de l'instrument à démanteler";

    $('#screenChoice').classList.add('hidden');
    $('#screenDossier').classList.remove('hidden');
    $('#numLoc').focus();
  });
});

$('#homeBtn').addEventListener('click', () => location.reload());

// ---------- Emplacement local du dossier (File System Access API) ----------
const FS_ACCESS_SUPPORTED = 'showDirectoryPicker' in window;
if (!FS_ACCESS_SUPPORTED) {
  $('#folderStatus').textContent = "Non disponible sur ce navigateur (Safari/iOS) — les documents restent sauvegardés sur le serveur du dossier.";
}

$('#btnChooseFolder').addEventListener('click', async () => {
  if (!FS_ACCESS_SUPPORTED) {
    toast("Cette fonction n'est pas supportée par ce navigateur (disponible sur Chrome/Edge de bureau). Les documents restent sauvegardés sur le serveur du dossier.", 4500);
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    state.rootDirHandle = handle;
    $('#folderStatus').textContent = `Dossier lié : « ${handle.name} » — le fichier de suivi et les documents y seront copiés.`;
    $('#folderStatus').classList.add('ok');
    toast(`Dossier « ${handle.name} » lié avec succès.`);
    if (state.numero) await ensureLocalDossierFolder();
  } catch (err) {
    // utilisateur a annulé la sélection — rien à faire
  }
});

async function ensureLocalDossierFolder() {
  if (!state.rootDirHandle || !state.numero) return;
  try {
    state.dossierDirHandle = await state.rootDirHandle.getDirectoryHandle(state.numero, { create: true });
    const pill = $('#wsFolderPill');
    if (pill) { pill.textContent = `📁 lié : ${state.rootDirHandle.name}/${state.numero}`; }
    await syncLocalTrackingFile();
  } catch (err) {
    toast("Impossible de créer/ouvrir le sous-dossier local pour ce numéro de localisation.");
  }
}

async function writeFileToLocalFolder(onglet, file) {
  if (!state.dossierDirHandle) return false;
  try {
    const subDir = await state.dossierDirHandle.getDirectoryHandle(onglet, { create: true });
    const fileHandle = await subDir.getFileHandle(file.name || `document-${Date.now()}`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();
    return true;
  } catch (err) {
    return false;
  }
}

async function syncLocalTrackingFile() {
  if (!state.dossierDirHandle || !state.numero) return;
  try {
    const res = await fetch(`${API}/api/dossier/${state.numero}`);
    const data = await res.json();
    const fileHandle = await state.dossierDirHandle.getFileHandle(`fichier-suivi-${state.numero}.json`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  } catch (err) {
    // best effort seulement — ne bloque jamais le flux principal
  }
}

// ---------- Étape 2 : vérifier / créer le dossier ----------
$('#btnCheckDossier').addEventListener('click', checkOrCreateDossier);
$('#numLoc').addEventListener('keydown', (e) => { if (e.key === 'Enter') checkOrCreateDossier(); });

async function checkOrCreateDossier() {
  const numero = $('#numLoc').value.trim().toUpperCase();
  const statusEl = $('#dossierStatus');
  if (!numero) { toast('Entrez un numéro de localisation.'); return; }

  statusEl.classList.remove('hidden', 'ok', 'new', 'err');
  statusEl.textContent = 'Recherche du dossier sur le réseau…';

  try {
    const res = await fetch(`${API}/api/dossier/${encodeURIComponent(numero)}?type=${state.mode}`, { method: 'POST' });
    const data = await res.json();
    state.numero = numero;
    state.dossierCreated = data.justCreated;

    statusEl.classList.add(data.justCreated ? 'new' : 'ok');
    statusEl.textContent = data.justCreated
      ? `Aucun dossier existant — nouveau dossier créé : /reseau/instrumentation/${numero}/`
      : `Dossier existant trouvé — dernière mise à jour ${new Date(data.updatedAt).toLocaleString('fr-CA')}`;

    if (state.rootDirHandle) await ensureLocalDossierFolder();
    setTimeout(() => openWorkspace(data), 500);
  } catch (err) {
    statusEl.classList.add('err');
    statusEl.textContent = "Impossible de joindre le serveur de dossiers pour l'instant.";
  }
}

// ---------- Étape 3 : espace de travail ----------
function openWorkspace(data) {
  $('#screenDossier').classList.add('hidden');
  $('#screenWorkspace').classList.remove('hidden');

  $('#wsNum').textContent = state.numero;
  $('#wsMeta').textContent = `${state.mode === 'installation' ? "Suivi d'installation" : 'Démantèlement'} · créé le ${new Date(data.createdAt).toLocaleDateString('fr-CA')}`;
  $('#wsCreated').textContent = data.justCreated ? 'nouveau dossier' : 'dossier existant';

  // pré-remplir les liens sauvegardés
  if (data.liens) {
    $$('[data-link]').forEach((input) => {
      const key = input.dataset.link;
      if (data.liens[key]) input.value = data.liens[key];
    });
  }
  updateLinkTargets();

  if (data.identification) {
    $('#fldTag').value = data.identification.tag || '';
    $('#fldType').value = data.identification.type || '';
    $('#fldDesc').value = data.identification.desc || '';
  }

  refreshAllFileLists();
  refreshApprovals(data.approbations || []);
  updateFilesCount();
}

// ---------- Onglets ----------
$$('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach((b) => b.setAttribute('aria-selected', 'false'));
    btn.setAttribute('aria-selected', 'true');
    const tab = btn.dataset.tab;
    state.currentTab = tab;
    $$('.tab-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
  });
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
    saveLiens();
  });
});

let liensSaveTimer;
function saveLiens() {
  clearTimeout(liensSaveTimer);
  liensSaveTimer = setTimeout(async () => {
    if (!state.numero) return;
    const liens = {};
    $$('[data-link]').forEach((i) => (liens[i.dataset.link] = i.value));
    await fetch(`${API}/api/dossier/${state.numero}/liens`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ liens }),
    }).catch(() => {});
    syncLocalTrackingFile();
  }, 500);
}

['fldTag', 'fldType', 'fldDesc'].forEach((id) => {
  document.getElementById(id).addEventListener('change', async () => {
    if (!state.numero) return;
    await fetch(`${API}/api/dossier/${state.numero}/identification`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: $('#fldTag').value, type: $('#fldType').value, desc: $('#fldDesc').value }),
    }).catch(() => {});
    toast('Fiche d\'identification enregistrée.');
    syncLocalTrackingFile();
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
  if (!state.numero) { toast("Créez d'abord un dossier."); return; }
  if (!files || !files.length) return;
  const form = new FormData();
  Array.from(files).forEach((f) => form.append('files', f));
  form.append('onglet', onglet);
  try {
    const res = await fetch(`${API}/api/dossier/${state.numero}/upload`, { method: 'POST', body: form });
    if (!res.ok) throw new Error('upload failed');

    let localOk = 0;
    if (state.dossierDirHandle) {
      for (const f of Array.from(files)) {
        if (await writeFileToLocalFolder(onglet, f)) localOk++;
      }
    }
    toast(state.dossierDirHandle
      ? `${files.length} document(s) enregistré(s) dans « ${onglet} » (+ ${localOk} copié(s) localement).`
      : `${files.length} document(s) enregistré(s) dans « ${onglet} ».`);
    refreshFileList(onglet);
    updateFilesCount();
    syncLocalTrackingFile();
  } catch (err) {
    toast("Erreur lors de l'enregistrement du document.");
  }
}

async function refreshFileList(onglet) {
  const listEl = $(`[data-file-list="${onglet}"]`);
  if (!listEl || !state.numero) return;
  try {
    const res = await fetch(`${API}/api/dossier/${state.numero}/files/${onglet}`);
    const files = await res.json();
    if (!files.length) { listEl.innerHTML = '<div class="empty-state">Aucun document déposé pour l\'instant.</div>'; return; }
    listEl.innerHTML = files.map((f) => `
      <div class="file-row">
        <span class="ext-badge">${extBadge(f.name)}</span>
        <span class="file-name">${f.name}</span>
        <span class="file-meta">${fmtSize(f.size)} · ${new Date(f.uploadedAt).toLocaleDateString('fr-CA')}</span>
      </div>`).join('');
  } catch (err) { listEl.innerHTML = '<div class="empty-state">Impossible de charger la liste des documents.</div>'; }
}

function refreshAllFileLists() {
  ['plans', 'programmation', 'mise-a-jour', 'information'].forEach(refreshFileList);
}

async function updateFilesCount() {
  if (!state.numero) return;
  try {
    const res = await fetch(`${API}/api/dossier/${state.numero}`);
    const data = await res.json();
    const total = Object.values(data.files || {}).reduce((sum, arr) => sum + arr.length, 0);
    $('#wsFilesCount').textContent = `${total} document(s)`;
  } catch (err) {}
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
let drawing = false, currentTool = 'pen', lastX = 0, lastY = 0, startX = 0, startY = 0, baseImage = null;

function resetCanvas() {
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
  // Tentative de lancement de Snagit en local via un schéma d'URI (à activer une fois
  // le pont d'intégration Snagit / IT en place). Repli : instructions manuelles.
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
    baseImage = canvas.toDataURL();
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
    if (!found) toast("Aucune image trouvée dans le presse-papiers.");
  } catch (err) {
    toast("Impossible de lire le presse-papiers (autorisation refusée). Essayez Ctrl+V ou le glisser-déposer.", 4000);
  }
});

// Collage au clavier (Ctrl+V / Cmd+V) — fonctionne sur la plupart des navigateurs sans permission spéciale
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

$('#btnSaveAnnotated').addEventListener('click', async () => {
  if (!state.numero) { toast("Créez d'abord un dossier."); return; }
  canvas.toBlob(async (blob) => {
    const filename = `capture-annotee-${Date.now()}.png`;
    const form = new FormData();
    form.append('files', blob, filename);
    form.append('onglet', 'mise-a-jour');
    try {
      await fetch(`${API}/api/dossier/${state.numero}/upload`, { method: 'POST', body: form });
      let localMsg = '';
      if (state.dossierDirHandle) {
        const namedBlob = new File([blob], filename, { type: 'image/png' });
        const ok = await writeFileToLocalFolder('mise-a-jour', namedBlob);
        if (ok) localMsg = ' (+ copiée localement)';
      }
      toast(`Image annotée enregistrée dans « Mise à jour »${localMsg}.`);
      refreshFileList('mise-a-jour');
      updateFilesCount();
      syncLocalTrackingFile();
    } catch (err) { toast('Erreur lors de l\'enregistrement de l\'image.'); }
  }, 'image/png');
});

// ---------- Approbation ----------
$('#btnApprove').addEventListener('click', async () => {
  const id = $('#fldEmployeeId').value.trim();
  const role = $('#fldRole').value;
  if (!id) { toast("Entrez votre identifiant d'employé."); return; }
  if (!state.numero) { toast("Créez d'abord un dossier."); return; }
  try {
    const res = await fetch(`${API}/api/dossier/${state.numero}/approbation`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: id, role }),
    });
    const data = await res.json();
    refreshApprovals(data.approbations);
    toast(`Dossier approuvé par ${id}.`);
    $('#fldEmployeeId').value = '';
    syncLocalTrackingFile();
  } catch (err) { toast("Erreur lors de l'approbation."); }
});

function refreshApprovals(list) {
  const el = $('#approvalHistory');
  if (!list || !list.length) { el.innerHTML = '<div class="empty-state">Aucune approbation enregistrée pour ce dossier.</div>'; return; }
  el.innerHTML = list.slice().reverse().map((a) => `
    <div class="approval-row">
      <span class="badge-ok">✓</span>
      <span class="who">${a.employeeId} <span style="color:var(--color-text-faint);font-weight:400;">(${a.role})</span></span>
      <span class="when">${new Date(a.at).toLocaleString('fr-CA')}</span>
    </div>`).join('');
}
