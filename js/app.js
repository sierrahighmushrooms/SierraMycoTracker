// Sierra Myco Lab - Application entry point.
// Imports all modules, wires up global event listeners, exposes the functions
// referenced by inline onclick handlers, and initializes the UI.

// Explicitly attach auth-related functions to window for inline HTML handlers
window.openAuthModal = (tab = 'signin') => {
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (tab) {
      const tabEl = document.getElementById(`auth-tab-${tab}`);
      if (tabEl) tabEl.click();
    }
  }
};

window.closeAuthModal = () => {
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};

// Global signOut handler accessible to HTML inline onclick="signOut()"
window.signOut = async () => {
  try {
    const client = window.supabaseClient || (typeof getSupabaseClient === 'function' ? getSupabaseClient() : null);
    if (client) {
      const { error } = await client.auth.signOut();
      if (error) console.error("Supabase SignOut Error:", error);
    }
  } catch (err) {
    console.error("SignOut Exception:", err);
  } finally {
    // Clear local auth/container states
    localStorage.removeItem('mycotrack_containers');
    localStorage.removeItem('myco_items_v5');
    localStorage.removeItem('mycotrack_current_org_id');
    localStorage.removeItem('supabase.auth.token');
    localStorage.removeItem('mycotrack_auth_token');
    localStorage.removeItem('sb-wsalxxsjnxptoeduwfqw-auth-token');
    sessionStorage.clear();
    
    if (typeof showLandingPage === 'function') {
      showLandingPage();
      const locContainer = document.getElementById('header-location-container');
      if (locContainer) locContainer.classList.add('hidden');
    } else {
      window.location.reload();
    }
  }
};

import { db, saveItems, setRefreshCallback, getCustomContainers, addCustomContainer, addCustomContainerPreset, addCustomMediumPreset, getCustomContainerPresets, initCloudSync, setSyncStatusCallback, setSyncErrorCallback, isSupabaseConfigured, getSupabaseClient, getSession, ensureValidSession, onAuthStateChange, isContainerLimitError, uploadItemsToCloud, syncItemsWithCloud, clearLegacyStorage, clearPendingImportStorage, checkAndClearStaleCache, loadCustomPresetsFromCloud, userOrganizations, userLocations, currentOrganizationId, currentLocationId, setCurrentOrganizationId, setCurrentLocationId, loadOrganizationContext, createOrganization, createRack } from './db.js';
import { fetchCustomers, createCustomer, updateCustomer, deleteCustomer, fetchOrders, createOrder, updateOrder, deleteOrder, populateCustomerPicker } from './sales.js';

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
  getNowDateTimeLocalString,
  initPrepDateInput
} from './utils.js';
import {
  openModal,
  closeModal,
  openItemModal,
  openItemDetailModal,
  showItemDetails,
  showContainerDetails,
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
  openSpawnBulkModal,
  closeSpawnBulkModal,
  switchSpawnBulkTab,
  populateSpawnBulkSubstrateSelect,
  handleSpawnBulkScanInput,
  onSpawnBulkSubstrateSelect,
  selectSpawnBulkSubstrate,
  executeSpawnToFruitingBlock,
  openQuickLogParentModal,
  closeQuickLogParentModal,
  openQuickAddModal,
  closeQuickAddModal,
  openRecipeCalcModal,
  closeRecipeCalcModal,
  calculateCVG,
  switchRecipeMode,
  handleRecipePresetChange,
  handleRecipeContainerChange,
  handleMoistureSliderChange,
  recalculateRecipeEngine,
  handleSaveCurrentRecipeModal,
  handleDeleteActiveCustomRecipe,
  pushRecipeToBulkPrep,
  openPrintSettingsModal,
  openPrintModal,
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
  saveOrgSettings,
  removeOrgLogo,
  updateOrgLogoPreviewUI,
  openRecordSaleModal,
  closeRecordSaleModal,
  handleSaleCustomerSelect,
  renderSaleLineItems,
  updateSaleLineItem,
  removeSaleLineItem,
  addSaleCustomLineItem,
  addScannedItemToSale,
  handleSaleSearchEnter,
  handleSaleSearchSuggestions,
  calculateSaleTotal,
  saveNewSale
} from './modals.js';
import { startScanner, stopScanner, startG2GCameraScan, stopG2GCameraScan, startSpawnBulkCameraScan, stopSpawnBulkCameraScan, startSaleCameraScan, stopSaleCameraScan } from './camera.js';
import { STAGES, CONTAINER_STAGES } from './config.js';

// --- Module-level UI state ---
let currentFilter = 'All';
let scannedItemId = null;

// --- Inventory & Supplies UI Logic ---
let currentSupplies = [];

window.renderInventoryList = async function() {
  const listEl = document.getElementById('inventory-list');
  if (!listEl) return;

  try {
    const { getSupplies, currentOrganizationId } = await import('./db.js');
    
    if (!currentOrganizationId) {
      listEl.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-slate-500">Please select an organization to view inventory.</td></tr>`;
      return;
    }

    currentSupplies = await getSupplies();
    const searchTerm = (document.getElementById('inventory-search')?.value || '').toLowerCase();
    
    const filteredSupplies = currentSupplies.filter(s => 
      s.name.toLowerCase().includes(searchTerm) || 
      (s.category && s.category.toLowerCase().includes(searchTerm))
    );

    if (filteredSupplies.length === 0) {
      listEl.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-slate-500">No supplies found.</td></tr>`;
      return;
    }

    listEl.innerHTML = filteredSupplies.map(supply => {
      const isLow = supply.reorder_threshold != null && supply.quantity_on_hand <= supply.reorder_threshold;
      const statusHtml = isLow 
        ? `<span class="text-[10px] bg-red-500/20 text-red-400 px-2 py-1 rounded font-bold">Low Stock</span>`
        : `<span class="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded font-bold">In Stock</span>`;

     // Escape HTML to prevent XSS
const escapeHtml = (unsafe) => {
  return (unsafe || '').toString()
       .replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#039;");
};

      return `
        <tr class="border-b border-slate-800/50 hover:bg-slate-800/30 transition">
          <td class="px-4 py-3 font-medium text-slate-200">${escapeHtml(supply.name)}</td>
          <td class="px-4 py-3 text-slate-400">${escapeHtml(supply.category || '-')}</td>
          <td class="px-4 py-3 font-mono text-slate-300">${supply.quantity_on_hand} ${escapeHtml(supply.unit_of_measure || '')}</td>
          <td class="px-4 py-3">${statusHtml}</td>
          <td class="px-4 py-3">
            <button onclick="deleteInventorySupply('${supply.id}')" class="text-red-400 hover:text-red-300 text-xs font-bold px-2 py-1 rounded hover:bg-red-400/10 transition">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to render inventory:', err);
    listEl.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-red-400">Error loading inventory.</td></tr>`;
  }
};

window.deleteInventorySupply = async function(id) {
  if (!confirm('Are you sure you want to delete this supply item?')) return;
  try {
    const { deleteSupply } = await import('./db.js');
    await deleteSupply(id);
    showToast('Supply deleted successfully', 'success');
    renderInventoryList();
  } catch (err) {
    showToast('Failed to delete supply: ' + err.message, 'error');
  }
};

// --- Add Supply Modal ---
function openAddSupplyModal() {
  const modal = document.getElementById('add-supply-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const input = document.getElementById('add-supply-name');
    if (input) setTimeout(() => input.focus(), 100);
  }
}

function closeAddSupplyModal() {
  const modal = document.getElementById('add-supply-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// --- Orders Table & Sales History UI Logic ---
window.renderOrdersList = async function() {
  const tbody = document.getElementById('orders-list');
  if (!tbody) return;

  try {
    const orders = await fetchOrders();
    const customers = await fetchCustomers();

    if (!orders || orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500">No orders recorded yet. Click "Create Order" or "+ New Order" on a customer to record a sale.</td></tr>`;
      return;
    }

    const escapeHtml = (unsafe) => {
      const div = document.createElement('div');
      div.textContent = (unsafe || '').toString();
      return div.innerHTML;
    };

    tbody.innerHTML = orders.map(order => {
      const customer = customers.find(c => c.id === (order.customer_id || order.customerId));
      const customerName = customer 
        ? `${customer.first_name || customer.firstName || ''} ${customer.last_name || customer.lastName || ''}`.trim() || customer.company || 'Customer'
        : 'Walk-in / Direct';
      
      const orderDate = order.order_date || order.orderDate || (order.created_at ? order.created_at.split('T')[0] : 'Today');
      const paymentStatus = (order.payment_status || order.paymentStatus || 'unpaid').toLowerCase();
      const statusBadge = paymentStatus === 'paid'
        ? `<span class="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-500/30">Paid</span>`
        : `<span class="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-500/30">Unpaid / Invoice</span>`;

      // Compute total from line items if total not stored directly
      let total = 0;
      const items = order.line_items || order.lineItems || [];
      if (Array.isArray(items)) {
        const subtotal = items.reduce((sum, item) => sum + (Number(item.qty || 1) * Number(item.unitPrice || 0)), 0);
        const discount = Number(order.discount || 0);
        const taxRate = Number(order.tax_rate || order.taxRate || 0);
        const discountedSub = Math.max(0, subtotal - discount);
        total = discountedSub + ((discountedSub * taxRate) / 100);
      }
      const displayTotal = `$${total.toFixed(2)}`;
      const shortId = (order.id || '').substring(0, 8);

      return `
        <tr class="border-b border-slate-800/80 hover:bg-slate-900/50 transition">
          <td class="px-4 py-3 font-mono text-emerald-400 font-semibold text-xs">#${shortId}</td>
          <td class="px-4 py-3 text-slate-200 font-medium">${escapeHtml(customerName)}</td>
          <td class="px-4 py-3 text-slate-400 text-xs">${escapeHtml(orderDate)}</td>
          <td class="px-4 py-3">${statusBadge}</td>
          <td class="px-4 py-3 font-mono font-bold text-slate-100">${displayTotal}</td>
          <td class="px-4 py-3 text-right">
            <button onclick="openRecordSaleModal('${order.customer_id || order.customerId || ''}')" class="text-xs text-emerald-400 hover:text-emerald-300 mr-2 font-medium">New Order</button>
            <button onclick="deleteOrder('${order.id}')" class="text-xs text-rose-400 hover:text-rose-300 font-medium">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error rendering orders list:', err);
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-4 text-center text-rose-400">Error loading orders.</td></tr>`;
  }
};

// Initialize optional sub-modules with error handling
try {
  if (document.getElementById('sales-module-container')) {
    fetchCustomers().then(() => {
      populateCustomerPicker();
      window.renderOrdersList();
    });
  }
} catch (err) {
  console.error('Failed to initialize sales module:', err);
}

// Initialize onboarding helpers if present
try {
  if (document.getElementById('onboarding-checklist-view')) {
    loadOrganizationContext();
  }
} catch (err) {
  console.error('Failed to initialize onboarding helpers:', err);
}

  // Apply feature toggles dynamically
  function applyFeatureToggles(settings) {
    const finalSettings = settings || { enable_sales: true, enable_racks: false, enable_supplies: true, enable_inoculation: true };
    
    // Force these to be true by default if not explicitly set to false
    if (finalSettings.enable_sales === undefined) finalSettings.enable_sales = true;
    if (finalSettings.enable_inoculation === undefined) finalSettings.enable_inoculation = true;
    if (finalSettings.enable_supplies === undefined) finalSettings.enable_supplies = true;

    const salesContainer = document.getElementById('sales-module-container');
    const racksContainer = document.getElementById('racks-module-container');
    const suppliesContainer = document.getElementById('supplies-module-container');
    const inoculationContainer = document.getElementById('inoculation-module-container');
    
    if (salesContainer) {
      salesContainer.classList.toggle('hidden', !finalSettings.enable_sales);
    }
    if (racksContainer) {
      racksContainer.classList.toggle('hidden', !finalSettings.enable_racks);
    }
    if (suppliesContainer) {
      suppliesContainer.classList.toggle('hidden', !finalSettings.enable_supplies);
    }
    if (inoculationContainer) {
      inoculationContainer.classList.toggle('hidden', !finalSettings.enable_inoculation);
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
  const checkedRadio = document.querySelector('input[name="pc-source"]:checked');
  const source = checkedRadio ? checkedRadio.value : 'manual';
  const batchContainer = document.getElementById('pc-batch-select-container');
  const dateContainer = document.getElementById('pc-date-input-container');

  if (source === 'existing') {
    if (batchContainer) batchContainer.classList.remove('hidden');
    if (dateContainer) dateContainer.classList.add('hidden');
  } else {
    if (batchContainer) batchContainer.classList.add('hidden');
    if (dateContainer) dateContainer.classList.remove('hidden');
  }
}

function populatePCBatchDropdown() {
  const select = document.getElementById('input-pc-select');
  if (!select) return;

  // Derive active batch IDs dynamically from current non-deleted items
  const activeBatchIdSet = new Set(
    (db.items || [])
      .filter(item => (item.pcBatch || item.batch_code) && !item.deleted)
      .map(item => item.pcBatch || item.batch_code)
  );

  const activeBatches = (db.pcBatches || []).filter(b => activeBatchIdSet.has(b.batchId));

  // Also include any batch IDs found in active items even if not in pcBatches
  const registeredBatchIds = new Set(activeBatches.map(b => b.batchId));
  activeBatchIdSet.forEach(batchId => {
    if (!registeredBatchIds.has(batchId)) {
      const sampleItem = (db.items || []).find(i => (i.pcBatch === batchId || i.batch_code === batchId));
      activeBatches.push({
        batchId: batchId,
        medium: sampleItem ? (sampleItem.medium || sampleItem.medium_type || 'Unknown') : 'Batch',
        date: sampleItem ? (sampleItem.createdAt || sampleItem.sterilizationDate || '') : ''
      });
    }
  });

  const existingRadio = document.querySelector('input[name="pc-source"][value="existing"]');
  const manualRadio = document.querySelector('input[name="pc-source"][value="manual"]');

  if (!activeBatches.length) {
    select.innerHTML = '<option value="">No active PC batches available</option>';
    select.disabled = true;
    if (existingRadio) existingRadio.disabled = true;
    if (manualRadio) {
      manualRadio.checked = true;
    }
    togglePCSourceFields();
    return;
  }

  select.disabled = false;
  if (existingRadio) existingRadio.disabled = false;
  select.innerHTML = activeBatches.map(b => {
    const desc = b.date ? `${b.medium} - ${b.date}` : b.medium;
    return `<option value="${b.batchId}">${b.batchId} (${desc})</option>`;
  }).join('');
}

function populateInoculantSources(selectedIdToSelect = null) {
  const type = document.getElementById('input-inoculant-type').value;
  const parentSelect = document.getElementById('input-parent');
  if (!parentSelect) return;

  let filtered = [];
  let defaultOptionText = 'None / Direct';

  if (type === 'Liquid Culture') {
    filtered = db.items.filter(i => (i.medium === 'Liquid Culture' || i.medium === 'Media Bottle' || i.containerType === 'Liquid Culture Jar') && !isLockedStage(i.stage));
    defaultOptionText = 'Select LC Source...';
  } else if (type === 'Agar') {
    filtered = db.items.filter(i => (i.medium === 'Agar' || i.medium === 'Petri Dish' || i.containerType === 'Agar Dish / Slant') && !isLockedStage(i.stage));
    defaultOptionText = 'Select Agar Plate...';
  } else if (type === 'Grain-to-Grain') {
    filtered = db.items.filter(i => (i.medium === 'Whole Oats' || i.medium === 'Rye Grain' || i.medium === 'Millet' || i.stage === 'Colonizing' || i.stage === 'G2G Ready') && !isLockedStage(i.stage) && i.stage !== 'Uninoculated' && i.stage !== 'Preparation');
    defaultOptionText = 'Select G2G Parent...';
  } else if (type === 'Spore Syringe') {
    filtered = db.items.filter(i => (i.medium === 'Spore Syringe' || i.inoculantType === 'Spore Syringe') && !isLockedStage(i.stage));
    defaultOptionText = 'None (Direct Spore Syringe)';
  }

  let optionsHtml = `<option value="">${defaultOptionText}</option>`;
  optionsHtml += `<option value="legacy" ${selectedIdToSelect === 'legacy' ? 'selected' : ''}>+ Legacy / External Source</option>`;
  filtered.forEach(i => {
    let volText = (i.volumeMl !== undefined && i.volumeMl !== null) ? ` (${i.volumeMl} mL left)` : '';
    const shortId = (typeof i.id === 'string' && i.id.length >= 8) ? i.id.slice(0, 8) : (i.id || '');
    const typeLabel = i.type || i.medium || (type === 'Liquid Culture' ? 'Liquid Culture' : (type === 'Agar' ? 'Agar' : 'Grain'));
    const strainOrName = i.strain || i.labelName || i.label || 'Unknown';
    optionsHtml += `<option value="${i.id}" ${selectedIdToSelect === i.id ? 'selected' : ''}>${strainOrName} (${typeLabel}) [${shortId}]${volText}</option>`;
  });
  parentSelect.innerHTML = optionsHtml;
  
  // Trigger change event to update legacy source input visibility
  parentSelect.dispatchEvent(new Event('change'));
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
  
  const parentSelect = document.getElementById('input-parent');
  if (parentSelect && !parentSelect.hasAttribute('data-legacy-listener')) {
    parentSelect.addEventListener('change', () => {
      const legacyContainer = document.getElementById('legacy-source-container');
      if (legacyContainer) {
        if (parentSelect.value === 'legacy') {
          legacyContainer.classList.remove('hidden');
        } else {
          legacyContainer.classList.add('hidden');
        }
      }

      // Automatically populate strain if a parent container is selected
      const selectedParentId = parentSelect.value;
      if (selectedParentId && selectedParentId !== 'legacy') {
        const parentItem = db.items.find(i => i.id === selectedParentId);
        const strainInput = document.getElementById('input-strain');
        if (parentItem && parentItem.strain && parentItem.strain !== 'Uninoculated' && strainInput) {
          strainInput.value = parentItem.strain;
        }
      }
    });
    parentSelect.setAttribute('data-legacy-listener', 'true');
  }
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
      //    - Executes: supabase.from('items').upsert(cleanedPayload, { onConflict: 'id' })
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

// --- Render Containers / Cards Grid ---
function renderContainers() {
  render();
}
window.renderContainers = renderContainers;

function populateSecondaryFilters() {
  const mediumSelect = document.getElementById('filter-medium-select');
  const batchSelect = document.getElementById('filter-batch-select');

  if (mediumSelect) {
    const currentMedVal = mediumSelect.value || 'all';
    const mediums = Array.from(new Set(
      (db.items || []).map(i => i.medium || i.medium_type).filter(Boolean)
    )).sort();

    mediumSelect.innerHTML = '<option value="all">All Mediums</option>' +
      mediums.map(m => `<option value="${m}" ${currentMedVal === m ? 'selected' : ''}>${m}</option>`).join('');
  }

  if (batchSelect) {
    const currentBatchVal = batchSelect.value || 'all';
    const batches = Array.from(new Set(
      (db.items || []).map(i => i.pcBatch || i.batch_code).filter(Boolean)
    )).sort();

    batchSelect.innerHTML = '<option value="all">All PC Batches</option>' +
      batches.map(b => `<option value="${b}" ${currentBatchVal === b ? 'selected' : ''}>${b}</option>`).join('');
  }
}

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

  populateSecondaryFilters();
  populateInoculantSources();
  populatePCBatchDropdown();

  let filtered = db.items || [];

  // 1. Stage filter
  if (currentFilter !== 'All') {
    filtered = filtered.filter(i => i.stage === currentFilter);
  }

  // 2. Scanned item override
  if (scannedItemId) {
    filtered = filtered.filter(i => i.id === scannedItemId || i.code === scannedItemId || i.custom_id === scannedItemId);
  }

  // 3. Search query filter (search strain, batch ID, medium, or short ID)
  const searchInput = document.getElementById('dashboard-search');
  const query = (searchInput?.value || '').trim().toLowerCase();
  if (query) {
    filtered = filtered.filter(i => {
      const idStr = (i.id || '').toLowerCase();
      const codeStr = (i.code || '').toLowerCase();
      const shortId = idStr.slice(0, 8);
      const strainStr = (i.strain || '').toLowerCase();
      const batchStr = (i.pcBatch || i.batch_code || '').toLowerCase();
      const mediumStr = (i.medium || i.medium_type || '').toLowerCase();
      const labelStr = (i.label || i.name || '').toLowerCase();
      const containerStr = (i.containerType || i.container_type || '').toLowerCase();

      return idStr.includes(query) ||
             codeStr.includes(query) ||
             shortId.includes(query) ||
             strainStr.includes(query) ||
             batchStr.includes(query) ||
             mediumStr.includes(query) ||
             labelStr.includes(query) ||
             containerStr.includes(query);
    });
  }

  // 4. Secondary Medium filter
  const medSelect = document.getElementById('filter-medium-select');
  if (medSelect && medSelect.value && medSelect.value !== 'all') {
    filtered = filtered.filter(i => (i.medium === medSelect.value || i.medium_type === medSelect.value));
  }

  // 5. Secondary Batch filter
  const batchSelect = document.getElementById('filter-batch-select');
  if (batchSelect && batchSelect.value && batchSelect.value !== 'all') {
    filtered = filtered.filter(i => (i.pcBatch === batchSelect.value || i.batch_code === batchSelect.value));
  }

  // 6. Location Selector filter
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

  grid.innerHTML = filtered.map(item => {
    const rawId = item.code || item.custom_id || item.id || '';
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
    const displayId = (typeof item.id === 'string' && item.id.length >= 8)
      ? item.id.slice(0, 8)
      : (isUuid ? rawId.substring(0, 8) : (item.code || rawId));
    const itemCode = item.code || item.custom_id || displayId;
    return `
    <div id="card-${item.id}" data-item-id="${item.id}" data-item-code="${itemCode}" class="container-card bg-slate-800 border ${item.stage === 'Uninoculated' ? 'border-amber-500/50' : item.stage === 'Contaminated' ? 'border-red-500/50' : 'border-slate-700'} p-4 rounded-xl space-y-3 cursor-pointer hover:border-emerald-500 transition relative group" onclick="window.openItemDetailModal ? window.openItemDetailModal('${item.id}') : openModal('${item.id}')">
      <div class="flex justify-between items-start">
        <div class="flex items-start gap-2">
          <input type="checkbox" id="${displayId}" value="${item.id}" data-id="${item.id}" data-item-id="${item.id}" data-item-code="${itemCode}" onclick="event.stopPropagation()" onchange="updateSelectedCount()" class="item-checkbox container-card-checkbox rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-700 mt-1">
          <div>
            <span class="text-xs font-mono bg-slate-900 text-emerald-400 px-2 py-0.5 rounded border border-slate-700">${displayId}</span>
            <h3 class="font-semibold text-slate-100 mt-1">${item.label}</h3>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[10px] uppercase font-bold px-2 py-1 rounded ${
            item.stage === 'Contaminated' ? 'bg-red-900/50 text-red-400' :
            item.stage === 'Uninoculated' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-emerald-300'
          }">${item.stage}</span>
          <button onclick="event.stopPropagation(); deleteItemDirect('${item.id}', event)" class="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 text-xs px-1 transition" title="Delete container">✕</button>
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
        ${(item.stage === 'Fruiting' || item.stage === 'Harvest') ? `
          <div class="col-span-2 pt-2 border-t border-slate-700/60 mt-1 flex justify-between items-center">
            <span class="text-[11px] text-emerald-400 font-bold">Yield: ${item.yieldGrams || item.totalYield || 0}g</span>
            <button onclick="event.stopPropagation(); openLogHarvestModal('${item.id}')" class="bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold px-2 py-1 rounded transition flex items-center gap-1 shadow-sm">
              🍄 Log Harvest
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
  }).join('');

  updateSelectedCount();
  updateDashboard();
}

// Event delegation on items-grid / inventory container for container cards
function initContainerGridListener() {
  const grid = document.getElementById('items-grid');
  if (!grid || grid.hasAttribute('data-delegated-listener')) return;

  grid.addEventListener('click', (e) => {
    // If a button or checkbox was clicked directly, let its own handler / stopPropagation manage it
    if (e.target.closest('button') || e.target.closest('input[type="checkbox"]')) {
      return;
    }

    // Find the enclosing container card or element with data-item-id
    const card = e.target.closest('.container-card, [data-item-id]');
    if (card) {
      try {
        const itemId = card.getAttribute('data-item-id') || card.getAttribute('data-item-code') || (card.id ? card.id.replace('card-', '') : null);
        if (!itemId) {
          console.warn('initContainerGridListener: Container card clicked but missing identifier.');
          return;
        }
        if (typeof window.openItemDetailModal === 'function') {
          window.openItemDetailModal(itemId);
        } else if (typeof openItemDetailModal === 'function') {
          openItemDetailModal(itemId);
        } else if (typeof window.openModal === 'function') {
          window.openModal(itemId);
        } else if (typeof openModal === 'function') {
          openModal(itemId);
        }
      } catch (err) {
        console.error('Error handling container card click:', err);
      }
    }
  });

  grid.setAttribute('data-delegated-listener', 'true');
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
document.getElementById('bulk-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const medium = document.getElementById('bulk-medium').value;
  const container = document.getElementById('bulk-container').value;
  const qty = parseInt(document.getElementById('bulk-qty').value);
  const pcTime = document.getElementById('bulk-time').value;
  const prepDateInputVal = (document.getElementById('bulk-prep-date') || {}).value;
  const pcBatchCode = document.getElementById('bulk-batch').value || generateBatchCode(medium, prepDateInputVal);
  const prepDate = prepDateInputVal || getNowDateTimeLocalString();
  
  // Date validation: Selected Date <= Today (block picking future dates)
  const now = new Date();
  const selectedDateObj = prepDate.includes('T') ? new Date(prepDate) : new Date(prepDate + 'T12:00:00');
  if (selectedDateObj.getTime() > now.getTime() + 60000) { // allow 1 minute tolerance for clock drift
    showToast('Prep / Run Date cannot be in the future. Please select a past or current date/time.', 'error');
    return;
  }

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

  // Set all created containers directly to "Uninoculated / Ready" status (Preparation stage)
  const isPCSubstrate = medium.startsWith('PC Substrate');
  const defaultStage = 'Preparation'; // Uninoculated / Ready for Inoculation

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
    date: prepDate.split('T')[0],
    prepDate: prepDate,
    medium: `${finalMedium} (${containerDisplay})`,
    qty: qty,
    pcTime: pcTime,
    status: 'Ready',
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
  const supabasePayload = [];
  const client = getSupabaseClient();
  let user = null;
  if (isSupabaseConfigured() && client) {
    try {
      const { data } = await client.auth.getUser();
      user = data?.user || null;
    } catch (err) {
      console.warn('Failed to retrieve user for immediate insert:', err);
    }
  }

  const nowIso = new Date().toISOString();

  for (let i = 1; i <= qty; i++) {
    const itemId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : generateId();
    const itemLabel = `${finalMedium} ${containerDisplay} #${i}`;
    const historyEntry = [{
      stage: defaultStage,
      timestamp: selectedTimestampStr,
      notes: isPCSubstrate
        ? `${finalMedium} sterilized in PC batch ${pcBatchCode} (${pcTime} mins). Ready for inoculation.`
        : `Sterilized in PC batch ${pcBatchCode} (${pcTime} mins). Ready for use.`,
      env: ''
    }];

    // Local UI item representation
    const newItem = {
      id: itemId,
      user_id: user ? user.id : null,
      organization_id: currentOrganizationId || null,
      name: itemLabel,
      label: itemLabel,
      strain: 'Uninoculated',
      medium: finalMedium,
      medium_type: finalMedium,
      volumeMl: volVal,
      color: colorVal,
      pcBatch: pcBatchCode,
      batch_code: pcBatchCode,
      parentItemId: null,
      stage: defaultStage,
      createdAt: selectedDateStr,
      created_at: nowIso,
      updated_at: nowIso,
      sterilizationDate: selectedDateStr,
      prepDate: prepDate,
      containerType: containerDisplay,
      container_type: containerDisplay,
      containerCapacity: containerCapacity,
      breakAndShake: null,
      totalYield: 0,
      yields: [],
      contamType: null,
      contamVector: null,
      history: historyEntry
    };

    // Construct container item object using ONLY valid Supabase columns
    const supabaseItem = {
      id: itemId,
      user_id: user ? user.id : null,
      name: itemLabel,
      strain: 'Uninoculated',
      medium_type: finalMedium,
      batch_code: pcBatchCode,
      stage: defaultStage,
      container_type: containerDisplay,
      organization_id: currentOrganizationId || null,
      history: historyEntry,
      yields: [],
      created_at: nowIso,
      updated_at: nowIso
    };

    generatedItems.push(newItem);
    supabasePayload.push(supabaseItem);
  }

  // 1. Direct Immediate Upsert to Supabase (keyed to 'id' for idempotent sync)
  if (isSupabaseConfigured() && client && user) {
    const validSession = await ensureValidSession(true);
    if (!validSession) return;

    try {
      const { error: insertError } = await client.from('items').upsert(supabasePayload, { onConflict: 'id' });
      if (insertError) {
        console.error('Immediate Supabase upsert error for Bulk PC Prep:', insertError);
        if (isContainerLimitError(insertError)) {
          showToast(insertError.message || 'Container limit reached. Upgrade to add more containers.', 'error');
          return;
        }
      }
    } catch (err) {
      console.error('Failed immediate upsert to Supabase:', err);
    }
  }

  // 2. Push newly created items into local state and localStorage
  generatedItems.forEach(item => db.items.unshift(item));
  try {
    localStorage.setItem('myco_items_v5', JSON.stringify(db.items));
  } catch (e) {
    console.warn('Failed saving to localStorage:', e);
  }
  saveItems();

  // 3. Immediately trigger renderContainers() / updateDashboard() to refresh active count and render new cards in UI grid
  if (typeof renderContainers === 'function') {
    renderContainers();
  } else {
    render();
  }
  updateDashboard();
  showToast(`✓ Created ${qty} container(s) for PC Batch ${pcBatchCode}!`, 'success');

  // 4. Open Label Settings Modal pre-loaded with newly created items to intercept print flow
  if (generatedItems.length > 0) {
    openPrintSettingsModal(generatedItems);
  }

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
          const settings = activeOrg.settings || { enable_sales: true, enable_racks: false, enable_supplies: true, enable_inoculation: true };
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

// --- Quick-Log Parent Asset Form Submit ---
const qlpForm = document.getElementById('quick-log-parent-form');
let isSubmittingQlp = false;
if (qlpForm) {
  qlpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (isSubmittingQlp) return;
    isSubmittingQlp = true;

    const submitBtn = qlpForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const assetType = document.getElementById('qlp-asset-type').value;
      const label = document.getElementById('qlp-label').value.trim();
      const strain = document.getElementById('qlp-strain').value.trim();
      const dateCreated = document.getElementById('qlp-date-created').value;

      let medium = 'Whole Oats';
      let containerType = 'Grain Jar / Bag';
      let volumeMl = null;

      if (assetType === 'Grain Jar') {
        medium = 'Whole Oats';
        containerType = 'Quart Mason Jar';
      } else if (assetType === 'Grain Bag') {
        medium = 'Whole Oats';
        containerType = '0T Spawn Bag';
      } else if (assetType === 'LC') {
        medium = 'Liquid Culture';
        containerType = 'Liquid Culture Jar';
        volumeMl = 500;
      } else if (assetType === 'Agar Plate') {
        medium = 'Agar';
        containerType = 'Petri Dish';
      }

      const todayStr = dateCreated ? new Date(dateCreated + 'T12:00:00').toLocaleDateString() : new Date().toLocaleDateString();

      const newParentItem = {
        id: generateId(),
        label: label || `${strain} - ${assetType}`,
        name: label || `${strain} - ${assetType}`,
        strain: strain,
        medium: medium,
        medium_type: medium,
        containerType: containerType,
        container_type: containerType,
        volumeMl: volumeMl,
        pcBatch: 'Quick-Log-Parent',
        parentItemId: null,
        parent_id: null,
        stage: 'Colonizing', // Active status
        createdAt: todayStr,
        created_at: dateCreated ? new Date(dateCreated + 'T12:00:00').toISOString() : new Date().toISOString(),
        prepDate: dateCreated || null,
        prep_date: dateCreated || null,
        breakAndShake: null,
        totalYield: 0,
        yields: [],
        contamType: null,
        contamVector: null,
        history: [{
          stage: 'Colonizing',
          timestamp: new Date().toLocaleString(),
          notes: `Quick-Logged Parent Asset (${assetType}) created on ${todayStr}`,
          env: ''
        }]
      };

      db.items.unshift(newParentItem);
      saveItems();

      // If Supabase is configured and logged in, sync item immediately
      if (isSupabaseConfigured()) {
        const result = await uploadItemsToCloud([newParentItem]);
        if (!result.success && result.error) {
          console.warn('Cloud upload notice for quick parent item:', result.error);
        }
      }

      // Close modal smoothly
      closeQuickLogParentModal();

      // Automatically switch the primary Inoculant Type to match the new parent if needed
      const inocTypeSelect = document.getElementById('input-inoculant-type');
      if (inocTypeSelect) {
        if (assetType === 'Grain Jar' || assetType === 'Grain Bag') {
          inocTypeSelect.value = 'Grain-to-Grain';
        } else if (assetType === 'LC') {
          inocTypeSelect.value = 'Liquid Culture';
        } else if (assetType === 'Agar Plate') {
          inocTypeSelect.value = 'Agar';
        }
        toggleInoculantTypeFields();
      }

      // Refresh Inoculant Source dropdown options and auto-select newly created parent item
      populateInoculantSources(newParentItem.id);

      // Re-render dashboard list if visible
      if (typeof render === 'function') {
        render();
      }
      if (typeof updateDashboard === 'function') {
        updateDashboard();
      }

      showToast(`✓ Created parent "${newParentItem.label}" and selected as source!`, 'success');
    } catch (err) {
      console.error('Failed to quick-log parent asset:', err);
      showToast('Error creating parent asset: ' + err.message, 'error');
    } finally {
      setTimeout(() => {
        isSubmittingQlp = false;
        if (submitBtn) submitBtn.disabled = false;
      }, 1000);
    }
  });
}

// --- Quick Add Source Form Submit ---
const qaForm = document.getElementById('quick-add-form');
let isSubmittingQa = false;
if (qaForm) {
  qaForm.addEventListener('submit', (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (isSubmittingQa) return;
    isSubmittingQa = true;

    const submitBtn = qaForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
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
      if (typeof render === 'function') render();
      if (typeof updateDashboard === 'function') updateDashboard();
    } finally {
      setTimeout(() => {
        isSubmittingQa = false;
        if (submitBtn) submitBtn.disabled = false;
      }, 1000);
    }
  });
}

// --- Active Inoculation Submission ---
const itemForm = document.getElementById('item-form');
let isSubmittingItemForm = false;
if (itemForm) {
  itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (isSubmittingItemForm) return;
    isSubmittingItemForm = true;

    const submitBtn = itemForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      let strain = (document.getElementById('input-strain')?.value || '').trim();
      const medium = document.getElementById('input-medium').value;
      const inoculantType = document.getElementById('input-inoculant-type').value;
      let parentId = document.getElementById('input-parent')?.value || null;
      const legacySourceDesc = document.getElementById('input-legacy-source')?.value || null;
      const quantity = parseInt(document.getElementById('input-quantity').value) || 1;
      
      let parentItemObj = null;
      if (parentId && parentId !== 'legacy') {
        parentItemObj = db.items.find(i => i.id === parentId);
      }

      // If strain field is blank or "Uninoculated", inherit from parent/LC source
      if ((!strain || strain.toLowerCase() === 'uninoculated') && parentItemObj && parentItemObj.strain && parentItemObj.strain !== 'Uninoculated') {
        strain = parentItemObj.strain;
      } else if (!strain || strain.toLowerCase() === 'uninoculated') {
        strain = 'Unknown Strain';
      }

      if (parentId === 'legacy') {
        parentId = null;
      }
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
      let modifiedSrcItem = null;
      if (inoculantType === 'Liquid Culture' && parentId && parentId !== 'legacy') {
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
          modifiedSrcItem = srcItem;
        }
      }

      const containerTypeVal = document.getElementById('input-container-type').value || '';
      const containerWeightVal = document.getElementById('input-container-weight').value || '';
      const stageVal = document.getElementById('input-stage').value || (CONTAINER_STAGES[containerTypeVal] || ['Colonizing'])[0];

      const affectedItems = [];

      // 1. Convert Existing PC Batch Items In-Place if available
      if (pcSource === 'existing' && pcBatchCode && pcBatchCode !== 'N/A') {
        const availablePrepContainers = db.items.filter(i => 
          (i.pcBatch === pcBatchCode || i.batch_code === pcBatchCode) &&
          (i.stage === 'Preparation' || i.stage === 'Uninoculated' || String(i.stage).toUpperCase() === 'PREPARATION')
        );

        const convertCount = Math.min(quantity, availablePrepContainers.length);

        for (let i = 0; i < convertCount; i++) {
          const item = availablePrepContainers[i];
          const newLabel = `${medium} - ${strain} (#${i + 1}/${quantity})`;
          item.label = newLabel;
          item.name = newLabel;
          item.strain = strain;
          item.medium = medium;
          item.medium_type = medium;
          if (containerTypeVal) {
            item.containerType = containerTypeVal;
            item.container_type = containerTypeVal;
          }
          if (containerWeightVal) {
            item.containerWeight = containerWeightVal;
          }
          item.parentItemId = parentId;
          item.parent_id = parentId;
          item.inoculantType = inoculantType;
          item.inoculantSourceId = parentId;
          item.inoculationDate = new Date().toLocaleDateString();
          item.legacy_source_description = legacySourceDesc;
          item.stage = stageVal;
          item.history = item.history || [];
          item.history.unshift({
            stage: stageVal,
            timestamp: new Date().toLocaleString(),
            notes: `Inoculated with ${strain} via ${inoculantType}${parentId ? ' from ' + parentId : (legacySourceDesc ? ' from ' + legacySourceDesc : '')}.`,
            env: ''
          });
          item.lifecycleHistory = item.lifecycleHistory || [];
          item.lifecycleHistory.unshift({
            fromStage: 'Preparation',
            toStage: stageVal,
            timestamp: new Date().toLocaleString(),
            type: 'inoculation',
            notes: `Inoculated with ${strain} via ${inoculantType}.`
          });
          affectedItems.push(item);
        }
      }

      // 2. Instantiate new containers only if quantity exceeds available Preparation containers or Manual PC Date
      const remainingQty = quantity - affectedItems.length;
      if (remainingQty > 0) {
        const generatedInCurrentRun = [];
        const startIndex = affectedItems.length + 1;

        for (let i = 1; i <= remainingQty; i++) {
          const itemIdx = startIndex + i - 1;
          let suffixNum = itemIdx;
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

          const newUuid = generateId();
          const newItem = {
            id: newUuid,
            code: candidateId,
            label: `${medium} - ${strain} (#${itemIdx}/${quantity})`,
            name: `${medium} - ${strain} (#${itemIdx}/${quantity})`,
            strain: strain,
            medium: medium,
            medium_type: medium,
            containerType: containerTypeVal,
            container_type: containerTypeVal,
            containerWeight: containerWeightVal,
            pcBatch: pcBatchCode,
            batch_code: pcBatchCode,
            parentItemId: parentId,
            parent_id: parentId,
            inoculantType: inoculantType,
            inoculantSourceId: parentId,
            inoculationDate: new Date().toLocaleDateString(),
            legacy_source_description: legacySourceDesc,
            stage: stageVal,
            createdAt: new Date().toLocaleDateString(),
            created_at: new Date().toISOString(),
            breakAndShake: null,
            totalYield: 0,
            yields: [],
            contamType: null,
            contamVector: null,
            history: [{
              stage: stageVal,
              timestamp: new Date().toLocaleString(),
              notes: `Inoculated with ${strain} via ${inoculantType}${parentId ? ' from ' + parentId : (legacySourceDesc ? ' from ' + legacySourceDesc : '')}.`,
              env: ''
            }],
            lifecycleHistory: [{
              fromStage: 'Preparation',
              toStage: stageVal,
              timestamp: new Date().toLocaleString(),
              type: 'inoculation',
              notes: `Inoculated with ${strain} via ${inoculantType}.`
            }]
          };

          db.items.unshift(newItem);
          affectedItems.push(newItem);
        }
      }

      // Persist state
      saveItems();

      // If Supabase is configured, sync to cloud
      if (isSupabaseConfigured()) {
        const itemsToUpload = modifiedSrcItem ? [modifiedSrcItem, ...affectedItems] : affectedItems;
        uploadItemsToCloud(itemsToUpload).catch(err => {
          console.warn('Background cloud upload error for Log Active Inoculations:', err);
        });
      }

      // Reset form and refresh UI
      document.getElementById('item-form').reset();
      initInoculationsForm();
      render();
      updateDashboard();
      showToast(`✓ Logged ${quantity} inoculation(s) for ${strain}!`, 'success');

      // Open Label Print Modal pre-loaded with affected item IDs
      if (shouldPrint && affectedItems.length > 0) {
        printBulkLabels(affectedItems);
      }
    } catch (err) {
      console.error('Inoculation run error:', err);
      showToast('Error logging inoculation: ' + err.message, 'error');
    } finally {
      setTimeout(() => {
        isSubmittingItemForm = false;
        if (submitBtn) submitBtn.disabled = false;
      }, 1000);
    }
  });
}

// --- Sales Tab Switching ---
function switchSalesTab(tab) {
  const customersTab = document.getElementById('customers-tab');
  const ordersTab = document.getElementById('orders-tab');
  const customersBtn = document.querySelector('#sales-module-container button:nth-child(1)');
  const ordersBtn = document.querySelector('#sales-module-container button:nth-child(2)');
  
  if (tab === 'customers') {
    customersTab.classList.remove('hidden');
    ordersTab.classList.add('hidden');
    customersBtn.classList.add('border-emerald-500', 'text-emerald-400');
    customersBtn.classList.remove('border-transparent', 'text-slate-400');
    ordersBtn.classList.add('border-transparent', 'text-slate-400');
    ordersBtn.classList.remove('border-emerald-500', 'text-emerald-400');
  } else {
    customersTab.classList.add('hidden');
    ordersTab.classList.remove('hidden');
    ordersBtn.classList.add('border-emerald-500', 'text-emerald-400');
    ordersBtn.classList.remove('border-transparent', 'text-slate-400');
    customersBtn.classList.add('border-transparent', 'text-slate-400');
    customersBtn.classList.remove('border-emerald-500', 'text-emerald-400');
  }
}

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

  // Auto-select first organization if none is selected
  if (!currentOrganizationId && userOrganizations.length > 0) {
    setCurrentOrganizationId(userOrganizations[0].id);
  }

  const activeOrg = userOrganizations.find(o => o.id === currentOrganizationId);
  if (!activeOrg) {
    // No organizations exist - redirect to create organization modal
    if (userOrganizations.length === 0) {
      window.location.hash = '#create-org-modal';
      return;
    }
    container.innerHTML = '<div class="text-center text-slate-400 py-8">Loading steps...</div>';
    return;
  }
  
  const settings = activeOrg.settings || { enable_sales: true, enable_racks: false, enable_supplies: true, enable_inoculation: true };
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
  
  const settings = activeOrg.settings || { enable_sales: true, enable_racks: false, enable_supplies: true, enable_inoculation: true };
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
    const settings = activeOrg.settings || { enable_sales: true, enable_racks: false, enable_supplies: true, enable_inoculation: true };
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
      const settings = activeOrg.settings || { enable_sales: true, enable_racks: false, enable_supplies: true, enable_inoculation: true };
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
      const settings = activeOrg.settings || { enable_sales: true, enable_racks: false, enable_supplies: true, enable_inoculation: true };
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
  
  const isOnboardingRoute = (hash === '#onboarding/setup' || hash === '#/onboarding/setup' || path === '/onboarding/setup' || path === '/onboarding');
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
  
  if (hash && (hash.startsWith('#container=') || hash.startsWith('#item='))) {
    const id = hash.startsWith('#container=') ? hash.split('#container=')[1] : hash.split('#item=')[1];
    if (id) {
      const found = db.items.find(i => i.id === id || i.code === id || i.custom_id === id);
      if (found) {
        currentFilter = 'All';
        scannedItemId = null;
        render();
        openModal(found.id);
        setTimeout(() => {
          const card = document.getElementById(`card-${found.id}`);
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

// Handle Square OAuth Callback route (/square-callback or ?code=...)
async function handleSquareOAuthCallback() {
  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash;

  const isSquareCallback = pathname === '/square-callback' || 
                           pathname.endsWith('/square-callback') || 
                           hash.startsWith('#square-callback') ||
                           (searchParams.has('code') && (searchParams.has('response_type') || sessionStorage.getItem('square_oauth_org_id')));

  if (!isSquareCallback) return;

  const code = searchParams.get('code');
  const error = searchParams.get('error') || searchParams.get('error_description');

  if (error) {
    showToast(`Square Authorization Error: ${error}`, 'error', 8000);
    window.history.replaceState({}, document.title, window.location.pathname.replace('/square-callback', '') || '/');
    return;
  }

  if (code) {
    showToast('Exchanging Square authorization code...', 'info', 5000);
    try {
      const { exchangeSquareAuthCode } = await import('./db.js');
      const orgId = sessionStorage.getItem('square_oauth_org_id') || undefined;
      sessionStorage.removeItem('square_oauth_org_id');

      const result = await exchangeSquareAuthCode(code, orgId);
      showToast(`✓ Square account connected successfully! (Merchant: ${result.merchant_id || 'Connected'})`, 'success', 6000);

      // Clean URL query parameters
      const cleanUrl = window.location.origin + (window.location.pathname.replace('/square-callback', '') || '/');
      window.history.replaceState({}, document.title, cleanUrl);

      // Refresh Organization Settings modal if open or user is viewing payments
      if (typeof window.renderSquareStatus === 'function') {
        window.renderSquareStatus();
      }
    } catch (err) {
      console.error('Square OAuth callback processing failed:', err);
      showToast(`Square connection failed: ${err.message}`, 'error', 8000);
    }
  }
}

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

window.addEventListener('hashchange', () => {
  handleURLHash();
  handleSquareOAuthCallback();
});

window.addEventListener('DOMContentLoaded', () => {
  handleURLHash();
  handleContainerPath();
  handleSquareOAuthCallback();
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
  // Add Supply Modal
  openAddSupplyModal,
  closeAddSupplyModal,


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
  openItemModal,
  openItemDetailModal,
  showItemDetails,
  showContainerDetails,
  openBatchModal,
  closeBatchModal,
  openViewQRCodeModal,
  closeViewQRCodeModal,
  copyQRCodeLink,
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
  openSpawnBulkModal,
  closeSpawnBulkModal,
  switchSpawnBulkTab,
  populateSpawnBulkSubstrateSelect,
  handleSpawnBulkScanInput,
  onSpawnBulkSubstrateSelect,
  selectSpawnBulkSubstrate,
  executeSpawnToFruitingBlock,
  startSpawnBulkCameraScan,
  stopSpawnBulkCameraScan,
  openQuickLogParentModal,
  closeQuickLogParentModal,
  openQuickAddModal,
  closeQuickAddModal,
  openRecipeCalcModal,
  closeRecipeCalcModal,
  calculateCVG,
  switchRecipeMode,
  handleRecipePresetChange,
  handleRecipeContainerChange,
  handleMoistureSliderChange,
  recalculateRecipeEngine,
  handleSaveCurrentRecipeModal,
  handleDeleteActiveCustomRecipe,
  pushRecipeToBulkPrep,
  openPrintSettingsModal,
  openPrintModal,
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
  loadOrgSettings,
  populateOrgSettings,
  saveOrgSettings,
  removeOrgLogo,
  updateOrgLogoPreviewUI,
  addScannedItemToSale,
  // camera.js
  startScanner,
  stopScanner,
  startG2GCameraScan,
  stopG2GCameraScan,
  applyFeatureToggles,
  openLogHarvestModal,
  closeLogHarvestModal,
  handleHarvestContainerSelectChange,
  handleHarvestContainerInputChange,
  calculateHarvestGramsPreview,
  handleLogHarvestSubmit,
  startHarvestCameraScan,
  stopHarvestCameraScan
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

// --- Wire up the auth form submit handler ---
// Prevents the browser's native form submission (which reloaded the homepage
// before any Supabase auth request could fire) and routes the submit through
// the modals.js handleAuthSubmit, which awaits signInWithPassword, verifies a
// session exists, displays errors in the modal, and only then proceeds.
// Use event delegation since the form might be dynamically rendered or replaced.
document.addEventListener('submit', (e) => {
  if (e.target && e.target.id === 'auth-form') {
    e.preventDefault();
    e.stopPropagation();
    handleAuthSubmit();
  }
});

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
  
  // Add listener to handle post-login routing
  onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || (session && (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED'))) {
      // Session is active: hide landing containers, show the dashboard,
      // then load the tenant context.
      showAppDashboard();
      handleMultiTenantInit();
      updateAuthModalUI();
    }
  });
  
  // Ensure auth modal UI is updated on initial load if session exists
  if (session) {
    updateAuthModalUI();
  }
}

// Keep routing in sync with auth events (OAuth redirect returns, logouts…).
// Also refresh the plan/container badge immediately after sign-in or profile
// updates so database-side plan changes (profiles / app_metadata) appear
// without waiting for the next data save.
onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' || (session && (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED'))) {
    // A session is active: add `hidden` to the landing page container
    // (hero, features, pricing) and remove `hidden` from #app-dashboard.
    showAppDashboard();
    updateContainerUsageUI();
    handleMultiTenantInit();
  } else if (event === 'USER_UPDATED') {
    updateContainerUsageUI();
  } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED' || (!session && event !== 'INITIAL_SESSION')) {
    console.warn('Auth state changed to unauthenticated (event: ' + event + '). Clearing state and resetting UI.');
    localStorage.removeItem('mycotrack_containers');
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
  
  // Show dashboard now that we have a valid session
  showAppDashboard();

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

          // Auto-select first organization if none is selected
          if (!currentOrganizationId && userOrganizations.length > 0) {
            setCurrentOrganizationId(userOrganizations[0].id);
          }
          
          // Re-fetch and render customers now that organization context is loaded
          if (typeof window.renderCustomers === 'function') {
            window.renderCustomers();
          }

        // Show/hide Setup Wizard button in header depending on active organization context
        const setupBtn = document.getElementById('setup-wizard-header-btn');
        if (setupBtn) {
          setupBtn.classList.toggle('hidden', !currentOrganizationId);
        }

        // Apply features toggles upon login / multi-tenant initialization
        const activeOrg = userOrganizations.find(o => o.id === currentOrganizationId);
        applyFeatureToggles(activeOrg ? activeOrg.settings : null);
        
        // Populate General tab inputs if openOrgSettings is called later
        if (typeof window.populateOrgSettings === 'function') {
            window.populateOrgSettings();
        }

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

  // Global Org Logo Upload in Org Settings Modal
  const orgLogoFileInput = document.getElementById('org-logo-upload');
  if (orgLogoFileInput) {
    orgLogoFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const base64Data = uploadEvent.target.result;
        try {
          localStorage.setItem('orgLogoData', base64Data);
          if (typeof window.updateOrgLogoPreviewUI === 'function') {
            window.updateOrgLogoPreviewUI();
          }
          showToast('Company logo updated successfully!', 'success');
        } catch (err) {
          console.error('Failed to store company logo in localStorage:', err);
          showToast('Failed to save company logo: image may be too large.', 'error');
        }
      };
      reader.readAsDataURL(file);
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

// --- Initialize add supply form listener ---
const addSupplyForm = document.getElementById('add-supply-form');
if (addSupplyForm) {
  addSupplyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = addSupplyForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = 'Saving...';
    submitBtn.disabled = true;
    
    try {
      const supplyData = {
        name: document.getElementById('add-supply-name').value,
        category: document.getElementById('add-supply-category').value,
        isDryIngredient: document.getElementById('add-supply-dry').checked,
        isNonDepleting: document.getElementById('add-supply-non-depleting').checked,
        quantityOnHand: document.getElementById('add-supply-quantity').value,
        unitOfMeasure: document.getElementById('add-supply-unit').value,
        packageSize: document.getElementById('add-supply-package-size').value,
        packageCost: document.getElementById('add-supply-package-cost').value,
        reorderThreshold: document.getElementById('add-supply-reorder-threshold').value,
        reorderUrl: document.getElementById('add-supply-reorder-url').value,
        supplier: document.getElementById('add-supply-supplier').value,
        productCode: document.getElementById('add-supply-product-code').value,
        notes: document.getElementById('add-supply-notes').value
      };
      
      const { createSupply } = await import('./db.js');
      await createSupply(supplyData);
      
      showToast('Supply item added successfully!', 'success');
      closeAddSupplyModal();
      addSupplyForm.reset();
      
      // Refresh inventory list if visible
      if (typeof renderInventoryList === 'function') {
        renderInventoryList();
      }
      
      // If we're in the onboarding wizard, refresh it
      if (window.location.hash === '#onboarding/setup') {
        renderOnboardingChecklist();
      }
    } catch (err) {
      console.error('Error adding supply:', err);
      showToast(err.message || 'Failed to add supply item.', 'error');
    } finally {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  });
}

// --- Initialize application ---
updateDashboard();
initInoculationsForm();
initPrepDateInput();
if (typeof renderInventoryList === 'function') {
  renderInventoryList();
}

// When bulk-prep-date changes, update batch code and validate date
const prepDateInput = document.getElementById('bulk-prep-date');

if (prepDateInput) {
  prepDateInput.addEventListener('change', () => {
    // Prevent future dates
    const now = new Date();
    const maxStr = getNowDateTimeLocalString(now);
    prepDateInput.max = maxStr;
    if (prepDateInput.value && new Date(prepDateInput.value).getTime() > now.getTime() + 60000) {
      showToast('Prep / Run Date cannot be in the future. Resetting to current date/time.', 'warning');
      prepDateInput.value = maxStr;
    }
    updateBatchCodeAuto();
  });
}

// Populate smart dropdowns with categorized mediums/containers
populateMediumDropdown('bulk-medium', 'Whole Oats');
populateContainerDropdownSmart('bulk-container', 'Whole Oats', 'Quart Wide Mouth');
updateBatchCodeAuto();
updatePairValidationWarning();
initContainerGridListener();
render();
updateContainerUsageUI();

// Load custom presets from Supabase user metadata (non-blocking)
loadCustomPresetsFromCloud();
