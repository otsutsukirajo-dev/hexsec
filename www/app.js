// =========================================================================
// PointagePro - app.js (Version Corrigée)
// =========================================================================

console.log("[PointagePro] 🚀 Démarrage de l'application...");

// --- Variables globales ---
let db = null;
let isScanning = false;
let html5QrCode = null;
let currentUser = null;
let EMPLOYEES = JSON.parse(localStorage.getItem('POINTAGEPRO_USERS')) || [];
let ALL_POINTAGES = JSON.parse(localStorage.getItem('POINTAGEPRO_POINTAGES')) || [];
let pendingPointages = JSON.parse(localStorage.getItem('POINTAGEPRO_PENDING')) || [];
let myPointages = [];
let isOnline = navigator.onLine;

const DB_POINTAGES_INDEX = '[id_employe+date]';

function getCurrentIsoDate() {
  return new Date().toISOString().split('T')[0];
}

function getCurrentTime() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
  const text = String(value ?? '');
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeQrData(qrData) {
  return String(qrData ?? '').trim();
}

function validateEmployeeIdentifier(value) {
  const normalized = normalizeQrData(value);
  return /^[A-Za-z0-9_-]{2,64}$/.test(normalized);
}

function validateQrCode(value) {
  const token = normalizeQrData(value);
  return token.length > 0 && token.length <= 64 && /^[A-Za-z0-9_-]+$/.test(token);
}

function debounce(fn, wait = 400) {
  let timeoutId = null;
  return (...args) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, wait);
  };
}

function buildPointageRecord(employe) {
  const employeeId = normalizeQrData(employe.identifiant ?? employe.id);
  const employeeName = String(employe.nom || employe.name || 'Employé inconnu').trim();
  const connected = navigator.onLine;

  if (!validateEmployeeIdentifier(employeeId)) {
    throw new Error('Identifiant employé invalide');
  }

  return {
    id_employe: employeeId,
    nom_complet: employeeName,
    timestamp: new Date().toISOString(),
    date: getCurrentIsoDate(),
    statut_presence: 'Présent',
    statut_sync: connected ? 'synchro' : 'en_attente',
    employeeId,
    employeeName,
    time: getCurrentTime(),
    gps: '18.8792° S, 47.5079° E (Antananarivo)',
    status: 'Présent',
    network: connected ? 'En ligne' : 'Hors-ligne',
    synced: connected
  };
}

function persistPointagesCache() {
  localStorage.setItem('POINTAGEPRO_POINTAGES', JSON.stringify(ALL_POINTAGES));
  localStorage.setItem('POINTAGEPRO_PENDING', JSON.stringify(pendingPointages));
}

async function refreshCachesFromDb() {
  if (!db) return;

  const records = await db.pointages.toArray();
  ALL_POINTAGES = records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  pendingPointages = ALL_POINTAGES.filter(
    p => p.synced === false || p.statut_sync === 'en_attente'
  );
  persistPointagesCache();
}

// =========================================================================
// 1. INITIALISATION BASE DE DONNÉES (IndexedDB via Dexie.js)
// =========================================================================
async function initDatabase() {
  if (typeof Dexie === 'undefined') {
    console.error("[DB] ❌ Dexie n'est pas chargé!");
    return false;
  }
  try {
    db = new Dexie("PointageProDB");
    db.version(1).stores({
      employes: '++id, identifiant, nom, email, poste, telephone, role, matricule, dateInscription',
      pointages: '++id, id_employe, [id_employe+date], nom_complet, timestamp, statut_presence, statut_sync, date'
    });

    await db.open();
    console.log("[DB] ✅ Base de données prête");

    if (ALL_POINTAGES.length > 0) {
      const existingCount = await db.pointages.count();
      if (existingCount === 0) {
        const cachedPointages = ALL_POINTAGES.map(p => ({
          id_employe: p.employeeId,
          nom_complet: p.employeeName,
          timestamp: p.timestamp || new Date(`${p.date}T${p.time}`).toISOString(),
          date: p.date,
          statut_presence: p.status || 'Présent',
          statut_sync: p.synced ? 'synchro' : 'en_attente',
          employeeId: p.employeeId,
          employeeName: p.employeeName,
          time: p.time,
          gps: p.gps || '18.8792° S, 47.5079° E (Antananarivo)',
          status: p.status || 'Présent',
          network: p.network || (navigator.onLine ? 'En ligne' : 'Hors-ligne'),
          synced: p.synced !== false
        }));

        if (cachedPointages.length > 0) {
          await db.pointages.bulkAdd(cachedPointages).catch(e => {
            console.warn("[DB] Import localStorage → Dexie échoué", e);
          });
        }
      }
    }

    await refreshCachesFromDb();

    // Hooks pour rendre le tableau de bord réactif
    try {
      db.pointages.hook('creating', function (primKey, obj) {
        document.dispatchEvent(new CustomEvent('pointages-changed', { detail: obj }));
      });
      db.pointages.hook('updating', function (mods, primKey, obj) {
        document.dispatchEvent(new CustomEvent('pointages-changed', { detail: { primKey, mods } }));
      });
      db.pointages.hook('deleting', function (primKey) {
        document.dispatchEvent(new CustomEvent('pointages-changed', { detail: { primKey, deleted: true } }));
      });
    } catch (e) {
      console.warn("[DB] Hooks non supportés:", e);
    }

    return true;
  } catch (erreur) {
    console.error("[DB] ❌ Erreur:", erreur);
    return false;
  }
}

// =========================================================================
// 2. SCANNER QR CODE
// =========================================================================
async function startQRScanner() {
  if (isScanning) return;
  isScanning = true;

  const scanBtn = document.getElementById('scanBtn');
  const stopBtn = document.getElementById('stopScanBtn');
  const scannerBox = document.getElementById('scannerBox');
  const reader = document.getElementById('reader');

  if (scanBtn) scanBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'inline-flex';
  if (scannerBox) scannerBox.style.display = 'none';
  if (reader) reader.style.display = 'block';

  _activerModeScanner();

  // 1. Capacitor Native Scanner (pour APK)
  if (typeof Capacitor !== 'undefined' && Capacitor.Plugins?.BarcodeScanner) {
    try {
      const { BarcodeScanner } = Capacitor.Plugins;
      let perms = await BarcodeScanner.checkPermissions();
      if (perms.camera !== 'granted') {
        perms = await BarcodeScanner.requestPermissions();
        if (perms.camera !== 'granted') {
          showToast('Permission refusée', 'Activez la caméra dans les paramètres', 'red');
          stopQRScanner();
          return;
        }
      }
      await BarcodeScanner.hideBackground();
      const result = await BarcodeScanner.startScan({ targetedFormats: ['QR_CODE'] });
      if (result.hasContent) {
        traiterCodeScanne(result.displayValue || result.rawValue || result.content);
      }
      return;
    } catch (e) {
      console.warn("[Scanner] Capacitor échoué → fallback:", e.message);
    }
  }

  // 2. Fallback Html5Qrcode (pour navigateur)
  if (!reader) return stopQRScanner();
  reader.style.display = 'block';

  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("reader", { verbose: false });
  }

  try {
    const cameras = await Html5Qrcode.getCameras();
    const cameraId = cameras.length ? cameras[cameras.length - 1].id : undefined;
    const computedBox = Math.min(260, Math.max(120, Math.floor(window.innerWidth * 0.75)));

    await html5QrCode.start(
      cameraId,
      {
        fps: 12,
        qrbox: { width: computedBox, height: computedBox }
      },
      (decodedText) => {
        stopQRScanner();
        traiterCodeScanne(decodedText);
      },
      () => {}
    );
  } catch (err) {
    console.error("[Scanner] Erreur:", err);
    showToast('Caméra non détectée', 'Utilisez le mode simulation', 'amber');
    stopQRScanner();
  }
}

async function stopQRScanner() {
  isScanning = false;
  _desactiverModeScanner();

  const reader = document.getElementById('reader');
  const scannerBox = document.getElementById('scannerBox');
  const scanBtn = document.getElementById('scanBtn');
  const stopBtn = document.getElementById('stopScanBtn');

  if (html5QrCode?.isScanning) {
    await html5QrCode.stop().catch(() => {});
  }

  if (reader) reader.style.display = 'none';
  if (scannerBox) scannerBox.style.display = 'flex';
  if (scanBtn) scanBtn.style.display = 'inline-flex';
  if (stopBtn) stopBtn.style.display = 'none';
}

// =========================================================================
// 3. TRAITEMENT QR
// =========================================================================
function traiterCodeScanne(qrData) {
  handleQRScanned(qrData);
}

async function handleQRScanned(qrData) {
  const token = normalizeQrData(qrData);
  if (!validateQrCode(token)) {
    showToast('Erreur', 'QR Code invalide', 'red');
    return;
  }

  if (!db && (!EMPLOYEES || EMPLOYEES.length === 0)) {
    showToast('Erreur', 'Base de données indisponible', 'red');
    return;
  }

  try {
    let employe = EMPLOYEES.find(e => {
      const ident = normalizeQrData(e.identifiant ?? e.id);
      return ident === token;
    });

    if (!employe && db) {
      employe = await db.employes.where('identifiant').equals(token).first();
    }

    if (employe) {
      await enregistrerPointage(employe);
    } else {
      showToast('Erreur', 'Employé non trouvé', 'red');
    }
  } catch (err) {
    console.error('[QR] Erreur:', err);
    showToast('Erreur', 'Impossible de vérifier l\'employé', 'red');
  }
}

// =========================================================================
// 4. POINTAGE (avec anti-double pointage 24h)
// =========================================================================
function _activerModeScanner() {
  document.body.classList.add('barcode-scanner-active');
}

function _desactiverModeScanner() {
  document.body.classList.remove('barcode-scanner-active');
}

async function enregistrerPointage(employe) {
  const aujourdhui = getCurrentIsoDate();
  const pointageData = buildPointageRecord(employe);

  if (!db) {
    ALL_POINTAGES.unshift(pointageData);
    if (!pointageData.synced) {
      pendingPointages.unshift(pointageData);
    }
    persistPointagesCache();

    if (currentUser && pointageData.employeeId === currentUser.id) {
      myPointages.unshift(pointageData);
    }

    showToast('✅ Succès', `${pointageData.employeeName} — Pointage enregistré (mode fallback)`, 'green');
    if (typeof renderTodayTable === 'function') renderTodayTable();
    if (typeof renderManagerTable === 'function') renderManagerTable();
    if (typeof updateManagerStats === 'function') updateManagerStats();
    return;
  }

  try {
    const pointagesAujourdhui = await db.pointages
      .where(DB_POINTAGES_INDEX)
      .equals([pointageData.id_employe, aujourdhui])
      .toArray();

    if (pointagesAujourdhui.length > 0) {
      showToast(
        'Pointage refusé',
        `${pointageData.employeeName} a déjà pointé aujourd'hui. Attendez demain.`,
        'amber',
        'fa-exclamation-triangle'
      );
      return;
    }

    await db.pointages.add(pointageData);
    await refreshCachesFromDb();
    document.dispatchEvent(new CustomEvent('pointages-changed', { detail: pointageData }));

    if (currentUser && pointageData.employeeId === currentUser.id) {
      myPointages.unshift(pointageData);
    }

    if (!pointageData.synced) {
      pendingPointages.unshift(pointageData);
      persistPointagesCache();
    }

    showToast('✅ Succès', `${pointageData.employeeName} — Pointage enregistré`, 'green');
    chargerTableauDeBord();
    renderTodayTable();
    updateStats();
  } catch (err) {
    console.error("[Pointage] Erreur:", err);
    showToast('Erreur', 'Impossible d’enregistrer le pointage', 'red');
  }
}

// =========================================================================
// 5. DASHBOARD DYNAMIQUE
// =========================================================================
function chargerTableauDeBord() {
  // Wrapper compatible avec l'UI existante (index.html)
  if (typeof renderManagerTable === 'function') renderManagerTable();
  if (typeof renderTodayTable === 'function') renderTodayTable();
  if (typeof updateManagerStats === 'function') updateManagerStats();
}

const refreshDashboard = debounce(() => {
  if (document.getElementById('page-manager')?.classList.contains('active')) {
    chargerTableauDeBord();
  }
}, 600);

function setupDashboardRefresh() {
  setInterval(refreshDashboard, 6000);

  document.addEventListener('pointages-changed', () => {
    refreshDashboard();
  });

  const btn = document.getElementById('btn-rafraichir');
  if (btn) btn.addEventListener('click', chargerTableauDeBord);
}

// =========================================================================
// 6. TOAST NOTIFICATIONS
// =========================================================================
function showToast(title, msg, type = 'green', icon = 'fa-info-circle') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;

  const iconNode = document.createElement('i');
  iconNode.className = `fas ${icon} toast-icon`;

  const textNode = document.createElement('div');
  textNode.className = 'toast-text';

  const titleNode = document.createElement('div');
  titleNode.className = 'toast-title';
  titleNode.textContent = String(title);

  const msgNode = document.createElement('div');
  msgNode.className = 'toast-msg';
  msgNode.textContent = String(msg);

  textNode.appendChild(titleNode);
  textNode.appendChild(msgNode);
  el.appendChild(iconNode);
  el.appendChild(textNode);
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('exit');
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

// =========================================================================
// 7. INITIALISATION
// =========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log("[Init] 🚀 PointagePro prêt");

  await initDatabase();

  EMPLOYEES = JSON.parse(localStorage.getItem('POINTAGEPRO_USERS')) || [];
  if (!db) {
    ALL_POINTAGES = JSON.parse(localStorage.getItem('POINTAGEPRO_POINTAGES')) || [];
    pendingPointages = JSON.parse(localStorage.getItem('POINTAGEPRO_PENDING')) || [];
  }

  // Initialiser currentUser depuis le stockage local si possible
  // Initialiser currentUser uniquement depuis la valeur persistée (pas de fallback automatique)
  currentUser = EMPLOYEES.find(u => u.id === localStorage.getItem('POINTAGEPRO_CURRENT_USER')) || null;
  if (currentUser) myPointages = ALL_POINTAGES.filter(p => p.employeeId === currentUser.id);

  const scanBtn = document.getElementById('scanBtn');
  if (scanBtn) scanBtn.addEventListener('click', startQRScanner);

  setupDashboardRefresh();
  chargerTableauDeBord();

  window.addEventListener('online', () => {
    isOnline = true;
    showToast('Connexion rétablie', 'Vous êtes en ligne', 'green');
    if (pendingPointages.length > 0) {
      forceSync();
    }
  });

  window.addEventListener('offline', () => {
    isOnline = false;
    showToast('Mode hors-ligne', 'Données sauvegardées localement', 'amber');
  });

  console.log("[Init] ✅ Application initialisée");
});

// =========================================================================
// 8. FONCTIONS SUPPLÉMENTAIRES (pour l'UI existante)
// =========================================================================
function renderTodayTable() {
  const el = document.getElementById('todayTable');
  if (!el) return;

  const todayStr = getCurrentIsoDate();
  const todayPointages = ALL_POINTAGES.filter(p => p.date === todayStr);

  if (todayPointages.length === 0) {
    el.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:24px;">Aucun pointage aujourd'hui</td></tr>`;
    return;
  }

  el.innerHTML = todayPointages.map(p => {
    const emp = EMPLOYEES.find(e => normalizeQrData(e.identifiant ?? e.id) === p.employeeId);
    const empName = emp ? emp.name : p.employeeName;
    const initials = escapeHtml(empName).split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const net = p.network === 'Hors-ligne' ? 'badge-amber' : 'badge-blue';
    const st = p.status === 'Présent' ? 'badge-green' : p.status === 'Retard' ? 'badge-amber' : 'badge-red';

    return `
      <tr>
        <td><div class="td-name"><div class="td-avatar">${escapeHtml(initials)}</div><span style="font-weight:600">${escapeHtml(empName)}</span></div></td>
        <td style="font-family:var(--font-mono);font-weight:700">${escapeHtml(p.time)}</td>
        <td style="font-size:12px;color:var(--text-2)">${escapeHtml(p.gps)}</td>
        <td><span class="badge ${escapeHtml(net)}">${escapeHtml(p.network)}</span></td>
        <td><span class="badge ${escapeHtml(st)}">${escapeHtml(p.status)}</span></td>
      </tr>`;
  }).join('');
}

function updateStats() {
  const present = myPointages.filter(p => p.status === 'Présent').length;
  const retard = myPointages.filter(p => p.status === 'Retard').length;
  const absent = myPointages.filter(p => p.status === 'Absent').length;
  const total = myPointages.length;
  const taux = total > 0 ? Math.round(((present + retard) / total) * 100) + '%' : '—';

  if (document.getElementById('countPresent')) document.getElementById('countPresent').textContent = present;
  if (document.getElementById('countRetard')) document.getElementById('countRetard').textContent = retard;
  if (document.getElementById('countAbsent')) document.getElementById('countAbsent').textContent = absent;
  if (document.getElementById('tauxPresence')) document.getElementById('tauxPresence').textContent = taux;
}

async function forceSync() {
  if (pendingPointages.length === 0) {
    showToast('Synchronisation', 'Aucun pointage en attente', 'green');
    return;
  }

  const syncedCount = pendingPointages.length;

  if (db) {
    for (const p of pendingPointages) {
      try {
        await db.pointages
          .where(DB_POINTAGES_INDEX)
          .equals([p.employeeId, p.date])
          .filter(record => record.timestamp === p.timestamp)
          .modify({ statut_sync: 'synchro' });
      } catch (e) {
        console.warn('[Sync] Mise à jour Dexie échouée pour', p, e);
      }
    }
  }

  pendingPointages.forEach(p => {
    p.synced = true;
    p.statut_sync = 'synchro';
    const orig = ALL_POINTAGES.find(o => o.time === p.time && o.employeeId === p.employeeId && o.date === p.date);
    if (orig) {
      orig.synced = true;
      orig.statut_sync = 'synchro';
    }
  });

  pendingPointages = [];
  persistPointagesCache();

  if (document.getElementById('syncStatus')) {
    document.getElementById('syncStatus').textContent = '✅ Synchronisé';
  }
  if (document.getElementById('syncInfo')) {
    document.getElementById('syncInfo').textContent = '0 pointage(s) en attente';
  }
  if (document.getElementById('pendingCount')) {
    document.getElementById('pendingCount').textContent = '0 en attente';
  }
  if (document.getElementById('offlineBanner')) {
    document.getElementById('offlineBanner').classList.remove('show');
  }

  showToast('Synchronisation', `${syncedCount} pointage(s) synchronisé(s)`, 'green');
}
