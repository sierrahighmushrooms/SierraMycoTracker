// Sierra Myco Lab - Application entry point.
// Imports all modules, wires up global event listeners, exposes the functions
// referenced by inline onclick handlers, and initializes the UI.

import { db, saveItems, setRefreshCallback, getCustomContainers, addCustomContainer, addCustomContainerPreset, addCustomMediumPreset, getCustomContainerPresets, initCloudSync, setSyncStatusCallback, setSyncErrorCallback, isSupabaseConfigured, getSession, onAuthStateChange, isContainerLimitError, uploadItemsToCloud, syncItemsWithCloud, clearLegacyStorage, clearPendingImportStorage, checkAndClearStaleCache, loadCustomPresetsFromCloud, userOrganizations, userLocations, currentOrganizationId, currentLocationId, setCurrentOrganizationId, setCurrentLocationId, loadOrganizationContext, createOrganization, createRack } from './db.js';

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
  isLockedStage,
  populateMediumDropdown,
  populateContainerDropdownSmart,
  updatePairValidationWarning,
  getTodayDateString,
  initPrepDateInput
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
  onPrinterTypeChange,
  onLabelModelChange,
  applyCustomLabelDims,
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
  deleteSelectedItems,
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
  updateCloudSyncBadge,
  updateContainerUsageUI,
  openUpgradeModal,
  closeUpgradeModal,
  selectUpgradePlan,
  showToast,
  handleContainerLimitError,
  openBillingSettings,
  closeBillingSettings,
  initiateTierCheckout,
  refreshBillingInfo,
  openOrgSettings,
  closeOrgSettings,
  switchOrgTab,
  saveOrgSettings
} from './modals.js';
import { startScanner, stopScanner, startG2GCameraScan, stopG2GCameraScan } from './camera.js';
import { STAGES, CONTAINER_STAGES } from './config.js';

// --- Module-level UI state ---
let currentFilter = 'All';
let scannedItemId = null;

// Apply feature toggles dynamically
function applyFeatureToggles(settings) {
  const finalSettings = settings || { enable_sales: false, enable_racks: false, enable_supplies: false };
  
  const salesContainer = document.getElementById('sales-module-container');
  const racksContainer = document.getElementById('racks-module-container');
  const suppliesContainer = document.getElementById('supplies-module-container');
  
  if (salesContainer) {
    salesContainer.classList.toggle('hidden', !finalSettings.enable_sales);
  }
  if (racksContainer) {
    racksContainer.classList.toggle('hidden', !finalSettings.enable_racks);
  }
  if (suppliesContainer) {
    suppliesContainer.classList.toggle('hidden', !finalSettings.enable_supplies);
  }
}

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
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const localDateStr = `${year}-${month}-${day}`;
  
  el.setAttribute('download', `SierraMycoLab_Backup_${localDateStr}.json`);
  document.body.appendChild(el); el.click(); el.remove();
}

function importJSON(e) {
  const input = e.target;
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    // 1) Parse the backup file; malformed JSON is rejected up front.
    let parsed;
    try {
      parsed = JSON.parse(event.target.result);
    } catch (err) {
      showToast('Invalid backup JSON file.', 'error');
      input.value = '';
      return;
    }

    try {
      // 1) Parse the wrapper: check if the data is wrapped in an object with an `items` array.
      //    Supported formats:
      //    - Direct array: [{...}, {...}]
      //    - Wrapped object: { items: [{...}, {...}], pcBatches: [...] }
      let extractedItems = [];
      let extractedBatches = [];

      if (Array.isArray(parsed)) {
        // Direct array format - use as-is
        extractedItems = parsed;
      } else if (parsed && typeof parsed === 'object') {
        // Wrapped format - extract the items array
        if (Array.isArray(parsed.items)) {
          extractedItems = parsed.items;
        } else if (parsed.items != null) {
          // items exists but is not an array - invalid format
          showToast('Invalid backup format: "items" is not an array.', 'error');
          input.value = '';
          return;
        }
        // Extract pcBatches if present
        if (Array.isArray(parsed.pcBatches)) {
          extractedBatches = parsed.pcBatches;
        }
      } else {
        showToast('Invalid backup JSON file.', 'error');
        input.value = '';
        return;
      }

      // JSON Import Guard: Allow imports up to 100 total items.
      // If an import would exceed 100 items, truncate and notify the user.
      const MAX_IMPORT_ITEMS = 100;
      let importTruncated = false;
      let originalCount = extractedItems.length;
      
      if (extractedItems.length > MAX_IMPORT_ITEMS) {
        extractedItems = extractedItems.slice(0, MAX_IMPORT_ITEMS);
        importTruncated = true;
      }

      // Sanitize the payload BEFORE insertion: legacy JSON may carry custom
      // string codes (e.g. "MY-Z9UGC") in the `id` field, which conflict with
      // Supabase's UUID `id` column. Save the custom code into `item.code`,
      // then drop the legacy `id` so Supabase auto-generates a valid UUID
      // primary key on insert.
      const sanitizedItems = extractedItems.map((item) => {
        const { id, ...rest } = item || {};
        return {
          ...rest,
          code: id || rest.code || null // preserve custom code
        };
      });

      db.items = sanitizedItems;
      db.pcBatches = extractedBatches;

      // Ensure every imported item has an id (required by the items table primary key).
      db.items.forEach(item => {
        if (item && (item.id == null || item.id === '')) item.id = generateId();
      });
      
      // Notify user if import was truncated
      if (importTruncated) {
        showToast(`Import limited to ${MAX_IMPORT_ITEMS} items. ${originalCount - MAX_IMPORT_ITEMS} items were not imported.`, 'warning', 8000);
      }

      // Persist locally first so the restore always works, even offline.
      saveItems();

      // 2-6) Upload the restored items to Supabase under the current user:
      //    - Fetches supabase.auth.getUser() for the active session
      //    - Maps label->name, medium->medium_type, pcBatch->batch_code, createdAt->created_at
      //    - Strips unmapped/extra keys (breakAndShake, parentItemId, legacy IDs, etc.)
      //    - Attaches user_id from the active session
      //    - Executes: supabase.from('items').insert(cleanedPayload)
      //    - Shows success notification with item count and refreshes dashboard
      if (isSupabaseConfigured()) {
        showToast('Uploading backup to cloud...', 'info', 3000);
        const result = await uploadItemsToCloud(db.items);
        if (result.success) {
          // Trigger a fresh query to reload items directly from Supabase.
          await syncItemsWithCloud();
          // Refresh the live dashboard view
          render();
          updateDashboard();
          // Show success notification with item count
          const count = result.insertedCount || 0;
          showToast(`✓ Successfully imported ${count} item${count !== 1 ? 's' : ''} and synced to your account.`, 'success', 5000);
        } else if (result.limitError) {
          const msg = result.errorMessage || (result.error && result.error.message) || 'Active container limit reached. Upgrade to add more containers.';
          render();
          updateDashboard();
          showToast(`Backup restored on this device, but cloud sync failed: ${msg}`, 'warning', 8000);
        } else {
          // Expose full Supabase error details for debugging
          const msg = result.errorMessage || (result.error && result.error.message) || 'Unknown error. Please try again.';
          const details = result.errorDetails ? ` Details: ${result.errorDetails}` : '';
          const hint = result.errorHint ? ` Hint: ${result.errorHint}` : '';
          console.error('Cloud upload failed:', { error: result.error, code: result.errorCode, details: result.errorDetails, hint: result.errorHint });
          render();
          updateDashboard();
          showToast(`Backup restored on this device, but the cloud upload failed: ${msg}${details}${hint}`, 'error', 10000);
        }
      } else {
        // Refresh the live dashboard view
        render();
        updateDashboard();
        const count = db.items.length;
        showToast(`✓ Successfully imported ${count} item${count !== 1 ? 's' : ''} (saved on this device only).`, 'success', 5000);
      }
    } catch (err) {
      console.error('Backup restore failed:', err);
      showToast('Backup restore failed: ' + (err && err.message ? err.message : 'Unexpected error.'), 'error', 8000);
    } finally {
      input.value = ''; // Allow re-importing the same file.
      clearPendingImportStorage();
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

  // Location Selector filter
  const locSelect = document.getElementById('header-location-select');
  if (locSelect && locSelect.value && locSelect.value !== 'all') {
    filtered = filtered.filter(i => i.location_id === locSelect.value);
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

// --- Bulk PC Prep: Smart Dropdown Handlers ---
function handleBulkMediumChange() {
  const medium = document.getElementById('bulk-medium').value;
  
  // If user selected "+ Add Custom Medium", open the custom preset modal
  if (medium === '__add_custom_medium__') {
    openCustomPresetModal('medium');
    // Reset to a valid selection
    populateMediumDropdown('bulk-medium', 'Whole Oats');
    return;
  }
  
  // Re-populate container dropdown with smart filtering based on selected medium
  const currentContainer = document.getElementById('bulk-container').value;
  populateContainerDropdownSmart('bulk-container', medium, currentContainer);
  
  // Update LC calculator and media bottle fields
  toggleLCMedium();
  updateBatchCodeAuto();
  updatePairValidationWarning();
}

function handleBulkContainerChange() {
  const container = document.getElementById('bulk-container').value;
  
  // If user selected "+ Add Custom Container", open the custom preset modal
  if (container === '__add_custom_container__') {
    openCustomPresetModal('container');
    // Reset to a valid selection
    const medium = document.getElementById('bulk-medium').value;
    populateContainerDropdownSmart('bulk-container', medium, 'Quart Wide Mouth');
    return;
  }
  
  toggleCustomContainer();
  updatePairValidationWarning();
}

// --- Custom Preset Modal ---
function openCustomPresetModal(type) {
  const modal = document.getElementById('custom-preset-modal');
  if (!modal) return;
  
  const presetType = type || 'container';
  document.getElementById('custom-preset-type').value = presetType;
  
  const title = document.getElementById('custom-preset-modal-title');
  const containerFields = document.getElementById('custom-preset-container-fields');
  const mediumFields = document.getElementById('custom-preset-medium-fields');
  
  if (presetType === 'container') {
    title.innerHTML = '<span>➕</span> Add Custom Container';
    containerFields.classList.remove('hidden');
    mediumFields.classList.add('hidden');
  } else {
    title.innerHTML = '<span>➕</span> Add Custom Medium';
    containerFields.classList.add('hidden');
    mediumFields.classList.remove('hidden');
  }
  
  // Reset form
  document.getElementById('custom-preset-form').reset();
  document.getElementById('custom-preset-type').value = presetType;
  
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeCustomPresetModal() {
  const modal = document.getElementById('custom-preset-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// Handle custom preset form submission
function handleCustomPresetSubmit(e) {
  e.preventDefault();
  
  const presetType = document.getElementById('custom-preset-type').value;
  const name = document.getElementById('custom-preset-name').value.trim();
  
  if (!name) {
    showToast('Please enter a name for your custom preset.', 'error');
    return;
  }
  
  if (presetType === 'container') {
    const containerType = document.getElementById('custom-preset-container-type').value;
    const capacityValue = parseFloat(document.getElementById('custom-preset-capacity').value) || 0;
    const capacityUnit = document.getElementById('custom-preset-unit').value;
    const recommendedMedium = document.getElementById('custom-preset-recommended-medium').value;
    
    const result = addCustomContainerPreset({
      name,
      type: containerType,
      capacityValue,
      capacityUnit,
      recommendedMedium
    });
    
    if (result) {
      showToast(`✓ Custom container "${name}" saved.`, 'success');
      // Refresh dropdowns
      const medium = document.getElementById('bulk-medium').value;
      populateContainerDropdownSmart('bulk-container', medium, name);
      closeCustomPresetModal();
    } else {
      showToast('A container with that name already exists.', 'warning');
    }
  } else {
    const category = document.getElementById('custom-preset-medium-category').value;
    
    const result = addCustomMediumPreset({
      name,
      category
    });
    
    if (result) {
      showToast(`✓ Custom medium "${name}" saved.`, 'success');
      // Refresh dropdowns
      populateMediumDropdown('bulk-medium', name);
      closeCustomPresetModal();
    } else {
      showToast('A medium with that name already exists.', 'warning');
    }
  }
}

// --- Bulk PC Prep Submission ---
document.getElementById('bulk-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const medium = document.getElementById('bulk-medium').value;
  const container = document.getElementById('bulk-container').value;
  const qty = parseInt(document.getElementById('bulk-qty').value);
  const pcTime = document.getElementById('bulk-time').value;
  const pcBatchCode = document.getElementById('bulk-batch').value || generateBatchCode();
  const prepDate = document.getElementById('bulk-prep-date').value || getTodayDateString();
  
  const selectedDateObj = new Date(prepDate + 'T12:00:00');
  const selectedDateStr = selectedDateObj.toLocaleDateString();
  const selectedTimestampStr = selectedDateObj.toLocaleString();

  let containerDisplay = container;
  let isCustomContainer = false;
  let containerCapacity = getStandardCapacity(container);

  // Check if this is a custom container preset
  const customPresets = getCustomContainerPresets();
  const customPreset = customPresets.find(c => c.name === container);
  if (customPreset) {
    containerDisplay = customPreset.name;
    // Convert capacity to mL for PC load calculations
    let capMl = customPreset.capacityValue || 0;
    if (customPreset.capacityUnit === 'qt') capMl = customPreset.capacityValue * 946.353;
    else if (customPreset.capacityUnit === 'lb') capMl = customPreset.capacityValue * 453.592;
    else if (customPreset.capacityUnit === 'oz') capMl = customPreset.capacityValue * 29.5735;
    containerCapacity = Math.round(capMl) || 500;
    isCustomContainer = true;
  }

  let finalMedium = medium;
  let volVal = null;
  let colorVal = null;

  // PC Substrate types are sterilized bulk substrates, ready for inoculation.
  // Map them to the "Preparation" stage (Sterilized / Ready for Inoculation).
  const isPCSubstrate = medium.startsWith('PC Substrate');
  const defaultStage = 'Preparation'; // Sterilized / Ready for Inoculation

  // Handle liquid/agar mediums for volume tracking
  const isLiquidOrAgar = medium === 'Liquid Culture' || medium === 'Malt Extract Broth' || medium === 'Water' ||
    medium === 'Malt Extract Agar' || medium === 'Potato Dextrose Agar';
  if (isLiquidOrAgar) {
    volVal = parseInt(document.getElementById('bulk-volume-ml').value) || 
             parseInt(document.getElementById('lc-target-volume').value) || null;
    colorVal = document.getElementById('bulk-color').value || null;
  }

  const newBatch = {
    batchId: pcBatchCode,
    date: prepDate,
    prepDate: prepDate,
    medium: `${finalMedium} (${containerDisplay})`,
    qty: qty,
    pcTime: pcTime,
    container: {
      name: isCustomContainer ? containerDisplay : container,
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
      createdAt: selectedDateStr,
      sterilizationDate: selectedDateStr,
      prepDate: prepDate,
      containerType: containerDisplay,
      containerCapacity: containerCapacity,
      breakAndShake: null,
      totalYield: 0,
      yields: [],
      contamType: null,
      contamVector: null,
      history: [{
        stage: defaultStage,
        timestamp: selectedTimestampStr,
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

  // --- Onboarding Auto-Complete Handler ---
  // If the user arrived here via the onboarding Step 7 (Prepared Media) CTA,
  // mark that step complete and route them back to the setup checklist.
  if (window.isOnboardingMediaStep) {
    window.isOnboardingMediaStep = false;
    (async () => {
      try {
        const activeOrg = userOrganizations.find(o => o.id === currentOrganizationId);
        if (activeOrg) {
          const { updateOrganizationSettings } = await import('./db.js');
          const settings = activeOrg.settings || { enable_sales: false, enable_racks: false, enable_supplies: false };
          settings.completed_onboarding_steps = settings.completed_onboarding_steps || [];
          if (!settings.completed_onboarding_steps.includes('step-media')) {
            settings.completed_onboarding_steps.push('step-media');
          }
          await updateOrganizationSettings(activeOrg.id, settings);
        }
      } catch (err) {
        console.error('Failed to save onboarding progress:', err);
      }
      showToast('✓ Prepared media logged! Setup checklist updated.', 'success');
      window.location.hash = '#onboarding/setup';
    })();
  }
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

// --- Setup Wizard Onboarding Steps ---
const ONBOARDING_STEPS = [
  {
    id: 'step-strains',
    title: 'Add Genetic Strains',
    desc: 'Add your first genetic strain or spore lot to begin inoculating and tracking batches.',
    cta: 'Add Strain',
    action: () => {
      window.location.hash = '';
      setTimeout(() => {
        const input = document.getElementById('input-strain');
        if (input) {
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
          input.focus();
          input.classList.add('ring-2', 'ring-emerald-500');
          setTimeout(() => input.classList.remove('ring-2', 'ring-emerald-500'), 3000);
          showToast('Enter your strain name here to start!', 'info');
        }
      }, 300);
    }
  },
  {
    id: 'step-media',
    title: 'Define Growing Media (Substrates)',
    desc: 'Log your first sterilized media lot using the Bulk PC Prep tool.',
    cta: 'Log Prepared Media',
    dependency: 'enable_supplies',
    action: () => {
      window.isOnboardingMediaStep = true;
      window.location.hash = '#bulk-pc';
    }
  },
  {
    id: 'step-locations',
    title: 'Add Physical Locations (Rooms)',
    desc: 'Configure your cultivation rooms, incubation closets, or lab facilities.',
    cta: 'Add Location',
    dependency: 'enable_racks',
    action: () => {
      openAddLocationModal();
    }
  },

  {
    id: 'step-racks',
    title: 'Set Up Rack Positions',
    desc: 'Set up specific rack, row, and shelf addresses for precise physical inventory locations.',
    cta: 'Add Rack / Shelving',
    dependency: 'enable_racks',
    action: () => {
      openAddRackModal();
    }
  },

  {
    id: 'step-supplies',
    title: 'Track Supplies & Sterilization Lots',
    desc: 'Log and monitor pressure cooker sterilization run times, grain lots, and bulk media supplies.',
    cta: 'Log Sterilization Run',
    dependency: 'enable_supplies',
    action: () => {
      window.location.hash = '';
      setTimeout(() => {
        const container = document.getElementById('supplies-module-container');
        if (container) {
          container.scrollIntoView({ behavior: 'smooth', block: 'center' });
          container.classList.add('ring-2', 'ring-amber-500');
          setTimeout(() => container.classList.remove('ring-2', 'ring-amber-500'), 3000);
          showToast('Use Bulk PC Prep to log a sterilization run and track supplies!', 'info');
        }
      }, 300);
    }
  },
  {
    id: 'step-labels',
    title: 'Configure Label / QR Code Size',
    desc: 'Customize your layout and offsets to print perfect QR labels for jars, bags, and plates.',
    cta: 'Configure Print Settings',
    action: () => {
      openPrintSettingsModal();
    }
  },
  {
    id: 'step-customer',
    title: 'Add First Customer',
    desc: 'Register customer profiles and set up billing defaults for quick invoice creation.',
    cta: 'Add Customer',
    dependency: 'enable_sales',
    action: () => {
      window.location.hash = '';
      setTimeout(() => {
        const container = document.getElementById('sales-module-container');
        if (container) {
          container.scrollIntoView({ behavior: 'smooth', block: 'center' });
          container.classList.add('ring-2', 'ring-emerald-500');
          setTimeout(() => container.classList.remove('ring-2', 'ring-emerald-500'), 3000);
          showToast('Use the Sales & Customers module to manage customers!', 'info');
        }
      }, 300);
    }
  },
  {
    id: 'step-team',
    title: 'Invite Team Members',
    desc: 'Invite growers, lab technicians, and managers to collaborate in your multi-tenant workspace.',
    cta: 'Manage Workspace',
    action: () => {
      openOrgSettings();
    }
  },
  {
    id: 'step-create-item',
    title: 'Create First Tracked Item',
    desc: 'Inoculate or scan your very first cultivation batch container to begin tracking live stages.',
    cta: 'Inoculate Container',
    action: () => {
      window.location.hash = '';
      setTimeout(() => {
        const container = document.getElementById('item-form');
        if (container) {
          container.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const parent = container.parentElement;
          parent.classList.add('ring-2', 'ring-emerald-500');
          setTimeout(() => parent.classList.remove('ring-2', 'ring-emerald-500'), 3000);
          showToast('Fill out this form to inoculate your first container!', 'info');
        }
      }, 300);
    }
  }
];

// Toggle visibility of onboarding view vs standard dashboard
function toggleOnboardingView(show) {
  const stats = document.getElementById('dashboard-stats');
  const grid = document.getElementById('dashboard-grid');
  const view = document.getElementById('onboarding-checklist-view');
  
  if (show) {
    if (stats) stats.classList.add('hidden');
    if (grid) grid.classList.add('hidden');
    if (view) {
      view.classList.remove('hidden');
      renderOnboardingChecklist();
    }
  } else {
    if (stats) stats.classList.remove('hidden');
    if (grid) grid.classList.remove('hidden');
    if (view) view.classList.add('hidden');
  }
}

// Render onboarding setup wizard
function renderOnboardingChecklist() {
  const container = document.getElementById('onboarding-steps-container');
  if (!container) return;
  
  const activeOrg = userOrganizations.find(o => o.id === currentOrganizationId);
  if (!activeOrg) {
    container.innerHTML = `<div class="col-span-full text-center text-slate-400 py-8">Please select or create an organization first.</div>`;
    return;
  }
  
  const settings = activeOrg.settings || { enable_sales: false, enable_racks: false, enable_supplies: false };
  const completedSteps = settings.completed_onboarding_steps || [];
  
  // Filter steps dynamically based on organization settings
  const visibleSteps = ONBOARDING_STEPS.filter(step => {
    if (!step.dependency) return true;
    return Boolean(settings[step.dependency]);
  });
  
  const completedCount = visibleSteps.filter(step => completedSteps.includes(step.id)).length;
  const totalCount = visibleSteps.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  
  const progressText = document.getElementById('onboarding-progress-text');
  const progressBar = document.getElementById('onboarding-progress-bar');
  if (progressText) {
    progressText.innerText = `${completedCount} of ${totalCount} steps completed (${percent}%)`;
  }
  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }
  
  container.innerHTML = visibleSteps.map(step => {
    const isCompleted = completedSteps.includes(step.id);
    const cardBorderClass = isCompleted ? 'border-emerald-500/50 bg-slate-900/80 shadow-emerald-950/5' : 'border-slate-800/80 bg-slate-900/40';
    const checkBgClass = isCompleted ? 'bg-emerald-500 border-emerald-500 text-slate-950' : 'bg-slate-950 border-slate-700 text-transparent';
    const statusLabel = isCompleted ? 'Completed' : 'Pending';
    const statusBadgeClass = isCompleted ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700';
    
    return `
      <div class="border ${cardBorderClass} p-5 rounded-xl flex flex-col justify-between gap-4 transition duration-200 hover:border-slate-700/80 shadow-md">
        <div class="space-y-3">
          <!-- Checkbox + Title -->
          <div class="flex items-start gap-3">
            <button onclick="window.toggleOnboardingStep('${step.id}')" class="w-5 h-5 rounded border flex items-center justify-center shrink-0 mt-0.5 transition duration-150 ${checkBgClass} focus:outline-none focus:ring-1 focus:ring-emerald-500">
              <svg class="w-3.5 h-3.5 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
              </svg>
            </button>
            <div>
              <h3 class="font-bold text-white text-sm tracking-wide leading-tight">${step.title}</h3>
              <div class="flex items-center gap-2 mt-1">
                <span class="text-[9px] px-1.5 py-0.5 rounded border font-semibold tracking-wider uppercase ${statusBadgeClass}">${statusLabel}</span>
              </div>
            </div>
          </div>
          <!-- Description -->
          <p class="text-xs text-slate-400 leading-relaxed pl-8">${step.desc}</p>
        </div>

        <!-- Action Button -->
        <div class="pl-8 pt-1">
          <button onclick="window.executeOnboardingCTA('${step.id}')" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2 px-3 rounded-lg text-xs transition flex items-center justify-center gap-1.5 border border-slate-700 hover:border-slate-600">
            <span>⚡</span> ${step.cta}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Toggle manual completion of setup wizard steps
async function toggleOnboardingStep(stepId) {
  const activeOrg = userOrganizations.find(o => o.id === currentOrganizationId);
  if (!activeOrg) return;
  
  const settings = activeOrg.settings || { enable_sales: false, enable_racks: false, enable_supplies: false };
  settings.completed_onboarding_steps = settings.completed_onboarding_steps || [];
  
  const index = settings.completed_onboarding_steps.indexOf(stepId);
  if (index === -1) {
    settings.completed_onboarding_steps.push(stepId);
  } else {
    settings.completed_onboarding_steps.splice(index, 1);
  }
  
  try {
    const { updateOrganizationSettings } = await import('./db.js');
    await updateOrganizationSettings(activeOrg.id, settings);
    
    if (index === -1) {
      showToast('Task marked as completed! 🎉', 'success');
    }
    
    renderOnboardingChecklist();
  } catch (err) {
    console.error('Failed to toggle onboarding step:', err);
    showToast('Failed to save progress: ' + err.message, 'error');
  }
}

// Run step CTA and auto-complete task
async function executeOnboardingCTA(stepId, actionFn) {
  if (typeof actionFn === 'function') {
    actionFn();
  }
  
  const activeOrg = userOrganizations.find(o => o.id === currentOrganizationId);
  if (activeOrg) {
    const settings = activeOrg.settings || { enable_sales: false, enable_racks: false, enable_supplies: false };
    settings.completed_onboarding_steps = settings.completed_onboarding_steps || [];
    if (!settings.completed_onboarding_steps.includes(stepId)) {
      settings.completed_onboarding_steps.push(stepId);
      try {
        const { updateOrganizationSettings } = await import('./db.js');
        await updateOrganizationSettings(activeOrg.id, settings);
      } catch (err) {
        console.error('Auto-complete failed:', err);
      }
    }
  }
}

// --- Add Location Modal (Step 4: Locations) ---
function openAddLocationModal() {
  const modal = document.getElementById('add-location-modal');
  const input = document.getElementById('add-location-name');
  const presetBtns = document.querySelectorAll('.preset-location-btn');
  if (input) input.value = '';
  presetBtns.forEach(btn => btn.classList.remove('border-emerald-500', 'text-emerald-400'));
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
  if (input) setTimeout(() => input.focus(), 100);
}

function closeAddLocationModal() {
  const modal = document.getElementById('add-location-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function selectLocationPreset(name) {
  const input = document.getElementById('add-location-name');
  if (input) input.value = name;
  document.querySelectorAll('.preset-location-btn').forEach(btn => {
    if (btn.dataset.preset === name) {
      btn.classList.add('border-emerald-500', 'text-emerald-400');
    } else {
      btn.classList.remove('border-emerald-500', 'text-emerald-400');
    }
  });
}

async function handleAddLocationSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const input = document.getElementById('add-location-name');
  const name = input ? input.value.trim() : '';
  if (!name) {
    showToast('Please enter a location name.', 'error');
    return;
  }
  const categorySelect = document.getElementById('add-location-category');
  const category = categorySelect ? categorySelect.value : 'Other';

  try {
    const { createLocation, updateOrganizationSettings } = await import('./db.js');
    showToast('Creating location: ' + name + '...', 'info');
    await createLocation(name, category);

    showToast('✓ Location created successfully!', 'success');

    // Refresh header location selector
    const select = document.getElementById('header-location-select');
    if (select) {
      const { userLocations: refreshedLocations, currentLocationId: activeLocId } = await import('./db.js');
      select.innerHTML = '<option value="all" class="bg-slate-900">All Locations</option>' +
        refreshedLocations.map(l => `<option value="${l.id}" class="bg-slate-900" ${activeLocId === l.id ? 'selected' : ''}>${l.name}</option>`).join('');
    }

    closeAddLocationModal();

    // Mark the onboarding step complete and re-render without reloading the page
    const activeOrg = userOrganizations.find(o => o.id === currentOrganizationId);
    if (activeOrg) {
      const settings = activeOrg.settings || { enable_sales: false, enable_racks: false, enable_supplies: false };
      settings.completed_onboarding_steps = settings.completed_onboarding_steps || [];
      if (!settings.completed_onboarding_steps.includes('step-locations')) {
        settings.completed_onboarding_steps.push('step-locations');
      }
      try {
        await updateOrganizationSettings(activeOrg.id, settings);
      } catch (err) {
        console.error('Failed to save onboarding progress:', err);
      }
    }

    renderOnboardingChecklist();
  } catch (err) {
    console.error('Failed to create location:', err);
    showToast('Failed to create location: ' + err.message, 'error');
  }
}

// Add new location (Room) directly from CTA prompt
async function addNewLocationDirectly(roomName) {

  try {
    const { createLocation } = await import('./db.js');
    showToast('Creating room: ' + roomName + '...', 'info');
    await createLocation(roomName);
    showToast('✓ Room created successfully!', 'success');
    
    const select = document.getElementById('header-location-select');
    if (select) {
      const { userLocations, currentLocationId } = await import('./db.js');
      select.innerHTML = '<option value="all" class="bg-slate-900">All Locations</option>' +
        userLocations.map(l => `<option value="${l.id}" class="bg-slate-900" ${currentLocationId === l.id ? 'selected' : ''}>${l.name}</option>`).join('');
    }
    render();
  } catch (err) {
    console.error('Failed to create location:', err);
    showToast('Failed to create room: ' + err.message, 'error');
  }
}

// Add Rack / Shelving modal (Step 5: Racks & Shelving)
function openAddRackModal() {
  const modal = document.getElementById('add-rack-modal');
  if (!modal) return;

  const nameInput = document.getElementById('add-rack-name');
  const shelvesInput = document.getElementById('add-rack-shelves');
  const capacityInput = document.getElementById('add-rack-capacity');
  if (nameInput) nameInput.value = '';
  if (shelvesInput) shelvesInput.value = 4;
  if (capacityInput) capacityInput.value = '';

  document.querySelectorAll('.preset-rack-btn').forEach(btn => {
    btn.classList.remove('border-emerald-500', 'text-emerald-400');
  });

  const locSelect = document.getElementById('add-rack-location');
  if (locSelect) {
    if (!userLocations || userLocations.length === 0) {
      locSelect.innerHTML = '<option value="">No locations available — add one first</option>';
    } else {
      locSelect.innerHTML = userLocations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
    }
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => {
    if (nameInput) nameInput.focus();
  }, 100);
}

function closeAddRackModal() {
  const modal = document.getElementById('add-rack-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function selectRackPreset(name, shelfCount) {
  const nameInput = document.getElementById('add-rack-name');
  const shelvesInput = document.getElementById('add-rack-shelves');
  if (nameInput && !nameInput.value.trim()) nameInput.value = name;
  if (shelvesInput) shelvesInput.value = shelfCount;

  document.querySelectorAll('.preset-rack-btn').forEach(btn => {
    if (btn.dataset.preset === name) {
      btn.classList.add('border-emerald-500', 'text-emerald-400');
    } else {
      btn.classList.remove('border-emerald-500', 'text-emerald-400');
    }
  });
}

async function handleAddRackSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const locationSelect = document.getElementById('add-rack-location');
  const locationId = locationSelect ? locationSelect.value : '';
  if (!locationId) {
    showToast('Please select a location.', 'error');
    return;
  }

  const nameInput = document.getElementById('add-rack-name');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    showToast('Please enter a rack/unit name.', 'error');
    return;
  }

  const shelvesInput = document.getElementById('add-rack-shelves');
  const shelfCount = parseInt(shelvesInput ? shelvesInput.value : '4', 10) || 4;

  const capacityInput = document.getElementById('add-rack-capacity');
  const capacity = capacityInput ? capacityInput.value.trim() : '';

  let preset = null;
  const activePresetBtn = document.querySelector('.preset-rack-btn.border-emerald-500');
  if (activePresetBtn) preset = activePresetBtn.dataset.preset;

  try {
    showToast('Creating rack: ' + name + '...', 'info');
    await createRack(locationId, name, preset, shelfCount, capacity);
    showToast('✓ Rack created successfully!', 'success');

    closeAddRackModal();

    const activeOrg = userOrganizations.find(o => o.id === currentOrganizationId);
    if (activeOrg) {
      const { updateOrganizationSettings } = await import('./db.js');
      const settings = activeOrg.settings || { enable_sales: false, enable_racks: false, enable_supplies: false };
      settings.completed_onboarding_steps = settings.completed_onboarding_steps || [];
      if (!settings.completed_onboarding_steps.includes('step-racks')) {
        settings.completed_onboarding_steps.push('step-racks');
      }
      try {
        await updateOrganizationSettings(activeOrg.id, settings);
      } catch (err) {
        console.error('Failed to save onboarding progress:', err);
      }
    }

    renderOnboardingChecklist();
    render();
  } catch (err) {
    console.error('Failed to create rack:', err);
    showToast('Failed to create rack: ' + err.message, 'error');
  }
}

// Expose onboarding helpers globally
window.toggleOnboardingStep = toggleOnboardingStep;

window.executeOnboardingCTA = (stepId) => {
  const step = ONBOARDING_STEPS.find(s => s.id === stepId);
  if (step) {
    executeOnboardingCTA(step.id, step.action);
  }
};

// --- URL Hash & Path Handling ---
function handleURLHash() {
  const hash = window.location.hash;
  const path = window.location.pathname;

  // Deep-link support: convert /onboarding/setup path to hash route so the
  // setup checklist renders seamlessly regardless of how the user arrived.
  if (path === '/onboarding/setup' && hash !== '#onboarding/setup' && hash !== '#/onboarding/setup') {
    window.location.hash = '#onboarding/setup';
    return;
  }
  
  const isOnboardingRoute = (hash === '#onboarding/setup' || hash === '#/onboarding/setup' || path === '/onboarding/setup');
  toggleOnboardingView(isOnboardingRoute);

  
  if (isOnboardingRoute) {
    return;
  }
  
  // Handle /settings/billing route (via #settings/billing or #/settings/billing)
  if (hash && (hash === '#settings/billing' || hash === '#/settings/billing')) {
    openBillingSettings();
    return;
  }

  // Handle #bulk-pc route: scroll to the Bulk PC Prep tool, and if arriving
  // via onboarding Step 7 (Prepared Media), show the context banner.
  if (hash && (hash === '#bulk-pc' || hash === '#/bulk-pc')) {
    setTimeout(() => {
      const suppliesContainer = document.getElementById('supplies-module-container');
      const banner = document.getElementById('bulk-pc-onboarding-banner');
      if (window.isOnboardingMediaStep && banner) {
        banner.classList.remove('hidden');
        banner.classList.add('flex');
      }
      if (suppliesContainer) {
        suppliesContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 200);
    return;
  }
  
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

function dismissBulkPcOnboardingBanner() {
  const banner = document.getElementById('bulk-pc-onboarding-banner');
  if (banner) {
    banner.classList.add('hidden');
    banner.classList.remove('flex');
  }
  window.isOnboardingMediaStep = false;
}
window.dismissBulkPcOnboardingBanner = dismissBulkPcOnboardingBanner;

// Handle path-based routing for /container/{id} URLs
function handleContainerPath() {
  const path = window.location.pathname;
  const match = path.match(/^\/container\/([^\/]+)$/);
  
  if (match) {
    const id = match[1];
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

window.addEventListener('hashchange', handleURLHash);
window.addEventListener('DOMContentLoaded', () => {
  handleURLHash();
  handleContainerPath();
});

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
  // Add Location modal (Step 4: Locations)
  openAddLocationModal,
  closeAddLocationModal,
  selectLocationPreset,
  handleAddLocationSubmit,
  // Add Rack / Shelving modal (Step 5: Racks & Shelving)
  openAddRackModal,
  closeAddRackModal,
  selectRackPreset,
  handleAddRackSubmit,


  // Bulk PC Prep smart dropdowns & custom presets
  handleBulkMediumChange,
  handleBulkContainerChange,
  openCustomPresetModal,
  closeCustomPresetModal,
  handleCustomPresetSubmit,
  dismissBulkPcOnboardingBanner,
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
  onPrinterTypeChange,
  onLabelModelChange,
  applyCustomLabelDims,
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
  deleteSelectedItems,
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
  // Subscription / Container Limits
  updateContainerUsageUI,
  openUpgradeModal,
  closeUpgradeModal,
  selectUpgradePlan,
  showToast,
  // Billing Settings
  openBillingSettings,
  closeBillingSettings,
  initiateTierCheckout,
  refreshBillingInfo,
  // Org Settings
  openOrgSettings,
  closeOrgSettings,
  switchOrgTab,
  saveOrgSettings,
  // camera.js
  startScanner,
  stopScanner,
  startG2GCameraScan,
  stopG2GCameraScan,
  applyFeatureToggles
});

// Set global function reference for modal interaction
window.applyFeatureToggles = applyFeatureToggles;

// --- Register UI refresh callback for the storage layer ---
setRefreshCallback(() => {
  render();
  updateDashboard();
  updateContainerUsageUI();
});

// --- Initialize stage form listener (modal) ---
initStageFormListener();

// --- Initialize feedback form listener ---
initFeedbackFormListener();

// --- Initialize hybrid cloud sync (Supabase) ---
// Registers the header "☁️ Cloud Synced" badge updater, syncs on app load,
// and re-syncs automatically on auth state changes (sign in / out).
setSyncStatusCallback(updateCloudSyncBadge);

// Register error callback to display toast notifications for cloud sync failures.
// On a database fetch failure the local cache is cleared (never falls back to
// stale/corrupted localStorage) and a clean error toast is shown.
setSyncErrorCallback((error, context) => {
  const message = error?.message || 'Unknown error';
  if (context === 'sync') {
    showToast(`Failed to load data from the server: ${message}. Local data has been cleared — please try again.`, 'error', 8000);
  } else if (context === 'delete') {
    showToast(`Failed to delete from cloud: ${message}`, 'error', 8000);
  } else {
    showToast(`Cloud operation failed: ${message}`, 'error', 8000);
  }
});

// --- Startup storage cleanup & cache-busting ---
// 1) Version check: if the stored version tag doesn't match the current app
//    version, localStorage is cleared to prevent out-of-sync builds across
//    different browsers.
// 2) Remove legacy cached item keys so stale arrays from previous builds
//    never hydrate or seed local state.
// These run BEFORE initCloudSync() so the Supabase fetch is the sole source
// of truth for state.
checkAndClearStaleCache();
clearLegacyStorage();

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
    handleMultiTenantInit();
  } else {
    showLandingPage();
  }
}

// Keep routing in sync with auth events (OAuth redirect returns, logouts…).
// Also refresh the plan/container badge immediately after sign-in or profile
// updates so database-side plan changes (profiles / app_metadata) appear
// without waiting for the next data save.
onAuthStateChange((event) => {
  if (event === 'SIGNED_IN') {
    showAppDashboard();
    updateContainerUsageUI();
    handleMultiTenantInit();
  } else if (event === 'USER_UPDATED') {
    updateContainerUsageUI();
  } else if (event === 'SIGNED_OUT') {
    showLandingPage();
    const locContainer = document.getElementById('header-location-container');
    if (locContainer) locContainer.classList.add('hidden');
  }
});

initAppRouting();

// --- Multi-Tenant Context and Onboarding Handlers ---
async function handleMultiTenantInit() {
  if (!isSupabaseConfigured()) return;
  const session = await getSession();
  if (!session) {
    const locContainer = document.getElementById('header-location-container');
    if (locContainer) locContainer.classList.add('hidden');
    return;
  }

  try {
    const context = await loadOrganizationContext();
    if (context.onboardingNeeded) {
      // Reset onboarding steps to Step 1 when opened
      const step1 = document.getElementById('onboarding-step-1');
      const step2 = document.getElementById('onboarding-step-2');
      if (step1 && step2) {
        step1.classList.remove('hidden');
        step2.classList.add('hidden');
      }
      const icon = document.getElementById('onboarding-modal-icon');
      const title = document.getElementById('onboarding-modal-title');
      const subtitle = document.getElementById('onboarding-modal-subtitle');
      if (icon) icon.innerText = '🏢';
      if (title) title.innerText = 'Create Your Organization';
      if (subtitle) subtitle.innerText = 'Set up your workspace to manage multi-tenant cultivation, inventory, and locations.';

      const modal = document.getElementById('onboarding-modal');
      if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
      }
      return;
    }

    // Show/hide Setup Wizard button in header depending on active organization context
    const setupBtn = document.getElementById('setup-wizard-header-btn');
    if (setupBtn) {
      setupBtn.classList.toggle('hidden', !currentOrganizationId);
    }

    // Apply features toggles upon login / multi-tenant initialization
    const activeOrg = userOrganizations.find(o => o.id === currentOrganizationId);
    applyFeatureToggles(activeOrg ? activeOrg.settings : null);

    // Populate Location selector dropdown
    const select = document.getElementById('header-location-select');
    if (select) {
      select.innerHTML = '<option value="all" class="bg-slate-900">All Locations</option>' +
        userLocations.map(l => `<option value="${l.id}" class="bg-slate-900" ${currentLocationId === l.id ? 'selected' : ''}>${l.name}</option>`).join('');
      
      const locContainer = document.getElementById('header-location-container');
      if (locContainer) locContainer.classList.remove('hidden');
    }

    await syncItemsWithCloud();
    render();
  } catch (err) {
    console.error('Multi-tenant init failed:', err);
  }
}

function autoGenerateSlug() {
  const nameInput = document.getElementById('onboarding-name');
  const slugInput = document.getElementById('onboarding-slug');
  if (nameInput && slugInput) {
    slugInput.value = nameInput.value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}

let onboardingLogoBase64 = null;
function handleOnboardingLogoChange() {
  const fileInput = document.getElementById('onboarding-logo-file');
  const preview = document.getElementById('onboarding-logo-preview');
  const placeholder = document.getElementById('onboarding-logo-placeholder');
  if (fileInput && fileInput.files && fileInput.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      onboardingLogoBase64 = e.target.result;
      if (preview) {
        preview.src = onboardingLogoBase64;
        preview.classList.remove('hidden');
      }
      if (placeholder) placeholder.classList.add('hidden');
    };
    reader.readAsDataURL(fileInput.files[0]);
  }
}

async function handleOnboardingSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('onboarding-name').value.trim();
  const slug = document.getElementById('onboarding-slug').value.trim();
  
  if (!name || !slug) {
    showToast('Organization Name and Slug are required.', 'error');
    return;
  }

  const enableSales = document.getElementById('onboarding-enable-sales').checked;
  const enableRacks = document.getElementById('onboarding-enable-racks').checked;
  const enableSupplies = document.getElementById('onboarding-enable-supplies').checked;

  const settings = {
    enable_sales: enableSales,
    enable_racks: enableRacks,
    enable_supplies: enableSupplies
  };

  try {
    showToast('Creating organization...', 'info');
    await createOrganization(name, slug, onboardingLogoBase64, settings);
    showToast('✓ Organization and Main Facility created successfully!', 'success');
    
    // Apply toggles right away
    applyFeatureToggles(settings);

    const modal = document.getElementById('onboarding-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    
    await handleMultiTenantInit();
  } catch (err) {
    console.error('Onboarding failed:', err);
    showToast('Failed to create organization: ' + err.message, 'error', 6000);
  }
}

function handleLocationFilterChange() {
  const select = document.getElementById('header-location-select');
  if (select) {
    setCurrentLocationId(select.value);
    render();
  }
}

// Setup event listeners for onboarding and location selector
function initMultiTenantListeners() {
  const onboardingForm = document.getElementById('onboarding-form');
  if (onboardingForm) {
    onboardingForm.addEventListener('submit', handleOnboardingSubmit);
  }

  // Handle Onboarding Steps navigation
  const nextBtn = document.getElementById('onboarding-next-btn');
  const backBtn = document.getElementById('onboarding-back-btn');
  const step1 = document.getElementById('onboarding-step-1');
  const step2 = document.getElementById('onboarding-step-2');
  const icon = document.getElementById('onboarding-modal-icon');
  const title = document.getElementById('onboarding-modal-title');
  const subtitle = document.getElementById('onboarding-modal-subtitle');

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const name = document.getElementById('onboarding-name').value.trim();
      const slug = document.getElementById('onboarding-slug').value.trim();
      if (!name || !slug) {
        showToast('Organization Name and Slug are required.', 'warning');
        return;
      }
      if (step1 && step2) {
        step1.classList.add('hidden');
        step2.classList.remove('hidden');
        if (icon) icon.innerText = '🚜';
        if (title) title.innerText = 'What does your farm do?';
        if (subtitle) subtitle.innerText = 'Tell us more about your mushroom cultivation and operations.';
      }
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (step1 && step2) {
        step2.classList.add('hidden');
        step1.classList.remove('hidden');
        if (icon) icon.innerText = '🏢';
        if (title) title.innerText = 'Create Your Organization';
        if (subtitle) subtitle.innerText = 'Set up your workspace to manage multi-tenant cultivation, inventory, and locations.';
      }
    });
  }

  const nameInput = document.getElementById('onboarding-name');
  if (nameInput) {
    nameInput.addEventListener('input', autoGenerateSlug);
  }

  const fileInput = document.getElementById('onboarding-logo-file');
  if (fileInput) {
    fileInput.addEventListener('change', handleOnboardingLogoChange);
  }

  const uploadBtn = document.getElementById('onboarding-upload-btn');
  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      const file = document.getElementById('onboarding-logo-file');
      if (file) file.click();
    });
  }

  const locSelect = document.getElementById('header-location-select');
  if (locSelect) {
    locSelect.addEventListener('change', handleLocationFilterChange);
  }

  const addRackForm = document.getElementById('add-rack-form');
  if (addRackForm) {
    addRackForm.addEventListener('submit', handleAddRackSubmit);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMultiTenantListeners);

} else {
  initMultiTenantListeners();
}

// --- Register the service worker for PWA / offline support ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}

// --- Listen for container limit errors from cloud sync ---
window.addEventListener('container-limit-error', (event) => {
  const { error } = event.detail || {};
  handleContainerLimitError(error);
  updateContainerUsageUI();
});

// --- Initialize custom preset form listener ---
document.getElementById('custom-preset-form').addEventListener('submit', handleCustomPresetSubmit);

// --- Initialize application ---
updateDashboard();
initInoculationsForm();
initPrepDateInput();

// When bulk-prep-date changes, update batch code automatically
const prepDateInput = document.getElementById('bulk-prep-date');
if (prepDateInput) {
  prepDateInput.addEventListener('change', updateBatchCodeAuto);
}

// Populate smart dropdowns with categorized mediums/containers
populateMediumDropdown('bulk-medium', 'Whole Oats');
populateContainerDropdownSmart('bulk-container', 'Whole Oats', 'Quart Wide Mouth');
updateBatchCodeAuto();
updatePairValidationWarning();
render();
updateContainerUsageUI();

// Load custom presets from Supabase user metadata (non-blocking)
loadCustomPresetsFromCloud();
