// Shared utility functions: classification, ID/code generation, formatting,
// and dry-yield estimation.

import { db, getCustomContainerPresets, getCustomMediumPresets } from './db.js';
import { APP_CONFIG, MEDIUM_CATEGORIES, CONTAINER_CATEGORIES, getMediumCategory, getContainerCategory, getContainerCapacityMl, isUnconventionalPair } from './config.js';

// Determine item category (Bulk Substrate vs Grain Spawn) by inspecting item.type/category
// or inferring from medium, containerType, and label.
export function getItemCategory(item) {
  if (!item) return '';
  if (item.category === 'Bulk Substrate' || item.category === 'Grain Spawn') return item.category;
  if (item.type === 'Bulk Substrate' || item.type === 'Grain Spawn') return item.type;

  const medium = (item.medium || '').toLowerCase();
  const containerType = (item.containerType || '').toLowerCase();
  const label = (item.label || '').toLowerCase();

  // Bulk Substrate detection
  if (medium.includes('substrate') || medium.includes('cvg') || medium.includes('bulk') ||
      medium.includes('coir') || medium.includes('sawdust') || medium.includes('straw') ||
      medium.includes('manure') || medium.includes('masters mix')) {
    return 'Bulk Substrate';
  }
  if (containerType.includes('fruiting block') || containerType.includes('monotub')) {
    return 'Bulk Substrate';
  }
  if (label.includes('fruiting block') || label.includes('monotub') || label.includes('bulk')) {
    return 'Bulk Substrate';
  }

  // Grain Spawn detection
  if (medium.includes('oats') || medium.includes('rye') || medium.includes('millet') ||
      medium.includes('popcorn') || medium.includes('grain')) {
    return 'Grain Spawn';
  }
  if (containerType.includes('grain jar') || containerType.includes('grain bag') ||
      containerType.includes('spawn bag') || containerType === 'grain jar / bag') {
    return 'Grain Spawn';
  }
  if (label.includes('grain') || label.includes('spawn')) {
    return 'Grain Spawn';
  }

  return '';
}

// A container is "inactive" (locked out of transfers/inoculation) when it is Contaminated or Spent
export function isLockedStage(stage) {
  return stage === 'Contaminated' || stage === 'Spent';
}

// Determine the medium type for an item: 'substrate', 'grain', or 'agar-lc'
export function getMediumType(item) {
  if (!item) return 'agar-lc';
  if (item.mediumType === 'substrate' || item.mediumType === 'grain' || item.mediumType === 'agar-lc') {
    return item.mediumType;
  }
  const cat = getItemCategory(item);
  if (cat === 'Bulk Substrate') return 'substrate';
  if (cat === 'Grain Spawn') return 'grain';
  const ct = (item.containerType || '').toLowerCase();
  const medium = (item.medium || '').toLowerCase();
  if (ct.includes('grain') || ct.includes('bag') || ct.includes('jar')) return 'grain';
  if (medium.includes('agar') || medium.includes('liquid culture') || medium.includes('media bottle')) return 'agar-lc';
  return 'agar-lc';
}

// Determine whether an item should show the Flush Yield Tracking section.
export function isFlushTrackingItem(item) {
  if (!item) return false;
  const haystack = [
    item.mediumType || '',
    item.type || '',
    item.category || '',
    item.medium || '',
    item.containerType || '',
    getItemCategory(item) || ''
  ].join(' ').toLowerCase();
  return haystack.includes('substrate') || haystack.includes('fruiting');
}

// Toggle G2G button, Spawn to Bulk button, Break & Shake, Flush Yield Tracking section, and legacy
// Yield Log visibility based on the item's medium type and current stage.
export function updateModalActionVisibility(mediumType, stage, item) {
  const g2gBtn = document.getElementById('btn-g2g-transfer');
  const spawnBulkBtn = document.getElementById('btn-spawn-bulk');
  const breakShakeBtn = document.getElementById('btn-break-shake');
  const yieldBlock = document.getElementById('yield-log-block');
  const flushSection = document.getElementById('flush-yield-section');

  const showFlush = isFlushTrackingItem(item);
  if (flushSection) flushSection.classList.toggle('hidden', !showFlush);

  if (mediumType === 'substrate') {
    if (g2gBtn) g2gBtn.classList.add('hidden');
    if (spawnBulkBtn) spawnBulkBtn.classList.add('hidden');
    if (breakShakeBtn) breakShakeBtn.classList.add('hidden');
    if (yieldBlock) yieldBlock.classList.add('hidden');
  } else if (mediumType === 'grain') {
    if (g2gBtn) g2gBtn.classList.remove('hidden');
    if (spawnBulkBtn) spawnBulkBtn.classList.remove('hidden');
    if (breakShakeBtn) breakShakeBtn.classList.remove('hidden');
    if (yieldBlock) yieldBlock.classList.add('hidden');
  } else {
    if (flushSection) flushSection.classList.add('hidden');
    if (spawnBulkBtn) spawnBulkBtn.classList.add('hidden');
    if (breakShakeBtn) breakShakeBtn.classList.add('hidden');
    if (yieldBlock) yieldBlock.classList.add('hidden');
    if (g2gBtn) g2gBtn.classList.remove('hidden');
  }
}

// Generate a valid v4 UUID client-side for container primary keys.
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Format a Date as MMDDYY (e.g. 080726).
export function formatMMDDYY(dateObj) {
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const yy = String(dateObj.getFullYear()).substring(2);
  return `${mm}${dd}${yy}`;
}

// Medium initials used in auto-generated item IDs.
export function getMediumInitials(medium) {
  if (!medium) return 'MT';
  const m = medium.toLowerCase();
  if (m.includes('whole oats') || m.includes('rye grain') || m.includes('millet') || m.includes('popcorn')) return 'GS';
  if (m.includes('agar')) return 'AG';
  if (m.includes('liquid culture')) return 'LC';
  if (m.includes('cvg bulk') || m.includes('bulk substrate')) return 'BS';
  return 'MT';
}

// Strain initials used in auto-generated item IDs.
export function getStrainInitials(strain) {
  if (!strain) return 'XX';
  const clean = strain.replace(/[^a-zA-Z0-9\s-]/g, '');
  const parts = clean.trim().split(/[\s-]+/);
  if (parts.length > 1) {
    return parts.map(p => p[0]).join('').toUpperCase();
  }
  return strain.trim().substring(0, 2).toUpperCase();
}

// Standard container capacity in mL.
export function getStandardCapacity(name) {
  // First check the categorized container definitions
  const categorizedCapacity = getContainerCapacityMl(name);
  if (categorizedCapacity) return categorizedCapacity;

  // Legacy fallback capacities
  const capacities = {
    'Quart Jar': 950,
    'Pint Jar': 473,
    '3lb Bag': 1360,
    '5lb Bag': 2268,
    'Petri Dish': 25,
    '500mL Bottle': 500,
    '1000mL Bottle': 1000
  };
  return capacities[name] || 500;
}

// --- Smart Dropdown Population (Medium & Container) ---

// Populate the Bulk PC Prep medium dropdown with categorized optgroups.
export function populateMediumDropdown(selectId = 'bulk-medium', selectedValue = null) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const customMediums = getCustomMediumPresets();

  let html = '<option value="" disabled>Select Medium...</option>';

  // Standard categorized mediums
  for (const [catKey, cat] of Object.entries(MEDIUM_CATEGORIES)) {
    html += `<optgroup label="${cat.icon} ${cat.label}">`;
    cat.items.forEach(item => {
      const selected = selectedValue === item.value ? ' selected' : '';
      html += `<option value="${item.value}"${selected}>${item.name}</option>`;
    });
    html += '</optgroup>';
  }

  // Custom mediums
  if (customMediums.length > 0) {
    html += '<optgroup label="⭐ Custom Mediums">';
    customMediums.forEach(m => {
      const selected = selectedValue === m.name ? ' selected' : '';
      html += `<option value="${m.name}"${selected}>${m.name}</option>`;
    });
    html += '</optgroup>';
  }

  // Add Custom option
  html += '<option value="__add_custom_medium__">+ Add Custom Medium</option>';

  select.innerHTML = html;
  if (selectedValue) select.value = selectedValue;
}

// Populate the Bulk PC Prep container dropdown with smart filtering.
// When a medium is selected, recommended containers are grouped at the top.
export function populateContainerDropdownSmart(selectId = 'bulk-container', selectedMedium = null, selectedValue = null) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const customContainers = getCustomContainerPresets();
  const mediumCat = getMediumCategory(selectedMedium);

  // Determine which containers are "recommended" for the selected medium
  const isRecommended = (containerValue) => {
    if (!mediumCat) return false;
    const catKey = getContainerCategory(containerValue);
    if (!catKey) return false;
    return CONTAINER_CATEGORIES[catKey].primaryMediums.includes(mediumCat);
  };

  // Build the full list of standard containers
  const allStandard = [];
  for (const [catKey, cat] of Object.entries(CONTAINER_CATEGORIES)) {
    cat.items.forEach(item => {
      allStandard.push({ ...item, category: catKey, categoryLabel: cat.label, categoryIcon: cat.icon });
    });
  }

  // Split into recommended vs other
  const recommended = allStandard.filter(c => isRecommended(c.value));
  const others = allStandard.filter(c => !isRecommended(c.value));

  let html = '<option value="" disabled>Select Container...</option>';

  // Recommended containers at top
  if (recommended.length > 0) {
    html += '<optgroup label="⭐ Recommended">';
    recommended.forEach(c => {
      const selected = selectedValue === c.value ? ' selected' : '';
      html += `<option value="${c.value}"${selected}>${c.categoryIcon} ${c.name} (${c.capacityMl} mL)</option>`;
    });
    html += '</optgroup>';
  }

  // Other / All containers in secondary section
  if (others.length > 0) {
    html += '<optgroup label="📦 Other Containers">';
    others.forEach(c => {
      const selected = selectedValue === c.value ? ' selected' : '';
      html += `<option value="${c.value}"${selected}>${c.categoryIcon} ${c.name} (${c.capacityMl} mL)</option>`;
    });
    html += '</optgroup>';
  }

  // Custom containers
  if (customContainers.length > 0) {
    html += '<optgroup label="⭐ Custom Containers">';
    customContainers.forEach(c => {
      const selected = selectedValue === c.name ? ' selected' : '';
      const capText = c.capacityValue ? ` (${c.capacityValue} ${c.capacityUnit})` : '';
      html += `<option value="${c.name}"${selected}>${c.name}${capText}</option>`;
    });
    html += '</optgroup>';
  }

  // Add Custom option
  html += '<option value="__add_custom_container__">+ Add Custom Container</option>';

  select.innerHTML = html;
  if (selectedValue) select.value = selectedValue;
}

// --- Non-Blocking Pair Validation ---
// Returns the warning message if the medium/container pair is unconventional,
// or null if the pair is fine.
export function getPairValidationWarning(mediumValue, containerValue) {
  if (!mediumValue || !containerValue) return null;
  if (isUnconventionalPair(mediumValue, containerValue)) {
    return '💡 Note: Narrow-neck media bottles/flasks are intended for liquids. Retrieving grain spawn from narrow openings can be difficult.';
  }
  return null;
}

// Update the pair validation warning badge in the UI
export function updatePairValidationWarning() {
  const medium = (document.getElementById('bulk-medium') || {}).value || '';
  const container = (document.getElementById('bulk-container') || {}).value || '';
  const warningEl = document.getElementById('pair-validation-warning');

  if (!warningEl) return;

  const warning = getPairValidationWarning(medium, container);
  if (warning) {
    warningEl.innerHTML = `<span class="text-amber-300 text-xs">${warning}</span>`;
    warningEl.classList.remove('hidden');
  } else {
    warningEl.classList.add('hidden');
    warningEl.innerHTML = '';
  }
}

// --- Prep Date Helpers ---
// Format a YYYY-MM-DD date string as "Aug 8, 2026"
export function formatPrepDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Get current date & time as YYYY-MM-DDTHH:MM (for datetime-local input)
export function getNowDateTimeLocalString(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Get today's date as YYYY-MM-DD
export function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const localDateStr = `${year}-${month}-${day}`;
  return localDateStr;
}

// Initialize the prep date input with current date/time and set max attribute to prevent future dates
export function initPrepDateInput() {
  const input = document.getElementById('bulk-prep-date');
  if (input) {
    const nowStr = getNowDateTimeLocalString();
    if (!input.value) {
      input.value = nowStr;
    }
    input.max = nowStr;
  }
}

// Resolve a standard prefix based on the selected medium name.
export function getBatchPrefix(mediumName) {
  if (!mediumName) return 'PC';
  const m = mediumName.toLowerCase();
  if (m.includes('agar')) return 'AGR';
  if (m.includes('liquid culture') || m.includes('lc')) return 'LC';
  if (m.includes('grain') || m.includes('oats') || m.includes('rye') || m.includes('popcorn')) return 'GRN';
  if (m.includes('substrate') || m.includes('cvg') || m.includes('sawdust') || m.includes('manure')) return 'SUB';
  return 'PC';
}

// Auto-incrementing batch code derived from the selected medium + date.
// Accepts optional customMedium and customDate parameters, otherwise extracts from UI.
export function generateBatchCode(customMedium, customDate) {
  const medium = customMedium || (document.getElementById('bulk-medium') || {}).value || '';
  const prefix = getBatchPrefix(medium);
  
  let yyyy, mm, dd;
  const rawDateVal = customDate || (document.getElementById('bulk-prep-date') || {}).value;

  if (rawDateVal) {
    // If rawDateVal is ISO string, datetime-local (YYYY-MM-DDTHH:MM), or date string (YYYY-MM-DD)
    const dateOnly = rawDateVal.split('T')[0];
    const parts = dateOnly.split('-');
    if (parts.length >= 3) {
      yyyy = parts[0];
      mm = parts[1].padStart(2, '0');
      dd = parts[2].padStart(2, '0');
    }
  }

  if (!yyyy || !mm || !dd) {
    const now = new Date();
    yyyy = String(now.getFullYear());
    mm = String(now.getMonth() + 1).padStart(2, '0');
    dd = String(now.getDate()).padStart(2, '0');
  }

  const dateStr = `${yyyy}${mm}${dd}`;

  const base = `${prefix}${dateStr}`;
  let maxSeq = 0;
  db.pcBatches.forEach(b => {
    if (b.batchId && b.batchId.startsWith(base + '-')) {
      const seq = parseInt(b.batchId.substring(base.length + 1), 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  });

  return `${base}-${String(maxSeq + 1).padStart(3, '0')}`;
}

// Populate the batch code input with an auto-generated value.
export function updateBatchCodeAuto() {
  const batchInput = document.getElementById('bulk-batch');
  if (!batchInput) return;
  batchInput.value = generateBatchCode();
}

// Estimate dry weight from a wet harvest (default ~10%).
export function estimateDryYield(wet, ratio = APP_CONFIG.DRY_YIELD_RATIO) {
  return Math.round(wet * ratio * 10) / 10;
}

// --- CVG Substrate Field Capacity Calculator ---
// Given a target batch size in quarts, returns the dry materials and water
// required to reach proper field capacity.
export function calculateCVGRecipe(targetQuarts) {
  const q = parseFloat(targetQuarts) || 0;
  return {
    coirGrams: Math.round(q * 50),
    vermiculiteQuarts: parseFloat((q * 0.25).toFixed(2)),
    gypsumGrams: Math.round(q * 10),
    waterLiters: parseFloat((q * 0.325).toFixed(2))
  };
}

// --- Biological Efficiency (BE%) helpers ---
// Estimate dry substrate weight (grams) from an item's containerWeight or an
// explicit drySubstrateWeight field.
export function getDrySubstrateWeightGrams(item) {
  if (!item) return 0;
  if (item.drySubstrateWeight && item.drySubstrateWeight > 0) return item.drySubstrateWeight;
  const w = (item.containerWeight || '').trim().toLowerCase();
  const lb = w.match(/([\d.]+)\s*lb/);
  if (lb) return parseFloat(lb[1]) * 453.592;
  const kg = w.match(/([\d.]+)\s*kg/);
  if (kg) return parseFloat(kg[1]) * 1000;
  const g = w.match(/([\d.]+)\s*g/);
  if (g) return parseFloat(g[1]);
  return 0;
}

// Biological Efficiency: (wet yield / dry substrate weight) * 100
export function calculateBE(totalWetGrams, drySubstrateGrams) {
  if (!drySubstrateGrams) return 0;
  return Math.round((totalWetGrams / drySubstrateGrams) * 100);
}

// --- Liquid Culture calculator ---
export function updateLCTargetVolumeDefault() {
  const select = document.getElementById('bulk-container');
  const targetInput = document.getElementById('lc-target-volume');
  if (!select || !targetInput) return;

  const selectedValue = select.value;
  if (!selectedValue || selectedValue === '__add_custom_container__') {
    targetInput.value = 500;
  } else {
    // Use the categorized capacity when available
    const capacity = getContainerCapacityMl(selectedValue);
    if (capacity) {
      targetInput.value = Math.round(capacity * 0.7);
    } else {
      // Fallback for custom containers
      const customPresets = getCustomContainerPresets();
      const custom = customPresets.find(c => c.name === selectedValue);
      if (custom && custom.capacityValue) {
        // Convert to mL if needed
        let capMl = custom.capacityValue;
        if (custom.capacityUnit === 'qt') capMl = custom.capacityValue * 946.353;
        else if (custom.capacityUnit === 'lb') capMl = custom.capacityValue * 453.592;
        else if (custom.capacityUnit === 'oz') capMl = custom.capacityValue * 29.5735;
        targetInput.value = Math.round(capMl * 0.7);
      } else {
        targetInput.value = 500;
      }
    }
  }
  updateLCCalculator();
}

export function updateLCCalculator() {
  const qty = parseInt((document.getElementById('bulk-qty') || {}).value) || 1;
  const volPerContainer = parseFloat((document.getElementById('lc-target-volume') || {}).value) || 0;
  const totalVol = qty * volPerContainer;

  const totalVolEl = document.getElementById('lc-total-batch-volume');
  if (totalVolEl) totalVolEl.innerText = totalVol + ' mL';

  const water = volPerContainer;
  const lme = (volPerContainer * 0.2) / 100;
  const sugar = (volPerContainer * 2.0) / 100;
  const peptone = (volPerContainer * 0.1) / 100;

  const waterEl = document.getElementById('lc-calc-water');
  const lmeEl = document.getElementById('lc-calc-lme');
  const sugarEl = document.getElementById('lc-calc-sugar');
  const peptoneEl = document.getElementById('lc-calc-peptone');
  if (waterEl) waterEl.innerText = `${water} mL (Total: ${water * qty} mL)`;
  if (lmeEl) lmeEl.innerText = `${lme.toFixed(2)} g (Total: ${(lme * qty).toFixed(2)} g)`;
  if (sugarEl) sugarEl.innerText = `${sugar.toFixed(2)} g (Total: ${(sugar * qty).toFixed(2)} g)`;
  if (peptoneEl) peptoneEl.innerText = `${peptone.toFixed(2)} g (Total: ${(peptone * qty).toFixed(2)} g)`;
}

export function toggleLCMedium() {
  const medium = document.getElementById('bulk-medium').value;
  const calcBox = document.getElementById('lc-calculator-box');
  const mediaBottleBox = document.getElementById('media-bottle-fields');

  // Show LC calculator for liquid mediums
  const isLiquid = medium === 'Liquid Culture' || medium === 'Malt Extract Broth' || medium === 'Water';
  if (isLiquid) {
    calcBox.classList.remove('hidden');
    updateLCTargetVolumeDefault();
  } else {
    calcBox.classList.add('hidden');
  }

  // Show media bottle fields for liquid/agar mediums
  const isLiquidOrAgar = isLiquid || medium === 'Malt Extract Agar' || medium === 'Potato Dextrose Agar';
  if (isLiquidOrAgar) {
    mediaBottleBox.classList.remove('hidden');
    const container = document.getElementById('bulk-container').value;
    const volumeMlInput = document.getElementById('bulk-volume-ml');
    if (!volumeMlInput.value) {
      const capacity = getContainerCapacityMl(container);
      volumeMlInput.value = capacity || 500;
    }
  } else {
    mediaBottleBox.classList.add('hidden');
  }
}

export function toggleCustomContainer() {
  const select = document.getElementById('bulk-container');
  const customDiv = document.getElementById('custom-container-fields');
  const isCustom = select.value === '__add_custom_container__';

  if (isCustom) customDiv.classList.remove('hidden');
  else customDiv.classList.add('hidden');

  updateLCTargetVolumeDefault();

  const medium = document.getElementById('bulk-medium').value;
  const isLiquidOrAgar = medium === 'Liquid Culture' || medium === 'Malt Extract Broth' || medium === 'Water' ||
    medium === 'Malt Extract Agar' || medium === 'Potato Dextrose Agar';
  if (isLiquidOrAgar) {
    const volumeMlInput = document.getElementById('bulk-volume-ml');
    if (!volumeMlInput.value) {
      const capacity = getContainerCapacityMl(select.value);
      volumeMlInput.value = capacity || 500;
    }
  }
}
