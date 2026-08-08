// Shared utility functions: classification, ID/code generation, formatting,
// and dry-yield estimation.

import { db } from './db.js';
import { APP_CONFIG } from './config.js';

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

// Toggle G2G button, Break & Shake, Flush Yield Tracking section, and legacy
// Yield Log visibility based on the item's medium type and current stage.
export function updateModalActionVisibility(mediumType, stage, item) {
  const g2gBtn = document.getElementById('btn-g2g-transfer');
  const breakShakeBtn = document.getElementById('btn-break-shake');
  const yieldBlock = document.getElementById('yield-log-block');
  const flushSection = document.getElementById('flush-yield-section');

  const showFlush = isFlushTrackingItem(item);
  if (flushSection) flushSection.classList.toggle('hidden', !showFlush);

  if (mediumType === 'substrate') {
    if (g2gBtn) g2gBtn.classList.add('hidden');
    if (breakShakeBtn) breakShakeBtn.classList.add('hidden');
    if (yieldBlock) yieldBlock.classList.add('hidden');
  } else if (mediumType === 'grain') {
    if (g2gBtn) g2gBtn.classList.remove('hidden');
    if (breakShakeBtn) breakShakeBtn.classList.remove('hidden');
    if (yieldBlock) yieldBlock.classList.add('hidden');
  } else {
    if (flushSection) flushSection.classList.add('hidden');
    if (breakShakeBtn) breakShakeBtn.classList.add('hidden');
    if (yieldBlock) yieldBlock.classList.add('hidden');
    if (g2gBtn) g2gBtn.classList.remove('hidden');
  }
}

// Generate a random human-friendly container ID.
export function generateId() {
  return 'MY-' + Math.random().toString(36).substr(2, 5).toUpperCase();
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
export function generateBatchCode() {
  const medium = (document.getElementById('bulk-medium') || {}).value || '';
  const prefix = getBatchPrefix(medium);
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
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

  if (select.value === 'custom') {
    const cap = parseInt(document.getElementById('custom-container-capacity').value) || 300;
    targetInput.value = Math.round(cap * 0.7);
  } else {
    const volumes = {
      'Quart Jar': 500,
      'Pint Jar': 250,
      '3lb Bag': 1000,
      '5lb Bag': 1500,
      'Petri Dish': 20,
      '500mL Bottle': 350,
      '1000mL Bottle': 700
    };
    targetInput.value = volumes[select.value] || 500;
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

  if (medium === 'Liquid Culture') {
    calcBox.classList.remove('hidden');
    updateLCTargetVolumeDefault();
  } else {
    calcBox.classList.add('hidden');
  }

  if (medium === 'Media Bottle (Agar/LC)') {
    mediaBottleBox.classList.remove('hidden');
    const container = document.getElementById('bulk-container').value;
    const volumeMlInput = document.getElementById('bulk-volume-ml');
    if (!volumeMlInput.value) {
      if (container === '500mL Bottle') volumeMlInput.value = 500;
      else if (container === '1000mL Bottle') volumeMlInput.value = 1000;
      else volumeMlInput.value = 500;
    }
  } else {
    mediaBottleBox.classList.add('hidden');
  }
}

export function toggleCustomContainer() {
  const select = document.getElementById('bulk-container');
  const customDiv = document.getElementById('custom-container-fields');
  const isCustom = select.value === 'custom';

  if (isCustom) customDiv.classList.remove('hidden');
  else customDiv.classList.add('hidden');

  updateLCTargetVolumeDefault();

  const medium = document.getElementById('bulk-medium').value;
  if (medium === 'Media Bottle (Agar/LC)') {
    const volumeMlInput = document.getElementById('bulk-volume-ml');
    if (select.value === '500mL Bottle') volumeMlInput.value = 500;
    else if (select.value === '1000mL Bottle') volumeMlInput.value = 1000;
  }
}