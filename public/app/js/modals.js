// Modal rendering & interaction logic for Sierra Myco Lab.

import {
  db,
  saveItems,
  getFeedback,
  submitFeedback,
  upvoteFeature,
  isSupabaseConfigured,
  getCurrentUser,
  signOutUser,
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
  deleteItemsFromCloud,
  userOrganizations,
  currentOrganizationId,
  setCurrentOrganizationId
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
  calculateBE,
  formatLocalDate,
  extractDateFromLabel,
  getInoculationDate,
  estimateHarvestDate,
  escapeHtml
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
  if (!element) {
    console.error("showModal: Element not found");
    return;
  }
  element.classList.remove('hidden');
  element.classList.add('flex');
}

function hideModal(element) {
  element.classList.add('hidden');
  element.classList.remove('flex');
}

// Helper to dynamically find an item by id, code, custom_id, or display_id
export function findItem(identifier) {
  if (!identifier) return null;
  if (typeof identifier === 'object' && identifier !== null) {
    const key = identifier.id || identifier.code || identifier.custom_id || identifier.display_id;
    return (key ? findItem(key) : null) || identifier;
  }
  return (db.items || []).find(i => 
    i && (
      i.id === identifier || 
      i.code === identifier || 
      i.custom_id === identifier || 
      i.display_id === identifier
    )
  ) || null;
}

// --- Single Item Detail Modal ---
export function openItemModal(itemOrId) {
  return openModal(itemOrId);
}

export function openItemDetailModal(itemOrId) {
  if (!itemOrId) {
    console.warn('openItemDetailModal: No item or ID provided.');
    return;
  }
  const item = findItem(itemOrId);
  if (!item) {
    console.warn('openItemDetailModal: Item not found for:', itemOrId);
    showToast('Container item not found.', 'warning');
    return;
  }
  return openModal(item);
}

export function showItemDetails(itemOrId) {
  return openModal(itemOrId);
}

export function showContainerDetails(itemOrId) {
  return openModal(itemOrId);
}

export function openModal(itemOrId) {
  if (!itemOrId) {
    console.warn('openModal: No item or ID provided.');
    return;
  }

  const item = findItem(itemOrId);

  if (!item) {
    const id = typeof itemOrId === 'object' ? (itemOrId.id || itemOrId.code || itemOrId.custom_id || 'unknown') : itemOrId;
    console.warn(`openModal: Item not found with ID "${id}"`);
    showToast('Container item not found.', 'warning');
    return;
  }

  activeItemId = item.id || id;

  const modalIdEl = document.getElementById('modal-id');
  if (modalIdEl) modalIdEl.innerText = item.id;
  const modalLabelEl = document.getElementById('modal-label');
  if (modalLabelEl) modalLabelEl.innerText = item.label;

  let parentText = item.parentItemId ? `Transferred from ${item.parentItemId}` : 'Spore/LC Generation 1';
  let genText = item.generation ? ` | Generation: ${item.generation}` : '';
  let containerInfo = item.containerType ? ` | Container: ${item.containerType}${item.containerWeight ? ` (${item.containerWeight})` : ''}` : '';
  document.getElementById('modal-lineage').innerText = `Batch: ${item.pcBatch} | ${parentText}${genText}${containerInfo}`;

  const parentSourceId = item.parent_id || item.parentItemId || null;
  const parentSourceEl = document.getElementById('modal-parent-source');
  if (parentSourceEl) {
    if (parentSourceId) {
      parentSourceEl.innerText = `Parent Source: [${parentSourceId.substring(0, 8)}]`;
      parentSourceEl.classList.remove('hidden');
    } else {
      parentSourceEl.innerText = '';
      parentSourceEl.classList.add('hidden');
    }
  }

  // Render Spawn Lineage badge for bulk substrate items with a captured parent spawn source
  const lineageBadge = document.getElementById('modal-lineage-badge');
  
  // Render Legacy Source badge if applicable
  const spawnId = item.parentSpawnId || item.parentSourceId;
  if (lineageBadge && !item.parentItemId && item.legacy_source_description) {
    lineageBadge.innerHTML = `
      <div class="text-xs bg-slate-800 border border-slate-700 rounded p-2 my-2 text-slate-300">
        <span class="text-amber-400 font-semibold">📜 Legacy Origin:</span>
        <span class="text-slate-300">${escapeHtml(item.legacy_source_description)}</span>
      </div>
    `;
    lineageBadge.classList.remove('hidden');
  } else if (lineageBadge) {
    if (spawnId) {
      const spawnName = item.parentSpawnName || spawnId;
      lineageBadge.innerHTML = `
        <div class="text-xs bg-slate-800 border border-slate-700 rounded p-2 my-2 text-slate-300">
          <span class="text-emerald-400 font-semibold">🧬 Spawn Lineage:</span>
          <a href="#" onclick="openModal('${spawnId}'); return false;" class="underline hover:text-emerald-300">${spawnName}</a>
        </div>
      `;
      lineageBadge.classList.remove('hidden');
    } else if (!item.legacy_source_description) {
      lineageBadge.innerHTML = '';
      lineageBadge.classList.add('hidden');
    }
  }

  const inocBanner = document.getElementById('inoculate-banner');
  if (item.stage === 'Uninoculated') {
    inocBanner.classList.remove('hidden');
    document.getElementById('inoc-parent').innerHTML = `<option value="">Source: Spore / LC</option>` +
      db.items.filter(i => i.id !== id && i.stage !== 'Uninoculated' && !isLockedStage(i.stage)).map(i => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.id)} - ${escapeHtml(i.label)}</option>`).join('');
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

  // "Mark as Spent" quick action: visible on any container whose stage isn't
  // already one of the inactive/terminal stages (Spent, Archived, Contaminated).
  const spentBtn = document.getElementById('btn-mark-spent');
  if (spentBtn) spentBtn.classList.toggle('hidden', INACTIVE_STAGES.includes(item.stage));

  toggleContamFields();

  // The creation entry is the LAST element (history is built with a single
  // entry, then later stage changes are unshifted in front of it). If the
  // item carries an explicit user-entered date (e.g. from "Create Parent
  // Asset"), prefer that over the entry's raw timestamp - which is always
  // stamped with the real moment the form was submitted, and can silently
  // diverge from a deliberately backdated asset. For older items with no
  // prep_date, fall back to a date extracted from the name/batch/code string.
  const explicitCreationDate = formatLocalDate(item.prepDate || item.prep_date) || extractDateFromLabel(item);
  document.getElementById('modal-history').innerHTML = item.history.map((h, idx) => {
    const isCreationEntry = idx === item.history.length - 1;
    const displayTimestamp = (isCreationEntry && explicitCreationDate) ? explicitCreationDate : h.timestamp;
    return `
    <div class="text-xs border-b border-slate-800 pb-2 last:border-0">
      <div class="flex justify-between text-slate-400">
        <span class="font-bold ${h.stage === 'Contaminated' ? 'text-red-400' : 'text-emerald-400'}">${h.stage} <span class="text-slate-500 font-normal">${h.env}</span></span>
        <span>${displayTimestamp}</span>
      </div>
      ${(h.temp !== undefined && h.temp !== null) || (h.humidity !== undefined && h.humidity !== null) ? `
        <div class="text-slate-500 mt-0.5">🌡️ ${h.temp !== undefined && h.temp !== null ? h.temp + '°F' : ''} ${h.humidity !== undefined && h.humidity !== null ? '| RH ' + h.humidity + '%' : ''}</div>
      ` : ''}
      ${h.notes ? `<p class="text-slate-300 mt-1">${escapeHtml(h.notes)}</p>` : ''}
    </div>
  `;
  }).join('');

  // --- Lineage / Inoculated Containers (reverse lookup: items whose parent_id points here) ---
  const childrenSection = document.getElementById('modal-children-section');
  const childrenList = document.getElementById('modal-children-list');
  if (childrenSection && childrenList) {
    const childItems = db.items.filter(i =>
      i.id !== item.id && (i.parent_id === item.id || i.parentItemId === item.id)
    );

    if (childItems.length === 0) {
      childrenList.innerHTML = '';
      childrenSection.classList.add('hidden');
    } else {
      childrenList.innerHTML = childItems.map(child => {
        const shortId = (child.id || '').substring(0, 8);
        const containerType = child.containerType || child.container_type || 'Unknown Container';
        const batchId = child.pcBatch || child.batch_code || 'N/A';
        const stage = child.stage || 'Unknown';
        return `
          <a href="#" onclick="openModal('${child.id}'); return false;"
             class="flex items-center justify-between text-xs border-b border-slate-800 last:border-0 py-1.5 px-1 -mx-1 rounded hover:bg-slate-800 transition text-slate-300">
            <span class="font-mono text-emerald-400">[${shortId}]</span>
            <span class="flex-1 mx-2 truncate">${containerType} - ${batchId}</span>
            <span class="font-semibold ${stage === 'Contaminated' ? 'text-red-400' : 'text-slate-400'}">${stage}</span>
          </a>
        `;
      }).join('');
      childrenSection.classList.remove('hidden');
    }
  }

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
// and a "Copy Link" button. The QR value embeds the configured production base URL
// so scanned codes resolve directly to the live app URL.
export function openViewQRCodeModal() {
  const item = db.items.find(i => i.id === activeItemId);
  if (!item) return;

  const modal = document.getElementById('view-qr-modal');
  if (!modal) return;

  // Set container ID display
  const idEl = document.getElementById('view-qr-item-id');
  if (idEl) idEl.innerText = item.id;

  // Compute target scan URL — getAppBaseUrl() resolves the org's custom scan
  // domain or falls back to this origin's /app/ mount point.
  const cleanBaseUrl = getAppBaseUrl();
  const scanTargetUrl = `${cleanBaseUrl}/#container=${item.id}`;

  // Set link text
  const linkEl = document.getElementById('view-qr-link');
  if (linkEl) linkEl.innerText = scanTargetUrl || 'No valid container ID';

  // Render QR code or skeleton placeholder
  renderQRCodeWithSkeleton('view-qr-code', scanTargetUrl, 160);

  showModal(modal);
}

export function closeViewQRCodeModal() {
  hideModal(document.getElementById('view-qr-modal'));
}

// Copy the container's shareable link to the clipboard
export function copyQRCodeLink() {
  const item = db.items.find(i => i.id === activeItemId);
  if (!item) return;

  const cleanBaseUrl = getAppBaseUrl();
  const link = `${cleanBaseUrl}/#container=${item.id}`;

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

// Quick action: mark the active item's container as fully depleted. Only
// touches stage/history fields - never clears item.id or any parent/child
// linkage, so existing lineage (parent_id / parentItemId on this item, and
// any child items pointing at it) stays intact.
export function markItemSpent() {
  const item = db.items.find(i => i.id === activeItemId);
  if (!item) return;
  if (INACTIVE_STAGES.includes(item.stage)) return;
  if (!confirm(`Mark ${item.label || item.id} as Spent? It will be hidden from inoculant source lists.`)) return;

  const fromStage = item.stage;
  item.stage = 'Spent';
  item.archived = true;
  item.history = item.history || [];
  item.history.unshift({
    stage: 'Spent',
    timestamp: new Date().toLocaleString(),
    notes: 'Container fully depleted / Marked as Spent.',
    env: ''
  });
  item.lifecycleHistory = item.lifecycleHistory || [];
  item.lifecycleHistory.unshift({
    fromStage: fromStage,
    toStage: 'Spent',
    timestamp: new Date().toLocaleString(),
    type: 'manual-spent',
    notes: 'Container fully depleted / Marked as Spent.'
  });

  saveItems();
  closeModal();

  if (typeof window.render === 'function') window.render();
  if (typeof window.updateDashboard === 'function') window.updateDashboard();
  showToast(`✓ ${item.id} marked as Spent.`, 'success', 3000);
}

// --- Delete Functions ---
export async function deleteActiveItem() {
  if (!activeItemId) return;
  if (confirm(`Are you sure you want to delete item ${activeItemId}? This cannot be undone.`)) {
    const deletedId = activeItemId;
    closeModal();

    // 1. Permanently delete from Supabase first if configured
    if (isSupabaseConfigured()) {
      const result = await deleteItemsFromCloud([deletedId]);
      if (!result.success && result.error) {
        showToast(`Failed to delete from cloud: ${result.error.message}`, 'error');
      }
    }

    // 2. Filter local array in-place and persist
    db.items = db.items.filter(i => i.id !== deletedId);
    saveItems();

    if (typeof window.render === 'function') window.render();
    if (typeof window.updateDashboard === 'function') window.updateDashboard();
    if (typeof window.updateContainerUsageUI === 'function') window.updateContainerUsageUI();
  }
}

export async function deleteItemDirect(id, e) {
  if (e && e.stopPropagation) e.stopPropagation();
  if (confirm(`Delete container ${id}?`)) {
    // 1. Permanently delete from Supabase first if configured
    if (isSupabaseConfigured()) {
      const result = await deleteItemsFromCloud([id]);
      if (!result.success && result.error) {
        showToast(`Failed to delete from cloud: ${result.error.message}`, 'error');
      }
    }

    // 2. Filter local array in-place and persist
    db.items = db.items.filter(i => i.id !== id);
    saveItems();

    if (typeof window.render === 'function') window.render();
    if (typeof window.updateDashboard === 'function') window.updateDashboard();
    if (typeof window.updateContainerUsageUI === 'function') window.updateContainerUsageUI();
  }
}

export async function deleteUninoculated() {
  const uninoculatedItems = db.items.filter(i => i.stage === 'Uninoculated' || i.stage === 'Preparation');
  const count = uninoculatedItems.length;
  if (!count) return alert('No uninoculated containers to delete.');
  if (confirm(`Are you sure you want to purge all ${count} uninoculated containers?`)) {
    const deletedIds = uninoculatedItems.map(i => i.id);

    // 1. Permanently delete from Supabase first if configured
    if (isSupabaseConfigured()) {
      const result = await deleteItemsFromCloud(deletedIds);
      if (!result.success && result.error) {
        showToast(`Failed to delete from cloud: ${result.error.message}`, 'error');
      }
    }

    // 2. Filter local array in-place and persist
    db.items = db.items.filter(i => i.stage !== 'Uninoculated' && i.stage !== 'Preparation');
    saveItems();

    if (typeof window.render === 'function') window.render();
    if (typeof window.updateDashboard === 'function') window.updateDashboard();
    if (typeof window.updateContainerUsageUI === 'function') window.updateContainerUsageUI();
  }
}

export async function deletePCBatch(batchId) {
  const affectedItems = db.items.filter(i => i.pcBatch === batchId || i.batch_code === batchId);
  const affected = affectedItems.length;
  if (confirm(`Delete PC Batch "${batchId}" and all ${affected} associated items?`)) {
    const deletedIds = affectedItems.map(i => i.id);

    // 1. Permanently delete from Supabase first if configured
    if (isSupabaseConfigured()) {
      const result = await deleteItemsFromCloud(deletedIds);
      if (!result.success && result.error) {
        showToast(`Failed to delete from cloud: ${result.error.message}`, 'error');
      }
    }

    // 2. Filter local arrays in-place and persist
    db.items = db.items.filter(i => i.pcBatch !== batchId && i.batch_code !== batchId);
    db.pcBatches = db.pcBatches.filter(b => b.batchId !== batchId);
    saveItems();
    openBatchModal();

    if (typeof window.render === 'function') window.render();
    if (typeof window.updateDashboard === 'function') window.updateDashboard();
    if (typeof window.updateContainerUsageUI === 'function') window.updateContainerUsageUI();
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
  if (typeof window.stopG2GCameraScan === 'function') {
    window.stopG2GCameraScan();
  }
  hideModal(document.getElementById('g2g-modal'));
}

// --- Spawn to Fruiting Block Modal Logic ---
let spawnBulkSelectedSubstrateId = null;

export function openSpawnBulkModal() {
  const parent = db.items.find(i => i.id === activeItemId);
  if (!parent) return;

  const parentGen = parent.generation || 1;
  const nameEl = document.getElementById('spawn-bulk-source-name');
  const detailsEl = document.getElementById('spawn-bulk-source-details');
  if (nameEl) nameEl.innerText = parent.label || `${parent.medium} - ${parent.strain || 'Grain Spawn'}`;
  if (detailsEl) detailsEl.innerText = `ID: ${parent.id} | Strain: ${parent.strain || 'Unknown'} | Gen: ${parentGen}`;

  spawnBulkSelectedSubstrateId = null;
  const scanInput = document.getElementById('spawn-bulk-scan-input');
  if (scanInput) scanInput.value = '';
  
  const partialCheckbox = document.getElementById('spawn-bulk-partial');
  if (partialCheckbox) partialCheckbox.checked = false;

  const subInfo = document.getElementById('spawn-bulk-selected-substrate-info');
  if (subInfo) {
    subInfo.innerHTML = '';
    subInfo.classList.add('hidden');
  }

  populateSpawnBulkSubstrateSelect();
  switchSpawnBulkTab('scan');

  showModal(document.getElementById('spawn-bulk-modal'));
}

export function closeSpawnBulkModal() {
  if (typeof window.stopSpawnBulkCameraScan === 'function') {
    window.stopSpawnBulkCameraScan();
  }
  hideModal(document.getElementById('spawn-bulk-modal'));
}

export function switchSpawnBulkTab(tab) {
  const tabScan = document.getElementById('spawn-bulk-tab-scan');
  const tabCreate = document.getElementById('spawn-bulk-tab-create');
  const panelScan = document.getElementById('spawn-bulk-panel-scan');
  const panelCreate = document.getElementById('spawn-bulk-panel-create');

  if (tab === 'scan') {
    if (tabScan) {
      tabScan.classList.add('border-emerald-500', 'text-emerald-400');
      tabScan.classList.remove('border-transparent', 'text-slate-400');
    }
    if (tabCreate) {
      tabCreate.classList.add('border-transparent', 'text-slate-400');
      tabCreate.classList.remove('border-emerald-500', 'text-emerald-400');
    }
    if (panelScan) panelScan.classList.remove('hidden');
    if (panelCreate) panelCreate.classList.add('hidden');
  } else {
    if (tabCreate) {
      tabCreate.classList.add('border-emerald-500', 'text-emerald-400');
      tabCreate.classList.remove('border-transparent', 'text-slate-400');
    }
    if (tabScan) {
      tabScan.classList.add('border-transparent', 'text-slate-400');
      tabScan.classList.remove('border-emerald-500', 'text-emerald-400');
    }
    if (panelCreate) panelCreate.classList.remove('hidden');
    if (panelScan) panelScan.classList.add('hidden');
  }
}

export function populateSpawnBulkSubstrateSelect() {
  const select = document.getElementById('spawn-bulk-substrate-select');
  if (!select) return;

  // Find uninoculated substrate items in Preparation stage
  const prepSubstrates = db.items.filter(i => {
    if (i.id === activeItemId || isLockedStage(i.stage)) return false;
    const isPrep = i.stage === 'Preparation' || i.stage === 'Uninoculated';
    const isSub = getItemCategory(i) === 'Bulk Substrate' || getMediumType(i) === 'substrate';
    return isPrep && isSub;
  });

  if (!prepSubstrates.length) {
    select.innerHTML = '<option value="">No uninoculated substrate bags in inventory</option>';
    return;
  }

  select.innerHTML = '<option value="">-- Select Uninoculated Substrate --</option>' +
    prepSubstrates.map(i => `<option value="${i.id}">${i.id} - ${i.label || i.medium} (${i.containerType || 'Substrate Bag'})</option>`).join('');
}

export function handleSpawnBulkScanInput(event) {
  if (event.key === 'Enter') {
    if (event.preventDefault) event.preventDefault();
    const input = event.target;
    let scannedId = (input.value || '').trim();
    if (scannedId.includes('#item=')) {
      scannedId = scannedId.split('#item=')[1];
    }
    if (scannedId.includes('/container/')) {
      scannedId = scannedId.split('/container/')[1];
    }
    selectSpawnBulkSubstrate(scannedId);
    if (input.value !== undefined) input.value = '';
  }
}

export function onSpawnBulkSubstrateSelect(subId) {
  selectSpawnBulkSubstrate(subId);
}

export function selectSpawnBulkSubstrate(subId) {
  if (!subId) {
    spawnBulkSelectedSubstrateId = null;
    const subInfo = document.getElementById('spawn-bulk-selected-substrate-info');
    if (subInfo) {
      subInfo.innerHTML = '';
      subInfo.classList.add('hidden');
    }
    return;
  }

  const subItem = db.items.find(i => i.id === subId || i.code === subId || i.custom_id === subId);
  if (!subItem) {
    showToast(`Substrate item not found: ${subId}`, 'error');
    return;
  }

  spawnBulkSelectedSubstrateId = subItem.id;

  const select = document.getElementById('spawn-bulk-substrate-select');
  if (select) {
    select.value = subItem.id;
  }

  const subInfo = document.getElementById('spawn-bulk-selected-substrate-info');
  if (subInfo) {
    subInfo.innerHTML = `
      <div class="flex justify-between items-center">
        <div>
          <span class="font-bold text-emerald-400">✓ Selected Substrate:</span>
          <span class="text-white font-mono ml-1">${subItem.id}</span>
          <span class="text-slate-300 ml-1">(${subItem.medium || subItem.label || 'Substrate'})</span>
        </div>
        <button type="button" onclick="selectSpawnBulkSubstrate('')" class="text-red-400 hover:text-red-300 font-bold ml-2">✕</button>
      </div>
    `;
    subInfo.classList.remove('hidden');
  }
}

export function executeSpawnToFruitingBlock() {
  const parent = db.items.find(i => i.id === activeItemId);
  if (!parent) {
    showToast('Source grain container not found.', 'error');
    return;
  }

  const panelCreate = document.getElementById('spawn-bulk-panel-create');
  const isQuickCreate = panelCreate && !panelCreate.classList.contains('hidden');

  const ratio = document.getElementById('spawn-bulk-ratio')?.value || '1:2';
  const qty = parseInt(document.getElementById('spawn-bulk-qty')?.value, 10) || 1;
  const printNow = document.getElementById('spawn-bulk-print-now')?.checked !== false;
  const isPartial = document.getElementById('spawn-bulk-partial')?.checked === true;

  let substrateName = 'CVG Bulk';
  let containerType = 'Fruiting Block / Monotub';
  let containerWeight = '5 lb Bag';
  let parentSubstrateItem = null;

  if (isQuickCreate) {
    substrateName = document.getElementById('spawn-bulk-create-recipe')?.value || 'CVG Bulk';
    containerWeight = document.getElementById('spawn-bulk-create-weight')?.value || '5 lb Bag';
    containerType = containerWeight.toLowerCase().includes('tub') || containerWeight.toLowerCase().includes('shoebox')
      ? 'Fruiting Block / Monotub'
      : 'Fruiting Block / Monotub';
  } else {
    if (spawnBulkSelectedSubstrateId) {
      parentSubstrateItem = db.items.find(i => i.id === spawnBulkSelectedSubstrateId);
      if (parentSubstrateItem) {
        substrateName = parentSubstrateItem.medium || 'CVG Bulk';
        containerType = parentSubstrateItem.containerType || 'Fruiting Block / Monotub';
        containerWeight = parentSubstrateItem.containerWeight || '5 lb Bag';
      }
    }
  }

  const today = new Date().toLocaleDateString();
  const parentGen = parent.generation || 1;
  const strain = parent.strain || 'Unknown Strain';

  const newFruitingBlocks = [];

  for (let i = 1; i <= qty; i++) {
    const newId = generateId();
    const blockLabel = qty > 1 
      ? `${substrateName} - ${strain} (#${i}/${qty})`
      : `${substrateName} - ${strain}`;

    const newBlock = {
      id: newId,
      label: blockLabel,
      strain: strain,
      medium: substrateName,
      mediumType: 'substrate',
      type: 'Bulk Substrate',
      category: 'Bulk Substrate',
      containerType: containerType,
      containerWeight: containerWeight,
      parentSourceId: parent.id,
      parentItemId: parent.id,
      parentGrainId: parent.id,
      parentSubstrateId: parentSubstrateItem ? parentSubstrateItem.id : null,
      parentSpawnId: parent.id,
      parentSpawnName: parent.label || parent.id,
      generation: parentGen,
      stage: 'Colonizing',
      createdAt: today,
      spawnRatio: ratio,
      totalYield: 0,
      totalWetYield: 0,
      totalDryYield: 0,
      yields: [],
      flushYields: [],
      history: [{
        stage: 'Colonizing',
        timestamp: new Date().toLocaleString(),
        notes: `Spawned from Grain Spawn ${parent.id} (Ratio ${ratio})${parentSubstrateItem ? ` paired with Substrate ${parentSubstrateItem.id}` : ''}.`,
        env: ''
      }],
      lifecycleHistory: [{
        fromStage: 'Preparation',
        toStage: 'Colonizing',
        timestamp: new Date().toLocaleString(),
        type: 's2b-transfer',
        notes: `Spawned from Grain Spawn ${parent.id} with ${substrateName} (${ratio}).`
      }]
    };

    newFruitingBlocks.push(newBlock);
    db.items.unshift(newBlock);
  }

  // Update Parent Grain Container based on Partial Spawn toggle
  if (isPartial) {
    parent.stage = 'Colonizing';
    parent.archived = false;
    parent.history.unshift({
      stage: 'Colonizing',
      timestamp: new Date().toLocaleString(),
      notes: `Partially spawned into ${qty} fruiting block(s). Source bag remains active.`,
      env: ''
    });
  } else {
    parent.stage = 'Spent';
    parent.archived = true;
    parent.history.unshift({
      stage: 'Spent',
      timestamp: new Date().toLocaleString(),
      notes: `Fully spawned into ${qty} fruiting block(s). Marked as SPENT.`,
      env: ''
    });
  }

  // If existing substrate was used, consume it / mark as Spent
  if (parentSubstrateItem) {
    parentSubstrateItem.stage = 'Spent';
    parentSubstrateItem.history.unshift({
      stage: 'Spent',
      timestamp: new Date().toLocaleString(),
      notes: `Consumed/inoculated during S2B with Grain Spawn ${parent.id}. Resulting Fruiting Blocks: ${newFruitingBlocks.map(b => b.id).join(', ')}.`,
      env: ''
    });
  }

  saveItems();
  closeSpawnBulkModal();
  closeModal();

  if (printNow) {
    showToast(`Created ${qty} Fruiting Block(s)! Opening label printer...`, 'success', 3000);
    openPrintSettingsModal(newFruitingBlocks);
  } else {
    showToast(`✓ Fruiting Block(s) created! You can print labels anytime from Container Details.`, 'success', 6000);
  }

  if (typeof window.render === 'function') {
    window.render();
    window.updateDashboard();
  }
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

// --- Quick-Log Parent Asset Modal ---
export function openQuickLogParentModal() {
  const modal = document.getElementById('quick-log-parent-modal');
  if (modal) {
    showModal(modal);
    const dateInput = document.getElementById('qlp-date-created');
    if (dateInput) {
      const today = new Date().toISOString().split('T')[0];
      dateInput.max = today;
      if (!dateInput.value) {
        dateInput.value = today;
      }
    }
    // Pre-populate strain from main inoculation form if typed
    const mainStrainInput = document.getElementById('input-strain');
    const qlpStrainInput = document.getElementById('qlp-strain');
    if (mainStrainInput && qlpStrainInput && mainStrainInput.value && !qlpStrainInput.value) {
      qlpStrainInput.value = mainStrainInput.value;
    }
    const qlpLabelInput = document.getElementById('qlp-label');
    if (qlpLabelInput) {
      setTimeout(() => qlpLabelInput.focus(), 100);
    }
  }
}

export function closeQuickLogParentModal() {
  const modal = document.getElementById('quick-log-parent-modal');
  if (modal) {
    hideModal(modal);
    const form = document.getElementById('quick-log-parent-form');
    if (form) form.reset();
  }
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

// --- Harvest Forecast Calendar ---
// A read-only rolling 4-week board that projects when currently active,
// inoculated containers will be ready for their first harvest, so weekend
// farmers-market inventory can be planned ahead. It never mutates db.items.

const HARVEST_CAL_WEEKS = 4;
const HARVEST_CAL_MAX_BADGES = 4; // shown per day before collapsing to "+N more"
const HARVEST_CAL_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Local midnight for the given Date (or now), with the time-of-day stripped.
function harvestCalStartOfDay(date) {
  const d = date ? new Date(date) : new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// The local Monday on or before `date` — the grid's very first cell. Weeks
// run Monday–Sunday to match getDateBucketKey() elsewhere in the app, which
// also keeps Sat/Sun adjacent as the last two columns.
function harvestCalWeekStart(date) {
  const d = harvestCalStartOfDay(date);
  const daysSinceMonday = (d.getDay() + 6) % 7; // getDay(): 0=Sun..6=Sat
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

function harvestCalDayKey(date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

// Group active, inoculated containers by the day their first harvest is
// estimated to land, keyed by harvestCalDayKey. Estimates that already
// passed (but whose container is still active) are folded onto today's cell
// and flagged overdue so they still show up for planning. Estimates beyond
// the visible window are dropped. Returns:
//   { byDay: Map<dayKey, Map<strain, { strain, qty, overdue }>>, total, marketTotal }
function buildHarvestForecast(gridEnd, today) {
  const byDay = new Map();
  let total = 0;
  let marketTotal = 0;

  (db.items || []).forEach(item => {
    if (!item || typeof item !== 'object') return;
    if (INACTIVE_STAGES.includes(item.stage)) return;          // Archived / Spent / Contaminated
    const strain = (item.strain || '').trim();
    if (!strain) return;                                        // not yet inoculated
    if (item.stage === 'Uninoculated' || item.stage === 'Preparation') return;

    const est = estimateHarvestDate(item);
    if (!est) return;
    if (est.getTime() >= gridEnd.getTime()) return;             // beyond the 4-week window

    const overdue = est.getTime() < today.getTime();
    const bucket = overdue ? today : est;
    const key = harvestCalDayKey(bucket);

    let strains = byDay.get(key);
    if (!strains) { strains = new Map(); byDay.set(key, strains); }
    const existing = strains.get(strain) || { strain, qty: 0, overdue: false };
    existing.qty += 1;
    if (overdue) existing.overdue = true;
    strains.set(strain, existing);

    total += 1;
    const dow = bucket.getDay();
    if (dow === 0 || dow === 6) marketTotal += 1; // landed on Sat/Sun
  });

  return { byDay, total, marketTotal };
}

// Render the rolling calendar grid into #harvest-calendar-grid and toggle the
// #harvest-calendar-empty banner / #harvest-calendar-summary line. Safe to
// call before the modal is shown; every element is null-checked.
export function renderHarvestCalendar() {
  const gridEl = document.getElementById('harvest-calendar-grid');
  if (!gridEl) return;
  const emptyEl = document.getElementById('harvest-calendar-empty');
  const summaryEl = document.getElementById('harvest-calendar-summary');

  const today = harvestCalStartOfDay();
  const gridStart = harvestCalWeekStart(today);
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridEnd.getDate() + HARVEST_CAL_WEEKS * 7);
  const todayKey = harvestCalDayKey(today);

  const { byDay, total, marketTotal } = buildHarvestForecast(gridEnd, today);

  const header = HARVEST_CAL_WEEKDAYS.map((label, i) => {
    const weekend = i >= 5;
    return `<div class="harvest-cal-head${weekend ? ' harvest-cal-head--weekend' : ''}">${label}${weekend ? ' <span class="harvest-cal-market-tag">MARKET</span>' : ''}</div>`;
  }).join('');

  const cells = [];
  for (let i = 0; i < HARVEST_CAL_WEEKS * 7; i++) {
    const date = new Date(gridStart);
    date.setDate(date.getDate() + i);
    const key = harvestCalDayKey(date);
    const dow = date.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isToday = key === todayKey;
    const isPast = date.getTime() < today.getTime();

    const classes = ['harvest-cal-cell'];
    if (isWeekend) classes.push('harvest-cal-cell--weekend');
    if (isToday) classes.push('harvest-cal-cell--today');
    if (isPast) classes.push('harvest-cal-cell--past');

    const strains = byDay.get(key);
    let badgesHtml = '';
    if (strains && strains.size) {
      const groups = Array.from(strains.values()).sort((a, b) => b.qty - a.qty);
      const shown = groups.slice(0, HARVEST_CAL_MAX_BADGES);
      const hidden = groups.slice(HARVEST_CAL_MAX_BADGES);
      badgesHtml = shown.map(g =>
        `<div class="harvest-cal-badge${g.overdue ? ' harvest-cal-badge--overdue' : ''}" title="${escapeHtml(g.strain)} — ${g.qty} container${g.qty === 1 ? '' : 's'}${g.overdue ? ' (estimate passed)' : ''}">🍄 ${escapeHtml(g.strain)} · ${g.qty}</div>`
      ).join('');
      if (hidden.length) {
        const hiddenQty = hidden.reduce((sum, g) => sum + g.qty, 0);
        const hiddenTitle = escapeHtml(hidden.map(g => `${g.strain} ×${g.qty}`).join(', '));
        badgesHtml += `<div class="harvest-cal-badge harvest-cal-badge--more" title="${hiddenTitle}">+${hiddenQty} more</div>`;
      }
    }

    const monthLabel = date.getDate() === 1
      ? `<span class="harvest-cal-month">${date.toLocaleString(undefined, { month: 'short' })}</span>`
      : '';

    cells.push(
      `<div class="${classes.join(' ')}">
        <div class="harvest-cal-daynum">${monthLabel}${date.getDate()}${isToday ? '<span class="harvest-cal-today-dot" aria-label="today"></span>' : ''}</div>
        <div class="harvest-cal-badges">${badgesHtml}</div>
      </div>`
    );
  }

  gridEl.innerHTML =
    `<div class="harvest-cal-grid harvest-cal-grid--head">${header}</div>` +
    `<div class="harvest-cal-grid harvest-cal-grid--body">${cells.join('')}</div>`;

  if (summaryEl) {
    if (total > 0) {
      summaryEl.textContent = marketTotal > 0
        ? `${total} container${total === 1 ? '' : 's'} forecast over the next ${HARVEST_CAL_WEEKS} weeks — ${marketTotal} landing on a market day (Sat/Sun).`
        : `${total} container${total === 1 ? '' : 's'} forecast over the next ${HARVEST_CAL_WEEKS} weeks — none on a weekend yet.`;
      summaryEl.classList.remove('hidden');
    } else {
      summaryEl.classList.add('hidden');
    }
  }

  if (emptyEl) emptyEl.classList.toggle('hidden', total > 0);
}

export function openHarvestCalendarModal() {
  renderHarvestCalendar();
  showModal(document.getElementById('harvest-calendar-modal'));
}

export function closeHarvestCalendarModal() {
  hideModal(document.getElementById('harvest-calendar-modal'));
}

// --- Label Print Settings & Custom Layouts Logic ---
// Returns the active label template, applying any saved custom dims when
// the 'custom' label model is selected.
function getActiveTemplate() {
  const tmpl = resolveLabelTemplate(labelModel) || LABEL_TEMPLATES[APP_CONFIG.DEFAULT_LABEL_MODEL] || {
    name: 'Default 30-Up',
    printerType: PRINTER_TYPES.SHEET,
    page: { width: 8.5, height: 11 },
    margin: { top: 0.5, bottom: 0.5, left: 0.1875, right: 0.1875 },
    label: { width: 2.625, height: 1.0 },
    grid: { cols: 3, rows: 10 },
    gap: { col: 0.125, row: 0 },
    slots: 30
  };

  if (labelModel === 'custom' || tmpl?.custom) {
    const stored = JSON.parse(localStorage.getItem(APP_CONFIG.STORAGE_KEYS.CUSTOM_LABEL_DIMS) || 'null');
    if (stored) {
      const w = parseFloat(stored.width) || parseFloat(stored.label?.width) || 2.625;
      const h = parseFloat(stored.height) || parseFloat(stored.label?.height) || 1.0;
      const c = parseInt(stored.cols) || parseInt(stored.grid?.cols) || 1;
      const r = parseInt(stored.rows) || parseInt(stored.grid?.rows) || 1;
      return {
        name: 'Custom Dimensions',
        printerType: printerType,
        page: stored.page || { width: w * c, height: h * r },
        margin: stored.margin || { top: 0, bottom: 0, left: 0, right: 0 },
        label: { width: w, height: h },
        grid: { cols: c, rows: r },
        gap: stored.gap || { col: 0, row: 0 },
        slots: c * r,
        continuous: printerType === PRINTER_TYPES.THERMAL
      };
    }
  }
  return tmpl;
}

function getLayoutConfig(tmpl) {
  const t = tmpl || getActiveTemplate();
  return { slots: t?.slots || 1, cols: (t?.grid && t.grid.cols) || 1 };
}

// Apply the resolved template's physical metrics as CSS custom properties so
// css/print.css can consume them in @page and grid layout rules.
function applyTemplateCSSVars(tmpl) {
  const root = document.documentElement;
  if (!tmpl) return;

  const labelWidth = tmpl.label?.width ?? tmpl.width ?? 2.625;
  const labelHeight = tmpl.label?.height ?? tmpl.height ?? 1.0;
  const pageWidth = tmpl.page?.width ?? 8.5;
  const pageHeight = tmpl.page?.height ?? 11;
  const marginTop = tmpl.margin?.top ?? 0.5;
  const marginBottom = tmpl.margin?.bottom ?? 0.5;
  const marginLeft = tmpl.margin?.left ?? 0.1875;
  const marginRight = tmpl.margin?.right ?? 0.1875;
  const cols = tmpl.grid?.cols ?? 1;
  const gapCol = tmpl.gap?.col ?? 0;
  const gapRow = tmpl.gap?.row ?? 0;

  root.style.setProperty('--label-width', `${labelWidth}in`);
  root.style.setProperty('--label-height', `${labelHeight}in`);
  root.style.setProperty('--page-width', `${pageWidth}in`);
  root.style.setProperty('--page-height', `${pageHeight}in`);
  root.style.setProperty('--page-margin-top', `${marginTop}in`);
  root.style.setProperty('--page-margin-bottom', `${marginBottom}in`);
  root.style.setProperty('--page-margin-left', `${marginLeft}in`);
  root.style.setProperty('--page-margin-right', `${marginRight}in`);
  root.style.setProperty('--label-cols', `${cols}`);
  root.style.setProperty('--label-col-gap', `${gapCol}in`);
  root.style.setProperty('--label-row-gap', `${gapRow}in`);
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

  const showNameCheckbox = document.getElementById('print-show-name');
  if (showNameCheckbox) {
    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_NAME);
    showNameCheckbox.checked = saved === null ? true : saved === 'true';
  }

  const showBatchIdCheckbox = document.getElementById('print-show-batch-id');
  if (showBatchIdCheckbox) {
    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_BATCH_ID);
    showBatchIdCheckbox.checked = saved === null ? true : saved === 'true';
  }

  const showStrainCheckbox = document.getElementById('print-show-strain');
  if (showStrainCheckbox) {
    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_STRAIN);
    showStrainCheckbox.checked = saved === null ? true : saved === 'true';
  }

  const showDatesCheckbox = document.getElementById('print-show-dates');
  if (showDatesCheckbox) {
    const saved = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_DATES);
    showDatesCheckbox.checked = saved === null ? true : saved === 'true';
  }

  // Company logo toggle initialization and visibility
  const lblShowLogo = document.getElementById('lblShowLogo');
  const showLogoCheckbox = document.getElementById('chkShowLogo') || document.getElementById('print-show-logo');
  if (lblShowLogo) {
    const is4x5Preset = labelModel === '4x5' || labelModel === 'generic-4x5';
    if (is4x5Preset) {
      lblShowLogo.classList.remove('hidden');
      if (showLogoCheckbox) {
        showLogoCheckbox.disabled = false;
        const savedLogoPref = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_LOGO);
        showLogoCheckbox.checked = savedLogoPref !== 'false';
      }
    } else {
      lblShowLogo.classList.add('hidden');
    }
  }

  const handwritingCheckbox = document.getElementById('print-enable-handwriting');
  if (handwritingCheckbox) {
    handwritingCheckbox.checked = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_ENABLE_HANDWRITING) === 'true';
  }

  const customHandwritingInput = document.getElementById('custom-handwriting-lines');
  if (customHandwritingInput) {
    customHandwritingInput.value = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_CUSTOM_HANDWRITING_LINES) || '';
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

  // Show dev-environment notice / confirmation when printing labels
  const devWarning = document.getElementById('print-dev-warning');
  if (devWarning) {
    const configuredBaseUrl = localStorage.getItem('orgBaseUrl');
    if (configuredBaseUrl && configuredBaseUrl.trim()) {
      const cleanUrl = configuredBaseUrl.trim().replace(/\/$/, '');
      devWarning.className = 'bg-emerald-950/60 border border-emerald-600/60 rounded-lg p-3 text-[11px] text-emerald-300 leading-relaxed';
      devWarning.innerHTML = `✅ QR codes configured to route to live domain: <span class="font-mono font-semibold">${cleanUrl}</span>`;
      devWarning.classList.remove('hidden');
    } else if (isUsingTemporaryBaseUrl()) {
      devWarning.className = 'bg-amber-950/50 border border-amber-600/50 rounded-lg p-3 text-[11px] text-amber-300 leading-relaxed';
      devWarning.innerHTML = '⚠️ Notice: You are printing labels from a dev environment. Ensure your Base URL points to your live deployment so printed QR codes work permanently.';
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

  // Handwriting Lines section visibility: height >= 2 or custom
  const handwritingContainer = document.getElementById('handwriting-settings-container');
  if (handwritingContainer) {
    const isCustom = labelModel === 'custom' || tmpl?.custom;
    const labelH = tmpl.label?.height ?? tmpl.height ?? 0;
    if (isCustom || labelH >= 2.0) {
      handwritingContainer.classList.remove('hidden');
    } else {
      handwritingContainer.classList.add('hidden');
    }
  }

  // Company logo toggle dynamic visibility: 4x5 preset only
  const lblShowLogo = document.getElementById('lblShowLogo');
  const showLogoCheckbox = document.getElementById('chkShowLogo') || document.getElementById('print-show-logo');
  if (lblShowLogo) {
    const is4x5Preset = labelModel === '4x5' || labelModel === 'generic-4x5';
    if (is4x5Preset) {
      lblShowLogo.classList.remove('hidden');
      if (showLogoCheckbox) showLogoCheckbox.disabled = false;
    } else {
      lblShowLogo.classList.add('hidden');
    }
  }

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
    cell.className = 'h-6 rounded border flex items-center justify-center text-[9px] font-semibold cursor-pointer transition py-0.5';
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

  const showNameCheckbox = document.getElementById('print-show-name');
  if (showNameCheckbox) {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_NAME, showNameCheckbox.checked ? 'true' : 'false');
  }

  const showBatchIdCheckbox = document.getElementById('print-show-batch-id');
  if (showBatchIdCheckbox) {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_BATCH_ID, showBatchIdCheckbox.checked ? 'true' : 'false');
  }

  const showStrainCheckbox = document.getElementById('print-show-strain');
  if (showStrainCheckbox) {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_STRAIN, showStrainCheckbox.checked ? 'true' : 'false');
  }

  const showDatesCheckbox = document.getElementById('print-show-dates');
  if (showDatesCheckbox) {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_DATES, showDatesCheckbox.checked ? 'true' : 'false');
  }

  const showLogoCheckbox = document.getElementById('chkShowLogo') || document.getElementById('print-show-logo');
  if (showLogoCheckbox) {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_LOGO, showLogoCheckbox.checked ? 'true' : 'false');
  }

  const handwritingCheckbox = document.getElementById('print-enable-handwriting');
  if (handwritingCheckbox) {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_ENABLE_HANDWRITING, handwritingCheckbox.checked ? 'true' : 'false');
  }

  const customHandwritingInput = document.getElementById('custom-handwriting-lines');
  if (customHandwritingInput) {
    localStorage.setItem(APP_CONFIG.STORAGE_KEYS.PRINT_CUSTOM_HANDWRITING_LINES, customHandwritingInput.value.trim());
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

export function openPrintModal(itemList = null) {
  return openPrintSettingsModal(itemList);
}

export function printBulkLabels(itemList) {
  if (!itemList || !itemList.length) return alert('No labels to print.');
  openPrintSettingsModal(itemList);
}

export function printSingleLabel(id = null) {
  const targetId = id || activeItemId;
  const item = db.items.find(i => i.id === targetId || i.code === targetId || i.custom_id === targetId);
  if (!item) {
    alert('No active item to print.');
    return;
  }
  // Set checkboxes/selection state to just this item
  const checkboxes = document.querySelectorAll('.item-checkbox, .container-card-checkbox, input[type="checkbox"][id^="MY-"], input[type="checkbox"][data-item-id]');
  checkboxes.forEach(cb => {
    const cbId = cb.getAttribute('data-item-id') || cb.getAttribute('data-id') || cb.value || cb.id;
    cb.checked = (cbId === item.id || cbId === item.code || cbId === item.custom_id);
  });
  updateSelectedCount();

  // Open the standard layout modal with this single item
  openPrintSettingsModal([item]);
}

window.printSingleLabel = printSingleLabel;

// --- Helper Formatting Utilities for Labels ---
export const formatCleanDate = (dateVal) => {
  if (!dateVal) return '';
  let d = new Date(dateVal);
  if (isNaN(d.getTime())) {
    d = new Date(dateVal + 'T12:00:00');
  }
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const isInoculated = (item) => {
  if (!item) return false;
  if (item.stage === 'Preparation' || item.stage === 'Uninoculated') return false;
  if (!item.strain || item.strain === 'Uninoculated') return false;
  return true;
};

// --- Dedicated Layout Generator: 2.6" x 1" Small Label Preset (Strictly Preserved) ---
export function render2x1SmallHTML(item, options = {}) {
  const {
    index = 0,
    total = 1,
    showLogo = false,
    orgLogoData = null
  } = options;

  const rawId = item.code || item.custom_id || item.id || '';
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
  const displayId = isUuid ? rawId.substring(0, 8) : rawId;
  const containerName = item.name || item.label || '';

  // 1. Line 1 (Bold, 12pt max): Clean species/strain name ONLY (Never output item.title, item.name, or compound strings)
  let cleanSpecies = '';
  const rawCandidate = item.strain && item.strain !== 'Uninoculated'
    ? item.strain
    : (item.species && item.species !== 'Uninoculated'
        ? item.species
        : (containerName || 'Uninoculated'));

  // Aggressively sanitize raw string: strip leading "Substrate - " prefixes, brackets, trailing sequence "(#1/4)", "(#1 of 4)"
  cleanSpecies = String(rawCandidate)
    .replace(/^[^-]+-\s*/, '')
    .replace(/\s*\(#\d+[\/\s\w]*\)$/i, '')
    .replace(/\s*\([^)]*\)$/, '')
    .trim();

  if (!cleanSpecies || cleanSpecies.toLowerCase() === 'uninoculated') {
    cleanSpecies = (item.strain && item.strain !== 'Uninoculated') ? item.strain : (containerName ? containerName.replace(/^[^-]+-\s*/, '').replace(/\s*\([^)]*\)$/, '').trim() : 'Uninoculated');
  }

  // 2. ID & Unit: ID: [Short ID] | Unit #[X] of [Total]
  let unitNum = index + 1;
  let totalItems = total || 1;
  const rawSearchStr = `${item.label || ''} ${item.name || ''} ${item.title || ''}`;
  const seqMatch = rawSearchStr.match(/#(\d+)[\/](\d+)/) || rawSearchStr.match(/#(\d+)\s+of\s+(\d+)/i) || rawSearchStr.match(/Unit\s+#?(\d+)\s+of\s+(\d+)/i);
  if (seqMatch) {
    unitNum = parseInt(seqMatch[1], 10) || unitNum;
    totalItems = parseInt(seqMatch[2], 10) || totalItems;
  }
  const idAndUnitText = `ID: ${displayId} | Unit #${unitNum} of ${totalItems}`;

  // 3. Dates: Prep: [Prep Date] | Inoc: [Inoc Date]
  let dateParts = [];
  const pDate = formatCleanDate(item.prepDate || item.prep_date);
  if (pDate) {
    dateParts.push(`Prep: ${pDate}`);
  }
  if (isInoculated(item)) {
    const rawInocDate = item.inoculationDate || item.inoculatedAt || item.createdAt || item.created_at;
    const iDate = formatCleanDate(rawInocDate);
    if (iDate) {
      dateParts.push(`Inoc: ${iDate}`);
    }
  }
  if (dateParts.length === 0) {
    const rawFallback = item.createdAt || item.created_at;
    const cDate = formatCleanDate(rawFallback);
    if (cDate) {
      dateParts.push(`Prep: ${cDate}`);
    } else {
      dateParts.push('Inoc: N/A');
    }
  }
  const datesLine = dateParts.join(' | ');

  // 4. Medium: Medium: [Substrate Type]
  const mediumVal = item.medium || item.medium_type || item.substrate || 'Whole Oats';
  const mediumLine = `Medium: ${mediumVal}`;

  const innerContentHtml = `
    ${showLogo && orgLogoData ? `<img src="${orgLogoData}" alt="Company Logo" class="print-logo" />` : ''}
    <div class="print-title print-name font-bold" style="font-size: 11pt; line-height: 1.15; max-height: 2.3em; overflow: hidden;" title="${cleanSpecies}">${cleanSpecies}</div>
    <div class="print-id font-mono font-semibold" style="white-space: nowrap; overflow: visible; font-size: 8.5pt;">${idAndUnitText}</div>
    <div class="print-date text-slate-600" style="font-size: 8pt; white-space: nowrap;">${datesLine}</div>
    <div class="print-extra text-slate-600" style="font-size: 8pt; white-space: nowrap;">${mediumLine}</div>
  `;

  return {
    innerContentHtml,
    fullWidthHandwritingHtml: '',
    isSmall2x1Preset: true,
    displayId
  };
}

// --- Dedicated Layout Generator: 4" x 5" Standard Digital Layout (render4x5StandardHTML) ---
export function render4x5StandardHTML(item, options = {}) {
  const {
    index = 0,
    total = 1,
    showLogo = false,
    orgLogoData = null,
    showName = true,
    showBatchId = true,
    showStrain = true,
    showDates = true,
    includeContainer = false
  } = options;

  const rawId = item.code || item.custom_id || item.id || '';
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
  const displayId = isUuid ? rawId.substring(0, 8) : rawId;
  const containerName = item.name || item.label || '';

  // Clean species / strain name
  let strainName = '';
  const rawCandidate = item.strain && item.strain !== 'Uninoculated'
    ? item.strain
    : (item.species && item.species !== 'Uninoculated'
        ? item.species
        : (containerName || 'Uninoculated'));

  strainName = String(rawCandidate)
    .replace(/^[^-]+-\s*/, '')
    .replace(/\s*\(#\d+[\/\s\w]*\)$/i, '')
    .replace(/\s*\([^)]*\)$/, '')
    .trim() || 'Uninoculated';

  // Unit Sequence (#1 of 4)
  let unitNum = index + 1;
  let totalItems = total || 1;
  const rawSearchStr = `${item.label || ''} ${item.name || ''} ${item.title || ''}`;
  const seqMatch = rawSearchStr.match(/#(\d+)[\/](\d+)/) || rawSearchStr.match(/#(\d+)\s+of\s+(\d+)/i) || rawSearchStr.match(/Unit\s+#?(\d+)\s+of\s+(\d+)/i);
  if (seqMatch) {
    unitNum = parseInt(seqMatch[1], 10) || unitNum;
    totalItems = parseInt(seqMatch[2], 10) || totalItems;
  }
  const idAndUnitText = `ID: ${displayId}  •  Unit #${unitNum} of ${totalItems}`;

  // Dates
  const prepDate = formatCleanDate(item.prepDate || item.prep_date || item.createdAt || item.created_at) || 'N/A';
  let inocDate = 'Uninoculated / Pending';
  if (isInoculated(item)) {
    const rawInoc = item.inoculationDate || item.inoculatedAt || item.createdAt || item.created_at;
    inocDate = formatCleanDate(rawInoc) || 'N/A';
  }
  const datesRowText = `Prep: ${prepDate}  |  Inoc: ${inocDate}`;

  // Medium / Substrate
  const mediumVal = item.medium || item.medium_type || item.substrate || 'Whole Oats';
  const cType = item.containerType || item.container_type || '';
  const cWeight = item.containerWeight || item.container_weight || '';
  const containerSpecs = cType ? ` (${cType}${cWeight ? ` - ${cWeight}` : ''})` : '';
  const mediumRowText = `Medium: ${mediumVal}${containerSpecs}`;

  // Top branding / logo
  const logoSrc = (showLogo && (orgLogoData || options.logoUrl)) ? (orgLogoData || options.logoUrl) : null;
  const logoHtml = logoSrc ? `
    <div class="branding-header text-center w-full">
      <img src="${logoSrc}" alt="Organization Logo" style="max-height: 50px; margin: 0 auto 10px auto; display: block;" />
    </div>
  ` : '';

  const innerContentHtml = `
    <div class="label-4x5-standard-centered flex flex-col items-center justify-between w-full h-full text-center text-slate-900 font-sans px-2 py-1" style="font-family: 'Geist', 'Helvetica Neue', Arial, sans-serif;">
      
      <!-- Top Header - Logo / Branding Zone (Only if showLogo & logo exists) -->
      ${logoHtml}

      <!-- Center-Aligned Metadata Hierarchy -->
      <div class="w-full flex flex-col items-center justify-center space-y-2.5 my-auto">
        <!-- Strain Title: Prominent bold header (18pt - 20pt) -->
        <div class="w-full border-b border-slate-300 pb-2">
          <div class="font-black text-slate-950 tracking-tight leading-tight uppercase truncate" style="font-size: 19pt; line-height: 1.15;" title="${strainName}">${strainName}</div>
        </div>

        <!-- Unit & ID Row -->
        <div class="font-mono font-bold tracking-wide" style="font-size: 11pt; color: #475569;">
          ${idAndUnitText}
        </div>

        <!-- Dates Row -->
        <div class="text-slate-700 font-medium" style="font-size: 10pt;">
          ${datesRowText}
        </div>

        <!-- Substrate / Medium -->
        <div class="text-slate-900" style="font-size: 10pt; font-weight: 600;">
          ${mediumRowText}
        </div>
      </div>

    </div>
  `;

  return {
    innerContentHtml,
    fullWidthHandwritingHtml: '',
    isSmall2x1Preset: false,
    displayId
  };
}

// --- Dedicated Layout Generator: 4" x 5" Handwriting Layout (render4x5HandwritingHTML) ---
export function render4x5HandwritingHTML(item, options = {}) {
  const {
    index = 0,
    total = 1,
    showLogo = false,
    orgLogoData = null,
    customHandwritingStr = ''
  } = options;

  const rawId = item.code || item.custom_id || item.id || '';
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
  const displayId = isUuid ? rawId.substring(0, 8) : rawId;
  const containerName = item.name || item.label || '';

  // Clean strain name
  let strainName = '';
  const rawCandidate = item.strain && item.strain !== 'Uninoculated'
    ? item.strain
    : (item.species && item.species !== 'Uninoculated'
        ? item.species
        : (containerName || ''));

  strainName = String(rawCandidate)
    .replace(/^[^-]+-\s*/, '')
    .replace(/\s*\(#\d+[\/\s\w]*\)$/i, '')
    .replace(/\s*\([^)]*\)$/, '')
    .trim();

  // Unit Sequence (#1 of 4)
  let unitNum = index + 1;
  let totalItems = total || 1;
  const rawSearchStr = `${item.label || ''} ${item.name || ''} ${item.title || ''}`;
  const seqMatch = rawSearchStr.match(/#(\d+)[\/](\d+)/) || rawSearchStr.match(/#(\d+)\s+of\s+(\d+)/i) || rawSearchStr.match(/Unit\s+#?(\d+)\s+of\s+(\d+)/i);
  if (seqMatch) {
    unitNum = parseInt(seqMatch[1], 10) || unitNum;
    totalItems = parseInt(seqMatch[2], 10) || totalItems;
  }
  const idAndUnitText = `ID: ${displayId}  •  Unit #${unitNum} of ${totalItems}`;

  // Top branding / logo
  const logoSrc = (showLogo && (orgLogoData || options.logoUrl)) ? (orgLogoData || options.logoUrl) : null;
  const logoHtml = logoSrc ? `
    <div class="branding-header text-center w-full">
      <img src="${logoSrc}" alt="Organization Logo" style="max-height: 50px; margin: 0 auto 10px auto; display: block;" />
    </div>
  ` : '';

  // Build custom or standard ruled lines (4-5 lines total)
  let customFields = [];
  if (customHandwritingStr) {
    customFields = customHandwritingStr.split(',').map(s => s.trim()).filter(Boolean);
  }

  // 4-5 Spacious centered ruled handwriting lines
  const standardRuledLines = [
    { label: 'Date / Stage' },
    { label: 'Observed Growth' },
    { label: 'Flushes / Yield' },
    { label: 'Contam / Notes' }
  ];

  const fullWidthHandwritingHtml = `
    <div class="label-4x5-handwriting-container w-full flex flex-col justify-start mt-3 pt-2 border-t-2 border-slate-900" style="font-family: 'Geist', 'Helvetica Neue', Arial, sans-serif;">
      
      <!-- Centered Spacious Ruled Handwriting Lines -->
      <div class="space-y-3.5 pt-1 w-full">
        ${standardRuledLines.map(line => `
          <div class="ruled-line-row w-full flex flex-col">
            <div class="flex items-baseline justify-between w-full px-1">
              <span class="font-bold text-[11pt] text-slate-900 tracking-wide uppercase">${line.label}:</span>
            </div>
            <div class="w-full border-b-2 border-dashed border-slate-600 min-h-[26px] mt-0.5"></div>
          </div>
        `).join('')}

        ${customFields.map(field => `
          <div class="ruled-line-row w-full flex flex-col">
            <div class="flex items-baseline justify-between w-full px-1">
              <span class="font-bold text-[11pt] text-slate-900 tracking-wide uppercase">${field}:</span>
            </div>
            <div class="w-full border-b-2 border-dashed border-slate-600 min-h-[26px] mt-0.5"></div>
          </div>
        `).join('')}
      </div>

    </div>
  `;

  const innerContentHtml = `
    <div class="label-4x5-hw-header flex flex-col items-center justify-center w-full text-center font-sans px-2" style="font-family: 'Geist', 'Helvetica Neue', Arial, sans-serif;">
      ${logoHtml}

      <div class="font-black text-slate-950 uppercase tracking-tight leading-tight truncate w-full" style="font-size: 18pt; line-height: 1.15;" title="${strainName || 'Blank Field'}">${strainName || '____________________'}</div>
      
      <div class="font-mono font-bold tracking-wide mt-1" style="font-size: 10.5pt; color: #475569;">
        ${idAndUnitText}
      </div>
    </div>
  `;

  return {
    innerContentHtml,
    fullWidthHandwritingHtml,
    isSmall2x1Preset: false,
    displayId
  };
}

// --- Fallback Default Preset Layout Generator (Preserving All Other Sheet / Roll Presets) ---
export function renderDefaultPresetHTML(item, options = {}) {
  const {
    showLogo = false,
    orgLogoData = null,
    enableHandwriting = false,
    customHandwritingStr = '',
    showName = true,
    showBatchId = true,
    showStrain = true,
    showDates = true,
    includeContainer = false,
    isLargeLabel = false
  } = options;

  const rawId = item.code || item.custom_id || item.id || '';
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
  const displayId = isUuid ? rawId.substring(0, 8) : rawId;
  const containerName = item.name || item.label || '';

  let nameHtml = '';
  if (showName && containerName) {
    nameHtml = `<div class="print-name" title="${containerName}">${containerName}</div>`;
  }

  let batchIdHtml = '';
  if (showBatchId && displayId) {
    batchIdHtml = `<div class="print-id">ID: ${displayId}</div>`;
  }

  let innerContentHtml = '';
  let fullWidthHandwritingHtml = '';

  if (enableHandwriting) {
    let fillLines = [
      '<div class="fill-line"><span class="line-label">Strain:</span><span class="line-blank"></span></div>',
      '<div class="fill-line"><span class="line-label">Date:</span><span class="line-blank"></span></div>'
    ];

    if (customHandwritingStr) {
      const customLines = customHandwritingStr.split(',').map(s => s.trim()).filter(Boolean);
      customLines.forEach(line => {
        fillLines.push(`<div class="fill-line"><span class="line-label">${line}:</span><span class="line-blank"></span></div>`);
      });
    }

    fillLines.push('<div class="fill-line"><span class="line-label">Notes:</span><span class="line-blank"></span></div>');

    if (isLargeLabel) {
      fullWidthHandwritingHtml = `
        <div class="print-card-footer print-handwriting-zone">
          ${fillLines.join('')}
        </div>
      `;
      innerContentHtml = `
        ${!isLargeLabel && showLogo && orgLogoData ? `<img src="${orgLogoData}" alt="Company Logo" class="print-logo" />` : ''}
        ${nameHtml}
        ${batchIdHtml}
      `;
    } else {
      innerContentHtml = `
        ${!isLargeLabel && showLogo && orgLogoData ? `<img src="${orgLogoData}" alt="Company Logo" class="print-logo" />` : ''}
        ${nameHtml}
        ${batchIdHtml}
        <div class="handwriting-lines-container">
          ${fillLines.join('')}
        </div>
      `;
    }
  } else {
    let strainHtml = '';
    if (showStrain && isInoculated(item)) {
      const strainText = item.strain;
      strainHtml = `<div class="print-strain">${strainText}</div>`;
    }

    let dateHtml = '';
    if (showDates) {
      let dateParts = [];
      if (item.prepDate || item.prep_date) {
        const pDate = formatCleanDate(item.prepDate || item.prep_date);
        if (pDate) dateParts.push(`Prep: ${pDate}`);
      }
      if (isInoculated(item)) {
        const rawInocDate = item.inoculationDate || item.inoculatedAt || item.createdAt || item.created_at;
        if (rawInocDate && rawInocDate !== 'null' && rawInocDate !== 'undefined') {
          const formattedInoc = formatCleanDate(rawInocDate);
          if (formattedInoc) dateParts.push(`Inoc: ${formattedInoc}`);
        }
      }
      if (dateParts.length > 0) {
        dateHtml = `<div class="print-date">${dateParts.join(' | ')}</div>`;
      }
    }

    let containerElement = '';
    if (includeContainer && (item.containerType || item.container_type)) {
      const cType = item.containerType || item.container_type;
      const cWeight = item.containerWeight || item.container_weight;
      containerElement = `<div class="print-extra font-semibold text-emerald-800">${cType}${cWeight ? ` (${cWeight})` : ''}</div>`;
    }

    innerContentHtml = `
      ${!isLargeLabel && showLogo && orgLogoData ? `<img src="${orgLogoData}" alt="Company Logo" class="print-logo" />` : ''}
      ${nameHtml}
      ${batchIdHtml}
      ${strainHtml}
      ${dateHtml}
      <div class="print-extra">${item.medium || item.medium_type || ''}</div>
      ${containerElement}
    `;
  }

  return {
    innerContentHtml,
    fullWidthHandwritingHtml,
    isSmall2x1Preset: false,
    displayId
  };
}

// --- Modular Router Architecture: Central Router for Label Templates ---
export function renderLabelHTML(item, options = {}) {
  const {
    preset = 'default',
    enableHandwriting = false,
    isHandwriting = false,
    labelWidth = 2.625,
    labelHeight = 1.0,
    isLargeLabel = false
  } = options;

  const handwritingActive = Boolean(enableHandwriting || isHandwriting);

  // Normalize preset key to identify 4x5, 2.6x1, etc.
  const is4x5Preset = (preset === '4x5' || preset === 'generic-4x5' || (Math.abs(labelWidth - 4.0) < 0.2 && Math.abs(labelHeight - 5.0) < 0.2));
  const is2x1SmallPreset = (preset === 'avery-5160' || preset === '30-up' || preset === '2.625x1' || preset === '2.6x1' ||
    (labelWidth <= 2.75 && labelHeight <= 1.3 && !isLargeLabel && !is4x5Preset));

  if (is4x5Preset) {
    return handwritingActive
      ? render4x5HandwritingHTML(item, options)
      : render4x5StandardHTML(item, options);
  } else if (is2x1SmallPreset && !handwritingActive) {
    return render2x1SmallHTML(item, options);
  } else {
    // Preserve all existing fallback presets intact
    return renderDefaultPresetHTML(item, options);
  }
}

window.renderLabelHTML = renderLabelHTML;

export function triggerPrint(itemList, layoutKey, offset) {
  try {
    return executePrint(itemList, layoutKey, offset);
  } catch (err) {
    console.error('triggerPrint failed:', err);
    try {
      window.print();
    } catch (e) {
      console.warn('Fallback window.print() failed:', e);
    }
  }
}

// Clean up print DOM nodes automatically after printing completes
window.addEventListener('afterprint', () => {
  const mount = document.getElementById('print-mount');
  if (mount) {
    mount.innerHTML = '';
  }
});

export function executePrint(itemList, layoutKey, offset) {
  let mount = document.getElementById('print-mount');
  if (!mount) {
    mount = document.createElement('div');
    mount.id = 'print-mount';
    mount.className = 'print-only-container';
    document.body.appendChild(mount);
  }
  mount.innerHTML = ''; // clear previous prints

  const tmpl = getActiveTemplate();
  applyTemplateCSSVars(tmpl);

  const labelWidth = tmpl.label?.width ?? tmpl.width ?? 2.625;
  const labelHeight = tmpl.label?.height ?? tmpl.height ?? 1.0;
  const cols = (tmpl.grid && tmpl.grid.cols) || 1;
  const rows = (tmpl.grid && tmpl.grid.rows) || 1;
  const totalSlots = cols * rows;
  const gapCol = tmpl.gap?.col ?? 0;
  const gapRow = tmpl.gap?.row ?? 0;
  const marginTop = tmpl.margin?.top ?? 0;
  const marginBottom = tmpl.margin?.bottom ?? 0;
  const marginLeft = tmpl.margin?.left ?? 0;
  const marginRight = tmpl.margin?.right ?? 0;

  // Apply layout class to container (retain legacy class names for CSS fallback)
  if (!tmpl.continuous) {
    mount.className = 'print-only-container layout-dynamic';
    mount.style.gridTemplateColumns = `repeat(${cols}, ${labelWidth}in)`;
    mount.style.gridAutoRows = `${labelHeight}in`;
    mount.style.columnGap = `${gapCol}in`;
    mount.style.rowGap = `${gapRow}in`;
    mount.style.paddingTop = `${marginTop}in`;
    mount.style.paddingBottom = `${marginBottom}in`;
    mount.style.paddingLeft = `${marginLeft}in`;
    mount.style.paddingRight = `${marginRight}in`;
    mount.style.display = 'grid';

    // Render empty invisible placeholder cards before first active label
    const skippedCount = Math.max(0, (offset || 1) - 1);
    for (let s = 0; s < skippedCount; s++) {
      const placeholder = document.createElement('div');
      placeholder.className = 'print-placeholder';
      placeholder.style.width = `${labelWidth}in`;
      placeholder.style.height = `${labelHeight}in`;
      mount.appendChild(placeholder);
    }
  } else {
    mount.className = 'print-only-container layout-single';
    mount.style.display = 'block';
    mount.style.gridTemplateColumns = '';
    mount.style.gridAutoRows = '';
    mount.style.columnGap = '';
    mount.style.rowGap = '';
    mount.style.paddingTop = '';
    mount.style.paddingBottom = '';
    mount.style.paddingLeft = '';
    mount.style.paddingRight = '';
  }

  const includeContainer = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_INCLUDE_CONTAINER) === 'true';
  const showName = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_NAME) !== 'false';
  const showBatchId = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_BATCH_ID) !== 'false';
  const showStrain = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_STRAIN) !== 'false';
  const showDates = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_DATES) !== 'false';
  const showLogoCheckbox = document.getElementById('chkShowLogo') || document.getElementById('print-show-logo');
  const showLogo = showLogoCheckbox ? showLogoCheckbox.checked : (localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_SHOW_LOGO) !== 'false');
  const orgLogoData = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.ORG_LOGO_DATA);
  const enableHandwriting = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_ENABLE_HANDWRITING) === 'true';
  const customHandwritingStr = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.PRINT_CUSTOM_HANDWRITING_LINES) || '';

  // Helper to generate QR code canvas/image and return a Promise that resolves when ready
  const qrPromises = [];

  // Render actual active labels through central renderLabelHTML generator
  itemList.forEach((item, index) => {
    const card = document.createElement('div');
    const isLargeLabel = labelHeight >= 2.0;
    const isMediumAddressLabel = labelHeight < 2.0 && labelHeight >= 0.75 && labelWidth >= 2.0;
    
    let cardClass = 'print-card';
    if (isLargeLabel) {
      cardClass += ' print-card-large';
    } else if (isMediumAddressLabel) {
      cardClass += ' print-card-medium';
    }
    card.className = cardClass;
    if (Math.abs(labelWidth - 2.625) < 0.1 && Math.abs(labelHeight - 1.0) < 0.1) {
      card.setAttribute('data-preset', '2.625x1');
    }
    card.style.width = `${labelWidth}in`;
    card.style.height = `${labelHeight}in`;

    // Call central renderLabelHTML generator
    const { innerContentHtml, fullWidthHandwritingHtml, isSmall2x1Preset, displayId } = renderLabelHTML(item, {
      preset: labelModel,
      index,
      total: itemList.length,
      labelWidth,
      labelHeight,
      isLargeLabel,
      showLogo,
      orgLogoData,
      enableHandwriting,
      customHandwritingStr,
      showName,
      showBatchId,
      showStrain,
      showDates,
      includeContainer
    });

    // Attach label model / preset identifier
    card.setAttribute('data-preset', labelModel || 'default');
    if (isSmall2x1Preset) {
      card.setAttribute('data-preset', '2.625x1');
    }

    const qrContainerId = `print-qr-${item.id || index}`;

    if (isLargeLabel) {
      const is4x5 = labelModel === 'generic-4x5' || labelModel === '4x5' || (Math.abs(labelWidth - 4.0) < 0.2 && Math.abs(labelHeight - 5.0) < 0.2);
      
      if (is4x5) {
        card.innerHTML = `
          <div class="print-card-4x5-container flex flex-col items-center justify-between w-full h-full text-center">
            <div class="print-text-container w-full">
              ${innerContentHtml}
            </div>
            <div class="print-qr-container flex items-center justify-center my-2" id="${qrContainerId}"></div>
            ${fullWidthHandwritingHtml ? `<div class="w-full">${fullWidthHandwritingHtml}</div>` : ''}
          </div>
        `;
      } else {
        const headerHtml = (showLogo && orgLogoData) ? `
          <div class="print-card-header">
            <img src="${orgLogoData}" alt="Company Logo" class="print-logo" />
          </div>` : '';

        card.innerHTML = `
          ${headerHtml}
          <div class="print-card-body">
            <div class="print-qr-container" id="${qrContainerId}"></div>
            <div class="print-text-container">
              ${innerContentHtml}
            </div>
          </div>
          ${fullWidthHandwritingHtml}
        `;
      }
    } else {
      card.innerHTML = `
        <div class="print-qr-container" id="${qrContainerId}"></div>
        <div class="print-text-container">
          ${innerContentHtml}
        </div>
      `;
    }
    mount.appendChild(card);

    // Generate QR code and await render completion
    const qrPromise = new Promise((resolve) => {
      const qrContainer = document.getElementById(qrContainerId);
      if (!qrContainer) {
        resolve();
        return;
      }
      // Explicitly set QR pixel dim: for smaller labels (height <= 1.25), use 80-90px max to prevent oversized canvases
      const qrPixelDim = labelHeight <= 1.25 ? 85 : 256;
      const cleanBaseUrl = getAppBaseUrl();
      const scanTargetUrl = `${cleanBaseUrl}/#container=${displayId || item.id}`;
      
      try {
        if (typeof QRCode !== 'undefined') {
          new QRCode(qrContainer, {
            text: scanTargetUrl,
            width: qrPixelDim,
            height: qrPixelDim,
            correctLevel: QRCode.CorrectLevel.M
          });
        }
      } catch (err) {
        console.error('Error rendering QRCode for item ' + (item.id || index), err);
      }

      // Check if canvas or image was generated or wait for image onload
      let attempts = 0;
      const checkReady = () => {
        const img = qrContainer.querySelector('img');
        const canvas = qrContainer.querySelector('canvas');
        if (img) {
          if (img.complete && img.naturalWidth !== 0) {
            resolve();
          } else {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 300);
          }
        } else if (canvas) {
          resolve();
        } else {
          attempts++;
          if (attempts < 15) {
            setTimeout(checkReady, 50);
          } else {
            resolve();
          }
        }
      };

      // Allow DOM to settle before checking
      requestAnimationFrame(checkReady);
    });

    qrPromises.push(qrPromise);
  });

  // Ensure all QR codes and DOM nodes are inserted and images rendered BEFORE invoking window.print()
  Promise.all(qrPromises).then(() => {
    // Wait for fonts, layout, and images to complete paint
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(triggerBrowserPrint).catch(triggerBrowserPrint);
    } else {
      triggerBrowserPrint();
    }
  }).catch(err => {
    console.warn('QR code generation error:', err);
    triggerBrowserPrint();
  });

  function triggerBrowserPrint() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            window.print();
          } catch (printErr) {
            console.warn('window.print() error in executePrint:', printErr);
          }
        }, 350);
      });
    });
  }
}


// --- Dashboard Bulk Selection ---
export function toggleSelectAll(selectAllInput) {
  const checkboxes = document.querySelectorAll('.item-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = selectAllInput.checked;
  });
  updateSelectedCount();
}

export function getSelectedContainerIds() {
  const checkboxes = document.querySelectorAll('.item-checkbox:checked, .container-card-checkbox:checked, input[type="checkbox"][id^="MY-"]:checked, input[type="checkbox"][data-item-id]:checked');
  return Array.from(checkboxes)
    .map(cb => cb.getAttribute('data-item-id') || cb.getAttribute('data-id') || cb.value || cb.id)
    .filter(Boolean);
}

export function updateSelectedCount() {
  const checkboxes = document.querySelectorAll('.item-checkbox, .container-card-checkbox, input[type="checkbox"][id^="MY-"], input[type="checkbox"][data-item-id]');
  // Deduplicate in case multiple selectors match the same input
  const uniqueChecked = new Set();
  const uniqueTotal = new Set();
  checkboxes.forEach(cb => {
    uniqueTotal.add(cb);
    if (cb.checked) {
      uniqueChecked.add(cb);
    }
  });

  const checkedCount = uniqueChecked.size;
  const totalCount = uniqueTotal.size;

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
    selectAll.checked = totalCount > 0 && checkedCount === totalCount;
  }
}

export function printSelectedLabels() {
  const selectedCodes = getSelectedContainerIds();
  if (!selectedCodes.length) {
    alert('Please select at least one item label to print.');
    return;
  }

  const matchedItems = db.items.filter(item => 
    selectedCodes.includes(item.id) || 
    (item.code && selectedCodes.includes(item.code)) || 
    (item.custom_id && selectedCodes.includes(item.custom_id))
  );

  if (!matchedItems.length) {
    alert('No labels to print.');
    return;
  }

  printBulkLabels(matchedItems);
}

// Bulk delete selected items with confirmation and Supabase sync.
// 1. Collects selected item IDs from checked checkboxes.
// 2. Shows confirmation dialog with count.
// 3. Deletes permanently from Supabase if configured.
// 4. Removes from local state in-place and clears selection.
// 5. Re-renders containers and updates dashboard.
export async function deleteSelectedItems() {
  const selectedCodes = getSelectedContainerIds();

  if (!selectedCodes.length) {
    showToast('No items selected for deletion.', 'warning');
    return;
  }

  const matchedItems = db.items.filter(item => 
    selectedCodes.includes(item.id) || 
    (item.code && selectedCodes.includes(item.code)) || 
    (item.custom_id && selectedCodes.includes(item.custom_id))
  );

  if (!matchedItems.length) {
    showToast('No items selected for deletion.', 'warning');
    return;
  }

  const selectedDbIds = matchedItems.map(i => i.id);

  // Show confirmation dialog
  const confirmed = confirm(`Are you sure you want to delete ${matchedItems.length} selected item${matchedItems.length !== 1 ? 's' : ''}? This cannot be undone.`);
  if (!confirmed) return;

  // Delete from Supabase first if configured
  if (isSupabaseConfigured()) {
    const result = await deleteItemsFromCloud(selectedDbIds);
    if (!result.success && result.error) {
      console.error('Bulk Delete Error:', result.error);
      showToast(`Failed to delete items from cloud: ${result.error.message}`, 'error', 8000);
      return;
    }
  }

  // Mutate local array in-place and persist
  db.items = db.items.filter(i => !selectedDbIds.includes(i.id));
  saveItems();

  // Clear the checkboxes and selection state
  const selectAll = document.getElementById('select-all-checkbox');
  if (selectAll) selectAll.checked = false;

  const checkboxes = document.querySelectorAll('.item-checkbox, .container-card-checkbox, input[type="checkbox"][id^="MY-"], input[type="checkbox"][data-item-id]');
  checkboxes.forEach(cb => { cb.checked = false; });
  updateSelectedCount();

  // Immediately re-render the workspace and dashboard
  if (typeof window.render === 'function') window.render();
  if (typeof window.renderContainers === 'function') window.renderContainers();
  if (typeof window.updateDashboard === 'function') window.updateDashboard();
  if (typeof window.updateContainerUsageUI === 'function') window.updateContainerUsageUI();

  // Show success notification
  showToast(`Successfully deleted ${matchedItems.length} item${matchedItems.length !== 1 ? 's' : ''}.`, 'success');
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
            <h4 class="font-bold text-slate-100 text-sm">${escapeHtml(fb.title)}</h4>
            <p class="text-xs text-slate-400 mt-1">${escapeHtml(fb.description || 'No description provided.')}</p>
            <div class="flex gap-2 mt-2">
              <span class="text-[10px] px-2 py-0.5 rounded ${categoryClass}">${escapeHtml(fb.category)}</span>
              <span class="text-[10px] px-2 py-0.5 rounded border ${statusClass}">${escapeHtml(fb.status)}</span>
            </div>
          </div>
          <button onclick="handleUpvote('${escapeHtml(fb.id)}')" class="flex flex-col items-center gap-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 transition shrink-0">
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

// --- Account Modal ---
// Sign-in / sign-up now lives entirely on the Next.js root (/). Unauthenticated
// visitors to /app/ are redirected there by initAppRouting(), so this modal is
// only ever opened (from the dashboard header menu) by a signed-in user, and
// only shows their account summary plus a sign-out button.

export function openAuthModal() {
  showModal(document.getElementById('auth-modal'));
  updateAuthModalUI();
}

export function closeAuthModal() {
  hideModal(document.getElementById('auth-modal'));
}

// Populate the account modal with the current user's email.
export async function updateAuthModalUI() {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch (e) { /* treat as signed out */ }

  const userEmailEl = document.getElementById('auth-user-email');
  if (userEmailEl) userEmailEl.innerText = user ? (user.email || user.id) : '';
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

    // Load / hydrate organization settings inputs
    export function loadOrgSettings() {
      if (!currentOrganizationId && userOrganizations.length > 0) {
        setCurrentOrganizationId(userOrganizations[0].id);
      }
      const org = userOrganizations.find(o => o.id === currentOrganizationId);

      const nameInput = document.getElementById('org-settings-name');
      const addressInput = document.getElementById('org-settings-address');
      const currencySelect = document.getElementById('org-settings-currency');
      const baseUrlInput = document.getElementById('org-base-url');

      const savedBaseUrl = localStorage.getItem('orgBaseUrl') || (org && org.settings && org.settings.base_url) || '';
      if (baseUrlInput) baseUrlInput.value = savedBaseUrl;

      if (org) {
        if (nameInput) nameInput.value = org.name || '';
        if (addressInput) addressInput.value = org.address || (org.settings && org.settings.address) || '';
        if (currencySelect) currencySelect.value = org.currency || (org.settings && org.settings.currency) || 'USD';

        // Load stored logo preview
        updateOrgLogoPreviewUI();

        if (org.settings) {
          const enableSales = document.getElementById('org-enable-sales');
          const enableRacks = document.getElementById('org-enable-racks');
          const enableSupplies = document.getElementById('org-enable-supplies');

          if (enableSales) enableSales.checked = org.settings.enable_sales !== false;
          if (enableRacks) enableRacks.checked = org.settings.enable_racks !== false;
          if (enableSupplies) enableSupplies.checked = org.settings.enable_supplies !== false;
        }
      } else {
        updateOrgLogoPreviewUI();
      }
    }

    export const populateOrgSettings = loadOrgSettings;

    // Attach to window for app.js to call
    window.loadOrgSettings = loadOrgSettings;
    window.populateOrgSettings = populateOrgSettings;

    // Initialize Org Settings modal event delegation for tabs
    export function initOrgSettingsModalListener() {
      const modal = document.getElementById('org-settings-modal');
      if (!modal || modal.hasAttribute('data-delegated-listener')) return;

      modal.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('#org-tab-integrations, #org-tab-general, #org-tab-features');
        if (tabBtn) {
          if (tabBtn.id === 'org-tab-integrations') {
            switchOrgTab('integrations');
          } else if (tabBtn.id === 'org-tab-general') {
            switchOrgTab('general');
          } else if (tabBtn.id === 'org-tab-features') {
            switchOrgTab('features');
          }
        }
      });

      modal.setAttribute('data-delegated-listener', 'true');
    }

    // Open organization settings modal
    export function openOrgSettings() {
      const modal = document.getElementById('org-settings-modal');
      if (!modal) {
        console.error("openOrgSettings: 'org-settings-modal' element not found in the DOM.");
        return;
      }

      initOrgSettingsModalListener();

      if (!currentOrganizationId && userOrganizations.length > 0) {
        setCurrentOrganizationId(userOrganizations[0].id);
      }

      loadOrgSettings();

      // Ensure live integration statuses are always updated on modal open
      const activeOrgId = currentOrganizationId || (userOrganizations.length > 0 ? userOrganizations[0].id : null);
      if (typeof window.renderSquareStatus === 'function') {
        window.renderSquareStatus(activeOrgId);
      }
      if (typeof window.renderEtsyStatus === 'function') {
        window.renderEtsyStatus(activeOrgId);
      }

      showModal(modal);
    }

// Update Org Logo Preview in Settings Modal
export function updateOrgLogoPreviewUI() {
  const logoData = localStorage.getItem(APP_CONFIG.STORAGE_KEYS.ORG_LOGO_DATA);
  const preview = document.getElementById('org-logo-preview');
  const placeholder = document.getElementById('org-logo-preview-placeholder');
  const removeBtn = document.getElementById('org-logo-remove-btn');

  if (logoData && preview) {
    preview.src = logoData;
    preview.classList.remove('hidden');
    if (placeholder) placeholder.classList.add('hidden');
    if (removeBtn) removeBtn.classList.remove('hidden');
  } else {
    if (preview) {
      preview.src = '';
      preview.classList.add('hidden');
    }
    if (placeholder) placeholder.classList.remove('hidden');
    if (removeBtn) removeBtn.classList.add('hidden');
  }
}

// Remove Org Logo handler
export function removeOrgLogo() {
  localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.ORG_LOGO_DATA);
  const fileInput = document.getElementById('org-logo-upload');
  if (fileInput) fileInput.value = '';
  updateOrgLogoPreviewUI();
  showToast('Company logo removed.', 'info');
}

// Close organization settings modal
export function closeOrgSettings() {
  const modal = document.getElementById('org-settings-modal');
  if (modal) hideModal(modal);
}

// Switch between organization tabs
export function switchOrgTab(tab) {
  const generalTab = document.getElementById('org-tab-general');
  const featuresTab = document.getElementById('org-tab-features');
  const integrationsTab = document.getElementById('org-tab-integrations');
  const generalPanel = document.getElementById('org-panel-general');
  const featuresPanel = document.getElementById('org-panel-features');
  const integrationsPanel = document.getElementById('org-panel-integrations');

  const tabs = [
    { id: 'general', btn: generalTab, panel: generalPanel },
    { id: 'features', btn: featuresTab, panel: featuresPanel },
    { id: 'integrations', btn: integrationsTab, panel: integrationsPanel }
  ];

  tabs.forEach(t => {
    if (t.btn && t.panel) {
      if (t.id === tab) {
        t.btn.className = 'px-4 py-2 text-xs font-bold border-b-2 border-emerald-500 text-emerald-400 transition flex items-center gap-1.5';
        t.panel.classList.remove('hidden');
      } else {
        t.btn.className = 'px-4 py-2 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition flex items-center gap-1.5';
        t.panel.classList.add('hidden');
      }
    }
  });

  // Load live integration statuses every time integrations tab is opened
  if (tab === 'integrations') {
    const activeOrgId = currentOrganizationId || (userOrganizations.length > 0 ? userOrganizations[0].id : null);
    if (typeof window.renderSquareStatus === 'function') {
      window.renderSquareStatus(activeOrgId);
    }
    if (typeof window.renderEtsyStatus === 'function') {
      window.renderEtsyStatus(activeOrgId);
    }
  }
}

// Helper to open Org Settings modal directly to the Integrations tab
export function openOrgIntegrationsTab() {
  openOrgSettings();
  switchOrgTab('integrations');
}

// Save organization settings
export async function saveOrgSettings() {
  const nameInput = document.getElementById('org-settings-name');
  const addressInput = document.getElementById('org-settings-address');
  const currencySelect = document.getElementById('org-settings-currency');
  const baseUrlInput = document.getElementById('org-base-url');
  
  const enableSales = document.getElementById('org-enable-sales').checked;
  const enableRacks = document.getElementById('org-enable-racks').checked;
  const enableSupplies = document.getElementById('org-enable-supplies').checked;

  // Persist orgBaseUrl in localStorage
  const baseUrlVal = baseUrlInput ? baseUrlInput.value.trim() : '';
  if (baseUrlVal) {
    localStorage.setItem('orgBaseUrl', baseUrlVal);
  } else {
    localStorage.removeItem('orgBaseUrl');
  }

  const { updateOrganization, currentOrganizationId } = await import('./db.js');

  try {
    showToast('Saving organization settings...', 'info');

    const settings = {
      enable_sales: enableSales,
      enable_racks: enableRacks,
      enable_supplies: enableSupplies,
      address: addressInput ? addressInput.value.trim() : '',
      currency: currencySelect ? currencySelect.value : 'USD',
      base_url: baseUrlVal
    };

    const updates = {
      settings
    };
    
    if (nameInput && nameInput.value.trim()) {
      updates.name = nameInput.value.trim();
    }

    if (currentOrganizationId) {
      await updateOrganization(currentOrganizationId, updates);
    }
    showToast('✓ Organization settings updated successfully!', 'success');

    // Trigger dynamic toggle of sidebar/app sections based on these active boolean flags
    if (typeof window.applyFeatureToggles === 'function') {
      window.applyFeatureToggles(settings);
    }
    
    // Update UI elements that show the org name
    const orgNameDisplay = document.getElementById('current-org-name');
    if (orgNameDisplay && updates.name) {
      orgNameDisplay.innerText = updates.name;
    }

    closeOrgSettings();
  } catch (err) {
    console.error('Failed to save organization settings:', err);
    showToast('Failed to update settings: ' + err.message, 'error');
  }
}
