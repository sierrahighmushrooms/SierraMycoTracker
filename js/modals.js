// Modal rendering & interaction logic for Sierra Myco Lab.

import {
  db,
  saveItems,
  getFeedback,
  submitFeedback,
  upvoteFeature,
  isSupabaseConfigured,
  getCurrentUser,
  getSession,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signOutUser,
  syncItemsWithCloud,
  pushLocalChangesToCloud,
  getSyncStatus,
  getContainerUsage,
  getProfilePlanInfo,
  getLocalActiveContainerCount,
  TIER_LIMITS,
  INACTIVE_STAGES,
  isContainerLimitError,
  getBillingInfo,
  getSubscriptionTiers,
  createLemonSqueezyCheckout,
  deleteItemsFromCloud
} from './db.js';
import { callGeminiAPI, extractActiveBatchContext, saveChatMessage, loadChatHistory, hasApiKey, getStoredApiKey, saveApiKey, clearApiKey, processAIResponseActions } from './ai.js';
import {
  getItemCategory,
  isLockedStage,
  getMediumType,
  updateModalActionVisibility,
  generateId,
  estimateDryYield,
  calculateCVGRecipe,
  getDrySubstrateWeightGrams,
  calculateBE
} from './utils.js';
import {
  APP_CONFIG,
  CONTAINER_STAGES,
  SUBSTRATE_STAGES,
  GRAIN_STAGES,
  getAppBaseUrl,
  isUsingTemporaryBaseUrl,
  PRINTER_TYPES,
  LABEL_TEMPLATES,
  resolveLabelTemplate,
  getLabelModelsForPrinterType
} from './config.js';

// --- Module-level modal state ---
let activeItemId = null;
let g2gScannedIds = [];

// --- Authentication Modal ---
// openAuthModal and closeAuthModal are defined later in this file
// (see "Modern SaaS Auth Modal" section) and exposed on window there.

function isValidUrl(url) {

  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

let printerType = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINTER_TYPE) || APP_CONFIG.DEFAULT_PRINTER_TYPE;
let labelModel = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.LABEL_MODEL) || APP_CONFIG.DEFAULT_LABEL_MODEL;
let printOffset = parseInt(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_OFFSET)) || APP_CONFIG.DEFAULT_PRINT_OFFSET;
let pendingPrintItems = null;


// Expose the active item id for other modules (e.g. app.js) without a circular import.
export function getActiveItemId() {
  return activeItemId;
}

// --- Generic modal open/close helpers ---
function showModal(element) {
  element.classList.remove('hidden');
  element.classList.add('flex');
}

function hideModal(element) {
  element.classList.add('hidden');
  element.classList.remove('flex');
}

// --- Single Item Detail Modal ---
export function openItemModal(id) {
  return openModal(id);
}

export function openModal(id) {
  activeItemId = id;
  const item = db.items.find(i => i.id === id);

  document.getElementById('modal-id').innerText = item.id;
  document.getElementById('modal-label').innerText = item.label;

  let parentText = item.parentItemId ? `Transferred from ${item.parentItemId}` : 'Spore/LC Generation 1';
  let genText = item.generation ? ` | Generation: ${item.generation}` : '';
  let containerInfo = item.containerType ? ` | Container: ${item.containerType}${item.containerWeight ? ` (${item.containerWeight})` : ''}` : '';
  document.getElementById('modal-lineage').innerText = `Batch: ${item.pcBatch} | ${parentText}${genText}${containerInfo}`;

  // Render Spawn Lineage badge for bulk substrate items with a captured parent spawn source
  const lineageBadge = document.getElementById('modal-lineage-badge');
  const spawnId = item.parentSpawnId || item.parentSourceId;
  if (lineageBadge) {
    if (spawnId) {
      const spawnName = item.parentSpawnName || spawnId;
      lineageBadge.innerHTML = `
        <div class="text-xs bg-slate-800 border border-slate-700 rounded p-2 my-2 text-slate-300">
          <span class="text-emerald-400 font-semibold">🧬 Spawn Lineage:</span>
          <a href="#" onclick="openModal('${spawnId}'); return false;" class="underline hover:text-emerald-300">${spawnName}</a>
        </div>
      `;
      lineageBadge.classList.remove('hidden');
    } else {
      lineageBadge.innerHTML = '';
      lineageBadge.classList.add('hidden');
    }
  }

  const inocBanner = document.getElementById('inoculate-banner');
  if (item.stage === 'Uninoculated') {
    inocBanner.classList.remove('hidden');
    document.getElementById('inoc-parent').innerHTML = `<option value="">Source: Spore / LC</option>` +
      db.items.filter(i => i.id !== id && i.stage !== 'Uninoculated' && !isLockedStage(i.stage)).map(i => `<option value="${i.id}">${i.id} - ${i.label}</option>`).join('');
  } else {
    inocBanner.classList.add('hidden');
  }

  if (item.breakAndShake) {
    document.getElementById('btn-break-shake').classList.add('hidden');
    document.getElementById('text-break-shake').classList.remove('hidden');
    document.getElementById('text-break-shake').innerText = `Shaken on: ${item.breakAndShake}`;
  } else {
    document.getElementById('btn-break-shake').classList.remove('hidden');
    document.getElementById('text-break-shake').classList.add('hidden');
  }

  document.getElementById('text-yield-total').innerText = `Total: ${item.totalYield || 0}g`;

  // Set Container Type dropdown and populate dynamic Stage options
  // Check both containerType and label for G2G-relevant keywords
  const ct = item.containerType || '';
  const labelStr = item.label || '';
  const g2gKeywords = ['Grain', 'Bag', 'Jar', 'Liquid Culture'];
  const hasG2GKeyword = g2gKeywords.some(k => ct.includes(k) || labelStr.includes(k));

  const modalContainerSelect = document.getElementById('modal-container-type');
  if (modalContainerSelect) {
    const validContainers = Object.keys(CONTAINER_STAGES);
    if (validContainers.includes(item.containerType)) {
      modalContainerSelect.value = item.containerType;
    } else if (hasG2GKeyword) {
      modalContainerSelect.value = 'Grain Jar / Bag';
    } else {
      modalContainerSelect.value = validContainers[0];
    }
  }
  // Determine medium type (substrate / grain / agar-lc) for stage sets & action buttons
  const mediumType = getMediumType(item);
  populateModalStageDropdown(modalContainerSelect ? modalContainerSelect.value : 'Agar Dish / Slant', item.stage, mediumType);

  // Toggle action buttons based on medium type and current stage
  updateModalActionVisibility(mediumType, item.stage, item);

  // Refresh the Flush Yield Tracking table and totals
  renderFlushYieldHistory(item);

  // Global lockout for inactive containers (Contaminated or Spent):
  // hide the active action buttons and stage transition form, show a prominent badge.
  const inactiveBadge = document.getElementById('modal-inactive-badge');
  const locked = isLockedStage(item.stage);
  if (inactiveBadge) {
    if (locked) {
      inactiveBadge.innerHTML = `<span class="bg-rose-900/50 text-rose-300 border border-rose-700 px-2 py-1 rounded text-xs font-bold">⚠️ Container Inactive (${item.stage})</span>`;
      inactiveBadge.classList.remove('hidden');
    } else {
      inactiveBadge.innerHTML = '';
      inactiveBadge.classList.add('hidden');
    }
  }
  const g2gBtn = document.getElementById('btn-g2g-transfer');
  const breakShakeBtn = document.getElementById('btn-break-shake');
  const stageForm = document.getElementById('stage-form');
  if (g2gBtn) g2gBtn.classList.toggle('hidden', locked || g2gBtn.classList.contains('hidden'));
  if (breakShakeBtn) breakShakeBtn.classList.toggle('hidden', locked || breakShakeBtn.classList.contains('hidden'));
  if (stageForm) stageForm.classList.toggle('hidden', locked);

  toggleContamFields();

  document.getElementById('modal-history').innerHTML = item.history.map(h => `
    <div class="text-xs border-b border-slate-800 pb-2 last:border-0">
      <div class="flex justify-between text-slate-400">
        <span class="font-bold ${h.stage === 'Contaminated' ? 'text-red-400' : 'text-emerald-400'}">${h.stage} <span class="text-slate-500 font-normal">${h.env}</span></span>
        <span>${h.timestamp}</span>
      </div>
      ${(h.temp !== undefined && h.temp !== null) || (h.humidity !== undefined && h.humidity !== null) ? `
        <div class="text-slate-500 mt-0.5">🌡️ ${h.temp !== undefined && h.temp !== null ? h.temp + '°F' : ''} ${h.humidity !== undefined && h.humidity !== null ? '| RH ' + h.humidity + '%' : ''}</div>
      ` : ''}
      ${h.notes ? `<p class="text-slate-300 mt-1">${h.notes}</p>` : ''}
    </div>
  `).join('');

  document.body.classList.add('overflow-hidden');

  showModal(document.getElementById('modal'));
}

export function closeModal() {
  hideModal(document.getElementById('modal'));
  document.body.classList.remove('overflow-hidden');
  activeItemId = null;
}

// --- View QR Code Modal ---
// Opens a focused dialog displaying the container's QR code, the code text,
// and a "Copy Link" button. The QR value uses the /container/{id} route format
// so scanned codes resolve directly to the live app URL.
export function openViewQRCodeModal() {
  const item = db.items.find(i => i.id === activeItemId);
  if (!item) return;

  const modal = document.getElementById('view-qr-modal');
  if (!modal) return;

  // Set container ID display
  const idEl = document.getElementById('view-qr-item-id');
  if (idEl) idEl.innerText = item.id;

  // Compute QR value — must be a non-empty string for the QR library
  const qrValue = item?.id ? `${getAppBaseUrl()}/container/${item.id}` : '';

  // Set link text
  const linkEl = document.getElementById('view-qr-link');
  if (linkEl) linkEl.innerText = qrValue || 'No valid container ID';

  // Render QR code or skeleton placeholder
  renderQRCodeWithSkeleton('view-qr-code', qrValue, 160);

  showModal(modal);
}

export function closeViewQRCodeModal() {
  hideModal(document.getElementById('view-qr-modal'));
}

// Copy the container's shareable link to the clipboard
export function copyQRCodeLink() {
  const item = db.items.find(i => i.id === activeItemId);
  if (!item) return;

  const link = `${getAppBaseUrl()}/container/${item.id}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('Link copied to clipboard!', 'success', 2000);
  }).catch(() => {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = link;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    showToast('Link copied to clipboard!', 'success', 2000);
  });
}

// Helper: Render a QR code with a skeleton placeholder when the value is empty.
// Uses the global qrcodejs library (QRCode constructor) loaded via CDN.
// When `value` is empty or falsy, a pulsing skeleton is shown instead of a
// blank white square, giving the user clear visual feedback.
function renderQRCodeWithSkeleton(containerId, value, size = 128) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Clear any existing content (including previously rendered QR codes)
  container.innerHTML = '';

  if (!value) {
    // Show skeleton placeholder instead of a blank white square
    container.innerHTML = `
      <div class="w-full h-full flex items-center justify-center">
        <div class="animate-pulse bg-slate-700 border-2 border-dashed border-slate-600 rounded w-10 h-10"></div>
      </div>
    `;
    return;
  }

  // Render the QR code using the qrcodejs library
  new QRCode(container, {
    text: value,
    width: size,
    height: size,
    correctLevel: QRCode.CorrectLevel.M
  });
}

// --- Stage dropdown population (modal) ---
export function populateModalStageDropdown(containerType, selectedStage = null, mediumType = '') {
  const select = document.getElementById('modal-stage-select');
  if (!select) return;
  // Use medium-specific stage sets when a medium type is provided
  let stages;
  if (mediumType === 'substrate') {
    stages = SUBSTRATE_STAGES;
  } else if (mediumType === 'grain') {
    stages = GRAIN_STAGES;
  } else {
    // Fallback: Include 'Contaminated' as an additional diagnostic state in the edit modal
    stages = [...(CONTAINER_STAGES[containerType] || []), 'Contaminated'];
  }
  select.innerHTML = stages.map(s => `<option value="${s}" ${selectedStage === s ? 'selected' : ''}>${s}</option>`).join('');
  // If selected stage is not in the valid list, default to first valid option
  if (selectedStage && !stages.includes(selectedStage) && stages.length > 0) {
    select.value = stages[0];
  }
}

export function toggleContamFields() {
  const select = document.getElementById('modal-stage-select');
  const auditBox = document.getElementById('contam-audit-fields');
  if (select.value === 'Contaminated') {
    auditBox.classList.remove('hidden');
  } else {
    auditBox.classList.add('hidden');
  }
}

export function handleModalContainerTypeChange() {
  const select = document.getElementById('modal-container-type');
  if (!select) return;
  // Determine the current item and stage (may be outside the new filtered set)
  const item = db.items.find(i => i.id === activeItemId);
  const currentStage = item ? item.stage : null;
  const mediumType = getMediumType(item);
  // Reset Stage to first valid option for the new Container Type / medium type
  populateModalStageDropdown(select.value, currentStage, mediumType);
  toggleContamFields();
  // Update action buttons & stage visibility based on medium type and stage
  updateModalActionVisibility(mediumType, currentStage, item);
}

// --- Flush Yield Tracking (Bulk Substrate / Fruiting) ---
export function renderFlushYieldHistory(item) {
  const tbody = document.getElementById('flush-history-table-body');
  const wetTotalEl = document.getElementById('yield-total-wet');
  const dryTotalEl = document.getElementById('yield-total-dry');
  if (!tbody) return;
  const records = item.flushYields || [];
  let totalWet = 0;
  let totalDry = 0;
  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-2 text-center text-slate-500">No harvests logged yet.</td></tr>';
  } else {
    tbody.innerHTML = records.map((r, i) => {
      const dry = typeof r.dry === 'number' ? r.dry : Math.round((r.wet || 0) * 0.1);
      totalWet += (parseFloat(r.wet) || 0);
      totalDry += (parseFloat(dry) || 0);
      return `
        <tr>
          <td class="p-2 font-semibold text-emerald-300">${r.flush || ('Flush ' + (i + 1))}</td>
          <td class="p-2">${parseFloat(r.wet) || 0}g</td>
          <td class="p-2">${parseFloat(dry) || 0}g</td>
          <td class="p-2">${r.date || ''}</td>
          <td class="p-2 text-right">
            <button onclick="removeFlushYieldRecord(${i})" class="text-red-400 hover:text-red-300 font-bold">✕</button>
          </td>
        </tr>
      `;
    }).join('');
  }
  if (wetTotalEl) wetTotalEl.innerText = totalWet;
  if (dryTotalEl) dryTotalEl.innerText = totalDry;
  // Biological Efficiency badge: (totalWetYield / drySubstrateWeight) * 100
  const beEl = document.getElementById('yield-total-be');
  if (beEl) {
    const be = calculateBE(totalWet, getDrySubstrateWeightGrams(item));
    beEl.innerText = be;
  }
}

export function addFlushYieldRecord() {
  const item = db.items.find(i => i.id === activeItemId);
  if (!item) return;
  const flush = document.getElementById('flush-num-input').value;
  const wet = parseFloat(document.getElementById('flush-wet-input').value);
  if (isNaN(wet) || wet <= 0) {
    alert('Enter a valid wet weight.');
    return;
  }
  const dry = estimateDryYield(wet); // ~10% estimated dry weight
  item.flushYields = item.flushYields || [];
  item.flushYields.push({
    flush: flush,
    wet: wet,
    dry: dry,
    date: new Date().toLocaleDateString()
  });
  item.totalWetYield = item.flushYields.reduce((s, r) => s + (parseFloat(r.wet) || 0), 0);
  item.totalDryYield = item.flushYields.reduce((s, r) => s + (parseFloat(r.dry) || 0), 0);
  item.totalYield = item.totalDryYield; // Track estimated dry yield as canonical total
  item.history.unshift({
    stage: 'Harvest',
    timestamp: new Date().toLocaleString(),
    notes: `${flush} logged: ${wet}g wet / ${dry}g dry (est.).`,
    env: ''
  });
  document.getElementById('flush-wet-input').value = '';
  saveItems();
  openModal(activeItemId);
}

export function removeFlushYieldRecord(index) {
  const item = db.items.find(i => i.id === activeItemId);
  if (!item) return;
  item.flushYields = item.flushYields || [];
  item.flushYields.splice(index, 1);
  item.totalWetYield = item.flushYields.reduce((s, r) => s + (parseFloat(r.wet) || 0), 0);
  item.totalDryYield = item.flushYields.reduce((s, r) => s + (parseFloat(r.dry) || 0), 0);
  item.totalYield = item.totalDryYield;
  saveItems();
  openModal(activeItemId);
}

// --- Inoculation & Stage Updates ---
export function applyInoculation() {
  const item = db.items.find(i => i.id === activeItemId);
  const strain = document.getElementById('inoc-strain').value;
  const parentId = document.getElementById('inoc-parent').value;

  if (!strain) return alert('Please enter a strain name.');

  item.strain = strain;
  item.label = `${item.medium} - ${strain}`;
  item.parentItemId = parentId || null;
  item.stage = 'Inoculation';
  item.history.unshift({
    stage: 'Inoculation',
    timestamp: new Date().toLocaleString(),
    notes: parentId ? `Inoculated via G2G from ${parentId}` : `Inoculated directly with ${strain}`,
    env: ''
  });

  // Capture parent grain spawn lineage for bulk substrate targets (S2B transfer)
  if (getItemCategory(item) === 'Bulk Substrate' && parentId) {
    const parent = db.items.find(p => p.id === parentId);
    item.parentSpawnId = parentId;
    item.parentSpawnName = parent ? (parent.label || parentId) : parentId;
    item.lifecycleHistory = item.lifecycleHistory || [];
    item.lifecycleHistory.unshift({
      fromStage: 'Uninoculated',
      toStage: 'Inoculation',
      timestamp: new Date().toLocaleString(),
      type: 's2b-transfer',
      notes: `Inoculated with grain spawn batch ${parentId} on ${new Date().toLocaleString()}.`
    });
  }

  saveItems();
  openModal(activeItemId);
}

export function logBreakAndShake() {
  const item = db.items.find(i => i.id === activeItemId);
  item.breakAndShake = new Date().toLocaleDateString();
  item.history.unshift({ stage: 'Milestone', timestamp: new Date().toLocaleString(), notes: 'Break & Shake performed.', env: '' });
  saveItems();
  openModal(activeItemId);
}

export function logYield() {
  const val = parseFloat(document.getElementById('input-yield').value);
  if (!val) return;
  const item = db.items.find(i => i.id === activeItemId);
  item.yields = item.yields || [];
  item.yields.push(val);
  item.totalYield = item.yields.reduce((a, b) => a + b, 0);
  item.history.unshift({ stage: 'Harvest', timestamp: new Date().toLocaleString(), notes: `Yield: ${val}g`, env: '' });
  document.getElementById('input-yield').value = '';
  saveItems();
  openModal(activeItemId);
}

// --- Delete Functions ---
export function deleteActiveItem() {
  if (!activeItemId) return;
  if (confirm(`Are you sure you want to delete item ${activeItemId}? This cannot be undone.`)) {
    const deletedId = activeItemId;
    db.items = db.items.filter(i => i.id !== deletedId);
    closeModal();
    saveItems();
    // Sync deletion to Supabase if configured
    if (isSupabaseConfigured()) {
      deleteItemsFromCloud([deletedId]).then(result => {
        if (!result.success && result.error) {
          showToast(`Failed to delete from cloud: ${result.error.message}`, 'error');
        }
      });
    }
  }
}

export function deleteItemDirect(id, e) {
  e.stopPropagation();
  if (confirm(`Delete container ${id}?`)) {
    db.items = db.items.filter(i => i.id !== id);
    saveItems();
    // Sync deletion to Supabase if configured
    if (isSupabaseConfigured()) {
      deleteItemsFromCloud([id]).then(result => {
        if (!result.success && result.error) {
          showToast(`Failed to delete from cloud: ${result.error.message}`, 'error');
        }
      });
    }
  }
}

export function deleteUninoculated() {
  const uninoculatedItems = db.items.filter(i => i.stage === 'Uninoculated');
  const count = uninoculatedItems.length;
  if (!count) return alert('No uninoculated containers to delete.');
  if (confirm(`Are you sure you want to purge all ${count} uninoculated jars?`)) {
    const deletedIds = uninoculatedItems.map(i => i.id);
    db.items = db.items.filter(i => i.stage !== 'Uninoculated');
    saveItems();
    // Sync deletion to Supabase if configured
    if (isSupabaseConfigured()) {
      deleteItemsFromCloud(deletedIds).then(result => {
        if (!result.success && result.error) {
          showToast(`Failed to delete from cloud: ${result.error.message}`, 'error');
        }
      });
    }
  }
}

export function deletePCBatch(batchId) {
  const affectedItems = db.items.filter(i => i.pcBatch === batchId);
  const affected = affectedItems.length;
  if (confirm(`Delete PC Batch "${batchId}" and all ${affected} associated items?`)) {
    const deletedIds = affectedItems.map(i => i.id);
    db.items = db.items.filter(i => i.pcBatch !== batchId);
    db.pcBatches = db.pcBatches.filter(b => b.batchId !== batchId);
    saveItems();
    openBatchModal();
    // Sync deletion to Supabase if configured
    if (isSupabaseConfigured()) {
      deleteItemsFromCloud(deletedIds).then(result => {
        if (!result.success && result.error) {
          showToast(`Failed to delete from cloud: ${result.error.message}`, 'error');
        }
      });
    }
  }
}

// --- Batch Modal UX ---
export function openBatchModal() {
  const modal = document.getElementById('batch-modal');
  const content = document.getElementById('batch-modal-content');

  if (!db.pcBatches.length) {
    content.innerHTML = `<p class="text-center text-slate-500 py-8">No PC batches recorded yet.</p>`;
  } else {
    content.innerHTML = db.pcBatches.map(b => {
      const batchItems = db.items.filter(i => i.pcBatch === b.batchId);
      const total = batchItems.length;
      const inoculated = batchItems.filter(i => i.stage !== 'Uninoculated').length;
      const contam = batchItems.filter(i => i.stage === 'Contaminated').length;

      return `
        <div class="bg-slate-900 p-4 rounded-lg border border-slate-700 flex justify-between items-center">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-bold text-amber-400 font-mono text-sm">${b.batchId}</span>
              <span class="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">${b.medium}</span>
            </div>
            <div class="text-xs text-slate-400 mt-1">
              Run Date: ${b.date} | Cook Time: ${b.pcTime} mins | Total: ${total} items
            </div>
            <div class="text-xs text-slate-300 mt-2 flex gap-3">
              <span>💉 Inoculated: <strong>${inoculated}/${total}</strong></span>
              <span class="text-red-400">⚠️ Contam Rate: <strong>${total ? Math.round((contam / total) * 100) : 0}%</strong></span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="printBulkLabels(getBatchItems('${b.batchId}'))" class="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-1.5 rounded text-white">🖨️ Labels</button>
            <button onclick="deletePCBatch('${b.batchId}')" class="bg-red-900/50 hover:bg-red-800 text-red-200 text-xs px-3 py-1.5 rounded">🗑️ Delete Batch</button>
          </div>
        </div>
      `;
    }).join('');
  }

  showModal(modal);
}

// Helper used by the batch modal's "Labels" button (exposed on window).
export function getBatchItems(batchId) {
  return db.items.filter(i => i.pcBatch === batchId);
}

export function closeBatchModal() {
  hideModal(document.getElementById('batch-modal'));
}

// --- G2G Transfer Modal ---
export function openG2GModal() {
  const parent = db.items.find(i => i.id === activeItemId);
  if (!parent) return;

  // Persist the currently selected container type from the modal dropdown
  const modalContainer = document.getElementById('modal-container-type');
  if (modalContainer) {
    parent.containerType = modalContainer.value;
    saveItems();
  }

  const parentGen = parent.generation || 1;
  document.getElementById('g2g-source-name').innerText = parent.label;
  document.getElementById('g2g-source-gen').innerText = `Strain: ${parent.strain} | Generation: ${parentGen}`;

  g2gScannedIds = [];
  document.getElementById('g2g-qty').value = '4';
  document.getElementById('g2g-scan-input').value = '';
  renderG2GScannedList();
  populateG2GScanSelect();

  switchG2GTab('auto');

  showModal(document.getElementById('g2g-modal'));
}

export function closeG2GModal() {
  window.stopG2GCameraScan();
  hideModal(document.getElementById('g2g-modal'));
}

export function switchG2GTab(tab) {
  const autoTab = document.getElementById('g2g-tab-auto');
  const scanTab = document.getElementById('g2g-tab-scan');
  const autoPanel = document.getElementById('g2g-auto-panel');
  const scanPanel = document.getElementById('g2g-scan-panel');

  if (tab === 'auto') {
    autoTab.classList.add('border-emerald-500', 'text-emerald-400');
    autoTab.classList.remove('border-transparent', 'text-slate-400');
    scanTab.classList.add('border-transparent', 'text-slate-400');
    scanTab.classList.remove('border-emerald-500', 'text-emerald-400');
    autoPanel.classList.remove('hidden');
    scanPanel.classList.add('hidden');
  } else {
    scanTab.classList.add('border-emerald-500', 'text-emerald-400');
    scanTab.classList.remove('border-transparent', 'text-slate-400');
    autoTab.classList.add('border-transparent', 'text-slate-400');
    autoTab.classList.remove('border-emerald-500', 'text-emerald-400');
    scanPanel.classList.remove('hidden');
    autoPanel.classList.add('hidden');
  }
}

export function executeG2GAutoGenerate() {
  const parent = db.items.find(i => i.id === activeItemId);
  if (!parent) return;

  const qty = parseInt(document.getElementById('g2g-qty').value) || 4;
  const containerType = document.getElementById('g2g-container-type').value;
  const substrate = document.getElementById('g2g-substrate').value;
  const today = new Date().toLocaleDateString();
  const parentGen = parent.generation || 1;
  const childGen = parentGen + 1;

  for (let i = 1; i <= qty; i++) {
    const newItem = {
      id: generateId(),
      label: `${parent.strain} - Gen ${childGen} #${i}`,
      strain: parent.strain,
      medium: substrate,
      containerType: containerType,
      containerWeight: '',
      pcBatch: 'G2G-' + parent.id,
      parentSourceId: parent.id,
      parentItemId: parent.id,
      generation: childGen,
      stage: 'Colonizing',
      createdAt: today,
      breakAndShake: null,
      totalYield: 0,
      yields: [],
      contamType: null,
      contamVector: null,
      history: [{
        stage: 'Colonizing',
        timestamp: new Date().toLocaleString(),
        notes: `G2G transfer from ${parent.id} (Gen ${parentGen}).`,
        env: ''
      }]
    };

    // Capture parent grain spawn lineage for bulk substrate targets (S2B transfer)
    if (getItemCategory(newItem) === 'Bulk Substrate') {
      newItem.parentSpawnId = parent.id;
      newItem.parentSpawnName = parent.label || parent.id;
      newItem.lifecycleHistory = newItem.lifecycleHistory || [];
      newItem.lifecycleHistory.unshift({
        fromStage: 'Preparation',
        toStage: 'Colonizing',
        timestamp: new Date().toLocaleString(),
        type: 's2b-transfer',
        notes: `Inoculated with grain spawn batch ${parent.id} on ${new Date().toLocaleString()}.`
      });
    }

    db.items.unshift(newItem);
  }

  parent.history.unshift({
    stage: parent.stage,
    timestamp: new Date().toLocaleString(),
    notes: `Transferred to ${qty} child items (G2G).`,
    env: ''
  });

  saveItems();
  closeG2GModal();
  openModal(activeItemId);
  alert(`Successfully created ${qty} new ${containerType} items via G2G transfer.`);
}

export function populateG2GScanSelect() {
  const select = document.getElementById('g2g-scan-select');
  if (!select) return;
  const prepItems = db.items.filter(i => i.stage === 'Preparation' && i.id !== activeItemId && !isLockedStage(i.stage));
  if (!prepItems.length) {
    select.innerHTML = '<option value="">No items in Preparation stage</option>';
    return;
  }
  select.innerHTML = '<option value="">-- Select an item --</option>' +
    prepItems.map(i => `<option value="${i.id}">${i.id} - ${i.label}</option>`).join('');
}

export function handleG2GScanInput(event) {
  if (event.key === 'Enter') {
    if (event.preventDefault) event.preventDefault();
    const input = event.target;
    let scannedId = input.value.trim();
    if (scannedId.includes('#item=')) {
      scannedId = scannedId.split('#item=')[1];
    }
    addG2GScanItem(scannedId);
    if (input.value !== undefined && input.value !== null) input.value = '';
  }
}

export function addG2GScanItem(id) {
  if (!id) return;
  if (g2gScannedIds.includes(id)) {
    alert('Item already added to transfer list.');
    return;
  }
  if (g2gScannedIds.length >= APP_CONFIG.MAX_G2G_TRANSFER_QTY) {
    alert(`Maximum ${APP_CONFIG.MAX_G2G_TRANSFER_QTY} items can be transferred via G2G.`);
    return;
  }
  const item = db.items.find(i => i.id === id);
  if (!item) {
    alert(`Item not found: ${id}`);
    return;
  }
  if (item.stage !== 'Preparation') {
    alert(`Item ${id} is not in Preparation stage (current: ${item.stage}).`);
    return;
  }
  g2gScannedIds.push(id);
  renderG2GScannedList();
  document.getElementById('g2g-scan-select').value = '';
}

export function removeG2GScanItem(id) {
  g2gScannedIds = g2gScannedIds.filter(i => i !== id);
  renderG2GScannedList();
}

export function renderG2GScannedList() {
  const container = document.getElementById('g2g-scanned-list');
  if (!container) return;
  if (!g2gScannedIds.length) {
    container.innerHTML = '<p class="text-xs text-slate-500 text-center py-3">No items scanned yet. Scan or select up to 4 items.</p>';
    return;
  }
  container.innerHTML = g2gScannedIds.map((id, idx) => {
    const item = db.items.find(i => i.id === id);
    return `
      <div class="flex justify-between items-center bg-slate-900 p-2 rounded border border-slate-700">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-emerald-400">#${idx + 1}</span>
          <span class="text-xs font-mono text-slate-300">${id}</span>
          <span class="text-xs text-slate-400">${item ? item.label : 'Unknown'}</span>
        </div>
        <button onclick="removeG2GScanItem('${id}')" class="text-red-400 hover:text-red-300 text-xs font-bold">✕</button>
      </div>
    `;
  }).join('');
}

export function executeG2GScanTransfer() {
  if (!g2gScannedIds.length) {
    alert('Please scan or select at least one item.');
    return;
  }

  const parent = db.items.find(i => i.id === activeItemId);
  if (!parent) return;

  const today = new Date().toLocaleDateString();
  const parentGen = parent.generation || 1;
  const childGen = parentGen + 1;

  g2gScannedIds.forEach(id => {
    const item = db.items.find(i => i.id === id);
    if (item) {
      item.parentSourceId = parent.id;
      item.parentItemId = parent.id;
      item.generation = childGen;
      // Auto-advance target item stage from Preparation to Colonizing
      const fromStage = item.stage === 'Preparation' ? 'Preparation' : item.stage;
      item.stage = 'Colonizing';
      item.history.unshift({
        stage: 'Colonizing',
        timestamp: new Date().toLocaleString(),
        notes: `G2G transfer from ${parent.id} (Gen ${parentGen}).`,
        env: ''
      });
      // Log the stage transition in lifecycleHistory
      item.lifecycleHistory = item.lifecycleHistory || [];
      item.lifecycleHistory.unshift({
        fromStage: fromStage,
        toStage: 'Colonizing',
        timestamp: new Date().toLocaleString(),
        type: 'auto-advance',
        notes: `G2G transfer from ${parent.id} (Gen ${parentGen}).`
      });
      // Capture parent grain spawn lineage for bulk substrate targets (S2B transfer)
      if (getItemCategory(item) === 'Bulk Substrate') {
        item.parentSpawnId = parent.id;
        item.parentSpawnName = parent.label || parent.id;
        item.lifecycleHistory.unshift({
          fromStage: fromStage,
          toStage: 'Colonizing',
          timestamp: new Date().toLocaleString(),
          type: 's2b-transfer',
          notes: `Inoculated with grain spawn batch ${parent.id} on ${new Date().toLocaleString()}.`
        });
      }
    }
  });

  parent.history.unshift({
    stage: parent.stage,
    timestamp: new Date().toLocaleString(),
    notes: `Transferred to ${g2gScannedIds.length} child items (G2G).`,
    env: ''
  });

  saveItems();
  closeG2GModal();
  openModal(activeItemId);
  alert(`Successfully transferred to ${g2gScannedIds.length} items via G2G.`);
}

// --- Quick Add Source Modal ---
export function openQuickAddModal() {
  showModal(document.getElementById('quick-add-modal'));
}

export function closeQuickAddModal() {
  hideModal(document.getElementById('quick-add-modal'));
  document.getElementById('quick-add-form').reset();
}

// --- CVG Recipe Calculator Modal ---
export function openRecipeCalcModal() {
  showModal(document.getElementById('recipe-calc-modal'));
}

export function closeRecipeCalcModal() {
  hideModal(document.getElementById('recipe-calc-modal'));
}

export function calculateCVG() {
  const quarts = parseFloat(document.getElementById('cvg-quarts').value) || 0;
  const recipe = calculateCVGRecipe(quarts);
  document.getElementById('cvg-coir').innerText = `${recipe.coirGrams} g`;
  document.getElementById('cvg-vermiculite').innerText = `${recipe.vermiculiteQuarts} quarts`;
  document.getElementById('cvg-gypsum').innerText = `${recipe.gypsumGrams} g`;
  document.getElementById('cvg-water').innerText = `${recipe.waterLiters} L`;
  document.getElementById('cvg-results').classList.remove('hidden');
}

// --- Label Print Settings & Custom Layouts Logic ---
// Returns the active label template, applying any saved custom dims when
// the 'custom' label model is selected.
function getActiveTemplate() {
  const tmpl = resolveLabelTemplate(labelModel);
  if (labelModel === 'custom' || tmpl.custom) {
    const stored = JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.CUSTOM_LABEL_DIMS) || 'null');
    if (stored) {
      return {
        name: 'Custom Dimensions',
        printerType: printerType,
        page: stored.page || { width: stored.width, height: stored.height },
        margin: stored.margin || { top: 0, bottom: 0, left: 0, right: 0 },
        label: { width: stored.width, height: stored.height },
        grid: { cols: stored.cols || 1, rows: stored.rows || 1 },
        gap: stored.gap || { col: 0, row: 0 },
        slots: (stored.cols || 1) * (stored.rows || 1),
        continuous: printerType === PRINTER_TYPES.THERMAL
      };
    }
  }
  return tmpl;
}

function getLayoutConfig(tmpl) {
  const t = tmpl || getActiveTemplate();
  return { slots: t.slots || 1, cols: (t.grid && t.grid.cols) || 1 };
}

// Apply the resolved template's physical metrics as CSS custom properties so
// css/print.css can consume them in @page and grid layout rules.
function applyTemplateCSSVars(tmpl) {
  const root = document.documentElement;
  if (!tmpl) return;
  root.style.setProperty('--label-width', `${tmpl.label.width}in`);
  root.style.setProperty('--label-height', `${tmpl.label.height}in`);
  root.style.setProperty('--page-width', `${tmpl.page.width}in`);
  root.style.setProperty('--page-height', `${tmpl.page.height}in`);
  root.style.setProperty('--page-margin-top', `${tmpl.margin.top}in`);
  root.style.setProperty('--page-margin-bottom', `${tmpl.margin.bottom}in`);
  root.style.setProperty('--page-margin-left', `${tmpl.margin.left}in`);
  root.style.setProperty('--page-margin-right', `${tmpl.margin.right}in`);
  root.style.setProperty('--label-cols', `${tmpl.grid.cols}`);
  root.style.setProperty('--label-col-gap', `${tmpl.gap.col}in`);
  root.style.setProperty('--label-row-gap', `${tmpl.gap.row}in`);
}

export function openPrintSettingsModal(itemList = null) {
  pendingPrintItems = itemList;

  // Load stored configurations
  printerType = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINTER_TYPE) || APP_CONFIG.DEFAULT_PRINTER_TYPE;
  labelModel = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.LABEL_MODEL) || APP_CONFIG.DEFAULT_LABEL_MODEL;
  printOffset = parseInt(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_OFFSET)) || APP_CONFIG.DEFAULT_PRINT_OFFSET;

  // Update UI elements to match stored configurations
  const printerTypeSelect = document.getElementById('printer-type-select');
  if (printerTypeSelect) printerTypeSelect.value = printerType;

  populateLabelModelSelect(printerType, labelModel);

  const config = getLayoutConfig();
  if (printOffset > config.slots) {
    printOffset = 1;
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_OFFSET, printOffset);
  }

  const includeContainerCheckbox = document.getElementById('print-include-container');
  if (includeContainerCheckbox) {
    includeContainerCheckbox.checked = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_INCLUDE_CONTAINER) === 'true';
  }

  // Customize dynamic print action button text
  const actionBtn = document.getElementById('print-settings-action-btn');
  if (actionBtn) {
    if (itemList && itemList.length > 0) {
      actionBtn.innerText = `🖨️ Print ${itemList.length} Label(s)`;
    } else {
      actionBtn.innerText = '💾 Save Settings';
    }
  }

  refreshPrintSettingsUI(false); // Update preview layout view (suppress automatic save)

  const modal = document.getElementById('print-settings-modal');
  if (modal) {
    showModal(modal);
  }

  // Show a subtle dev-environment warning when printing labels from a
  // temporary dev URL (dev tunnel / localhost) without an explicit base URL.
  const devWarning = document.getElementById('print-dev-warning');
  if (devWarning) {
    if (isUsingTemporaryBaseUrl()) {
      devWarning.classList.remove('hidden');
    } else {
      devWarning.classList.add('hidden');
    }
  }
}

export function closePrintSettingsModal() {
  const modal = document.getElementById('print-settings-modal');
  if (modal) {
    hideModal(modal);
  }
  pendingPrintItems = null;
}

// Populate the Label Model <select> with options valid for the given printer type.
function populateLabelModelSelect(pType, selectedKey) {
  const select = document.getElementById('label-model-select');
  if (!select) return;
  const models = getLabelModelsForPrinterType(pType);
  select.innerHTML = models.map(m => `<option value="${m.key}">${m.name}</option>`).join('');
  if (models.some(m => m.key === selectedKey)) {
    select.value = selectedKey;
  } else if (models.length) {
    select.value = models[0].key;
    labelModel = models[0].key;
  }
}

export function onPrinterTypeChange() {
  const select = document.getElementById('printer-type-select');
  if (select) {
    printerType = select.value;
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINTER_TYPE, printerType);
  }
  // Reset to the first valid label model for the new printer type
  const models = getLabelModelsForPrinterType(printerType);
  labelModel = models.length ? models[0].key : APP_CONFIG.DEFAULT_LABEL_MODEL;
  localStorage.setItem(APP_CONFIG.STORAGE_KEYS.LABEL_MODEL, labelModel);
  populateLabelModelSelect(printerType, labelModel);
  refreshPrintSettingsUI(true);
}

export function onLabelModelChange() {
  const select = document.getElementById('label-model-select');
  if (select) {
    labelModel = select.value;
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.LABEL_MODEL, labelModel);
  }
  refreshPrintSettingsUI(true);
}

export function applyCustomLabelDims() {
  const width = parseFloat(document.getElementById('custom-label-width').value);
  const height = parseFloat(document.getElementById('custom-label-height').value);
  const cols = parseInt(document.getElementById('custom-label-cols').value) || 1;
  const rows = parseInt(document.getElementById('custom-label-rows').value) || 1;

  if (!width || !height || width <= 0 || height <= 0) {
    alert('Please enter valid label width and height (inches).');
    return;
  }

  const customDims = {
    width,
    height,
    cols,
    rows,
    page: { width: width * cols, height: height * rows },
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    gap: { col: 0, row: 0 }
  };
  localStorage.setItem(APP_CONFIG.STORAGE_KEYS.CUSTOM_LABEL_DIMS, JSON.stringify(customDims));
  refreshPrintSettingsUI(true);
  alert('Custom label dimensions applied.');
}

// Refresh the layout-dependent portions of the print settings modal:
// custom dims panel visibility, offset select options, and the preview grid.
export function refreshPrintSettingsUI(shouldSave = true) {
  const customPanel = document.getElementById('custom-label-dims-panel');
  if (customPanel) {
    customPanel.classList.toggle('hidden', labelModel !== 'custom');
  }

  const tmpl = getActiveTemplate();
  const config = getLayoutConfig(tmpl);

  const offsetContainer = document.getElementById('print-offset-container');
  const offsetSelect = document.getElementById('print-offset-select');
  if (offsetContainer) {
    if (!tmpl.continuous) {
      offsetContainer.classList.remove('hidden');
      if (offsetSelect) {
        if (printOffset > config.slots) {
          printOffset = 1;
          localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_OFFSET, printOffset);
        }
        offsetSelect.innerHTML = Array.from({ length: config.slots }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
        offsetSelect.value = printOffset;
      }
      renderPreviewGrid();
    } else {
      offsetContainer.classList.add('hidden');
    }
  }
}

// Backwards-compatible alias retained for any external callers.
export function onPrintLayoutChange(shouldSave = true) {
  refreshPrintSettingsUI(shouldSave);
}

export function onPrintOffsetChange() {
  const offsetSelect = document.getElementById('print-offset-select');
  if (offsetSelect) {
    printOffset = parseInt(offsetSelect.value) || 1;
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_OFFSET, printOffset);
  }
  renderPreviewGrid();
}

export function renderPreviewGrid() {
  const grid = document.getElementById('print-preview-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const config = getLayoutConfig();
  grid.style.gridTemplateColumns = `repeat(${config.cols}, minmax(0, 1fr))`;

  const numItems = pendingPrintItems ? pendingPrintItems.length : 1;

  for (let i = 1; i <= config.slots; i++) {
    const cell = document.createElement('div');
    cell.className = 'w-10 h-8 rounded border flex items-center justify-center text-[10px] font-bold cursor-pointer transition';
    cell.innerText = i;

    if (i < printOffset) {
      // Skipped / used labels
      cell.className += ' bg-slate-700/60 border-slate-600 text-slate-500';
    } else if (i >= printOffset && i < printOffset + numItems) {
      // Active label printing positions
      cell.className += ' bg-emerald-600 border-emerald-500 text-white shadow shadow-emerald-500/35 scale-[1.05] z-10';
    } else {
      // Empty slot
      cell.className += ' bg-slate-900 border-slate-700 hover:border-slate-500 text-slate-400';
    }

    // Interactive slot selection
    cell.onclick = () => {
      const offsetSelect = document.getElementById('print-offset-select');
      if (offsetSelect) {
        offsetSelect.value = i;
        onPrintOffsetChange();
      }
    };

    grid.appendChild(cell);
  }
}

export function applyOrExecutePrintSettings() {
  const printerTypeSelect = document.getElementById('printer-type-select');
  if (printerTypeSelect) {
    printerType = printerTypeSelect.value;
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINTER_TYPE, printerType);
  }
  const labelModelSelect = document.getElementById('label-model-select');
  if (labelModelSelect) {
    labelModel = labelModelSelect.value;
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.LABEL_MODEL, labelModel);
  }

  const includeContainerCheckbox = document.getElementById('print-include-container');
  if (includeContainerCheckbox) {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_INCLUDE_CONTAINER, includeContainerCheckbox.checked ? 'true' : 'false');
  }

  const tmpl = getActiveTemplate();
  if (!tmpl.continuous) {
    printOffset = parseInt(document.getElementById('print-offset-select').value) || 1;
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_OFFSET, printOffset);
  }

  if (pendingPrintItems && pendingPrintItems.length > 0) {
    const itemsToPrint = pendingPrintItems;
    closePrintSettingsModal();
    executePrint(itemsToPrint, labelModel, printOffset);
  } else {
    alert('Print configurations saved successfully.');
    closePrintSettingsModal();
  }
}

export function printBulkLabels(itemList) {
  if (!itemList || !itemList.length) return alert('No labels to print.');
  openPrintSettingsModal(itemList);
}

export function printSingleLabel() {
  const item = db.items.find(i => i.id === activeItemId);
  if (item) printBulkLabels([item]);
}

export function executePrint(itemList, layoutKey, offset) {
  const section = document.getElementById('bulk-print-section');
  if (!section) return;
  section.innerHTML = '';

  const tmpl = getActiveTemplate();
  applyTemplateCSSVars(tmpl);

  const cols = (tmpl.grid && tmpl.grid.cols) || 1;
  const rows = (tmpl.grid && tmpl.grid.rows) || 1;
  const totalSlots = cols * rows;

  // Apply layout class to container (retain legacy class names for CSS fallback)
  if (!tmpl.continuous) {
    section.className = 'layout-dynamic';
    section.style.gridTemplateColumns = `repeat(${cols}, ${tmpl.label.width}in)`;
    section.style.gridAutoRows = `${tmpl.label.height}in`;
    section.style.columnGap = `${tmpl.gap.col}in`;
    section.style.rowGap = `${tmpl.gap.row}in`;
    section.style.paddingTop = `${tmpl.margin.top}in`;
    section.style.paddingBottom = `${tmpl.margin.bottom}in`;
    section.style.paddingLeft = `${tmpl.margin.left}in`;
    section.style.paddingRight = `${tmpl.margin.right}in`;
    section.style.display = 'grid';

    // Render empty invisible placeholder cards before first active label
    const skippedCount = Math.max(0, (offset || 1) - 1);
    for (let s = 0; s < skippedCount; s++) {
      const placeholder = document.createElement('div');
      placeholder.className = 'print-placeholder';
      placeholder.style.width = `${tmpl.label.width}in`;
      placeholder.style.height = `${tmpl.label.height}in`;
      section.appendChild(placeholder);
    }
  } else {
    section.className = 'layout-single';
  }

  const includeContainer = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_INCLUDE_CONTAINER) === 'true';

  // Render actual active labels
  itemList.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'print-card';
    card.style.width = `${tmpl.label.width}in`;
    card.style.height = `${tmpl.label.height}in`;

    let containerElement = '';
    if (includeContainer && item.containerType) {
      containerElement = `<div class="print-extra font-semibold text-emerald-800">${item.containerType}${item.containerWeight ? ` (${item.containerWeight})` : ''}</div>`;
    }

    // Format prep date for display (e.g., "Prepped: Aug 8, 2026")
    let prepDateText = '';
    if (item.prepDate) {
      const d = new Date(item.prepDate + 'T12:00:00');
      if (!isNaN(d.getTime())) {
        prepDateText = `Prepped: ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }
    }

    card.innerHTML = `
      <div class="print-qr-container" id="print-qr-${item.id}"></div>
      <div class="print-text-container">
        <div class="print-id">${item.id}</div>
        <div class="print-strain">${item.strain === 'Uninoculated' ? 'Uninoculated' : item.strain}</div>
        <div class="print-date">${prepDateText || `Inoc: ${item.createdAt}`}</div>
        <div class="print-extra">${item.medium}</div>
        ${containerElement}
      </div>
    `;
    section.appendChild(card);

    // Render QR Code in background
    setTimeout(() => {
      const size = Math.round(Math.min(tmpl.label.width, tmpl.label.height) * 96 * 0.6);
      const qrPayload = `${getAppBaseUrl()}/container/${item.id}`;
      new QRCode(document.getElementById(`print-qr-${item.id}`), {
        text: qrPayload,
        width: size,
        height: size,
        correctLevel: QRCode.CorrectLevel.M
      });
    }, 30);
  });

  // Show print panel and print
  setTimeout(() => {
    window.print();
  }, 350);
}


// --- Dashboard Bulk Selection ---
export function toggleSelectAll(selectAllInput) {
  const checkboxes = document.querySelectorAll('.item-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = selectAllInput.checked;
  });
  updateSelectedCount();
}

export function updateSelectedCount() {
  const checkboxes = document.querySelectorAll('.item-checkbox');
  const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
  const printBtn = document.getElementById('print-selected-btn');
  if (printBtn) {
    printBtn.innerText = `🖨️ Print Selected Labels (${checkedCount})`;
  }
  // Update bulk delete button: show only when at least 1 item is selected
  const deleteBtn = document.getElementById('bulk-delete-btn');
  if (deleteBtn) {
    deleteBtn.innerText = `🗑️ Delete (${checkedCount})`;
    if (checkedCount > 0) {
      deleteBtn.classList.remove('hidden');
    } else {
      deleteBtn.classList.add('hidden');
    }
  }
  const selectAll = document.getElementById('select-all-checkbox');
  if (selectAll) {
    selectAll.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
  }
}

export function printSelectedLabels() {
  const checkboxes = document.querySelectorAll('.item-checkbox');
  const checkedIds = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.getAttribute('data-id'));
  if (!checkedIds.length) {
    alert('Please select at least one item label to print.');
    return;
  }
  const itemsToPrint = db.items.filter(i => checkedIds.includes(i.id));
  printBulkLabels(itemsToPrint);
}

// Bulk delete selected items with confirmation and Supabase sync.
// 1. Collects selected item IDs from checked checkboxes.
// 2. Shows confirmation dialog with count.
// 3. Deletes from Supabase if configured.
// 4. Removes from local state and clears selection.
// 5. Shows success notification with count.
export async function deleteSelectedItems() {
  const checkboxes = document.querySelectorAll('.item-checkbox');
  const selectedIds = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.getAttribute('data-id'));

  if (!selectedIds.length) {
    showToast('No items selected for deletion.', 'warning');
    return;
  }

  // Show confirmation dialog
  const confirmed = confirm(`Are you sure you want to delete ${selectedIds.length} selected item${selectedIds.length !== 1 ? 's' : ''}? This cannot be undone.`);
  if (!confirmed) return;

  // Delete from Supabase if configured
  if (isSupabaseConfigured()) {
    const result = await deleteItemsFromCloud(selectedIds);
    if (!result.success && result.error) {
      console.error('Bulk Delete Error:', result.error);
      showToast(`Failed to delete items from cloud: ${result.error.message}`, 'error', 8000);
      return;
    }
  }

  // Remove deleted items from local state
  db.items = db.items.filter(i => !selectedIds.includes(i.id));
  saveItems();

  // Clear the select-all checkbox
  const selectAll = document.getElementById('select-all-checkbox');
  if (selectAll) selectAll.checked = false;

  // Show success notification
  showToast(`Successfully deleted ${selectedIds.length} item${selectedIds.length !== 1 ? 's' : ''}.`, 'success');
}

// --- Item Modal Stage Form Submit ---
export function initStageFormListener() {
  document.getElementById('stage-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const item = db.items.find(i => i.id === activeItemId);
    if (!item) return;

    const stage = document.getElementById('modal-stage-select').value;
    const tempVal = parseFloat(document.getElementById('modal-temp').value) || null;
    const humVal = parseFloat(document.getElementById('modal-hum').value) || null;
    const env = (tempVal !== null || humVal !== null) ? `[${tempVal !== null ? tempVal + '°F' : ''} ${humVal !== null ? humVal + '%' : ''}]` : '';
    let notes = document.getElementById('modal-stage-notes').value;
    const timestamp = new Date().toLocaleString();

    // Update Container Type if changed in modal
    const modalContainer = document.getElementById('modal-container-type');
    if (modalContainer) {
      item.containerType = modalContainer.value;
    }

    item.stage = stage;

    if (stage === 'Contaminated') {
      const cType = document.getElementById('modal-contam-type').value;
      const cVector = document.getElementById('modal-contam-vector').value;
      item.contamType = cType;
      item.contamVector = cVector;
      notes = `[Diagnostic: ${cType} | Vector: ${cVector}] ${notes}`;
    }

    // Store structured environmental data alongside the stage update
    item.history.unshift({ stage, timestamp, notes, env, temp: tempVal, humidity: humVal });
    item.environmentHistory = item.environmentHistory || [];
    if (tempVal !== null || humVal !== null) {
      item.environmentHistory.unshift({ stage, timestamp, temp: tempVal, humidity: humVal, notes });
    }

    document.getElementById('modal-stage-notes').value = '';
    document.getElementById('modal-temp').value = '';
    document.getElementById('modal-hum').value = '';
    saveItems();
    openModal(activeItemId);
  });
}

// --- AI Assistant Chat Drawer ---
export function toggleAIDrawer() {
  const drawer = document.getElementById('ai-chat-drawer');
  if (!drawer) return;
  if (drawer.classList.contains('drawer-closed')) {
    drawer.classList.remove('drawer-closed');
    drawer.classList.add('drawer-open');
    // Check for API key and show onboarding if needed
    const messages = document.getElementById('ai-chat-messages');
    if (messages && messages.children.length === 0) {
      if (!hasApiKey()) {
        renderOnboardingCard();
      } else {
        appendAIMessage('assistant', 'Hello! I\'m MycoAI, your mycology assistant. Ask me about your active batches, contamination issues, or general cultivation techniques!');
        renderQuickActionChips();
      }
    }
  } else {
    drawer.classList.remove('drawer-open');
    drawer.classList.add('drawer-closed');
  }
}

// Render the API key onboarding card
function renderOnboardingCard() {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;

  const onboardingDiv = document.createElement('div');
  onboardingDiv.id = 'ai-onboarding-card';
  onboardingDiv.className = 'ai-onboarding-card bg-gradient-to-br from-slate-800 to-slate-900 border border-emerald-600/50 rounded-xl p-5 space-y-4';
  onboardingDiv.innerHTML = `
    <div class="text-center space-y-2">
      <h3 class="text-lg font-bold text-emerald-400">Welcome to MycoAI 🤖</h3>
      <p class="text-sm text-slate-300 leading-relaxed">
        To activate smart container diagnosis and mycology assistance, you need a free Gemini API key from Google AI Studio.
      </p>
    </div>

    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
       class="block w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-4 rounded-lg text-center text-sm transition">
      🔑 Get Free Gemini Key
    </a>

    <div class="space-y-2">
      <input type="text" id="ai-api-key-input" placeholder="Paste API key (AIzaSy...)"
             class="w-full bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono">
      <button onclick="handleSaveApiKey()"
              class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-lg text-sm transition">
        Save Key & Start
      </button>
    </div>

    <p class="text-[10px] text-slate-500 text-center">
      Your key is stored locally on this device only and never sent to any server except Google's Gemini API.
    </p>
  `;
  container.appendChild(onboardingDiv);
  container.scrollTop = container.scrollHeight;
}

// Handle saving the API key from the onboarding card
export function handleSaveApiKey() {
  const input = document.getElementById('ai-api-key-input');
  if (!input) return;

  const key = input.value.trim();
  if (!key) {
    alert('Please enter a valid API key.');
    return;
  }

  if (!key.startsWith('AIza')) {
    alert('Invalid API key format. Gemini keys should start with "AIza".');
    return;
  }

  saveApiKey(key);

  // Remove onboarding card
  const onboardingCard = document.getElementById('ai-onboarding-card');
  if (onboardingCard) onboardingCard.remove();

  // Show greeting message
  appendAIMessage('assistant', 'MycoAI initialized! How can I help with your batches today?');
  renderQuickActionChips();
}

// Render quick action chips for common queries
function renderQuickActionChips() {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;

  // Don't add chips if they already exist
  if (document.getElementById('ai-quick-chips')) return;

  const chipsDiv = document.createElement('div');
  chipsDiv.id = 'ai-quick-chips';
  chipsDiv.className = 'flex flex-wrap gap-2 mt-2';
  chipsDiv.innerHTML = `
    <button onclick="sendChatMessage('What are my active batches?')" class="ai-chip bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-full transition">📊 Active Batches</button>
    <button onclick="sendChatMessage('How do I prevent contamination?')" class="ai-chip bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-full transition">🛡️ Contam Prevention</button>
    <button onclick="sendChatMessage('What is the CVG recipe?')" class="ai-chip bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-full transition">🧪 CVG Recipe</button>
    <button onclick="sendChatMessage('How do I make liquid culture?')" class="ai-chip bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-200 text-xs px-3 py-1.5 rounded-full transition">🧫 LC Guide</button>
  `;
  container.appendChild(chipsDiv);
  container.scrollTop = container.scrollHeight;
}

// Open the API key management dialog
export function openApiKeyManager() {
  const currentKey = getStoredApiKey();
  const maskedKey = currentKey ? currentKey.substring(0, 8) + '...' + currentKey.substring(currentKey.length - 4) : 'No key stored';

  const dialogHtml = `
    <div id="api-key-dialog" class="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[90]">
      <div class="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
        <div class="flex justify-between items-center">
          <h3 class="text-md font-bold text-emerald-400">🔑 API Key Settings</h3>
          <button onclick="closeApiKeyManager()" class="text-slate-400 hover:text-white font-bold">✕</button>
        </div>

        <div class="bg-slate-900 p-3 rounded-lg border border-slate-700">
          <div class="text-xs text-slate-400 mb-1">Current Key</div>
          <div class="text-sm font-mono text-slate-200">${maskedKey}</div>
        </div>

        <div class="space-y-2">
          <input type="text" id="api-key-update-input" placeholder="Enter new API key (AIzaSy...)"
                 class="w-full bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono">
          <div class="flex gap-2">
            <button onclick="updateApiKeyFromDialog()" class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg text-xs transition">
              💾 Update Key
            </button>
            <button onclick="clearApiKeyFromDialog()" class="flex-1 bg-red-900/60 hover:bg-red-800 text-red-200 font-bold py-2 px-3 rounded-lg text-xs transition">
              🗑️ Clear Key
            </button>
          </div>
        </div>

        <p class="text-[10px] text-slate-500 text-center">
          Get a free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline">Google AI Studio</a>
        </p>
      </div>
    </div>
  `;

  // Remove existing dialog if present
  const existing = document.getElementById('api-key-dialog');
  if (existing) existing.remove();

  document.body.insertAdjacentHTML('beforeend', dialogHtml);
}

export function closeApiKeyManager() {
  const dialog = document.getElementById('api-key-dialog');
  if (dialog) dialog.remove();
}

export function updateApiKeyFromDialog() {
  const input = document.getElementById('api-key-update-input');
  if (!input) return;

  const key = input.value.trim();
  if (!key) {
    alert('Please enter a valid API key.');
    return;
  }

  if (!key.startsWith('AIza')) {
    alert('Invalid API key format. Gemini keys should start with "AIza".');
    return;
  }

  saveApiKey(key);
  closeApiKeyManager();
  alert('API key updated successfully!');
}

export function clearApiKeyFromDialog() {
  if (confirm('Are you sure you want to clear your stored API key? MycoAI will show the onboarding screen next time.')) {
    clearApiKey();
    closeApiKeyManager();
    // Clear chat and show onboarding
    const messages = document.getElementById('ai-chat-messages');
    if (messages) {
      messages.innerHTML = '';
      renderOnboardingCard();
    }
  }
}

export function closeAIDrawer() {
  const drawer = document.getElementById('ai-chat-drawer');
  if (drawer) {
    drawer.classList.remove('drawer-open');
    drawer.classList.add('drawer-closed');
  }
}

function appendAIMessage(role, text) {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;
  const msgDiv = document.createElement('div');
  msgDiv.className = role === 'user'
    ? 'ai-message ai-message-user bg-emerald-900/40 border border-emerald-700/50 rounded-lg p-3 text-sm text-slate-100 ml-8'
    : 'ai-message ai-message-assistant bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-100 mr-8';
  msgDiv.innerHTML = `<span class="font-bold ${role === 'user' ? 'text-emerald-400' : 'text-teal-400'}">${role === 'user' ? '🧑 You' : '🤖 MycoAI'}</span><p class="mt-1 whitespace-pre-wrap">${text}</p>`;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

export async function sendChatMessage(userPrompt) {
  const input = document.getElementById('ai-chat-input');
  const prompt = userPrompt || (input ? input.value.trim() : '');
  if (!prompt) return;

  // Append user message immediately
  appendAIMessage('user', prompt);
  saveChatMessage('user', prompt);
  if (input) input.value = '';

  // Extract active batch context for the AI
  const activeBatchContext = extractActiveBatchContext();

  // Show typing indicator
  const typingId = 'ai-typing-' + Date.now();
  const container = document.getElementById('ai-chat-messages');
  if (container) {
    const typingDiv = document.createElement('div');
    typingDiv.id = typingId;
    typingDiv.className = 'ai-message ai-message-assistant bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-400 mr-8';
    typingDiv.innerHTML = '<span class="font-bold text-teal-400">🤖 MycoAI</span><p class="mt-1 italic">Thinking...</p>';
    container.appendChild(typingDiv);
    container.scrollTop = container.scrollHeight;
  }

  // Call the Gemini API via ai.js module
  const response = await callGeminiAPI(prompt, activeBatchContext);

  // Remove typing indicator
  const typingEl = document.getElementById(typingId);
  if (typingEl) typingEl.remove();

  // Process any action payloads in the response
  const { cleanText, executedActions } = processAIResponseActions(response);

  // Display the cleaned response
  appendAIMessage('assistant', cleanText);
  saveChatMessage('assistant', cleanText);

  // Show confirmation badges for executed actions
  if (executedActions.length > 0) {
    appendActionBadges(executedActions);
    // Trigger dashboard refresh (saveItems already called by action handlers)
    if (typeof window.render === 'function') {
      window.render();
      window.updateDashboard();
    }
  }
}

// Append green status badges for executed actions
function appendActionBadges(actions) {
  const container = document.getElementById('ai-chat-messages');
  if (!container) return;

  actions.forEach(action => {
    const badgeDiv = document.createElement('div');
    badgeDiv.className = action.error
      ? 'ai-action-badge bg-amber-900/40 border border-amber-600/50 rounded-lg px-3 py-2 text-xs text-amber-300 mt-2'
      : 'ai-action-badge bg-emerald-900/40 border border-emerald-600/50 rounded-lg px-3 py-2 text-xs text-emerald-300 mt-2';
    badgeDiv.innerHTML = `<span class="font-semibold">${action.message}</span>`;
    container.appendChild(badgeDiv);
  });
  container.scrollTop = container.scrollHeight;
}

// Re-export callGeminiAPI for app.js global exposure
export { callGeminiAPI } from './ai.js';

// --- Community Feedback & Feature Request Modal ---
export function openFeedbackModal() {
  renderRoadmap();
  showModal(document.getElementById('feedback-modal'));
}

export function closeFeedbackModal() {
  hideModal(document.getElementById('feedback-modal'));
}

export function switchFeedbackTab(tab) {
  const submitTab = document.getElementById('feedback-tab-submit');
  const roadmapTab = document.getElementById('feedback-tab-roadmap');
  const submitPanel = document.getElementById('feedback-submit-panel');
  const roadmapPanel = document.getElementById('feedback-roadmap-panel');

  if (tab === 'submit') {
    submitTab.classList.add('border-fuchsia-500', 'text-fuchsia-400');
    submitTab.classList.remove('border-transparent', 'text-slate-400');
    roadmapTab.classList.add('border-transparent', 'text-slate-400');
    roadmapTab.classList.remove('border-fuchsia-500', 'text-fuchsia-400');
    submitPanel.classList.remove('hidden');
    roadmapPanel.classList.add('hidden');
  } else {
    roadmapTab.classList.add('border-fuchsia-500', 'text-fuchsia-400');
    roadmapTab.classList.remove('border-transparent', 'text-slate-400');
    submitTab.classList.add('border-transparent', 'text-slate-400');
    submitTab.classList.remove('border-fuchsia-500', 'text-fuchsia-400');
    roadmapPanel.classList.remove('hidden');
    submitPanel.classList.add('hidden');
    renderRoadmap();
  }
}

export function renderRoadmap() {
  const roadmapList = document.getElementById('roadmap-list');
  if (!roadmapList) return;

  const feedbackList = getFeedback();

  if (!feedbackList.length) {
    roadmapList.innerHTML = '<p class="text-center text-slate-500 py-8">No feature requests yet. Be the first to submit one!</p>';
    return;
  }

  // Sort by upvotes descending
  const sorted = [...feedbackList].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));

  roadmapList.innerHTML = sorted.map(fb => {
    const statusClass = fb.status === 'Shipped'
      ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700'
      : fb.status === 'In Progress'
        ? 'bg-blue-900/50 text-blue-300 border-blue-700'
        : 'bg-amber-900/50 text-amber-300 border-amber-700';

    const categoryClass = fb.category === 'UI'
      ? 'bg-purple-900/50 text-purple-300'
      : fb.category === 'Tracker'
        ? 'bg-cyan-900/50 text-cyan-300'
        : fb.category === 'Recipe'
          ? 'bg-teal-900/50 text-teal-300'
          : 'bg-rose-900/50 text-rose-300';

    return `
      <div class="bg-slate-900 p-4 rounded-lg border border-slate-700 space-y-2">
        <div class="flex justify-between items-start gap-3">
          <div class="flex-1">
            <h4 class="font-bold text-slate-100 text-sm">${fb.title}</h4>
            <p class="text-xs text-slate-400 mt-1">${fb.description || 'No description provided.'}</p>
            <div class="flex gap-2 mt-2">
              <span class="text-[10px] px-2 py-0.5 rounded ${categoryClass}">${fb.category}</span>
              <span class="text-[10px] px-2 py-0.5 rounded border ${statusClass}">${fb.status}</span>
            </div>
          </div>
          <button onclick="handleUpvote('${fb.id}')" class="flex flex-col items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 transition shrink-0">
            <span class="text-lg">👍</span>
            <span class="text-xs font-bold text-fuchsia-400">${fb.upvotes || 0}</span>
          </button>
        </div>
        <div class="text-[10px] text-slate-500">Submitted ${new Date(fb.createdAt).toLocaleDateString()}</div>
      </div>
    `;
  }).join('');
}

export function handleUpvote(featureId) {
  upvoteFeature(featureId);
  renderRoadmap();
}

export function initFeedbackFormListener() {
  const form = document.getElementById('feedback-form');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('fb-title').value.trim();
    const category = document.getElementById('fb-category').value;
    const description = document.getElementById('fb-description').value.trim();

    if (!title) {
      alert('Please enter a feature title.');
      return;
    }

    submitFeedback({ title, category, description });
    form.reset();
    alert('Feature request submitted successfully! Check the Community Roadmap tab to see it listed.');
    switchFeedbackTab('roadmap');
  });
}

// --- Modern SaaS Auth Modal (Sign In / Sign Up + Google OAuth) ---
let activeAuthTab = 'signin';

export function openAuthModal(tab = 'signin') {
  showModal(document.getElementById('auth-modal'));
  switchAuthTab(tab);
  updateAuthModalUI();
}

export function closeAuthModal() {
  hideModal(document.getElementById('auth-modal'));
}


// Toggle between the [ Sign In ] and [ Sign Up ] segments.
export function switchAuthTab(tab) {
  activeAuthTab = (tab === 'signup') ? 'signup' : 'signin';
  const signinTab = document.getElementById('auth-tab-signin');
  const signupTab = document.getElementById('auth-tab-signup');
  const submitBtn = document.getElementById('auth-submit-btn');
  const title = document.getElementById('auth-modal-title');

  const apply = (el, isActive) => {
    if (!el) return;
    el.classList.toggle('border-amber-500', isActive);
    el.classList.toggle('text-slate-300', isActive);
    el.classList.toggle('border-slate-800', !isActive);
    el.classList.toggle('text-slate-400', !isActive);
  };
  apply(signinTab, activeAuthTab === 'signin');
  apply(signupTab, activeAuthTab === 'signup');

  if (submitBtn) submitBtn.innerText = activeAuthTab === 'signup' ? 'Create Free Account' : 'Sign In';
  if (title) title.innerText = activeAuthTab === 'signup' ? 'Create your account' : 'Welcome back';
  hideAuthMessage();
}

function showAuthMessage(message, isError = true) {
  const el = document.getElementById('auth-message');
  if (!el) return;
  el.innerText = message;
  el.classList.remove('hidden', 'text-red-400', 'text-emerald-400');
  el.classList.add(isError ? 'text-red-400' : 'text-emerald-400');
}

function hideAuthMessage() {
  const el = document.getElementById('auth-message');
  if (el) el.classList.add('hidden');
}

function restoreSubmitButton() {
  const btn = document.getElementById('auth-submit-btn');
  if (!btn) return;
  btn.disabled = false;
  btn.innerText = activeAuthTab === 'signup' ? 'Create Free Account' : 'Sign In';
}

// Refresh the auth modal contents to reflect the current session state.
export async function updateAuthModalUI() {
  const setupNotice = document.getElementById('auth-setup-notice');
  const formView = document.getElementById('auth-form');
  const accountView = document.getElementById('auth-account-view');
  const tabSwitcher = document.getElementById('auth-tabs');
  const forgotPassword = document.getElementById('auth-forgot-password');

  // Supabase not configured yet: show local-only setup notice.
  if (!isSupabaseConfigured()) {
    if (setupNotice) setupNotice.classList.remove('hidden');
    if (formView) formView.classList.add('hidden');
    if (accountView) accountView.classList.add('hidden');
    if (tabSwitcher) tabSwitcher.classList.add('hidden');
    if (forgotPassword) forgotPassword.classList.add('hidden');
    return;
  }
  if (setupNotice) setupNotice.classList.add('hidden');

  let user = null;
  try {
    user = await getCurrentUser();
  } catch (e) { /* treat as signed out */ }

  if (user) {
    // Signed in: show account view with the green cloud-synced indicator.
    if (formView) formView.classList.add('hidden');
    if (tabSwitcher) tabSwitcher.classList.add('hidden');
    if (forgotPassword) forgotPassword.classList.add('hidden');
    if (accountView) accountView.classList.remove('hidden');
    
    const userEmailEl = document.getElementById('auth-user-email');
    if (userEmailEl) {
      userEmailEl.innerText = user.email || user.id;
    }
  } else {
    // Signed out: show form and tabs
    if (formView) formView.classList.remove('hidden');
    if (tabSwitcher) tabSwitcher.classList.remove('hidden');
    if (forgotPassword) forgotPassword.classList.remove('hidden');
    if (accountView) accountView.classList.add('hidden');
  }
}

// Google OAuth button — redirects to Google via Supabase.
export async function handleAuthGoogle() {
  hideAuthMessage();
  const btn = document.getElementById('auth-google-btn');
  if (btn) btn.disabled = true;
  try {
    await signInWithGoogle();
    // Browser navigates to Google; nothing further to do here.
  } catch (err) {
    showAuthMessage(err.message || 'Google sign-in failed.');
    if (btn) btn.disabled = false;
  }
}

// Single submit action — routes to sign in or sign up based on active tab.
export async function handleAuthSubmit() {
  if (activeAuthTab === 'signup') return handleAuthSignUp();
  return handleAuthSignIn();
}

async function handleAuthSignIn() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  hideAuthMessage();
  if (!email || !password) return showAuthMessage('Please enter both email and password.');

  const btn = document.getElementById('auth-submit-btn');
  if (btn) { btn.disabled = true; btn.innerText = 'Signing in…'; }
  try {
    // Await the Supabase auth request fully before doing anything else.
    await signInWithEmail(email, password);
    // Confirm an authenticated session actually exists before proceeding.
    const session = await getSession();
    if (!session) {
      throw new Error('Sign in did not establish a session. Please try again.');
    }
    document.getElementById('auth-password').value = '';
    // Push locally created/edited items FIRST (explicit user action, not a
    // page-load auto-push) so offline guest work isn't wiped out when the
    // fetch-only sync replaces local state with the cloud view.
    await pushLocalChangesToCloud().catch(() => {});
    await syncItemsWithCloud();
    
    // Update the modal UI to show the account view instead of closing it
    await updateAuthModalUI();
  } catch (err) {
    showAuthMessage(err.message || 'Sign in failed.');
  } finally {
    restoreSubmitButton();
  }
}

async function handleAuthSignUp() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  hideAuthMessage();
  if (!email || !password) return showAuthMessage('Please enter both email and password.');
  if (password.length < 6) return showAuthMessage('Password must be at least 6 characters.');

  const btn = document.getElementById('auth-submit-btn');
  if (btn) { btn.disabled = true; btn.innerText = 'Creating account…'; }
  try {
    const data = await signUpWithEmail(email, password);
    if (data.session) {
      // Email confirmation disabled: session created, sync right away.
      document.getElementById('auth-password').value = '';
      // Push guest items first (explicit action), then fetch-only sync.
      await pushLocalChangesToCloud().catch(() => {});
      await syncItemsWithCloud();
      
      // Update the modal UI to show the account view instead of closing it
      await updateAuthModalUI();
    } else {
      showAuthMessage('Account created! Check your inbox to confirm your email, then sign in.', false);
    }
  } catch (err) {
    showAuthMessage(err.message || 'Sign up failed.');
  } finally {
    restoreSubmitButton();
  }
}

export async function handleAuthLogout() {
  await signOutUser();
  closeAuthModal();
}

// Header badge: subtle green indicator shown while cloud-synced.
export function updateCloudSyncBadge(status) {
  const badge = document.getElementById('cloud-sync-status');
  if (!badge) return;
  if (status && status.synced && status.user) {
    badge.classList.remove('hidden');
    badge.classList.add('inline-flex');
  } else {
    badge.classList.add('hidden');
    badge.classList.remove('inline-flex');
  }
}

// --- Container Usage & Subscription Tier UI ---

// Cached usage data for the current session
let cachedUsage = null;

// Update the container usage progress bar in the dashboard.
// Plan + limit are read from public.profiles (`plan`, `container_limit`) or
// user metadata; the active count comes from the server-side RPC when
// available, falling back to the local count for offline/guest mode.
export async function updateContainerUsageUI() {
  const usageContainer = document.getElementById('container-usage-widget');
  if (!usageContainer) return;

  // Fetch server usage + profile plan info in parallel.
  const [usage, planInfo] = await Promise.all([
    getContainerUsage(),
    getProfilePlanInfo()
  ]);
  
  // Active count: prefer the server-side count; fall back to the local count
  // for offline/guest mode.
  const activeCount = (usage && usage.active_count != null)
    ? usage.active_count
    : getLocalActiveContainerCount();

  // Plan: profiles.plan / user app_metadata wins; fall back to the RPC tier.
  const rawPlan = String((planInfo && planInfo.plan) || (usage && usage.tier) || 'free').toLowerCase();
  const isAdminRole = (planInfo && planInfo.role) === 'admin';
  const isProPlan = rawPlan === 'pro' || rawPlan === 'admin' || isAdminRole;

  // Container limit: profiles.container_limit wins; PRO/admin default to
  // unlimited; then RPC max_limit; then the free tier default.
  let maxLimit;
  if (planInfo && planInfo.containerLimit != null) {
    maxLimit = planInfo.containerLimit;
  } else if (isProPlan) {
    maxLimit = Infinity;
  } else if (usage && usage.max_limit != null) {
    maxLimit = usage.max_limit;
  } else {
    maxLimit = TIER_LIMITS.free;
  }

  const unlimited = !isFinite(maxLimit) || maxLimit >= 999999;
  const canCreate = unlimited || activeCount < maxLimit;
  
  cachedUsage = {
    active_count: activeCount,
    max_limit: unlimited ? 999999 : maxLimit,
    can_create: canCreate,
    tier: rawPlan,
    unlimited
  };
  
  // Calculate percentage (nominal 0 for unlimited plans)
  const percentage = unlimited ? 0 : Math.min(100, Math.round((activeCount / maxLimit) * 100));
  
  // Determine color based on usage level
  let barColor = 'bg-emerald-500';
  let textColor = 'text-emerald-400';
  if (!unlimited && percentage >= 90) {
    barColor = 'bg-red-500';
    textColor = 'text-red-400';
  } else if (!unlimited && percentage >= 70) {
    barColor = 'bg-amber-500';
    textColor = 'text-amber-400';
  }
  
  // Format the limit display (∞ for unlimited / PRO plans)
  const limitDisplay = unlimited ? '∞' : maxLimit;
  
  // Plan badge label & styling
  let planLabel;
  let planBadgeClass = 'bg-slate-700 text-slate-300 border-slate-600';
  if (isProPlan) {
    planLabel = 'PRO Plan';
    planBadgeClass = 'bg-emerald-900/60 text-emerald-300 border-emerald-600';
  } else {
    const tierNames = { free: 'Free', grower: 'Grower', commercial: 'Commercial' };
    const planName = tierNames[rawPlan] || (rawPlan.charAt(0).toUpperCase() + rawPlan.slice(1));
    planLabel = `${planName} Plan`;
  }
  
  usageContainer.innerHTML = `
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
      <div class="flex justify-between items-center">
        <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Active Containers</span>
        <span id="container-plan-badge" class="text-[10px] px-2 py-0.5 rounded-full border ${planBadgeClass}">${planLabel}</span>
      </div>
      <div class="flex items-end justify-between">
        <span class="text-2xl font-bold ${textColor}">${activeCount} <span class="text-sm font-normal text-slate-500">/ ${limitDisplay}</span></span>
        <span class="text-xs text-slate-500">${unlimited ? 'Unlimited plan' : percentage + '% used'}</span>
      </div>
      <div class="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
        <div class="${barColor} h-2 rounded-full transition-all duration-500" style="width: ${unlimited ? 4 : percentage}%"></div>
      </div>
      ${!canCreate ? `
        <button onclick="openUpgradeModal()" class="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold py-2 px-3 rounded-lg transition flex items-center justify-center gap-1">
          ⚡ Limit Reached — Upgrade Plan
        </button>
      ` : !unlimited && activeCount >= maxLimit * 0.8 ? `
        <button onclick="openUpgradeModal()" class="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold py-2 px-3 rounded-lg transition">
          View Upgrade Options
        </button>
      ` : ''}
    </div>
  `;
  
  // Update the "Add Container" button state
  updateAddContainerButtonState(canCreate);
  
  return cachedUsage;
}

// Enable/disable the Add Container buttons based on usage
export function updateAddContainerButtonState(canCreate) {
  const addButtons = document.querySelectorAll('[data-add-container-btn]');
  addButtons.forEach(btn => {
    if (!canCreate) {
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
      btn.title = 'Container limit reached. Upgrade your plan to add more.';
    } else {
      btn.disabled = false;
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
      btn.title = '';
    }
  });
}

// Show a toast notification
export function showToast(message, type = 'info', duration = 5000) {
  // Remove existing toasts
  const existingToast = document.getElementById('app-toast');
  if (existingToast) existingToast.remove();
  
  const colors = {
    info: 'bg-slate-800 border-slate-600 text-slate-200',
    success: 'bg-emerald-900/90 border-emerald-600 text-emerald-100',
    error: 'bg-red-900/90 border-red-600 text-red-100',
    warning: 'bg-amber-900/90 border-amber-600 text-amber-100'
  };
  
  const icons = {
    info: 'ℹ️',
    success: '✅',
    error: '⚠️',
    warning: '⚠️'
  };
  
  const toast = document.createElement('div');
  toast.id = 'app-toast';
  toast.className = `fixed bottom-4 right-4 z-[100] ${colors[type]} border rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3 max-w-sm animate-slide-up`;
  toast.innerHTML = `
    <span class="text-lg">${icons[type]}</span>
    <span class="text-sm font-medium">${message}</span>
    <button onclick="this.parentElement.remove()" class="ml-2 text-slate-400 hover:text-white font-bold">✕</button>
  `;
  
  document.body.appendChild(toast);
  
  // Auto-remove after duration
  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.add('animate-fade-out');
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
}

// Open the upgrade plan modal
export function openUpgradeModal() {
  // Remove existing modal if present
  closeUpgradeModal();
  
  const currentTier = cachedUsage?.tier || 'free';
  const activeCount = cachedUsage?.active_count || getLocalActiveContainerCount();
  
  const modalHtml = `
    <div id="upgrade-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[95]">
      <div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div class="p-6 space-y-6">
          <div class="flex justify-between items-start">
            <div>
              <h2 class="text-xl font-bold text-white">Upgrade Your Plan 🚀</h2>
              <p class="text-sm text-slate-400 mt-1">You're currently using <strong class="text-amber-400">${activeCount}</strong> active containers on the <strong class="capitalize">${currentTier}</strong> plan.</p>
            </div>
            <button onclick="closeUpgradeModal()" class="text-slate-400 hover:text-white font-bold text-xl">✕</button>
          </div>
          
          <div class="grid md:grid-cols-3 gap-4">
            <!-- Free Tier -->
            <div class="bg-slate-800 border ${currentTier === 'free' ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-slate-700'} rounded-xl p-5 space-y-3">
              <div class="text-center">
                <h3 class="font-bold text-white text-lg">Free</h3>
                <div class="text-3xl font-bold text-white mt-2">$0<span class="text-sm font-normal text-slate-400">/mo</span></div>
              </div>
              <ul class="text-xs text-slate-300 space-y-2">
                <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> 100 active containers</li>
                <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> Cloud sync</li>
                <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> QR label printing</li>
                <li class="flex items-center gap-2"><span class="text-slate-500">✕</span> <span class="text-slate-500">Priority support</span></li>
              </ul>
              ${currentTier === 'free' 
                ? '<div class="text-center text-xs font-bold text-emerald-400 py-2 bg-emerald-900/30 rounded-lg">Current Plan</div>'
                : '<div class="text-center text-xs text-slate-500 py-2">—</div>'}
            </div>
            
            <!-- Grower Tier -->
            <div class="bg-gradient-to-b from-slate-800 to-slate-900 border ${currentTier === 'grower' ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-amber-500/50'} rounded-xl p-5 space-y-3 relative">
              <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-[10px] font-bold px-3 py-1 rounded-full">POPULAR</div>
              <div class="text-center">
                <h3 class="font-bold text-white text-lg">Grower</h3>
                <div class="text-3xl font-bold text-amber-400 mt-2">$9<span class="text-sm font-normal text-slate-400">/mo</span></div>
              </div>
              <ul class="text-xs text-slate-300 space-y-2">
                <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> <strong>500</strong> active containers</li>
                <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> Cloud sync</li>
                <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> QR label printing</li>
                <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> Priority support</li>
              </ul>
              ${currentTier === 'grower'
                ? '<div class="text-center text-xs font-bold text-emerald-400 py-2 bg-emerald-900/30 rounded-lg">Current Plan</div>'
                : '<button onclick="selectUpgradePlan(\'grower\')" class="w-full bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold py-2.5 rounded-lg transition">Upgrade to Grower</button>'}
            </div>
            
            <!-- Commercial Tier -->
            <div class="bg-slate-800 border ${currentTier === 'commercial' ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-slate-700'} rounded-xl p-5 space-y-3">
              <div class="text-center">
                <h3 class="font-bold text-white text-lg">Commercial</h3>
                <div class="text-3xl font-bold text-white mt-2">$29<span class="text-sm font-normal text-slate-400">/mo</span></div>
              </div>
              <ul class="text-xs text-slate-300 space-y-2">
                <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> <strong>Unlimited</strong> containers</li>
                <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> Cloud sync</li>
                <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> QR label printing</li>
                <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> Priority support</li>
              </ul>
              ${currentTier === 'commercial'
                ? '<div class="text-center text-xs font-bold text-emerald-400 py-2 bg-emerald-900/30 rounded-lg">Current Plan</div>'
                : '<button onclick="selectUpgradePlan(\'commercial\')" class="w-full bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold py-2.5 rounded-lg transition">Upgrade to Commercial</button>'}
            </div>
          </div>
          
          <div class="text-center text-xs text-slate-500">
            <p>💡 <strong>Tip:</strong> Archived, Spent, and Contaminated containers don't count toward your limit.</p>
            <p class="mt-1">Contact <a href="mailto:support@sierramycolab.com" class="text-emerald-400 underline">support@sierramycolab.com</a> to upgrade or manage your subscription.</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// Close the upgrade modal
export function closeUpgradeModal() {
  const modal = document.getElementById('upgrade-modal');
  if (modal) modal.remove();
}

// Handle plan selection (placeholder for payment integration)
export function selectUpgradePlan(plan) {
  // TODO: Integrate with payment provider (Stripe, etc.)
  showToast(`To upgrade to the ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan, please contact support@sierramycolab.com`, 'info', 8000);
  closeUpgradeModal();
}

// Handle container limit errors from database operations
export function handleContainerLimitError(error) {
  if (isContainerLimitError(error)) {
    showToast('Active container limit reached for your current plan.', 'error', 6000);
    openUpgradeModal();
    return true;
  }
  return false;
}

// --- Subscription & Billing Settings Page/Modal ---

// Cached billing info for the settings page
let cachedBillingInfo = null;
let cachedTiers = null;

// Open the billing settings modal (acts as /settings/billing page)
export async function openBillingSettings() {
  // Close any existing billing modal
  closeBillingSettings();
  
  // Show loading state first
  const loadingHtml = `
    <div id="billing-settings-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[96]">
      <div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div class="p-8 text-center">
          <div class="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p class="text-slate-400 text-sm">Loading billing settings...</p>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', loadingHtml);
  
  // Fetch billing info and tiers in parallel
  const [billingInfo, tiers] = await Promise.all([
    getBillingInfo(),
    getSubscriptionTiers()
  ]);
  
  cachedBillingInfo = billingInfo;
  cachedTiers = tiers;
  
  // Render the full billing settings page
  renderBillingSettingsContent(billingInfo, tiers);
}

// Render the billing settings modal content
function renderBillingSettingsContent(billing, tiers) {
  const modal = document.getElementById('billing-settings-modal');
  if (!modal) return;
  
  const currentTier = billing.tier || 'free';
  const activeCount = billing.active_count || 0;
  const maxLimit = billing.max_limit || TIER_LIMITS.free;
  const subscriptionStatus = billing.subscription_status || 'none';
  const hasSubscription = Boolean(billing.lemonsqueezy_subscription_id);
  const portalUrl = billing.lemonsqueezy_customer_portal_url;
  const periodEnd = billing.subscription_current_period_end;
  
  // Calculate usage percentage
  const percentage = maxLimit >= 999999 ? 0 : Math.min(100, Math.round((activeCount / maxLimit) * 100));
  
  // Determine progress bar color
  let barColor = 'bg-emerald-500';
  if (percentage >= 90) barColor = 'bg-red-500';
  else if (percentage >= 70) barColor = 'bg-amber-500';
  
  // Format limit display
  const limitDisplay = maxLimit >= 999999 ? '∞' : maxLimit;
  
  // Tier display names and styling
  const tierConfig = {
    free: { name: 'Free', color: 'text-slate-300', badge: 'bg-slate-700 text-slate-300' },
    grower: { name: 'Grower', color: 'text-amber-400', badge: 'bg-amber-900/50 text-amber-300 border-amber-700' },
    commercial: { name: 'Commercial', color: 'text-emerald-400', badge: 'bg-emerald-900/50 text-emerald-300 border-emerald-700' },
    pro: { name: 'PRO', color: 'text-emerald-400', badge: 'bg-emerald-900/50 text-emerald-300 border-emerald-700' },
    admin: { name: 'PRO', color: 'text-emerald-400', badge: 'bg-emerald-900/50 text-emerald-300 border-emerald-700' }
  };
  
  // Status badge styling
  const statusConfig = {
    active: { label: 'Active', class: 'bg-emerald-900/50 text-emerald-300 border-emerald-700' },
    trialing: { label: 'Trialing', class: 'bg-blue-900/50 text-blue-300 border-blue-700' },
    canceled: { label: 'Canceled', class: 'bg-red-900/50 text-red-300 border-red-700' },
    past_due: { label: 'Past Due', class: 'bg-amber-900/50 text-amber-300 border-amber-700' },
    expired: { label: 'Expired', class: 'bg-slate-700 text-slate-400 border-slate-600' },
    none: { label: 'Free Plan', class: 'bg-slate-700 text-slate-300 border-slate-600' }
  };
  
  const currentTierConfig = tierConfig[currentTier] || tierConfig.free;
  const currentStatusConfig = statusConfig[subscriptionStatus] || statusConfig.none;
  
  // Format renewal date
  const renewalDate = periodEnd ? new Date(periodEnd).toLocaleDateString('en-US', { 
    month: 'long', day: 'numeric', year: 'numeric' 
  }) : null;
  
  // Determine which upgrade button to show
  const upgradeTarget = currentTier === 'free' ? 'grower' : currentTier === 'grower' ? 'commercial' : null;
  const upgradeTargetConfig = upgradeTarget ? tierConfig[upgradeTarget] : null;
  
  // Get tier pricing from fetched tiers or use defaults
  const tierPricing = {
    free: { price: 0, limit: 100 },
    grower: { price: 9, limit: 500 },
    commercial: { price: 29, limit: 'Unlimited' }
  };
  
  if (tiers && tiers.length) {
    tiers.forEach(t => {
      if (tierPricing[t.tier_name]) {
        tierPricing[t.tier_name].price = (t.monthly_price_cents || 0) / 100;
        tierPricing[t.tier_name].limit = t.max_active_containers >= 999999 ? 'Unlimited' : t.max_active_containers;
        tierPricing[t.tier_name].variantId = t.lemonsqueezy_variant_id;
      }
    });
  }
  
  modal.innerHTML = `
    <div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
      <div class="p-6 space-y-6">
        <!-- Header -->
        <div class="flex justify-between items-start border-b border-slate-800 pb-4">
          <div>
            <h2 class="text-xl font-bold text-white flex items-center gap-2">
              <span>💳</span> Subscription & Billing
            </h2>
            <p class="text-sm text-slate-400 mt-1">Manage your plan, usage, and payment settings.</p>
          </div>
          <button onclick="closeBillingSettings()" class="text-slate-400 hover:text-white font-bold text-xl">✕</button>
        </div>
        
        <!-- Current Plan Overview -->
        <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <div class="flex flex-wrap justify-between items-start gap-4">
            <div>
              <div class="text-xs text-slate-500 uppercase tracking-wide mb-1">Current Plan</div>
              <div class="flex items-center gap-3">
                <span class="text-2xl font-bold ${currentTierConfig.color}">${currentTierConfig.name}</span>
                <span class="text-[10px] px-2 py-1 rounded-full border ${currentStatusConfig.class}">${currentStatusConfig.label}</span>
              </div>
              ${renewalDate && hasSubscription ? `
                <div class="text-xs text-slate-500 mt-2">Renews on ${renewalDate}</div>
              ` : ''}
            </div>
            <div class="text-right">
              <div class="text-xs text-slate-500 uppercase tracking-wide mb-1">Monthly Cost</div>
              <div class="text-2xl font-bold text-white">$${tierPricing[currentTier]?.price || 0}<span class="text-sm font-normal text-slate-500">/mo</span></div>
            </div>
          </div>
        </div>
        
        <!-- Plan Usage Section -->
        <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
          <div class="flex justify-between items-center">
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              <span>📊</span> Plan Usage
            </h3>
            <span class="text-xs text-slate-500">${percentage}% of limit used</span>
          </div>
          
          <div class="flex items-end justify-between">
            <span class="text-3xl font-bold text-white">${activeCount} <span class="text-lg font-normal text-slate-500">/ ${limitDisplay} Active Containers</span></span>
          </div>
          
          <div class="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
            <div class="${barColor} h-3 rounded-full transition-all duration-500" style="width: ${maxLimit >= 999999 ? '2' : percentage}%"></div>
          </div>
          
          <p class="text-xs text-slate-500">
            💡 Containers in <strong>Archived</strong>, <strong>Spent</strong>, or <strong>Contaminated</strong> stages don't count toward your limit.
          </p>
        </div>
        
        <!-- Tier Upgrade Cards -->
        <div class="space-y-4">
          <h3 class="text-sm font-bold text-white flex items-center gap-2">
            <span>🚀</span> Available Plans
          </h3>
          
          <div class="grid md:grid-cols-3 gap-4">
            ${renderBillingTierCard('free', currentTier, tierPricing.free, tierConfig.free)}
            ${renderBillingTierCard('grower', currentTier, tierPricing.grower, tierConfig.grower, true)}
            ${renderBillingTierCard('commercial', currentTier, tierPricing.commercial, tierConfig.commercial)}
          </div>
        </div>
        
        <!-- Manage Subscription Section (for paid users) -->
        ${hasSubscription ? `
          <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-5 space-y-4">
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              <span>⚙️</span> Manage Subscription
            </h3>
            <p class="text-xs text-slate-400">
              View your receipts, update payment methods, or cancel your subscription through our secure payment portal.
            </p>
            <a href="${portalUrl || '#'}" 
               target="_blank" 
               rel="noopener noreferrer"
               onclick="${portalUrl ? '' : 'event.preventDefault(); showToast(\'Customer portal URL not available. Please contact support.\', \'warning\');'}"
               class="block w-full bg-slate-700 hover:bg-slate-600 text-white text-sm font-bold py-3 px-4 rounded-lg transition text-center">
              🧾 Manage Subscription & Receipts
            </a>
          </div>
        ` : ''}
        
        <!-- Footer -->
        <div class="text-center text-xs text-slate-500 border-t border-slate-800 pt-4">
          <p>Need help? Contact <a href="mailto:support@sierramycolab.com" class="text-emerald-400 underline">support@sierramycolab.com</a></p>
        </div>
      </div>
    </div>
  `;
}

// Render a tier card for the billing settings page
function renderBillingTierCard(tierName, currentTier, pricing, config, isPopular = false) {
  const isCurrentPlan = tierName === currentTier;
  const isUpgradeTarget = (currentTier === 'free' && tierName === 'grower') || 
                          (currentTier === 'grower' && tierName === 'commercial');
  const isDowngrade = (currentTier === 'grower' && tierName === 'free') || 
                      (currentTier === 'commercial' && (tierName === 'free' || tierName === 'grower'));
  
  const features = {
    free: ['100 active containers', 'Cloud sync', 'QR label printing', 'Community support'],
    grower: ['500 active containers', 'Cloud sync', 'QR label printing', 'Priority support'],
    commercial: ['Unlimited containers', 'Cloud sync', 'QR label printing', 'Dedicated support']
  };
  
  return `
    <div class="bg-slate-800 border ${isCurrentPlan ? 'border-emerald-500 ring-2 ring-emerald-500/30' : isPopular ? 'border-amber-500/50' : 'border-slate-700'} rounded-xl p-5 space-y-3 relative">
      ${isPopular && !isCurrentPlan ? '<div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-[10px] font-bold px-3 py-1 rounded-full">POPULAR</div>' : ''}
      <div class="text-center">
        <h4 class="font-bold ${config.color} text-lg">${config.name}</h4>
        <div class="text-2xl font-bold text-white mt-2">$${pricing.price}<span class="text-xs font-normal text-slate-400">/mo</span></div>
        <div class="text-xs text-slate-500 mt-1">${pricing.limit} containers</div>
      </div>
      <ul class="text-xs text-slate-300 space-y-1.5">
        ${features[tierName].map(f => `<li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> ${f}</li>`).join('')}
      </ul>
      ${isCurrentPlan 
        ? '<div class="text-center text-xs font-bold text-emerald-400 py-2 bg-emerald-900/30 rounded-lg">Current Plan</div>'
        : isUpgradeTarget 
          ? `<button onclick="initiateTierCheckout('${tierName}')" class="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold py-2.5 rounded-lg transition">
               Upgrade to ${config.name} Tier
             </button>`
          : isDowngrade
            ? '<div class="text-center text-xs text-slate-500 py-2">Contact support to downgrade</div>'
            : '<div class="text-center text-xs text-slate-500 py-2">—</div>'}
    </div>
  `;
}

// Initiate checkout for a tier upgrade via Lemon Squeezy
export async function initiateTierCheckout(tierName) {
  // Get the variant ID from cached tiers
  let variantId = null;
  if (cachedTiers && cachedTiers.length) {
    const tier = cachedTiers.find(t => t.tier_name === tierName);
    variantId = tier?.lemonsqueezy_variant_id;
  }
  
  // Fallback variant IDs (should be configured in database)
  if (!variantId) {
    const fallbackVariants = {
      grower: 'GROWER_VARIANT_ID',
      commercial: 'COMMERCIAL_VARIANT_ID'
    };
    variantId = fallbackVariants[tierName];
  }
  
  if (!variantId || variantId.includes('VARIANT_ID')) {
    showToast('Checkout is not configured yet. Please contact support to upgrade.', 'warning', 6000);
    return;
  }
  
  // Show loading toast
  showToast('Creating secure checkout session...', 'info', 3000);
  
  // Call the checkout API
  const result = await createLemonSqueezyCheckout(tierName, variantId);
  
  if (result.error) {
    showToast(result.error, 'error', 6000);
    return;
  }
  
  if (result.checkout_url) {
    // Open checkout in a new window or redirect
    window.open(result.checkout_url, '_blank', 'noopener,noreferrer');
    showToast('Opening secure checkout...', 'success', 3000);
  } else {
    showToast('Failed to create checkout session. Please try again.', 'error', 6000);
  }
}

// Close the billing settings modal
export function closeBillingSettings() {
  const modal = document.getElementById('billing-settings-modal');
  if (modal) modal.remove();
}

// Refresh billing info after returning from checkout
export async function refreshBillingInfo() {
  if (cachedBillingInfo) {
    const billingInfo = await getBillingInfo();
    cachedBillingInfo = billingInfo;
    // Re-render if modal is open
    const modal = document.getElementById('billing-settings-modal');
    if (modal) {
      renderBillingSettingsContent(billingInfo, cachedTiers);
    }
  }
  // Also update the dashboard usage widget
  updateContainerUsageUI();
}

// Open organization settings modal
export function openOrgSettings() {
  showModal(document.getElementById('org-settings-modal'));
}

// Close organization settings modal
export function closeOrgSettings() {
  const modal = document.getElementById('org-settings-modal');
  if (modal) modal.remove();
}

// Switch between organization tabs
export function switchOrgTab(tab) {
  const generalTab = document.getElementById('org-tab-general');
  const featuresTab = document.getElementById('org-tab-features');
  const generalPanel = document.getElementById('org-panel-general');
  const featuresPanel = document.getElementById('org-panel-features');

  if (generalTab && featuresTab && generalPanel && featuresPanel) {
    if (tab === 'general') {
      generalTab.className = 'px-4 py-2 text-xs font-bold border-b-2 border-emerald-500 text-emerald-400 transition';
      featuresTab.className = 'px-4 py-2 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition';
      generalPanel.classList.remove('hidden');
      featuresPanel.classList.add('hidden');
    } else {
      featuresTab.className = 'px-4 py-2 text-xs font-bold border-b-2 border-emerald-500 text-emerald-400 transition';
      generalTab.className = 'px-4 py-2 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition';
      featuresPanel.classList.remove('hidden');
      generalPanel.classList.add('hidden');
    }
  }
}

// Save organization settings
export async function saveOrgSettings() {
  const enableSales = document.getElementById('org-enable-sales').checked;
  const enableRacks = document.getElementById('org-enable-racks').checked;
  const enableSupplies = document.getElementById('org-enable-supplies').checked;

  const { updateOrganizationSettings, currentOrganizationId } = await import('./db.js');

  try {
    showToast('Saving feature modules...', 'info');
    
    const settings = {
      enable_sales: enableSales,
      enable_racks: enableRacks,
      enable_supplies: enableSupplies
    };

    await updateOrganizationSettings(currentOrganizationId, settings);
    showToast('✓ Feature modules updated successfully!', 'success');
    
    // Trigger dynamic toggle of sidebar/app sections based on these active boolean flags
    if (typeof window.applyFeatureToggles === 'function') {
      window.applyFeatureToggles(settings);
    }
    
    closeOrgSettings();
  } catch (err) {
    console.error('Failed to save organization settings:', err);
    showToast('Failed to update feature modules: ' + err.message, 'error');
  }
}
