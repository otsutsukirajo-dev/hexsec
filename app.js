// =========================================================================
// 1. INITIALISATION DE LA BASE DE DONNÉES LOCALE (IndexedDB via Dexie)
// =========================================================================
const db = new Dexie("PointageProDB");

// Schéma de production adapté pour l'Offline-First avec gestion des absences
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
    event.preventDefault(); // Bloque le rechargement automatique de la page

    try {
      // 1. Récupération dynamique des inputs de l'interface graphique
      const nomComplet = document.getElementById('nom-complet-input').value.trim();
      const email = document.getElementById('email-input').value.trim();
      const departement = document.getElementById('departement-input').value.trim();
      const telephone = document.getElementById('telephone-input').value.trim();
      
      // Récupération sécurisée du bouton radio sélectionné
      const radioRole = document.querySelector('input[name="role"]:checked');
      const roleCoche = radioRole ? radioRole.value : 'Employé';

      // Validation rapide
      if (!nomComplet || !email) {
        alert("Veuillez remplir au moins le nom complet et l'adresse email.");
        return;
      }

      // 2. Génération de l'identifiant unique hors-ligne robuste
      const identifiantUnique = 'PTG-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

      // 3. Écriture directe dans IndexedDB
      await db.employes.add({
        identifiant: identifiantUnique,
        nom: nomComplet,
        email: email,
        departement: departement,
        telephone: telephone,
        role: roleCoche,
        dateInscription: new Date().toISOString()
      });

      console.log(`[IndexedDB] Employé stocké avec succès. ID : ${identifiantUnique}`);

      // 4. Injection et affichage du QR Code sur le badge
      if (typeof genererQRCodeEmploye === "function") {
        genererQRCodeEmploye(identifiantUnique);
      } else {
        console.error("La fonction 'genererQRCodeEmploye' est introuvable. Vérifie l'ordre de tes scripts.");
      }

      alert("Inscription validée localement ! Le QR Code a été généré sur le badge.");
      formInscription.reset();

    } catch (erreur) {
      console.error("[Erreur Critique] Échec de la sauvegarde locale IndexedDB :", erreur);
      alert("Erreur lors de l'enregistrement local sur le PC. Vérifiez la console.");
    }
  });
} else {
  // Avertissement normal si l'application démarre sur l'onglet Connexion
  console.warn("[Attention] Le formulaire HTML avec l'ID 'formulaire-inscription' est introuvable sur la vue actuelle.");
}

// =========================================================================
// 3. LOGIQUE DU SCANNER WEB NATIF AVEC JSQR (SANS PLUGIN EXTEME)
// =========================================================================
let localStream = null;
let animationFrameId = null;

async function startQRScanner() {
  const video = document.getElementById('video-preview');
  const statutTexte = document.getElementById('statut-texte');
  const scannerIcon = document.getElementById('scannerIcon');
  const scanBtn = document.getElementById('scanBtn');
  const stopScanBtn = document.getElementById('stopScanBtn');

  try {
    // 1. Demande l'accès direct au capteur arrière du smartphone
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: "environment" } 
    });
    
    if (video) {
      video.srcObject = localStream;
    }
    
    // 2. Ajustements visuels de l'interface
    if (scannerIcon) scannerIcon.style.display = 'none'; // Cache l'icône QR pour voir la vidéo
    if (scanBtn) scanBtn.style.display = 'none';         // Cache le bouton "Activer"
    if (stopScanBtn) stopScanBtn.style.display = 'block'; // Affiche le bouton "Arrêter"
    if (statutTexte) statutTexte.innerText = "Caméra active. Alignez le QR Code.";

    // 3. Préparation d'un Canvas en arrière-plan pour extraire les images de la caméra
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    // Boucle d'analyse en temps réel (frame par frame)
    function analyserFrame() {
      if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        
        // Appel de la bibliothèque locale jsQR
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        // Si jsQR détecte un QR code valide !
        if (code) {
          console.log(`[jsQR] Code détecté : ${code.data}`);
          
          // On éteint immédiatement la caméra
          stopQRScanner();
          
          // On envoie la valeur (le jeton) directement à ta fonction existante
          onScanSuccess(code.data);
          return; 
        }
      }
      // Tant qu'aucun QR code n'est trouvé, on demande l'image suivante
      animationFrameId = requestAnimationFrame(analyserFrame);
    }
    
    animationFrameId = requestAnimationFrame(analyserFrame);

  } catch (err) {
    console.error("[Camera] Erreur d'accès : ", err);
    if (statutTexte) statutTexte.innerText = "Erreur caméra : " + err.message;
    alert("Impossible d'accéder à l'appareil photo. Vérifiez les autorisations.");
  }
}

function stopQRScanner() {
  const scannerIcon = document.getElementById('scannerIcon');
  const scanBtn = document.getElementById('scanBtn');
  const stopScanBtn = document.getElementById('stopScanBtn');
  const statutTexte = document.getElementById('statut-texte');
  const video = document.getElementById('video-preview');

  // Arrêt physique du flux de la caméra
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  // Arrêt de la boucle d'analyse d'images
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (video) {
    video.srcObject = null;
  }

  // Remise à zéro de l'interface graphique
  if (scannerIcon) scannerIcon.style.display = 'block';
  if (scanBtn) scanBtn.style.display = 'block';
  if (stopScanBtn) stopScanBtn.style.display = 'none';
  if (statutTexte) statutTexte.innerText = "Prêt à scanner";
}

// Fonction de secours obligatoire pour que ton application ne plante pas au chargement initial
function lancerBornePointage() {
  console.log("[PointagePro] Le scanner autonome jsQR est paré.");
}
// =========================================================================
// 4. SYNC MODULE : DÉTECTION RÉSEAU & ENVOI AUTOMATIQUE DES POINTAGES
// =========================================================================
async function synchroniserPointagesAttente() {
  if (!navigator.onLine) {
    console.log("[Sync] Mode Hors-ligne : Synchronisation reportée.");
    return;
  }

  try {
    const pointagesEnAttente = await db.pointages.where('statut_sync').equals('en_attente').toArray();

    if (pointagesEnAttente.length === 0) {
      console.log("[Sync] Rien à synchroniser. Tous les pointages sont à jour.");
      return;
    }

    console.log(`[Sync] Connexion détectée ! Envoi de ${pointagesEnAttente.length} pointage(s)...`);

    const RESPONSE = await fetch('https://api.votre-serveur.com/pointages/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pointagesEnAttente)
    });

    if (RESPONSE.ok) {
      console.log("[Sync] Serveur mis à jour avec succès !");
      for (const pointage of pointagesEnAttente) {
        await db.pointages.update(pointage.id, { statut_sync: 'synchronise' });
      }
      console.log("[Sync] Base locale mise à jour ('synchronise').");
      
      if (typeof chargerTableauDeBord === "function") {
        chargerTableauDeBord();
      }
    } else {
      console.warn("[Sync] Erreur serveur. Nouvelle tentative au prochain cycle.");
    }

  } catch (erreur) {
    console.error("[Sync] Serveur injoignable (Hors-ligne simulé) :", erreur);
  }
}

// =========================================================================
// 5. INTERFACE RH : TABLEAU DE BORD & EXPORTATION CSV
// =========================================================================
async function chargerTableauDeBord() {
  const tbody = document.getElementById('table-pointages-body');
  if (!tbody) return; // Évite les erreurs si l'onglet RH n'est pas ouvert

  const tousLesPointages = await db.pointages.toArray();
  tousLesPointages.reverse(); // Derniers pointages en haut

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
  console.log("[Absences] Vérification des présences de la veille...");

  try {
    const hier = new Date();
    hier.setDate(hier.getDate() - 1);
    const dateHierStr = hier.toISOString().split('T')[0]; // Format YYYY-MM-DD

    const listeEmployes = await db.employes.toArray();
    if (listeEmployes.length === 0) return;

    for (const employe of listeEmployes) {
      // On cherche si l'employé a un enregistrement quelconque pour hier
      const aPointeHier = await db.pointages
        .where('id_employe').equals(employe.identifiant)
        .and(p => p.timestamp.startsWith(dateHierStr))
        .first();

      // S'il n'existe rien, on crée son absence automatique
      if (!aPointeHier) {
        await db.pointages.add({
          id_employe: employe.identifiant,
          nom_complet: employe.nom,
          timestamp: `${dateHierStr}T23:59:59.000Z`,
          statut_presence: 'Absent',
          statut_sync: 'en_attente'
        });
        console.log(`[Absences] Absence enregistrée automatiquement : ${employe.nom}`);
      }
    }

    await chargerTableauDeBord();

  } catch (erreur) {
    console.error("[Absences] Erreur lors de la génération automatique :", erreur);
  }
}

// =========================================================================
// 7. ÉCOUTEURS D'ÉVÉNEMENTS & INITIALISATION GÉNÉRALE
// =========================================================================
window.addEventListener('online', () => {
  console.log("[Réseau] Connexion Internet rétablie !");
  setTimeout(synchroniserPointagesAttente, 2000);
});

window.addEventListener('offline', () => {
  console.warn("[Réseau] Basculement en mode Hors-ligne.");
});

document.addEventListener("DOMContentLoaded", () => {
  // Démarre les composants de la borne
  lancerBornePointage();
  chargerTableauDeBord();
  verifierEtGenererAbsences();

  // Écouteurs pour le tableau de bord RH
  const btnRafraichir = document.getElementById('btn-rafraichir');
  const btnExport = document.getElementById('btn-export');
  if (btnRafraichir) btnRafraichir.addEventListener('click', chargerTableauDeBord);
  if (btnExport) btnExport.addEventListener('click', exporterPointagesEnCSV);

  // Routines automatiques
  setInterval(synchroniserPointagesAttente, 30000); // Check réseau toutes les 30s
  setInterval(verifierEtGenererAbsences, 86400000); // Check absences toutes les 24h
});