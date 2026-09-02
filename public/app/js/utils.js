// Shared utility functions: classification, ID/code generation, formatting,
// and dry-yield estimation.

import { db, getCustomContainerPresets, getCustomMediumPresets, userOrganizations, currentOrganizationId } from './db.js';
import { APP_CONFIG, MEDIUM_CATEGORIES, CONTAINER_CATEGORIES, DEFAULT_CONTAINER_WEIGHTS, getMediumCategory, getContainerCategory, getContainerCapacityMl, isUnconventionalPair, harvestDaysForStrain } from './config.js';

// Escape a value for safe interpolation into innerHTML. Use this for ANY
// user-controlled text (strain names, labels, notes, customer/company names,
// supply names, feedback) rendered via template-literal innerHTML — otherwise
// a value like `<img src=x onerror=...>` becomes stored XSS across an org.
export function escapeHtml(unsafe) {
  return (unsafe === null || unsafe === undefined ? '' : String(unsafe))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

// Safely format a stored date value (a full ISO timestamp OR a bare
// "YYYY-MM-DD" string) as "MM/DD/YYYY" in LOCAL time, without ever rolling
// over to the adjacent day. A bare date-only string is parsed by the JS spec
// as UTC midnight, not local midnight - reformatting that in any timezone
// west of UTC rolls it back a full day, so it's re-anchored to local noon
// before being parsed. Returns null (never "undefined"/"NaN") when the value
// is missing or unparsable.
export function formatLocalDate(raw) {
  if (!raw) return null;
  let value = raw;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    value = `${value}T12:00:00`;
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

// Resolve the Date a container should be grouped by for the date-bucketed
// grid: created_at/createdAt (the system-stamped creation time) wins when
// present, since that's what actually determines when the record entered
// the system; only when neither exists do we fall back to the user-entered
// Prep/Run Date. Bare "YYYY-MM-DD" values are built with the LOCAL Date
// constructor (new Date(year, month-1, day)) instead of being handed to
// new Date(string), which the JS spec parses as UTC midnight - in any
// timezone behind UTC that rolls the date back a full day. Full ISO
// timestamps (with a time and/or offset) are left to new Date(...), which
// parses those correctly regardless of timezone. Returns null when nothing
// usable is found.
export function getContainerBucketDate(item) {
  const candidates = [item.created_at, item.createdAt, item.prepDate, item.prep_date];
  for (const raw of candidates) {
    if (!raw) continue;

    if (typeof raw === 'string') {
      const bareDateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (bareDateMatch) {
        const [, year, month, day] = bareDateMatch;
        const d = new Date(Number(year), Number(month) - 1, Number(day));
        if (!isNaN(d.getTime())) return d;
        continue;
      }
    }

    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// Classify a Date into one of the container-grid date buckets, using LOCAL
// calendar boundaries (never UTC/ISO) so the grouping matches what the user
// sees on their own clock. Weeks run Monday-Sunday. Items with no
// resolvable date (see getContainerBucketDate) are grouped under 'older' so
// they never silently disappear from the grid.
// "Created MM/DD/YYYY" label for a container card, using the same date
// resolution as getContainerBucketDate so the visible date always matches
// the section the card is grouped under. Returns null when no usable date
// field exists.
export function getContainerCreatedDateLabel(item) {
  const date = getContainerBucketDate(item);
  if (!date) return null;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getFullYear()}`;
}

// --- Harvest Forecast helpers ---

// Resolve the Date a container was actually inoculated on, for harvest-date
// forecasting. Prefers the timestamp of the earliest history entry whose
// stage looks like an inoculation event ("Inoculation" / "Inoculated"),
// since that is the true start of the colonization clock. Falls back to the
// same created/prep date resolution used everywhere else (getContainerBucketDate)
// so containers logged before the history entry existed still forecast.
// Returns a Date, or null when nothing usable is available.
export function getInoculationDate(item) {
  if (!item || typeof item !== 'object') return null;

  const history = Array.isArray(item.history) ? item.history : [];
  let earliest = null;
  for (const entry of history) {
    if (!entry || typeof entry.stage !== 'string') continue;
    if (!/^inocul/i.test(entry.stage.trim())) continue;
    const d = new Date(entry.timestamp);
    if (isNaN(d.getTime())) continue;
    if (!earliest || d.getTime() < earliest.getTime()) earliest = d;
  }
  if (earliest) return earliest;

  return getContainerBucketDate(item);
}

// Estimate the first-harvest Date for an inoculated container by adding the
// strain's configured timeline (see harvestDaysForStrain) to its inoculation
// date. Uses setDate() rather than millisecond math so the result lands on
// the same wall-clock day regardless of any DST shift in the interval.
// Returns a Date, or null when the inoculation date can't be resolved.
export function estimateHarvestDate(item) {
  const start = getInoculationDate(item);
  if (!start) return null;
  const days = harvestDaysForStrain(item && item.strain);
  const harvest = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  harvest.setDate(harvest.getDate() + days);
  return harvest;
}

export function getDateBucketKey(date) {
  if (!date || isNaN(date.getTime())) return 'older';

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const dow = todayStart.getDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  const thisWeekStart = new Date(todayStart);
  thisWeekStart.setDate(thisWeekStart.getDate() - daysSinceMonday);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  if (date >= todayStart) return 'today';
  if (date >= yesterdayStart) return 'yesterday';
  if (date >= thisWeekStart) return 'thisWeek';
  if (date >= lastWeekStart) return 'lastWeek';
  return 'older';
}

// Best-effort fallback for older items with no prep_date: pull a "M-D" or
// "MM/DD" style date embedded in the item's name/batch/code string (e.g. a
// manually-typed label like "King Blue 8-10"). These embedded dates never
// carry a year, so the item's created_at year is assumed (falling back to
// the current year). Returns null when no plausible date-like substring is
// found - callers should fall back to created_at/createdAt after this.
export function extractDateFromLabel(item) {
  const candidates = [item.name, item.label, item.pcBatch, item.batch_code, item.code];
  const dateLikePattern = /\b(\d{1,2})[\/-](\d{1,2})\b/;
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    const match = raw.match(dateLikePattern);
    if (!match) continue;
    const month = parseInt(match[1], 10);
    const day = parseInt(match[2], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const yearSource = item.created_at || item.createdAt;
    const yearDate = yearSource ? new Date(yearSource) : null;
    const year = yearDate && !isNaN(yearDate.getTime()) ? yearDate.getFullYear() : new Date().getFullYear();
    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
  }
  return null;
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

// --- Persistent Container Weight Defaults & Live Fill Calculation ---

const CONTAINER_WEIGHTS_STORAGE_KEY = 'myco_container_default_weights';
const AIO_RATIO_STORAGE_KEY = 'myco_aio_default_ratio';

// Normalization check for raw unit strings
export function normalizeUnit(unitStr) {
  if (!unitStr) return 'units';
  const raw = unitStr.toString().toLowerCase().trim();
  if (raw === 'lb' || raw === 'lbs' || raw === 'pound' || raw === 'pounds') return 'lbs';
  if (raw === 'oz' || raw === 'ounce' || raw === 'ounces' || raw === '16oz' || raw === '32oz') return 'oz';
  if (raw === 'g' || raw === 'gram' || raw === 'grams') return 'g';
  if (raw === 'kg' || raw === 'kilo' || raw === 'kilogram' || raw === 'kilograms') return 'kg';
  if (raw === 'ml' || raw === 'milliliter' || raw === 'milliliters') return 'mL';
  if (raw === 'l' || raw === 'liter' || raw === 'liters') return 'L';
  if (raw === 'unit' || raw === 'units' || raw === 'count' || raw === 'each' || raw === 'ea') return 'units';
  return unitStr;
}

// Unit conversion helper between lbs, grams, kg, oz, mL, and L
export function convertWeight(value, fromUnit = 'lbs', toUnit = 'lbs') {
  if (value == null || isNaN(value)) return 0;
  const num = parseFloat(value);
  const fUnit = normalizeUnit(fromUnit);
  const tUnit = normalizeUnit(toUnit);
  if (fUnit === tUnit) return num;

  // Liquid conversion (mL <-> L)
  if ((fUnit === 'mL' || fUnit === 'L') && (tUnit === 'mL' || tUnit === 'L')) {
    const inMl = fUnit === 'L' ? num * 1000 : num;
    return tUnit === 'L' ? inMl / 1000 : inMl;
  }

  // Weight conversion (g, oz, lbs, kg) with base in grams
  let inGrams = num;
  if (fUnit === 'lbs') {
    inGrams = num * 453.59237;
  } else if (fUnit === 'kg') {
    inGrams = num * 1000;
  } else if (fUnit === 'oz') {
    inGrams = num * 28.3495;
  } else if (fUnit === 'g') {
    inGrams = num;
  }

  // Convert from base unit (grams) to toUnit
  if (tUnit === 'lbs') {
    return inGrams / 453.59237;
  }
  if (tUnit === 'kg') {
    return inGrams / 1000;
  }
  if (tUnit === 'oz') {
    return inGrams / 28.3495;
  }
  if (tUnit === 'g') {
    return inGrams;
  }
  return inGrams;
}

// Get default fill weight for a container type (checking org_settings -> localStorage -> config -> fallback)
export function getContainerDefaultWeight(containerName, targetUnit = 'lbs') {
  if (!containerName) return convertWeight(1.25, 'lbs', targetUnit);

  let weightInLbs = 1.25;

  // 1. Check active org settings if available
  try {
    if (currentOrganizationId && Array.isArray(userOrganizations)) {
      const activeOrg = userOrganizations.find(o => o.id === currentOrganizationId);
      if (activeOrg?.settings?.container_weights && activeOrg.settings.container_weights[containerName] != null) {
        return Number(activeOrg.settings.container_weights[containerName]);
      }
    }
  } catch (e) {
    console.warn('Error reading org container weights:', e);
  }

  // 2. Check localStorage
  try {
    const saved = JSON.parse(localStorage.getItem(CONTAINER_WEIGHTS_STORAGE_KEY) || '{}');
    if (saved && saved[containerName] != null) {
      return Number(saved[containerName]);
    }
  } catch (e) {
    console.warn('Error reading local container weights:', e);
  }

  // 3. Check custom presets
  try {
    const customPresets = getCustomContainerPresets();
    const custom = customPresets.find(c => c.name === containerName);
    if (custom) {
      if (custom.defaultWeightLbs != null) return Number(custom.defaultWeightLbs);
      if (custom.capacityUnit === 'lb' && custom.capacityValue) return Number(custom.capacityValue);
      if (custom.capacityUnit === 'qt' && custom.capacityValue) return Number((custom.capacityValue * 1.25).toFixed(2));
    }
  } catch (e) {
    console.warn('Error reading custom preset weight:', e);
  }

  // 4. Check DEFAULT_CONTAINER_WEIGHTS or CONTAINER_CATEGORIES config
  if (DEFAULT_CONTAINER_WEIGHTS[containerName] != null) {
    return DEFAULT_CONTAINER_WEIGHTS[containerName];
  }

  for (const cat of Object.values(CONTAINER_CATEGORIES)) {
    const found = cat.items.find(i => i.value === containerName || i.name === containerName);
    if (found?.defaultWeightLbs != null) return found.defaultWeightLbs;
  }

  // Calculate weight in lbs from various sources
  if (currentOrganizationId && Array.isArray(userOrganizations)) {
    const activeOrg = userOrganizations.find(o => o.id === currentOrganizationId);
    if (activeOrg?.settings?.container_weights && activeOrg.settings.container_weights[containerName] != null) {
      weightInLbs = Number(activeOrg.settings.container_weights[containerName]);
      return convertWeight(weightInLbs, 'lbs', targetUnit);
    }
  }

  try {
    const saved = JSON.parse(localStorage.getItem(CONTAINER_WEIGHTS_STORAGE_KEY) || '{}');
    if (saved && saved[containerName] != null) {
      weightInLbs = Number(saved[containerName]);
      return convertWeight(weightInLbs, 'lbs', targetUnit);
    }
  } catch (e) {
    console.warn('Error reading local container weights:', e);
  }

  try {
    const customPresets = getCustomContainerPresets();
    const custom = customPresets.find(c => c.name === containerName);
    if (custom) {
      if (custom.defaultWeightLbs != null) weightInLbs = Number(custom.defaultWeightLbs);
      else if (custom.capacityUnit === 'lb' && custom.capacityValue) weightInLbs = Number(custom.capacityValue);
      else if (custom.capacityUnit === 'qt' && custom.capacityValue) weightInLbs = Number((custom.capacityValue * 1.25).toFixed(2));
      return convertWeight(weightInLbs, 'lbs', targetUnit);
    }
  } catch (e) {
    console.warn('Error reading custom preset weight:', e);
  }

  if (DEFAULT_CONTAINER_WEIGHTS[containerName] != null) {
    weightInLbs = DEFAULT_CONTAINER_WEIGHTS[containerName];
    return convertWeight(weightInLbs, 'lbs', targetUnit);
  }

  for (const cat of Object.values(CONTAINER_CATEGORIES)) {
    const found = cat.items.find(i => i.value === containerName || i.name === containerName);
    if (found?.defaultWeightLbs != null) {
      weightInLbs = found.defaultWeightLbs;
      return convertWeight(weightInLbs, 'lbs', targetUnit);
    }
  }

  return convertWeight(1.25, 'lbs', targetUnit);
}

// Save default fill weight for a container type (stored normalized in lbs)
export async function saveContainerDefaultWeight(containerName, weight, unit = 'lbs') {
  if (!containerName || weight == null || isNaN(weight)) return;
  const numWeightLbs = parseFloat(convertWeight(weight, unit, 'lbs').toFixed(2));

  // Save to localStorage
  try {
    const saved = JSON.parse(localStorage.getItem(CONTAINER_WEIGHTS_STORAGE_KEY) || '{}');
    saved[containerName] = numWeightLbs;
    localStorage.setItem(CONTAINER_WEIGHTS_STORAGE_KEY, JSON.stringify(saved));
  } catch (e) {
    console.warn('Failed saving container default weight to localStorage:', e);
  }

  // Save to active organization settings if available
  try {
    if (currentOrganizationId && Array.isArray(userOrganizations)) {
      const activeOrg = userOrganizations.find(o => o.id === currentOrganizationId);
      if (activeOrg) {
        activeOrg.settings = activeOrg.settings || {};
        activeOrg.settings.container_weights = activeOrg.settings.container_weights || {};
        activeOrg.settings.container_weights[containerName] = numWeightLbs;
        const { updateOrganizationSettings } = await import('./db.js');
        await updateOrganizationSettings(currentOrganizationId, activeOrg.settings);
      }
    }
  } catch (e) {
    console.warn('Failed saving container weight to organization settings:', e);
  }
}

// Get the user's saved default AIO grain:substrate ratio (checking org_settings -> localStorage)
// Returns { ratio: '50-50'|'custom'|..., customGrainPct: number|null } or null if none saved.
export function getAIODefaultRatio() {
  try {
    if (currentOrganizationId && Array.isArray(userOrganizations)) {
      const activeOrg = userOrganizations.find(o => o.id === currentOrganizationId);
      if (activeOrg?.settings?.aio_default_ratio) {
        return activeOrg.settings.aio_default_ratio;
      }
    }
  } catch (e) {
    console.warn('Error reading org AIO default ratio:', e);
  }

  try {
    const saved = JSON.parse(localStorage.getItem(AIO_RATIO_STORAGE_KEY) || 'null');
    if (saved) return saved;
  } catch (e) {
    console.warn('Error reading local AIO default ratio:', e);
  }

  return null;
}

// Save the user's preferred default AIO grain:substrate ratio
export async function saveAIODefaultRatio(ratioValue, customGrainPct = null) {
  if (!ratioValue) return;
  const payload = {
    ratio: ratioValue,
    customGrainPct: ratioValue === 'custom' ? Number(customGrainPct) || 50 : null
  };

  // Save to localStorage
  try {
    localStorage.setItem(AIO_RATIO_STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Failed saving AIO default ratio to localStorage:', e);
  }

  // Save to active organization settings if available
  try {
    if (currentOrganizationId && Array.isArray(userOrganizations)) {
      const activeOrg = userOrganizations.find(o => o.id === currentOrganizationId);
      if (activeOrg) {
        activeOrg.settings = activeOrg.settings || {};
        activeOrg.settings.aio_default_ratio = payload;
        const { updateOrganizationSettings } = await import('./db.js');
        await updateOrganizationSettings(currentOrganizationId, activeOrg.settings);
      }
    }
  } catch (e) {
    console.warn('Failed saving AIO default ratio to organization settings:', e);
  }
}

// Update live calculation indicator (Total Material Needed), AIO breakdown, and populate medium name
export function updateBulkPrepWeightSummary() {
  const containerSelect = document.getElementById('bulk-container');
  const mediumSelect = document.getElementById('bulk-medium');
  const qtyInput = document.getElementById('bulk-qty');
  const unitWeightInput = document.getElementById('txtUnitWeight');
  const unitSelect = document.getElementById('selWeightUnit');
  const lblTotal = document.getElementById('lblTotalPrepWeight');
  const lblMedium = document.getElementById('lblMediumDeductName');
  const stockNotice = document.getElementById('stock-warning-notice');
  const quickSupplyContainer = document.getElementById('quick-supply-btn-container');
  const quickSupplyLabel = document.getElementById('quick-supply-name-label');

  if (!lblTotal) return;

  const mediumName = mediumSelect?.value || 'Whole Oats';
  const isLiquidOrAgar = isLiquidOrAgarMedium(mediumName);
  const qty = parseFloat(qtyInput?.value) || 0;

  let totalWeight = 0;
  let selectedUnit = 'lbs';

  if (isLiquidOrAgar) {
    const volPerContainer = parseFloat(document.getElementById('lc-target-volume')?.value || document.getElementById('bulk-volume-ml')?.value) || 500;
    const totalVol = qty * volPerContainer;
    selectedUnit = 'mL';
    lblTotal.textContent = `${totalVol} mL`;
    if (lblMedium) lblMedium.textContent = `${mediumName} (Recipe Ingredients)`;
  } else {
    const unitWeight = parseFloat(unitWeightInput?.value) || 0;
    selectedUnit = unitSelect?.value || 'lbs';
    totalWeight = qty * unitWeight;
    const isAIO = mediumName === 'All In One';

    // Format label text with selected unit
    const formattedWeightStr = `${totalWeight.toFixed(selectedUnit === 'g' ? 0 : 2)} ${selectedUnit}`;
    lblTotal.textContent = formattedWeightStr;
    if (lblMedium) lblMedium.textContent = isAIO ? 'All-In-One Split' : mediumName;

    // Toggle AIO panel visibility and recalculate splits if AIO is active
    const aioPanel = document.getElementById('aio-composition-panel');
    if (aioPanel) {
      aioPanel.classList.toggle('hidden', !isAIO);
      if (isAIO) {
        updateAIOSplitCalculations(totalWeight, selectedUnit);
      }
    }
  }

  // Check current stock if supplies are loaded in window/db
  checkSupplyStockWarning(mediumName, totalWeight, selectedUnit, stockNotice, quickSupplyContainer, quickSupplyLabel);
}

// Calculate AIO ratio splits for Grain and Substrate components
export function updateAIOSplitCalculations(totalWeight, unit = 'lbs') {
  const ratioSelect = document.getElementById('aio-ratio-select');
  const customPctInput = document.getElementById('aio-custom-grain-pct');
  const grainWeightEl = document.getElementById('aio-grain-weight-calc');
  const subWeightEl = document.getElementById('aio-sub-weight-calc');
  const aioSplitPreview = document.getElementById('aio-split-preview');
  const aioRatioLabel = document.getElementById('aio-ratio-label');

  const ratioVal = ratioSelect?.value || '50-50';
  let grainPct;

  if (ratioVal === 'custom') {
    let customPct = parseFloat(customPctInput?.value);
    if (isNaN(customPct)) customPct = 50;
    customPct = Math.min(99, Math.max(1, customPct));
    grainPct = customPct / 100;
  } else {
    const parsedGrain = parseFloat(String(ratioVal).split('-')[0]);
    grainPct = (isNaN(parsedGrain) ? 50 : parsedGrain) / 100;
  }

  const subPct = 1 - grainPct;

  const grainWeight = totalWeight * grainPct;
  const subWeight = totalWeight * subPct;

  const grainFormatted = `${grainWeight.toFixed(unit === 'g' ? 0 : 2)} ${unit}`;
  const subFormatted = `${subWeight.toFixed(unit === 'g' ? 0 : 2)} ${unit}`;

  if (grainWeightEl) grainWeightEl.textContent = grainFormatted;
  if (subWeightEl) subWeightEl.textContent = subFormatted;

  const desc = `${Math.round(grainPct * 100)}% Grain / ${Math.round(subPct * 100)}% Substrate`;
  if (aioSplitPreview) aioSplitPreview.textContent = desc;
  if (aioRatioLabel) aioRatioLabel.textContent = desc;
}

// Find matching supply from inventory by name or synonyms
export function findMatchingSupply(supplies, ingredientName) {
  if (!Array.isArray(supplies) || !ingredientName) return null;
  const target = ingredientName.trim().toLowerCase();

  // Keyword lookup map for common dry mycology supplies
  const aliases = {
    'light malt extract (lme)': ['light malt extract', 'malt extract', 'lme', 'dme', 'dry malt extract', 'malt'],
    'dextrose / honey': ['dextrose', 'honey', 'glucose', 'corn sugar', 'karo', 'syrup'],
    'peptone': ['peptone', 'bacteriological peptone', 'mycological peptone', 'yeast nutrient'],
    'agar powder': ['agar powder', 'agar-agar', 'agar', 'agar agar', 'powdered agar'],
    'potato flakes / infusion': ['potato flakes', 'instant potato', 'potato dextrose', 'pda', 'potato'],
    'distilled water': ['distilled water', 'water', 'ro water'],
    'nutritional yeast / peptone': ['yeast', 'nutritional yeast', 'peptone', 'yeast nutrient']
  };

  // Direct check
  let match = supplies.find(s => {
    const sName = (s.name || '').trim().toLowerCase();
    return sName === target;
  });
  if (match) return match;

  // Check aliases
  for (const [key, aliasList] of Object.entries(aliases)) {
    if (target === key || aliasList.some(a => target.includes(a))) {
      match = supplies.find(s => {
        const sName = (s.name || '').trim().toLowerCase();
        return sName === key || aliasList.some(a => sName.includes(a) || a.includes(sName));
      });
      if (match) return match;
    }
  }

  // Substring fallback
  return supplies.find(s => {
    const sName = (s.name || '').trim().toLowerCase();
    return sName.includes(target) || target.includes(sName);
  });
}

// Check if supply stock is lower than required weight and show non-blocking notice / quick add button
export async function checkSupplyStockWarning(mediumName, totalRequiredWeight, selectedUnit = 'lbs', noticeEl, quickAddContainerEl, quickAddLabelEl) {
  const notice = noticeEl || document.getElementById('stock-warning-notice');
  const quickBtnContainer = quickAddContainerEl || document.getElementById('quick-supply-btn-container');
  const quickLabel = quickAddLabelEl || document.getElementById('quick-supply-name-label');

  if (!notice) return;

  const isLiquidOrAgar = isLiquidOrAgarMedium(mediumName);

  if (!isLiquidOrAgar && (totalRequiredWeight <= 0 || !mediumName)) {
    notice.classList.add('hidden');
    notice.textContent = '';
    if (quickBtnContainer) quickBtnContainer.classList.add('hidden');
    return;
  }

  try {
    const { getSupplies, currentOrganizationId } = await import('./db.js');
    if (!currentOrganizationId) {
      notice.classList.add('hidden');
      if (quickBtnContainer) quickBtnContainer.classList.add('hidden');
      return;
    }

    const supplies = await getSupplies().catch(() => []);

    // 1. Liquid / Agar Recipe Multi-Ingredient Verification (supports live editable inputs)
    if (isLiquidOrAgar) {
      const activeIngredients = getActiveRecipeCalculatorIngredients();
      const dryIngredients = activeIngredients.filter(i => !i.isLiquid && i.amount > 0);

      const warnings = [];
      let missingDryItem = null;

      for (const ingredient of dryIngredients) {
        const matchingSupply = findMatchingSupply(supplies, ingredient.name);
        if (!matchingSupply) {
          warnings.push(`<strong>${ingredient.name}</strong> (${ingredient.amount}g) not in Inventory.`);
          if (!missingDryItem) missingDryItem = ingredient.name;
        } else if (!matchingSupply.is_non_depleting) {
          const supplyUnit = matchingSupply.unit_of_measure || 'g';
          const stockInGrams = convertWeight(matchingSupply.quantity_on_hand, supplyUnit, 'g');
          if (stockInGrams < ingredient.amount) {
            warnings.push(`Low stock for <strong>${matchingSupply.name}</strong> (${matchingSupply.quantity_on_hand} ${supplyUnit} < ${ingredient.amount}g).`);
          }
        }
      }

      if (warnings.length > 0) {
        notice.innerHTML = `📦 <span class="font-semibold">Recipe Inventory Notice:</span> ${warnings.join(' ')}`;
        notice.classList.remove('hidden');
      } else {
        notice.classList.add('hidden');
        notice.textContent = '';
      }

      if (quickBtnContainer) {
        if (missingDryItem) {
          if (quickLabel) quickLabel.textContent = `"${missingDryItem}"`;
          quickBtnContainer.setAttribute('data-target-supply', missingDryItem);
          quickBtnContainer.classList.remove('hidden');
        } else {
          quickBtnContainer.classList.add('hidden');
        }
      }
      return;
    }

    // 2. All-In-One Medium Verification
    const isAIO = mediumName === 'All In One';
    if (isAIO) {
      const grainSelect = document.getElementById('aio-grain-select');
      const subSelect = document.getElementById('aio-substrate-select');
      const ratioSelect = document.getElementById('aio-ratio-select');

      const grainName = grainSelect?.value || 'Whole Oats';
      const subName = subSelect?.value || 'Coco Coir';

      let grainPct = 0.5;
      let subPct = 0.5;
      const ratioVal = ratioSelect?.value || '50-50';
      if (ratioVal === '40-60') { grainPct = 0.4; subPct = 0.6; }
      else if (ratioVal === '33-67') { grainPct = 0.3333; subPct = 0.6667; }
      else if (ratioVal === '60-40') { grainPct = 0.6; subPct = 0.4; }

      const grainReq = totalRequiredWeight * grainPct;
      const subReq = totalRequiredWeight * subPct;

      const matchingGrain = (supplies || []).find(s => {
        const sName = (s.name || '').trim().toLowerCase();
        const mName = grainName.trim().toLowerCase();
        return sName === mName || sName.includes(mName) || mName.includes(sName);
      });

      const matchingSub = (supplies || []).find(s => {
        const sName = (s.name || '').trim().toLowerCase();
        const mName = subName.trim().toLowerCase();
        return sName === mName || sName.includes(mName) || mName.includes(sName);
      });

      const warnings = [];
      let missingItem = null;

      if (!matchingGrain) {
        warnings.push(`<strong>${grainName}</strong> is not registered in Inventory.`);
        missingItem = grainName;
      } else if (!matchingGrain.is_non_depleting) {
        const supplyUnit = matchingGrain.unit_of_measure || 'lbs';
        const stockInSelectedUnit = convertWeight(matchingGrain.quantity_on_hand, supplyUnit, selectedUnit);
        if (stockInSelectedUnit < grainReq) {
          warnings.push(`Current stock of <strong>${matchingGrain.name}</strong> (${matchingGrain.quantity_on_hand} ${supplyUnit}) is lower than ${grainReq.toFixed(selectedUnit === 'g' ? 0 : 2)} ${selectedUnit} needed.`);
        }
      }

      if (!matchingSub) {
        warnings.push(`<strong>${subName}</strong> is not registered in Inventory.`);
        if (!missingItem) missingItem = subName;
      } else if (!matchingSub.is_non_depleting) {
        const supplyUnit = matchingSub.unit_of_measure || 'lbs';
        const stockInSelectedUnit = convertWeight(matchingSub.quantity_on_hand, supplyUnit, selectedUnit);
        if (stockInSelectedUnit < subReq) {
          warnings.push(`Current stock of <strong>${matchingSub.name}</strong> (${matchingSub.quantity_on_hand} ${supplyUnit}) is lower than ${subReq.toFixed(selectedUnit === 'g' ? 0 : 2)} ${selectedUnit} needed.`);
        }
      }

      if (warnings.length > 0) {
        notice.innerHTML = `⚠️ <span class="font-semibold">Notice:</span> ${warnings.join(' ')}`;
        notice.classList.remove('hidden');
      } else {
        notice.classList.add('hidden');
        notice.textContent = '';
      }

      if (quickBtnContainer) {
        if (missingItem) {
          if (quickLabel) quickLabel.textContent = `"${missingItem}"`;
          quickBtnContainer.setAttribute('data-target-supply', missingItem);
          quickBtnContainer.classList.remove('hidden');
        } else {
          quickBtnContainer.classList.add('hidden');
        }
      }
      return;
    }

    // 3. Standard Single Medium
    const matchingSupply = (supplies || []).find(s => {
      const sName = (s.name || '').trim().toLowerCase();
      const mName = (mediumName || '').trim().toLowerCase();
      return sName === mName || sName.includes(mName) || mName.includes(sName);
    });

    if (!matchingSupply) {
      notice.innerHTML = `💡 <span class="font-semibold">Notice:</span> <strong>${mediumName}</strong> is not registered in Inventory & Supplies.`;
      notice.classList.remove('hidden');
      if (quickBtnContainer) {
        if (quickLabel) quickLabel.textContent = `"${mediumName}"`;
        quickBtnContainer.setAttribute('data-target-supply', mediumName);
        quickBtnContainer.classList.remove('hidden');
      }
      return;
    }

    if (quickBtnContainer) quickBtnContainer.classList.add('hidden');

    if (!matchingSupply.is_non_depleting) {
      const supplyUnit = matchingSupply.unit_of_measure || 'lbs';
      const stockInSelectedUnit = convertWeight(matchingSupply.quantity_on_hand, supplyUnit, selectedUnit);
      if (stockInSelectedUnit < totalRequiredWeight) {
        notice.innerHTML = `⚠️ <span class="font-semibold">Warning:</span> Current stock of <strong>${matchingSupply.name}</strong> (${matchingSupply.quantity_on_hand} ${supplyUnit}) is lower than ${totalRequiredWeight.toFixed(selectedUnit === 'g' ? 0 : 2)} ${selectedUnit} needed.`;
        notice.classList.remove('hidden');
        return;
      }
    }
    notice.classList.add('hidden');
    notice.textContent = '';
  } catch (e) {
    // Graceful silent fallback
    notice.classList.add('hidden');
  }
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

// Helper to get recipe ingredients breakdown for Liquid / Agar recipes given total volume in mL
export function getLiquidAgarRecipeBreakdown(mediumName, totalVolumeMl) {
  const med = (mediumName || '').trim();
  const vol = Number(totalVolumeMl) || 0;
  const factor = vol / 500; // standard base 500 mL

  if (med === 'Liquid Culture') {
    return [
      { name: 'Distilled Water', amount: vol, unit: 'mL', isLiquid: true },
      { name: 'Light Malt Extract (LME)', amount: parseFloat((factor * 1.0).toFixed(2)), unit: 'g', isLiquid: false },
      { name: 'Dextrose / Honey', amount: parseFloat((factor * 10.0).toFixed(2)), unit: 'g', isLiquid: false },
      { name: 'Peptone', amount: parseFloat((factor * 0.5).toFixed(2)), unit: 'g', isLiquid: false }
    ];
  }

  if (med === 'Malt Extract Broth') {
    return [
      { name: 'Distilled Water', amount: vol, unit: 'mL', isLiquid: true },
      { name: 'Light Malt Extract (LME)', amount: parseFloat((factor * 2.0).toFixed(2)), unit: 'g', isLiquid: false },
      { name: 'Peptone', amount: parseFloat((factor * 0.5).toFixed(2)), unit: 'g', isLiquid: false }
    ];
  }

  if (med === 'Malt Extract Agar') {
    return [
      { name: 'Distilled Water', amount: vol, unit: 'mL', isLiquid: true },
      { name: 'Agar Powder', amount: parseFloat((factor * 10.0).toFixed(2)), unit: 'g', isLiquid: false },
      { name: 'Light Malt Extract (LME)', amount: parseFloat((factor * 10.0).toFixed(2)), unit: 'g', isLiquid: false },
      { name: 'Nutritional Yeast / Peptone', amount: parseFloat((factor * 0.5).toFixed(2)), unit: 'g', isLiquid: false }
    ];
  }

  if (med === 'Potato Dextrose Agar') {
    return [
      { name: 'Distilled Water', amount: vol, unit: 'mL', isLiquid: true },
      { name: 'Agar Powder', amount: parseFloat((factor * 10.0).toFixed(2)), unit: 'g', isLiquid: false },
      { name: 'Dextrose / Honey', amount: parseFloat((factor * 10.0).toFixed(2)), unit: 'g', isLiquid: false },
      { name: 'Potato Flakes / Infusion', amount: parseFloat((factor * 4.0).toFixed(2)), unit: 'g', isLiquid: false }
    ];
  }

  if (med === 'Water') {
    return [
      { name: 'Distilled Water', amount: vol, unit: 'mL', isLiquid: true }
    ];
  }

  // Custom liquid/agar fallback (assume standard LC if liquid category, standard MEA if agar category)
  const cat = getMediumCategory(med);
  if (cat === 'AGAR') {
    return [
      { name: 'Distilled Water', amount: vol, unit: 'mL', isLiquid: true },
      { name: 'Agar Powder', amount: parseFloat((factor * 10.0).toFixed(2)), unit: 'g', isLiquid: false },
      { name: 'Light Malt Extract (LME)', amount: parseFloat((factor * 10.0).toFixed(2)), unit: 'g', isLiquid: false }
    ];
  }
  return [
    { name: 'Distilled Water', amount: vol, unit: 'mL', isLiquid: true },
    { name: 'Light Malt Extract (LME)', amount: parseFloat((factor * 1.0).toFixed(2)), unit: 'g', isLiquid: false },
    { name: 'Dextrose / Honey', amount: parseFloat((factor * 10.0).toFixed(2)), unit: 'g', isLiquid: false }
  ];
}

// Check if a medium name is liquid or agar
export function isLiquidOrAgarMedium(mediumName) {
  if (!mediumName) return false;
  const cat = getMediumCategory(mediumName);
  if (cat === 'LIQUID' || cat === 'AGAR') return true;
  const m = mediumName.toLowerCase();
  return m.includes('liquid culture') || m.includes('broth') || m.includes('water') || m.includes('agar');
}

// --- Liquid & Agar Recipe Calculator ---
export function updateLCTargetVolumeDefault() {
  const select = document.getElementById('bulk-container');
  const targetInput = document.getElementById('lc-target-volume');
  const volumeMlInput = document.getElementById('bulk-volume-ml');
  if (!select || !targetInput) return;

  const selectedValue = select.value;
  let defVol = 500;
  if (!selectedValue || selectedValue === '__add_custom_container__') {
    defVol = 500;
  } else {
    // Use the categorized capacity when available
    const capacity = getContainerCapacityMl(selectedValue);
    if (capacity) {
      defVol = Math.round(capacity * 0.7);
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
        defVol = Math.round(capMl * 0.7);
      } else {
        defVol = 500;
      }
    }
  }
  targetInput.value = defVol;
  if (volumeMlInput) volumeMlInput.value = defVol;
  updateLCCalculator();
}

// In-memory overrides and custom additives for the live recipe calculator
let recipeManualOverrides = {};
let customRecipeAdditives = [];

export function resetRecipeCalculatorState() {
  recipeManualOverrides = {};
  customRecipeAdditives = [];
}

// Get all currently active ingredients and their final calculated/overridden quantities in grams/mL
export function getActiveRecipeCalculatorIngredients() {
  const medium = document.getElementById('bulk-medium')?.value || 'Liquid Culture';
  const qty = parseInt((document.getElementById('bulk-qty') || {}).value) || 1;
  const volPerContainer = parseFloat((document.getElementById('lc-target-volume') || {}).value) || 500;
  const totalVol = qty * volPerContainer;

  const baseBreakdown = getLiquidAgarRecipeBreakdown(medium, totalVol);
  const result = [];

  baseBreakdown.forEach((item, idx) => {
    const key = `base_${idx}`;
    const overridden = recipeManualOverrides[key];
    const finalAmt = overridden !== undefined ? parseFloat(overridden) || 0 : item.amount;
    result.push({
      key,
      name: item.name,
      amount: finalAmt,
      unit: item.unit,
      isLiquid: item.isLiquid,
      isCustom: false
    });
  });

  customRecipeAdditives.forEach(custom => {
    const key = custom.id;
    const overridden = recipeManualOverrides[key];
    const finalAmt = overridden !== undefined ? parseFloat(overridden) || 0 : (custom.per500ml * (totalVol / 500));
    result.push({
      key,
      name: custom.name,
      amount: parseFloat(finalAmt.toFixed(2)),
      unit: custom.unit || 'g',
      isLiquid: false,
      isCustom: true
    });
  });

  return result;
}

export function handleRecipeIngredientAmountChange(key, value) {
  recipeManualOverrides[key] = parseFloat(value) || 0;
  updateBulkPrepWeightSummary();
}

export function addCustomRecipeIngredientRow() {
  const name = prompt('Enter custom ingredient or coloring name (e.g., Activated Charcoal, Blue Coloring, Dextrose):');
  if (!name || !name.trim()) return;

  const per500 = parseFloat(prompt(`Enter standard grams per 500 mL for ${name.trim()}:`, '1.0')) || 1.0;
  const newAdditive = {
    id: 'add_' + Date.now().toString(36),
    name: name.trim(),
    per500ml: per500,
    unit: 'g'
  };

  customRecipeAdditives.push(newAdditive);
  updateLCCalculator();
}

export function removeCustomRecipeIngredientRow(id) {
  customRecipeAdditives = customRecipeAdditives.filter(c => c.id !== id);
  delete recipeManualOverrides[id];
  updateLCCalculator();
}

export function handleTargetVolumeChange(val) {
  const num = parseFloat(val) || 0;
  const volMlInput = document.getElementById('bulk-volume-ml');
  if (volMlInput && num > 0) {
    volMlInput.value = num;
  }
  updateLCCalculator();
}

export function handleVolumeMlChange(val) {
  const num = parseFloat(val) || 0;
  const lcTarget = document.getElementById('lc-target-volume');
  if (lcTarget && num > 0) {
    lcTarget.value = num;
  }
  updateLCCalculator();
}

export function updateLCCalculator() {
  const medium = document.getElementById('bulk-medium')?.value || 'Liquid Culture';
  const qty = parseInt((document.getElementById('bulk-qty') || {}).value) || 1;
  const volPerContainer = parseFloat((document.getElementById('lc-target-volume') || {}).value) || 0;
  const totalVol = qty * volPerContainer;

  // Sync with bulk-volume-ml if present
  const volMlInput = document.getElementById('bulk-volume-ml');
  if (volMlInput && volPerContainer > 0) {
    volMlInput.value = volPerContainer;
  }

  const totalVolEl = document.getElementById('lc-total-batch-volume');
  if (totalVolEl) totalVolEl.innerText = `${totalVol} mL Total`;

  const titleEl = document.getElementById('recipe-calc-box-title');
  if (titleEl) {
    const isAgar = medium.toLowerCase().includes('agar');
    titleEl.innerHTML = isAgar ? '<span>🧫</span> Agar Recipe Calculator' : '<span>🧪</span> Liquid Culture Recipe Calculator';
  }

  const listContainer = document.getElementById('lc-calc-ingredients-list');
  if (listContainer) {
    const activeIngredients = getActiveRecipeCalculatorIngredients();
    listContainer.innerHTML = activeIngredients.map(item => {
      const icon = item.isLiquid ? '💧' : (item.name.includes('LME') || item.name.includes('Malt') ? '🌾' : (item.name.includes('Honey') || item.name.includes('Dextrose') ? '🍯' : (item.name.includes('Agar') ? '🧫' : (item.name.includes('Charcoal') ? '⬛' : '🧪'))));
      return `
        <div class="flex items-center justify-between gap-2 pt-1.5 first:pt-0">
          <div class="flex items-center gap-1.5 min-w-0 flex-1">
            <span class="text-sm shrink-0">${icon}</span>
            <span class="font-medium text-slate-300 truncate">${item.name}</span>
            ${item.isCustom ? `<button type="button" onclick="removeCustomRecipeIngredientRow('${item.key}')" class="text-[10px] text-rose-400 hover:text-rose-300 ml-1">✕</button>` : ''}
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <input type="number" step="0.01" min="0" value="${item.amount}" oninput="handleRecipeIngredientAmountChange('${item.key}', this.value)" class="w-20 bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded p-1 text-right font-mono text-emerald-400 font-bold focus:outline-none text-xs">
            <span class="text-xs font-mono text-slate-400 w-6">${item.unit}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  updateBulkPrepWeightSummary();
}

export function toggleLCMedium() {
  const medium = document.getElementById('bulk-medium')?.value || '';
  const calcBox = document.getElementById('lc-calculator-box');
  const mediaBottleBox = document.getElementById('media-bottle-fields');
  const unitWeightContainer = document.getElementById('unit-weight-container');

  const isLiquidOrAgar = isLiquidOrAgarMedium(medium);

  // Hide generic fill weight box for liquid and agar media to avoid redundancy
  if (unitWeightContainer) {
    unitWeightContainer.classList.toggle('hidden', isLiquidOrAgar);
  }

  // Show recipe calculator box for liquid or agar mediums
  if (calcBox) {
    if (isLiquidOrAgar) {
      calcBox.classList.remove('hidden');
      updateLCTargetVolumeDefault();
    } else {
      calcBox.classList.add('hidden');
    }
  }

  // Show media bottle color / variant fields for liquid/agar mediums
  if (mediaBottleBox) {
    if (isLiquidOrAgar) {
      mediaBottleBox.classList.remove('hidden');
      const container = document.getElementById('bulk-container')?.value;
      const volumeMlInput = document.getElementById('bulk-volume-ml');
      if (volumeMlInput && !volumeMlInput.value) {
        const capacity = getContainerCapacityMl(container);
        volumeMlInput.value = capacity ? Math.round(capacity * 0.7) : 500;
      }
    } else {
      mediaBottleBox.classList.add('hidden');
    }
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
