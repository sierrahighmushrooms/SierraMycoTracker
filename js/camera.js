// Camera-based QR scanning. Handles both the standalone scanner modal and
// the in-modal G2G camera scan.

import { db } from './db.js';

let html5QrcodeScanner = null; // standalone scanner modal instance
let html5QrCode = null;        // G2G in-modal scanner instance

// --- Standalone scanner modal ---
export function startScanner() {
  const modal = document.getElementById('scanner-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  html5QrcodeScanner = new Html5Qrcode('qr-reader');
  html5QrcodeScanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      stopScanner();
      let targetId = decodedText;
      if (decodedText.includes('#item=')) {
        targetId = decodedText.split('#item=')[1];
      }
      if (db.items.find(i => i.id === targetId)) {
        window.currentFilter = 'All';
        window.scannedItemId = targetId;
        window.render();
        setTimeout(() => {
          const card = document.getElementById(`card-${targetId}`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth' });
            card.classList.add('ring-4', 'ring-emerald-400');
            setTimeout(() => {
              card.classList.remove('ring-4', 'ring-emerald-400');
            }, 4000);
          }
        }, 150);
      } else {
        alert('ID not found: ' + targetId);
      }
    },
    () => {}
  );
}

export function stopScanner() {
  if (html5QrcodeScanner) html5QrcodeScanner.stop().catch(() => {});
  const modal = document.getElementById('scanner-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// --- G2G in-modal camera scan ---
export function startG2GCameraScan() {
  if (html5QrCode) return;
  const container = document.getElementById('g2g-camera-container');
  if (!container) return;

  container.classList.remove('hidden');

  html5QrCode = new Html5Qrcode('g2g-qr-reader');
  html5QrCode.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 200, height: 200 } },
    (decodedText) => {
      // Successfully decoded a QR code -> push through the scan entry pipeline
      window.handleG2GScanInput({ key: 'Enter', target: { value: decodedText } });
      // Release camera hardware and hide the scanner UI
      stopG2GCameraScan();
    },
    () => { /* ignore decoding errors */ }
  ).catch((err) => {
    console.error('Could not start webcam scanner:', err);
    html5QrCode = null;
    container.classList.add('hidden');
    alert('Could not start camera: ' + err);
  });
}

export function stopG2GCameraScan() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      html5QrCode = null;
      const container = document.getElementById('g2g-camera-container');
      if (container) container.classList.add('hidden');
    }).catch(() => {
      html5QrCode = null;
      const container = document.getElementById('g2g-camera-container');
      if (container) container.classList.add('hidden');
    });
  } else {
    const container = document.getElementById('g2g-camera-container');
    if (container) container.classList.add('hidden');
  }
}