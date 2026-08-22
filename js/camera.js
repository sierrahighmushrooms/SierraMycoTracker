// Camera-based QR scanning. Handles both the standalone scanner modal and
// the in-modal G2G camera scan.

import { db } from './db.js';

let html5QrcodeScanner = null; // standalone scanner modal instance
let html5QrCode = null;        // G2G in-modal scanner instance
let html5QrCodeSpawnBulk = null; // Spawn to Bulk in-modal scanner instance
let html5QrCodeSale = null;      // Record Sale in-modal scanner instance

// --- Standalone scanner modal ---
export async function startScanner() {
  const modal = document.getElementById('scanner-modal') || document.getElementById('qr-scanner-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  const readerEl = document.getElementById('qr-reader');
  if (readerEl) {
    readerEl.innerHTML = '';
  }

  try {
    if (html5QrcodeScanner) {
      try {
        if (html5QrcodeScanner.isScanning) {
          await html5QrcodeScanner.stop();
        }
        html5QrcodeScanner.clear();
      } catch (err) {
        console.warn("Error resetting existing scanner instance:", err);
      }
      html5QrcodeScanner = null;
      window.html5QrcodeScannerInstance = null;
    }

    html5QrcodeScanner = new Html5Qrcode('qr-reader');
    window.html5QrcodeScannerInstance = html5QrcodeScanner;

    await html5QrcodeScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        stopScanner();
        let targetId = decodedText;
        if (decodedText.includes('#container=')) {
          targetId = decodedText.split('#container=')[1];
        } else if (decodedText.includes('#item=')) {
          targetId = decodedText.split('#item=')[1];
        } else if (decodedText.includes('/container/')) {
          targetId = decodedText.split('/container/')[1];
        }
        const matched = db.items.find(i => i.id === targetId || i.code === targetId || i.custom_id === targetId);
        if (matched) {
          targetId = matched.id;
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
  } catch (err) {
    console.warn("Camera permission denied or camera unavailable:", err);
    // Display user-friendly inline notice inside #qr-reader
    const readerEl = document.getElementById('qr-reader');
    if (readerEl) {
      readerEl.innerHTML = `
        <div class="p-4 text-center text-amber-400 text-sm">
          ⚠️ Camera access was denied or is unavailable. Please grant camera permissions in your browser bar and try again.
        </div>`;
    }
  }
}

export async function stopScanner() {
  const scanner = html5QrcodeScanner || window.html5QrcodeScannerInstance;
  if (scanner) {
    try {
      // Only stop if actively scanning
      if (scanner.isScanning) {
        await scanner.stop();
      }
      scanner.clear();
    } catch (err) {
      console.warn("Error stopping scanner instance:", err);
    } finally {
      html5QrcodeScanner = null;
      window.html5QrcodeScannerInstance = null;
    }
  }
  // Always hide modal and restore page scroll regardless of scanner status
  const modal = document.getElementById('scanner-modal') || document.getElementById('qr-scanner-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

window.startScanner = startScanner;
window.stopScanner = stopScanner;

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
      let scannedVal = decodedText;
      if (decodedText.includes('#container=')) {
        scannedVal = decodedText.split('#container=')[1];
      } else if (decodedText.includes('#item=')) {
        scannedVal = decodedText.split('#item=')[1];
      } else if (decodedText.includes('/container/')) {
        scannedVal = decodedText.split('/container/')[1];
      }
      window.handleG2GScanInput({ key: 'Enter', target: { value: scannedVal } });
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

// --- Spawn to Bulk in-modal camera scan ---
export function startSpawnBulkCameraScan() {
  if (html5QrCodeSpawnBulk) return;
  const container = document.getElementById('spawn-bulk-camera-container');
  if (!container) return;

  container.classList.remove('hidden');

  html5QrCodeSpawnBulk = new Html5Qrcode('spawn-bulk-qr-reader');
  html5QrCodeSpawnBulk.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 200, height: 200 } },
    (decodedText) => {
      // Successfully decoded a QR code -> push through the scan entry pipeline
      let scannedVal = decodedText;
      if (decodedText.includes('#container=')) {
        scannedVal = decodedText.split('#container=')[1];
      } else if (decodedText.includes('#item=')) {
        scannedVal = decodedText.split('#item=')[1];
      } else if (decodedText.includes('/container/')) {
        scannedVal = decodedText.split('/container/')[1];
      }
      if (typeof window.handleSpawnBulkScanInput === 'function') {
        window.handleSpawnBulkScanInput({ key: 'Enter', target: { value: scannedVal } });
      }
      // Release camera hardware and hide the scanner UI
      stopSpawnBulkCameraScan();
    },
    () => { /* ignore decoding errors */ }
  ).catch((err) => {
    console.error('Could not start webcam scanner:', err);
    html5QrCodeSpawnBulk = null;
    container.classList.add('hidden');
    alert('Could not start camera: ' + err);
  });
}

export function stopSpawnBulkCameraScan() {
  if (html5QrCodeSpawnBulk) {
    html5QrCodeSpawnBulk.stop().then(() => {
      html5QrCodeSpawnBulk.clear();
      html5QrCodeSpawnBulk = null;
      const container = document.getElementById('spawn-bulk-camera-container');
      if (container) container.classList.add('hidden');
    }).catch(() => {
      html5QrCodeSpawnBulk = null;
      const container = document.getElementById('spawn-bulk-camera-container');
      if (container) container.classList.add('hidden');
    });
  } else {
    const container = document.getElementById('spawn-bulk-camera-container');
    if (container) container.classList.add('hidden');
  }
}

// --- Record Sale in-modal camera scan ---
export function startSaleCameraScan() {
  if (html5QrCodeSale) return;
  const container = document.getElementById('sale-camera-container');
  if (!container) return;

  container.classList.remove('hidden');

  html5QrCodeSale = new Html5Qrcode('sale-qr-reader');
  html5QrCodeSale.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    (decodedText) => {
      let scannedVal = decodedText;
      if (decodedText.includes('#container=')) {
        scannedVal = decodedText.split('#container=')[1];
      } else if (decodedText.includes('#item=')) {
        scannedVal = decodedText.split('#item=')[1];
      } else if (decodedText.includes('/container/')) {
        scannedVal = decodedText.split('/container/')[1];
      }
      if (typeof window.handleSaleQRScanned === 'function') {
        window.handleSaleQRScanned(scannedVal);
      }
      stopSaleCameraScan();
    },
    () => { /* ignore frame errors */ }
  ).catch((err) => {
    console.error('Could not start sale webcam scanner:', err);
    html5QrCodeSale = null;
    container.classList.add('hidden');
    if (typeof showToast === 'function') {
      showToast('Camera error: ' + err, 'error');
    } else {
      alert('Could not start camera: ' + err);
    }
  });
}

export function stopSaleCameraScan() {
  if (html5QrCodeSale) {
    html5QrCodeSale.stop().then(() => {
      html5QrCodeSale.clear();
      html5QrCodeSale = null;
      const container = document.getElementById('sale-camera-container');
      if (container) container.classList.add('hidden');
    }).catch(() => {
      html5QrCodeSale = null;
      const container = document.getElementById('sale-camera-container');
      if (container) container.classList.add('hidden');
    });
  } else {
    const container = document.getElementById('sale-camera-container');
    if (container) container.classList.add('hidden');
  }
}

window.startSaleCameraScan = startSaleCameraScan;
window.stopSaleCameraScan = stopSaleCameraScan;
