// Modal rendering & interaction logic for Sierra Myco Lab.

import {
  db,
  saveItems,
  getFeedback,
  submitFeedback,
  upvoteFeature,
  isSupabaseConfigured,
  getCurrentUser,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signOutUser,
  syncItemsWithCloud,
  getSyncStatus,
  getContainerUsage,
  getLocalActiveContainerCount,
  TIER_LIMITS,
  INACTIVE_STAGES,
  isContainerLimitError
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
  GRAIN_STAGES
} from './config.js';

// --- Module-level modal state ---
let activeItemId = null;
let g2gScannedIds = [];
let printLayout = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_LAYOUT) || APP_CONFIG.DEFAULT_PRINT_LAYOUT;
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
    db.items = db.items.filter(i => i.id !== activeItemId);
    closeModal();
    saveItems();
  }
}

export function deleteItemDirect(id, e) {
  e.stopPropagation();
  if (confirm(`Delete container ${id}?`)) {
    db.items = db.items.filter(i => i.id !== id);
    saveItems();
  }
}

export function deleteUninoculated() {
  const count = db.items.filter(i => i.stage === 'Uninoculated').length;
  if (!count) return alert('No uninoculated containers to delete.');
  if (confirm(`Are you sure you want to purge all ${count} uninoculated jars?`)) {
    db.items = db.items.filter(i => i.stage !== 'Uninoculated');
    saveItems();
  }
}

export function deletePCBatch(batchId) {
  const affected = db.items.filter(i => i.pcBatch === batchId).length;
  if (confirm(`Delete PC Batch "${batchId}" and all ${affected} associated items?`)) {
    db.items = db.items.filter(i => i.pcBatch !== batchId);
    db.pcBatches = db.pcBatches.filter(b => b.batchId !== batchId);
    saveItems();
    openBatchModal();
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
function getLayoutConfig(layout) {
  switch (layout) {
    case '10-up': return { slots: 10, cols: 2 };
    case '20-up': return { slots: 20, cols: 2 };
    case '80-up': return { slots: 80, cols: 4 };
    case '30-up':
    default: return { slots: 30, cols: 3 };
  }
}

export function openPrintSettingsModal(itemList = null) {
  pendingPrintItems = itemList;

  // Load stored configurations
  printLayout = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_LAYOUT) || APP_CONFIG.DEFAULT_PRINT_LAYOUT;
  printOffset = parseInt(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_OFFSET)) || APP_CONFIG.DEFAULT_PRINT_OFFSET;

  // Update UI elements to match stored configurations
  const layoutSelect = document.getElementById('print-layout-select');
  const offsetSelect = document.getElementById('print-offset-select');
  if (layoutSelect) layoutSelect.value = printLayout;

  const config = getLayoutConfig(printLayout);
  if (printOffset > config.slots) {
    printOffset = 1;
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_OFFSET, printOffset);
  }

  if (offsetSelect) {
    offsetSelect.innerHTML = Array.from({ length: config.slots }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
    offsetSelect.value = printOffset;
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

  onPrintLayoutChange(false); // Update preview layout view (suppress automatic save)

  const modal = document.getElementById('print-settings-modal');
  if (modal) {
    showModal(modal);
  }
}

export function closePrintSettingsModal() {
  const modal = document.getElementById('print-settings-modal');
  if (modal) {
    hideModal(modal);
  }
  pendingPrintItems = null;
}

export function onPrintLayoutChange(shouldSave = true) {
  const layoutSelect = document.getElementById('print-layout-select');
  if (layoutSelect) {
    printLayout = layoutSelect.value;
    if (shouldSave) {
      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_LAYOUT, printLayout);
    }
  }

  const offsetContainer = document.getElementById('print-offset-container');
  if (offsetContainer) {
    if (printLayout !== 'single') {
      offsetContainer.classList.remove('hidden');

      // Dynamically populate offset select options
      const config = getLayoutConfig(printLayout);
      const offsetSelect = document.getElementById('print-offset-select');
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

  const config = getLayoutConfig(printLayout);
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
  printLayout = document.getElementById('print-layout-select').value;
  localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_LAYOUT, printLayout);

  const includeContainerCheckbox = document.getElementById('print-include-container');
  if (includeContainerCheckbox) {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_INCLUDE_CONTAINER, includeContainerCheckbox.checked ? 'true' : 'false');
  }

  if (printLayout !== 'single') {
    printOffset = parseInt(document.getElementById('print-offset-select').value) || 1;
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_OFFSET, printOffset);
  }

  if (pendingPrintItems && pendingPrintItems.length > 0) {
    const itemsToPrint = pendingPrintItems;
    closePrintSettingsModal();
    executePrint(itemsToPrint, printLayout, printOffset);
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

export function executePrint(itemList, layout, offset) {
  const section = document.getElementById('bulk-print-section');
  if (!section) return;
  section.innerHTML = '';

  // Apply layout class to container
  if (layout !== 'single') {
    section.className = `layout-${layout}`;

    // Render empty invisible placeholder cards before first active label
    const skippedCount = offset - 1;
    for (let s = 0; s < skippedCount; s++) {
      const placeholder = document.createElement('div');
      placeholder.className = 'print-placeholder';
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

    let containerElement = '';
    if (includeContainer && item.containerType) {
      containerElement = `<div class="print-extra font-semibold text-emerald-800">${item.containerType}${item.containerWeight ? ` (${item.containerWeight})` : ''}</div>`;
    }

    card.innerHTML = `
      <div class="print-qr-container" id="print-qr-${item.id}"></div>
      <div class="print-text-container">
        <div class="print-id">${item.id}</div>
        <div class="print-strain">${item.strain === 'Uninoculated' ? 'Uninoculated' : item.strain}</div>
        <div class="print-date">Inoc: ${item.createdAt}</div>
        <div class="print-extra">${item.medium}</div>
        ${containerElement}
      </div>
    `;
    section.appendChild(card);

    // Render QR Code in background
    setTimeout(() => {
      const size = layout === '10-up' ? 140 : layout === '80-up' ? 38 : 70;
      const qrPayload = `${window.location.origin}${window.location.pathname}#item=${item.id}`;
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
    el.classList.toggle('bg-slate-950', isActive);
    el.classList.toggle('text-white', isActive);
    el.classList.toggle('shadow', isActive);
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
  const formView = document.getElementById('auth-form-view');
  const accountView = document.getElementById('auth-account-view');

  // Supabase not configured yet: show local-only setup notice.
  if (!isSupabaseConfigured()) {
    if (setupNotice) setupNotice.classList.remove('hidden');
    if (formView) formView.classList.add('hidden');
    if (accountView) accountView.classList.add('hidden');
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
    if (accountView) accountView.classList.remove('hidden');
    const info = document.getElementById('auth-account-info');
    if (info) {
      const status = getSyncStatus();
      const lastSyncText = status.at ? new Date(status.at).toLocaleString() : 'pending…';
      info.innerHTML = `
        <div class="text-xs text-slate-500">Signed in as</div>
        <div class="text-sm font-bold text-amber-300 break-all">${user.email || user.id}</div>
        <div class="text-[10px] text-slate-500 mt-1">Last cloud sync: ${lastSyncText}</div>
      `;
    }
  } else {
    if (formView) formView.classList.remove('hidden');
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
    await signInWithEmail(email, password);
    document.getElementById('auth-password').value = '';
    await syncItemsWithCloud();
    closeAuthModal();
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
      await syncItemsWithCloud();
      closeAuthModal();
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

// Update the container usage progress bar in the dashboard
export async function updateContainerUsageUI() {
  const usageContainer = document.getElementById('container-usage-widget');
  if (!usageContainer) return;

  // Try to get usage from Supabase RPC first
  let usage = await getContainerUsage();
  
  // Fallback to local count if RPC unavailable (offline/guest mode)
  if (!usage) {
    const localCount = getLocalActiveContainerCount();
    usage = {
      active_count: localCount,
      max_limit: TIER_LIMITS.free,
      can_create: localCount < TIER_LIMITS.free,
      tier: 'free'
    };
  }
  
  cachedUsage = usage;
  
  // Calculate percentage
  const percentage = Math.min(100, Math.round((usage.active_count / usage.max_limit) * 100));
  
  // Determine color based on usage level
  let barColor = 'bg-emerald-500';
  let textColor = 'text-emerald-400';
  if (percentage >= 90) {
    barColor = 'bg-red-500';
    textColor = 'text-red-400';
  } else if (percentage >= 70) {
    barColor = 'bg-amber-500';
    textColor = 'text-amber-400';
  }
  
  // Format the limit display (show ∞ for commercial tier)
  const limitDisplay = usage.max_limit >= 999999 ? '∞' : usage.max_limit;
  
  // Tier display names
  const tierNames = { free: 'Free', grower: 'Grower', commercial: 'Commercial' };
  const tierDisplay = tierNames[usage.tier] || 'Free';
  
  usageContainer.innerHTML = `
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
      <div class="flex justify-between items-center">
        <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Active Containers</span>
        <span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 border border-slate-600">${tierDisplay} Plan</span>
      </div>
      <div class="flex items-end justify-between">
        <span class="text-2xl font-bold ${textColor}">${usage.active_count} <span class="text-sm font-normal text-slate-500">/ ${limitDisplay}</span></span>
        <span class="text-xs text-slate-500">${percentage}% used</span>
      </div>
      <div class="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
        <div class="${barColor} h-2 rounded-full transition-all duration-500" style="width: ${percentage}%"></div>
      </div>
      ${!usage.can_create ? `
        <button onclick="openUpgradeModal()" class="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold py-2 px-3 rounded-lg transition flex items-center justify-center gap-1">
          ⚡ Limit Reached — Upgrade Plan
        </button>
      ` : usage.active_count >= usage.max_limit * 0.8 ? `
        <button onclick="openUpgradeModal()" class="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold py-2 px-3 rounded-lg transition">
          View Upgrade Options
        </button>
      ` : ''}
    </div>
  `;
  
  // Update the "Add Container" button state
  updateAddContainerButtonState(usage.can_create);
  
  return usage;
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
                <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> 15 active containers</li>
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
                <li class="flex items-center gap-2"><span class="text-emerald-400">✓</span> <strong>100</strong> active containers</li>
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
