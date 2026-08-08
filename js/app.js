// Sierra Myco Lab - Application entry point.
// Imports all modules, wires up global event listeners, exposes the functions
// referenced by inline onclick handlers, and initializes the UI.

import { db, saveItems, setRefreshCallback, getCustomContainers, addCustomContainer, initCloudSync, setSyncStatusCallback, isSupabaseConfigured, getSession, onAuthStateChange } from './db.js';
import {
  generateId,
  formatMMDDYY,
  getMediumInitials,
  getStrainInitials,
  getStandardCapacity,
  generateBatchCode,
  updateBatchCodeAuto,
  updateLCCalculator,
  updateLCTargetVolumeDefault,
  toggleLCMedium,
  toggleCustomContainer,
  isLockedStage
} from './utils.js';
import {
  openModal,
  closeModal,
  openBatchModal,
  closeBatchModal,
  openG2GModal,
  closeG2GModal,
  switchG2GTab,
  executeG2GAutoGenerate,
  populateG2GScanSelect,
  handleG2GScanInput,
  addG2GScanItem,
  removeG2GScanItem,
  renderG2GScannedList,
  executeG2GScanTransfer,
  openQuickAddModal,
  closeQuickAddModal,
  openRecipeCalcModal,
  closeRecipeCalcModal,
  calculateCVG,
  openPrintSettingsModal,
  closePrintSettingsModal,
  onPrintLayoutChange,
  onPrintOffsetChange,
  applyOrExecutePrintSettings,
  printBulkLabels,
  printSingleLabel,
  applyInoculation,
  logBreakAndShake,
  logYield,
  addFlushYieldRecord,
  removeFlushYieldRecord,
  toggleContamFields,
  handleModalContainerTypeChange,
  deleteActiveItem,
  deleteItemDirect,
  deleteUninoculated,
  deletePCBatch,
  toggleSelectAll,
  updateSelectedCount,
  printSelectedLabels,
  getBatchItems,
  initStageFormListener,
  toggleAIDrawer,
  closeAIDrawer,
  sendChatMessage,
  callGeminiAPI,
  handleSaveApiKey,
  openApiKeyManager,
  closeApiKeyManager,
  updateApiKeyFromDialog,
  clearApiKeyFromDialog,
  openFeedbackModal,
  closeFeedbackModal,
  switchFeedbackTab,
  renderRoadmap,
  handleUpvote,
  initFeedbackFormListener,
  openAuthModal,
  closeAuthModal,
  switchAuthTab,
  handleAuthSubmit,
  handleAuthGoogle,
  handleAuthLogout,
  updateAuthModalUI,
  updateCloudSyncBadge
} from './modals.js';
import { startScanner, stopScanner, startG2GCameraScan, stopG2GCameraScan } from './camera.js';
import { STAGES, CONTAINER_STAGES } from './config.js';

// --- Module-level UI state ---
let currentFilter = 'All';
let scannedItemId = null;

// --- Dashboard stats ---
function updateDashboard() {
  document.getElementById('stat-total').innerText = db.items.length;
  document.getElementById('stat-blank').innerText = db.items.filter(i => i.stage === 'Preparation').length;
  const contam = db.items.filter(i => i.stage === 'Contaminated').length;
  const activeOrDone = db.items.filter(i => i.stage !== 'Preparation').length;
  document.getElementById('stat-contam').innerText = activeOrDone ? Math.round((contam / activeOrDone) * 100) + '%' : '0%';
  document.getElementById('stat-yield').innerText = db.items.reduce((sum, item) => sum + (item.totalYield || 0), 0) + 'g';
}

// --- Form population helpers ---
function togglePCSourceFields() {
  const source = document.querySelector('input[name="pc-source"]:checked').value;
  if (source === 'existing') {
    document.getElementById('pc-batch-select-container').classList.remove('hidden');
    document.getElementById('pc-date-input-container').classList.add('hidden');
  } else {
    document.getElementById('pc-batch-select-container').classList.add('hidden');
    document.getElementById('pc-date-input-container').classList.remove('hidden');
  }
}

function populatePCBatchDropdown() {
  const select = document.getElementById('input-pc-select');
  if (!select) return;
  if (!db.pcBatches.length) {
    select.innerHTML = '<option value="">No PC Batches Available</option>';
    return;
  }
  select.innerHTML = db.pcBatches.map(b => `<option value="${b.batchId}">${b.batchId} (${b.medium} - ${b.date})</option>`).join('');
}

function populateInoculantSources(selectedIdToSelect = null) {
  const type = document.getElementById('input-inoculant-type').value;
  const parentSelect = document.getElementById('input-parent');
  if (!parentSelect) return;

  let filtered = [];
  let defaultOptionText = 'None / Direct';

  if (type === 'Liquid Culture') {
    filtered = db.items.filter(i => (i.medium === 'Liquid Culture' || i.medium === 'Media Bottle') && !isLockedStage(i.stage));
    defaultOptionText = 'Select LC Source...';
  } else if (type === 'Agar') {
    filtered = db.items.filter(i => (i.medium === 'Agar' || i.medium === 'Petri Dish') && !isLockedStage(i.stage));
    defaultOptionText = 'Select Agar Plate...';
  } else if (type === 'Grain-to-Grain') {
    filtered = db.items.filter(i => (i.medium === 'Whole Oats' || i.medium === 'Rye Grain' || i.medium === 'Millet' || i.stage === 'G2G Ready') && !isLockedStage(i.stage) && i.stage !== 'Uninoculated');
    defaultOptionText = 'Select G2G Parent...';
  } else if (type === 'Spore Syringe') {
    filtered = db.items.filter(i => i.medium === 'Spore Syringe' && !isLockedStage(i.stage));
    defaultOptionText = 'None (Direct Spore Syringe)';
  }

  let optionsHtml = `<option value="">${defaultOptionText}</option>`;
  filtered.forEach(i => {
    let volText = (i.volumeMl !== undefined && i.volumeMl !== null) ? ` (${i.volumeMl} mL left)` : '';
    optionsHtml += `<option value="${i.id}" ${selectedIdToSelect === i.id ? 'selected' : ''}>${i.id} - ${i.label}${volText}</option>`;
  });
  parentSelect.innerHTML = optionsHtml;
}

function toggleInoculantTypeFields() {
  const type = document.getElementById('input-inoculant-type').value;
  const volContainer = document.getElementById('volume-per-bag-container');
  const inlineQuickAdd = document.querySelector('[onclick="openQuickAddModal()"]');

  if (type === 'Liquid Culture') {
    if (volContainer) volContainer.classList.remove('hidden');
    if (inlineQuickAdd) inlineQuickAdd.classList.remove('hidden');
  } else {
    if (volContainer) volContainer.classList.add('hidden');
    if (inlineQuickAdd) inlineQuickAdd.classList.add('hidden');
  }
  populateInoculantSources();
}

function populateContainerDropdown() {
  const select = document.getElementById('input-container-type');
  if (!select) return;

  const standardOptions = [
    '14A Grow Bag',
    '0T Spawn Bag',
    'Quart Mason Jar',
    '500mL Media Bottle',
    'Petri Dish'
  ];

  const customContainers = getCustomContainers();

  let html = '<option value="" disabled selected>Select Container...</option>';

  standardOptions.forEach(opt => {
    html += `<option value="${opt}">${opt}</option>`;
  });

  if (customContainers.length > 0) {
    html += '<optgroup label="Custom Containers">';
    customContainers.forEach(opt => {
      html += `<option value="${opt}">${opt}</option>`;
    });
    html += '</optgroup>';
  }

  html += '<option value="add_new">+ Add New Container Type</option>';
  select.innerHTML = html;
}

function populateStageDropdown(containerType, selectedStage = null, selectId = 'input-stage') {
  const select = document.getElementById(selectId);
  if (!select) return;
  const stages = CONTAINER_STAGES[containerType] || [];
  select.innerHTML = stages.map(s => `<option value="${s}" ${selectedStage === s ? 'selected' : ''}>${s}</option>`).join('');
  // If no selected stage provided, default to first valid option
  if (!selectedStage && stages.length > 0) {
    select.value = stages[0];
  }
}

function handleContainerTypeChange() {
  const select = document.getElementById('input-container-type');
  if (!select) return;
  // Reset Stage to first valid option for the new Container Type
  populateStageDropdown(select.value);
}

function quickAddContainer() {
  const customName = prompt('Enter a custom container label (e.g., Pint Mason Jar):');
  if (customName && customName.trim()) {
    addCustomContainer(customName);
    populateContainerDropdown();
    document.getElementById('input-container-type').value = customName.trim();
  }
}

function initInoculationsForm() {
  const dateInput = document.getElementById('input-pc-date');
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
  populatePCBatchDropdown();
  togglePCSourceFields();
  toggleInoculantTypeFields();
  // Populate initial Stage options based on default Container Type
  const containerSelect = document.getElementById('input-container-type');
  if (containerSelect) {
    populateStageDropdown(containerSelect.value);
  }
}

// --- Backup / Export helpers ---
function exportJSON() {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({ items: db.items, pcBatches: db.pcBatches }));
  const el = document.createElement('a');
  el.setAttribute('href', dataStr);
  el.setAttribute('download', `SierraMycoLab_Backup_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(el); el.click(); el.remove();
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (Array.isArray(parsed)) {
        db.items = parsed;
      } else {
        db.items = parsed.items || [];
        db.pcBatches = parsed.pcBatches || [];
      }
      saveItems();
      alert('Backup restored successfully.');
    } catch (err) {
      alert('Invalid backup JSON file.');
    }
  };
  reader.readAsText(file);
}

function exportCSV() {
  if (!db.items.length) return alert('No data to export.');
  let csv = 'ID,Label,Strain,Medium,Batch,Stage,ContamType,ContamVector,Created,TotalYield,ContainerType,ContainerWeight\n';
  db.items.forEach(i => {
    csv += `${i.id},"${i.label}",${i.strain},${i.medium},${i.pcBatch},${i.stage},"${i.contamType || ''}","${i.contamVector || ''}",${i.createdAt},${i.totalYield || 0},"${i.containerType || ''}","${i.containerWeight || ''}"\n`;
  });
  const dataStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  const el = document.createElement('a');
  el.setAttribute('href', dataStr);
  el.setAttribute('download', 'SierraMycoLab_Data.csv');
  document.body.appendChild(el); el.click(); el.remove();
}

// --- Render Cards Grid ---
function render() {
  const stages = ['All', ...STAGES];

  let filterHtml = `<span class="text-xs text-slate-400 mr-2">Filter:</span>` + stages.map(stage => `
    <button onclick="scannedItemId=null; currentFilter='${stage}'; render()" class="text-xs px-3 py-1 rounded-full border whitespace-nowrap ${currentFilter === stage && !scannedItemId ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}">
      ${stage}
    </button>
  `).join('');

  if (scannedItemId) {
    filterHtml += `
      <button onclick="scannedItemId=null; render()" class="text-xs px-3 py-1 rounded-full border border-emerald-500 bg-emerald-950 text-emerald-300 font-bold whitespace-nowrap flex items-center gap-1">
        🔍 Scanned: ${scannedItemId} <span class="bg-emerald-800 text-emerald-100 rounded-full px-1 text-[9px]">✕</span>
      </button>
    `;
  }
  document.getElementById('filter-bar').innerHTML = filterHtml;

  populateInoculantSources();
  populatePCBatchDropdown();

  let filtered = currentFilter === 'All' ? db.items : db.items.filter(i => i.stage === currentFilter);
  if (scannedItemId) {
    filtered = db.items.filter(i => i.id === scannedItemId);
  }

  const grid = document.getElementById('items-grid');

  if (!filtered.length) {
    grid.innerHTML = `<div class="col-span-full text-center text-slate-500 py-12">No records found.</div>`;
    updateSelectedCount();
    return;
  }

  grid.innerHTML = filtered.map(item => `
    <div id="card-${item.id}" class="bg-slate-800 border ${item.stage === 'Uninoculated' ? 'border-amber-500/50' : item.stage === 'Contaminated' ? 'border-red-500/50' : 'border-slate-700'} p-4 rounded-xl space-y-3 cursor-pointer hover:border-emerald-500 transition relative group" onclick="openModal('${item.id}')">
      <div class="flex justify-between items-start">
        <div class="flex items-start gap-2">
          <input type="checkbox" data-id="${item.id}" onclick="event.stopPropagation()" onchange="updateSelectedCount()" class="item-checkbox rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-700 mt-1">
          <div>
            <span class="text-xs font-mono bg-slate-900 text-emerald-400 px-2 py-0.5 rounded border border-slate-700">${item.id}</span>
            <h3 class="font-semibold text-slate-100 mt-1">${item.label}</h3>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[10px] uppercase font-bold px-2 py-1 rounded ${
            item.stage === 'Contaminated' ? 'bg-red-900/50 text-red-400' :
            item.stage === 'Uninoculated' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-emerald-300'
          }">${item.stage}</span>
          <button onclick="deleteItemDirect('${item.id}', event)" class="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 text-xs px-1 transition">✕</button>
        </div>
      </div>
      <div class="text-xs grid grid-cols-2 gap-1 text-slate-400">
        <div><strong class="text-slate-300">Strain:</strong> ${item.strain}</div>
        <div><strong class="text-slate-300">Batch:</strong> ${item.pcBatch}</div>
        ${item.medium === 'Media Bottle' ? `
          <div><strong class="text-slate-300">Volume:</strong> ${item.volumeMl ? item.volumeMl + ' mL' : 'N/A'}</div>
          <div><strong class="text-slate-300">Color:</strong> ${item.color || 'N/A'}</div>
        ` : ''}
        ${item.containerType ? `
          <div class="col-span-2"><strong class="text-slate-300">Container:</strong> ${item.containerType}${item.containerWeight ? ` (${item.containerWeight})` : ''}</div>
        ` : ''}
        ${item.parentItemId ? `<div class="col-span-2"><strong class="text-slate-300">G2G Parent:</strong> <span class="text-emerald-400 font-mono">${item.parentItemId}</span></div>` : ''}
        ${item.contamType ? `<div class="col-span-2 text-red-400 font-medium">⚠️ ${item.contamType}</div>` : ''}
      </div>
    </div>
  `).join('');

  updateSelectedCount();
  updateDashboard();
}

// --- Bulk PC Prep Submission ---
document.getElementById('bulk-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const medium = document.getElementById('bulk-medium').value;
  const container = document.getElementById('bulk-container').value;
  const qty = parseInt(document.getElementById('bulk-qty').value);
  const pcTime = document.getElementById('bulk-time').value;
  const pcBatchCode = document.getElementById('bulk-batch').value || generateBatchCode();
  const today = new Date().toLocaleDateString();

  let containerDisplay = container;
  let isCustomContainer = false;
  let containerCapacity = getStandardCapacity(container);

  if (container === 'custom') {
    const customName = document.getElementById('custom-container-name').value || 'Custom Container';
    const customCapacity = parseInt(document.getElementById('custom-container-capacity').value) || 300;
    containerDisplay = `${customName} (${customCapacity}mL)`;
    containerCapacity = customCapacity;
    isCustomContainer = true;
  }

  let finalMedium = medium;
  let volVal = null;
  let colorVal = null;

  // PC Substrate types are sterilized bulk substrates, ready for inoculation.
  // Map them to the "Preparation" stage (Sterilized / Ready for Inoculation).
  const isPCSubstrate = medium.startsWith('PC Substrate');
  const defaultStage = 'Preparation'; // Sterilized / Ready for Inoculation

  if (medium === 'Media Bottle (Agar/LC)') {
    finalMedium = 'Media Bottle';
    volVal = parseInt(document.getElementById('bulk-volume-ml').value) || null;
    colorVal = document.getElementById('bulk-color').value || null;
  } else if (medium === 'Liquid Culture') {
    volVal = parseInt(document.getElementById('lc-target-volume').value) || null;
  }

  const newBatch = {
    batchId: pcBatchCode,
    date: today,
    medium: `${finalMedium} (${containerDisplay})`,
    qty: qty,
    pcTime: pcTime,
    container: {
      name: isCustomContainer ? document.getElementById('custom-container-name').value : container,
      capacity: containerCapacity,
      isCustom: isCustomContainer
    }
  };

  if (!db.pcBatches.find(b => b.batchId === pcBatchCode)) {
    db.pcBatches.unshift(newBatch);
  }

  const generatedItems = [];
  for (let i = 1; i <= qty; i++) {
    const newItem = {
      id: generateId(),
      label: `${finalMedium} ${containerDisplay} #${i}`,
      strain: 'Uninoculated',
      medium: finalMedium,
      volumeMl: volVal,
      color: colorVal,
      pcBatch: pcBatchCode,
      parentItemId: null,
      stage: defaultStage,
      createdAt: today,
      breakAndShake: null,
      totalYield: 0,
      yields: [],
      contamType: null,
      contamVector: null,
      history: [{
        stage: defaultStage,
        timestamp: new Date().toLocaleString(),
        notes: isPCSubstrate
          ? `${finalMedium} sterilized in PC batch ${pcBatchCode} for ${pcTime} mins. Ready for inoculation.`
          : `Sterilized in PC batch ${pcBatchCode} for ${pcTime} mins.`,
        env: ''
      }]
    };
    db.items.unshift(newItem);
    generatedItems.push(newItem);
  }

  saveItems();
  printBulkLabels(generatedItems);
});

// --- Quick Add Source Form Submit ---
document.getElementById('quick-add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const label = document.getElementById('qa-label').value;
  const strain = document.getElementById('qa-strain').value;
  const volume = parseInt(document.getElementById('qa-volume').value) || 50;

  const newSource = {
    id: generateId(),
    label: `${label} (${volume} mL)`,
    strain: strain,
    medium: 'Liquid Culture',
    volumeMl: volume,
    pcBatch: 'Vendor/Quick-Add',
    parentItemId: null,
    stage: 'Colonizing',
    createdAt: new Date().toLocaleDateString(),
    breakAndShake: null,
    totalYield: 0,
    yields: [],
    contamType: null,
    contamVector: null,
    history: [{ stage: 'Colonizing', timestamp: new Date().toLocaleString(), notes: 'Quick Added LC Inoculant Source', env: '' }]
  };

  db.items.unshift(newSource);
  saveItems();
  closeQuickAddModal();

  populateInoculantSources(newSource.id);
});

// --- Active Inoculation Submission ---
document.getElementById('item-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const strain = document.getElementById('input-strain').value;
  const medium = document.getElementById('input-medium').value;
  const inoculantType = document.getElementById('input-inoculant-type').value;
  const parentId = document.getElementById('input-parent').value || null;
  const quantity = parseInt(document.getElementById('input-quantity').value) || 1;
  const shouldPrint = document.getElementById('input-print-toggle').checked;
  const pcSource = document.querySelector('input[name="pc-source"]:checked').value;

  let pcBatchCode = 'N/A';
  let dateObj = new Date();

  if (pcSource === 'existing') {
    const selectedBatch = document.getElementById('input-pc-select').value;
    if (selectedBatch) {
      pcBatchCode = selectedBatch;
      const matchedBatch = db.pcBatches.find(b => b.batchId === selectedBatch);
      if (matchedBatch && matchedBatch.date) {
        dateObj = new Date(matchedBatch.date + ' T12:00:00');
        if (isNaN(dateObj.getTime())) {
          dateObj = new Date();
        }
      }
    }
  } else {
    const manualDateVal = document.getElementById('input-pc-date').value;
    if (manualDateVal) {
      dateObj = new Date(manualDateVal + 'T12:00:00');
      const formattedDate = formatMMDDYY(dateObj);
      pcBatchCode = `PC-MAN-${formattedDate}`;
    }
  }

  const mediumInitials = getMediumInitials(medium);
  const strainInitials = getStrainInitials(strain);
  const dateStr = formatMMDDYY(dateObj);
  const prefix = `${mediumInitials}-${strainInitials}-${dateStr}`;

  const volumePerBag = parseInt(document.getElementById('input-volume-per-bag').value) || 10;

  // Handle Volume Deduction for LC Source
  if (inoculantType === 'Liquid Culture' && parentId) {
    const srcItem = db.items.find(i => i.id === parentId);
    if (srcItem) {
      const originalVol = srcItem.volumeMl !== undefined && srcItem.volumeMl !== null ? srcItem.volumeMl : 0;
      srcItem.volumeMl = Math.max(0, originalVol - (quantity * volumePerBag));
      srcItem.history.unshift({
        stage: srcItem.stage,
        timestamp: new Date().toLocaleString(),
        notes: `Deducted ${quantity * volumePerBag} mL for inoculating ${quantity} container(s).`,
        env: ''
      });
    }
  }

  const generatedItems = [];
  const generatedInCurrentRun = [];

  for (let i = 1; i <= quantity; i++) {
    let suffixNum = 1;
    let candidateId = '';
    while (true) {
      let testId = `${prefix}-${String(suffixNum).padStart(2, '0')}`;
      if (!db.items.find(item => item.id === testId) && !generatedInCurrentRun.includes(testId)) {
        candidateId = testId;
        generatedInCurrentRun.push(testId);
        break;
      }
      suffixNum++;
    }

    const containerTypeVal = document.getElementById('input-container-type').value || '';
    const containerWeightVal = document.getElementById('input-container-weight').value || '';
    const stageVal = document.getElementById('input-stage').value || (CONTAINER_STAGES[containerTypeVal] || ['Preparation'])[0];

    const newItem = {
      id: candidateId,
      label: `${medium} - ${strain} (#${i}/${quantity})`,
      strain: strain,
      medium: medium,
      containerType: containerTypeVal,
      containerWeight: containerWeightVal,
      pcBatch: pcBatchCode,
      parentItemId: parentId,
      stage: stageVal,
      createdAt: new Date().toLocaleDateString(),
      breakAndShake: null,
      totalYield: 0,
      yields: [],
      contamType: null,
      contamVector: null,
      history: [{
        stage: stageVal,
        timestamp: new Date().toLocaleString(),
        notes: `Inoculated with ${strain} via ${inoculantType}${parentId ? ' from ' + parentId : ''}.`,
        env: ''
      }]
    };

    db.items.unshift(newItem);
    generatedItems.push(newItem);
  }

  saveItems();
  document.getElementById('item-form').reset();
  initInoculationsForm();

  if (shouldPrint && generatedItems.length > 0) {
    printBulkLabels(generatedItems);
  }
});

// --- URL Hash Handling ---
function handleURLHash() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#item=')) {
    const id = hash.split('#item=')[1];
    if (id) {
      const found = db.items.find(i => i.id === id);
      if (found) {
        currentFilter = 'All';
        scannedItemId = null;
        render();
        openModal(id);
        setTimeout(() => {
          const card = document.getElementById(`card-${id}`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth' });
            card.classList.add('ring-4', 'ring-emerald-400');
            setTimeout(() => {
              card.classList.remove('ring-4', 'ring-emerald-400');
            }, 4000);
          }
        }, 200);
      }
    }
  }
}

window.addEventListener('hashchange', handleURLHash);
window.addEventListener('DOMContentLoaded', handleURLHash);

// --- Expose globals referenced by inline handlers ---
Object.defineProperty(window, 'currentFilter', { get: () => currentFilter, set: v => { currentFilter = v; } });
Object.defineProperty(window, 'scannedItemId', { get: () => scannedItemId, set: v => { scannedItemId = v; } });
Object.defineProperty(window, 'items', { get: () => db.items, set: v => { db.items = v; } });
Object.defineProperty(window, 'pcBatches', { get: () => db.pcBatches, set: v => { db.pcBatches = v; } });

Object.assign(window, {
  // app.js
  render,
  updateDashboard,
  togglePCSourceFields,
  populatePCBatchDropdown,
  populateInoculantSources,
  toggleInoculantTypeFields,
  populateContainerDropdown,
  populateStageDropdown,
  handleContainerTypeChange,
  quickAddContainer,
  initInoculationsForm,
  exportJSON,
  importJSON,
  exportCSV,
  // utils.js
  toggleLCMedium,
  updateBatchCodeAuto,
  toggleCustomContainer,
  updateLCTargetVolumeDefault,
  updateLCCalculator,
  // modals.js
  openModal,
  closeModal,
  openBatchModal,
  closeBatchModal,
  openG2GModal,
  closeG2GModal,
  switchG2GTab,
  executeG2GAutoGenerate,
  populateG2GScanSelect,
  handleG2GScanInput,
  addG2GScanItem,
  removeG2GScanItem,
  renderG2GScannedList,
  executeG2GScanTransfer,
  openQuickAddModal,
  closeQuickAddModal,
  openRecipeCalcModal,
  closeRecipeCalcModal,
  calculateCVG,
  openPrintSettingsModal,
  closePrintSettingsModal,
  onPrintLayoutChange,
  onPrintOffsetChange,
  applyOrExecutePrintSettings,
  printBulkLabels,
  printSingleLabel,
  applyInoculation,
  logBreakAndShake,
  logYield,
  addFlushYieldRecord,
  removeFlushYieldRecord,
  toggleContamFields,
  handleModalContainerTypeChange,
  deleteActiveItem,
  deleteItemDirect,
  deleteUninoculated,
  deletePCBatch,
  toggleSelectAll,
  updateSelectedCount,
  printSelectedLabels,
  getBatchItems,
  // AI Assistant Drawer
  toggleAIDrawer,
  closeAIDrawer,
  sendChatMessage,
  callGeminiAPI,
  handleSaveApiKey,
  openApiKeyManager,
  closeApiKeyManager,
  updateApiKeyFromDialog,
  clearApiKeyFromDialog,
  // Community Feedback Modal
  openFeedbackModal,
  closeFeedbackModal,
  switchFeedbackTab,
  renderRoadmap,
  handleUpvote,
  // Auth / Cloud Sync Modal
  openAuthModal,
  closeAuthModal,
  switchAuthTab,
  handleAuthSubmit,
  handleAuthGoogle,
  handleAuthLogout,
  // camera.js
  startScanner,
  stopScanner,
  startG2GCameraScan,
  stopG2GCameraScan
});

// --- Register UI refresh callback for the storage layer ---
setRefreshCallback(() => {
  render();
  updateDashboard();
});

// --- Initialize stage form listener (modal) ---
initStageFormListener();

// --- Initialize feedback form listener ---
initFeedbackFormListener();

// --- Initialize hybrid cloud sync (Supabase) ---
// Registers the header "☁️ Cloud Synced" badge updater, syncs on app load,
// and re-syncs automatically on auth state changes (sign in / out).
setSyncStatusCallback(updateCloudSyncBadge);
initCloudSync();

// --- SaaS app shell routing (public landing vs. authenticated dashboard) ---
function showAppDashboard() {
  const landing = document.getElementById('landing-page');
  const dashboard = document.getElementById('app-dashboard');
  if (landing) landing.classList.add('hidden');
  if (dashboard) dashboard.classList.remove('hidden');
}

function showLandingPage() {
  const landing = document.getElementById('landing-page');
  const dashboard = document.getElementById('app-dashboard');
  if (landing) landing.classList.remove('hidden');
  if (dashboard) dashboard.classList.add('hidden');
}

// Check Supabase auth state on page load and route accordingly. Without
// configured Supabase credentials the classic local-first app is shown.
async function initAppRouting() {
  if (!isSupabaseConfigured()) {
    showAppDashboard();
    return;
  }
  const session = await getSession();
  if (session) {
    showAppDashboard();
  } else {
    showLandingPage();
  }
}

// Keep routing in sync with auth events (OAuth redirect returns, logouts…).
onAuthStateChange((event) => {
  if (event === 'SIGNED_IN') showAppDashboard();
  else if (event === 'SIGNED_OUT') showLandingPage();
});

initAppRouting();

// --- Register the service worker for PWA / offline support ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}

// --- Initialize application ---
updateDashboard();
initInoculationsForm();
updateBatchCodeAuto();
render();
