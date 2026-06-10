// =========================================================================
// 1. INITIALISATION DE LA BASE DE DONNÉES LOCALE (IndexedDB via Dexie)
// =========================================================================
const db = new Dexie("PointageProDB");

db.version(1).stores({
  employes: '++id, identifiant, nom, email, departement, telephone, role, dateInscription',
  pointages: '++id, id_employe, nom_complet, timestamp, statut_presence, statut_sync'
});

console.log("[PointagePro] Base de données locale IndexedDB prête.");

// =========================================================================
// 2. LOGIQUE D'INSCRIPTION ET SAUVEGARDE HORS-LIGNE
// =========================================================================
const formInscription = document.getElementById('formulaire-inscription');

if (formInscription) {
  formInscription.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const nomComplet = document.getElementById('nom-complet-input').value.trim();
      const email = document.getElementById('email-input').value.trim();
      const departement = document.getElementById('departement-input').value.trim();
      const telephone = document.getElementById('telephone-input').value.trim();
      const radioRole = document.querySelector('input[name="role"]:checked');
      const roleCoche = radioRole ? radioRole.value : 'Employé';

      if (!nomComplet || !email) {
        alert("Veuillez remplir au moins le nom complet et l'adresse email.");
        return;
      }

      const identifiantUnique = 'PTG-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

      await db.employes.add({
        identifiant: identifiantUnique,
        nom: nomComplet,
        email: email,
        departement: departement,
        telephone: telephone,
        role: roleCoche,
        dateInscription: new Date().toISOString()
      });

      if (typeof genererQRCodeEmploye === "function") {
        genererQRCodeEmploye(identifiantUnique);
      }
      alert("Inscription validée localement !");
      formInscription.reset();
    } catch (erreur) {
      console.error("[Erreur Critique] IndexedDB :", erreur);
    }
  });
}

// =========================================================================
// 3. LOGIQUE DU SCANNER NATIF OFFICIEL (CAPACITOR 8+)
//    ✅ Utilise Capacitor.Plugins.BarcodeScanner (plugin natif Android/iOS)
//    ✅ La caméra s'affiche DERRIÈRE la WebView (background transparent)
//    ✅ Aucun flux vidéo Web (WebRTC/getUserMedia/html5-qrcode) n'est utilisé
// =========================================================================
let isScanning = false;

/**
 * Applique la transparence sur la WebView et masque les éléments d'UI
 * pour laisser la caméra native apparaître en arrière-plan.
 */
function _activerModeScanner() {
  document.body.classList.add('barcode-scanner-active');

  const scanBtn = document.getElementById('scanBtn');
  const stopScanBtn = document.getElementById('stopScanBtn');
  const scannerBox = document.getElementById('scannerBox');

  if (scanBtn) scanBtn.style.display = 'none';
  if (stopScanBtn) stopScanBtn.style.display = 'inline-flex';
  if (scannerBox) scannerBox.style.display = 'flex';
}

/**
 * Retire la transparence et restaure l'état visuel initial de l'application.
 * Appelé dans tous les cas : succès, erreur, ou annulation manuelle.
 */
function _desactiverModeScanner() {
  document.body.classList.remove('barcode-scanner-active');

  const scanBtn = document.getElementById('scanBtn');
  const stopScanBtn = document.getElementById('stopScanBtn');
  const scannerBox = document.getElementById('scannerBox');

  if (scanBtn) scanBtn.style.display = 'inline-flex';
  if (stopScanBtn) stopScanBtn.style.display = 'none';
  if (scannerBox) scannerBox.style.display = 'flex';

  isScanning = false;
}

/**
 * Logique métier globale pour le traitement du QR Code scanné.
 */
function traiterCodeScanne(qrData) {
  console.log(`[PointagePro] ✅ Traitement du code détecté : ${qrData}`);
  if (typeof handleQRScanned === 'function') {
    handleQRScanned(qrData);
  } else if (typeof onScanSuccess === 'function') {
    onScanSuccess(qrData);
  }
}

/**
 * Lance le scanner QR Code natif Capacitor.
 * Gestion complète : permissions, transparence, lecture, nettoyage.
 */
async function startQRScanner() {
  if (isScanning) return;
  isScanning = true;

  const plugin = (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.BarcodeScanner)
    ? Capacitor.Plugins.BarcodeScanner
    : null;

  if (!plugin) {
    console.warn("[Scanner] Plugin Capacitor BarcodeScanner introuvable. Mode démo activé.");
    isScanning = false;
    if (typeof showToast === 'function') {
      showToast(
        'Plugin non disponible',
        'BarcodeScanner natif absent. Utilisez le bouton "Simuler" ou testez sur appareil Android.',
        'amber',
        'fa-exclamation-triangle'
      );
    }
    return;
  }

  try {
    // Vérification et demande des permissions caméra natives
    const permissions = await plugin.checkPermissions();
    if (permissions.camera !== 'granted') {
      const request = await plugin.requestPermissions();
      if (request.camera !== 'granted') {
        if (typeof showToast === 'function') {
          showToast(
            'Permission refusée',
            'Activez la permission Caméra dans les paramètres de votre appareil.',
            'red',
            'fa-video-slash'
          );
        }
        isScanning = false;
        return;
      }
    }

    // Rendre la WebView transparente (caméra native en fond)
    _activerModeScanner();
    await plugin.hideBackground();

    if (typeof showToast === 'function') {
      showToast('Scanner actif', 'Alignez le QR Code dans la zone de visée', 'green', 'fa-qrcode');
    }

    // Lancer le scan natif (bloquant jusqu'à lecture ou annulation)
    const result = await plugin.startScan();

    if (result) {
      let qrData = null;

      if (result.barcodes && result.barcodes.length > 0) {
        qrData = result.barcodes[0].displayValue || result.barcodes[0].rawValue;
      } else if (result.hasContent && result.content) {
        qrData = result.content;
      } else if (typeof result === 'string' && result.length > 0) {
        qrData = result;
      }

      if (qrData) {
        traiterCodeScanne(qrData);
      } else {
        console.log("[Scanner Natif] Aucun contenu lu.");
      }
    }
  } catch (erreur) {
    console.error("[Scanner Natif] Erreur lors du scan :", erreur);
    if (typeof showToast === 'function') {
      showToast('Erreur Scanner', 'Impossible de lancer le scanner natif.', 'red', 'fa-exclamation-triangle');
    }
  } finally {
    // Nettoyage de sécurité garanti dans tous les cas
    try {
      await plugin.showBackground();
    } catch (e) {
      console.warn("[Scanner] showBackground ignoré :", e);
    }
    _desactiverModeScanner();
  }
}

/**
 * Arrête le scanner natif Capacitor et restaure l'interface.
 */
async function stopQRScanner() {
  const plugin = (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.BarcodeScanner)
    ? Capacitor.Plugins.BarcodeScanner
    : null;

  if (plugin) {
    try {
      await plugin.stopScan();
    } catch (e) {
      console.warn("[Scanner] stopScan ignoré :", e);
    }
    try {
      await plugin.showBackground();
    } catch (e) {
      console.warn("[Scanner] showBackground ignoré :", e);
    }
  }

  _desactiverModeScanner();
}

function lancerBornePointage() {
  console.log("[PointagePro] Borne configurée avec le scanner officiel Capacitor natif.");
}

// =========================================================================
// 4. SYNC MODULE : DÉTECTION RÉSEAU & ENVOI AUTOMATIQUE DES POINTAGES
// =========================================================================
async function synchroniserPointagesAttente() {
  if (!navigator.onLine) return;

  try {
    const pointagesEnAttente = await db.pointages.where('statut_sync').equals('en_attente').toArray();
    if (pointagesEnAttente.length === 0) return;

    const RESPONSE = await fetch('https://api.votre-serveur.com/pointages/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pointagesEnAttente)
    });

    if (RESPONSE.ok) {
      for (const pointage of pointagesEnAttente) {
        await db.pointages.update(pointage.id, { statut_sync: 'synchronise' });
      }
      if (typeof chargerTableauDeBord === "function") {
        chargerTableauDeBord();
      }
    }
  } catch (erreur) {
    console.error("[Sync] Serveur injoignable :", erreur);
  }
}

// =========================================================================
// 5. INTERFACE RH : TABLEAU DE BORD & EXPORTATION CSV
// =========================================================================
async function chargerTableauDeBord() {
  const tbody = document.getElementById('table-pointages-body');
  if (!tbody) return;

  const tousLesPointages = await db.pointages.toArray();
  tousLesPointages.reverse();

  tbody.innerHTML = "";

  if (tousLesPointages.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="padding: 15px; text-align: center; color: #64748b;">Aucun pointage enregistré.</td></tr>`;
    return;
  }

  tousLesPointages.forEach(p => {
    const dateFormatee = new Date(p.timestamp).toLocaleString('fr-FR');
    const iconeSync = p.statut_sync === 'synchronise' ? '🟢 Synchro' : '🟠 En attente';
    const estAbsent = p.statut_presence === 'Absent';
    const couleurStatut = estAbsent ? '#ef4444' : '#10b981';
    const textePresence = estAbsent ? '❌ Absent' : '✅ Présent';

    const ligne = document.createElement('tr');
    ligne.style.borderBottom = "1px solid #1e293b";
    if (estAbsent) ligne.style.backgroundColor = "rgba(239, 68, 68, 0.03)";

    ligne.innerHTML = `
      <td style="padding: 10px; font-weight: bold;">${p.nom_complet}</td>
      <td style="padding: 10px; color: #94a3b8;">${p.id_employe}</td>
      <td style="padding: 10px;">${dateFormatee}</td>
      <td style="padding: 10px; font-weight: bold; color: ${couleurStatut};">${textePresence} (${iconeSync})</td>
    `;
    tbody.appendChild(ligne);
  });
}

async function exporterPointagesEnCSV() {
  const pointages = await db.pointages.toArray();
  if (pointages.length === 0) {
    alert("Aucune donnée à exporter.");
    return;
  }

  let csvContent = "\uFEFFID Pointage;ID Employé;Nom Complet;Date/Heure;Statut Présence;Statut Synchro\n";
  pointages.forEach(p => {
    const date = new Date(p.timestamp).toLocaleString('fr-FR');
    csvContent += `${p.id};${p.id_employe};${p.nom_complet};${date};${p.statut_presence || 'Présent'};${p.statut_sync}\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Rapport_Pointages_${Date.now()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// =========================================================================
// 6. MODULE DE GÉNÉRATION AUTOMATIQUE DES ABSENCES (TOUTES LES 24H)
// =========================================================================
async function verifierEtGenererAbsences() {
  try {
    const hier = new Date();
    hier.setDate(hier.getDate() - 1);
    const dateHierStr = hier.toISOString().split('T')[0];

    const listeEmployes = await db.employes.toArray();
    if (listeEmployes.length === 0) return;

    for (const employe of listeEmployes) {
      const aPointeHier = await db.pointages
        .where('id_employe').equals(employe.identifiant)
        .and(p => p.timestamp.startsWith(dateHierStr))
        .first();

      if (!aPointeHier) {
        await db.pointages.add({
          id_employe: employe.identifiant,
          nom_complet: employe.nom,
          timestamp: `${dateHierStr}T23:59:59.000Z`,
          statut_presence: 'Absent',
          statut_sync: 'en_attente'
        });
      }
    }
    await chargerTableauDeBord();
  } catch (erreur) {
    console.error("[Absences] Erreur :", erreur);
  }
}

// =========================================================================
// 7. ÉCOUTEURS D'ÉVÉNEMENTS & INITIALISATION GÉNÉRALE
// =========================================================================
window.addEventListener('online', () => {
  setTimeout(synchroniserPointagesAttente, 2000);
});

document.addEventListener("DOMContentLoaded", () => {
  lancerBornePointage();
  chargerTableauDeBord();
  verifierEtGenererAbsences();

  const btnRafraichir = document.getElementById('btn-rafraichir');
  const btnExport = document.getElementById('btn-export');
  if (btnRafraichir) btnRafraichir.addEventListener('click', chargerTableauDeBord);
  if (btnExport) btnExport.addEventListener('click', exporterPointagesEnCSV);

  setInterval(synchroniserPointagesAttente, 30000);
  setInterval(verifierEtGenererAbsences, 86400000);
});