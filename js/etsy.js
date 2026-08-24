// Sierra Myco Lab - Etsy API v3 Integration Client Module

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { getSupabaseClient, currentOrganizationId } from './db.js';
import { showToast } from './modals.js';

/**
 * Initiates the OAuth 2.0 PKCE flow for Etsy.
 * Requests authorization URL from the edge function and redirects the browser.
 */
export async function connectEtsy() {
  const btn = document.getElementById('btn-connect-etsy');
  const btnText = document.getElementById('text-connect-etsy');

  const setBtnLoading = (loading) => {
    if (btn) {
      btn.disabled = loading;
      // Preserve full Tailwind styling
      btn.className = 'flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-medium text-sm rounded-lg transition-colors shadow-sm cursor-pointer border border-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed shrink-0';
    }
    if (btnText) {
      btnText.textContent = loading ? 'Connecting...' : 'Connect Etsy Shop';
    }
  };

  const supabase = getSupabaseClient();
  if (!supabase) {
    showToast('Supabase client not initialized.', 'error');
    return;
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    showToast('You must be logged in to connect Etsy.', 'error');
    return;
  }

  setBtnLoading(true);

  try {
    showToast('Connecting to Etsy...', 'info');

    const redirectUri = `${SUPABASE_URL}/functions/v1/etsy-auth-callback`;
    const clientRedirectUrl = `${window.location.origin}/index.html`;

    const { data: result, error: fnError } = await supabase.functions.invoke('etsy-auth-start', {
      body: {
        user_id: session.user.id,
        redirect_uri: redirectUri,
        client_redirect_url: clientRedirectUrl,
        organization_id: currentOrganizationId
      }
    });

    if (fnError) {
      throw fnError;
    }

    const authUrl = result?.url || result?.auth_url;
    if (authUrl) {
      window.location.href = authUrl;
    } else {
      throw new Error((result && result.error) || 'No authorization URL returned.');
    }
  } catch (err) {
    console.error('Etsy OAuth connection error:', err);
    showToast('Unable to connect to Etsy authentication server. Please check Edge Function status.', 'error');
    setBtnLoading(false);
  }
}

// Global click delegation for resilient connection
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (e.target && e.target.closest('#btn-connect-etsy')) {
      e.preventDefault();
      connectEtsy();
    }
  });
}

/**
 * Checks if the current user/organization has an active Etsy connection.
 */
export async function fetchEtsyIntegrationStatus() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('etsy_integrations')
    .select('id, user_id, etsy_shop_id, etsy_shop_name, expires_at, created_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching Etsy integration status:', error);
    return null;
  }

  return data;
}

/**
 * Disconnects the current Etsy store integration.
 */
export async function disconnectEtsy() {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('etsy_integrations')
    .delete()
    .eq('user_id', user.id);

  if (error) {
    showToast('Failed to disconnect Etsy.', 'error');
    console.error(error);
  } else {
    showToast('Etsy integration disconnected.', 'success');
  }
}

/**
 * Triggers initial inventory import from Etsy via Edge Function.
 */
export async function importEtsyListings() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    showToast('Supabase client not initialized.', 'error');
    return null;
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session) {
    showToast('You must be logged in to import Etsy listings.', 'error');
    return null;
  }

  try {
    showToast('Importing listings from Etsy...', 'info');

    const { data: result, error: fnError } = await supabase.functions.invoke('etsy-import-listings', {
      body: {
        organization_id: currentOrganizationId
      }
    });

    if (fnError || (result && result.error)) {
      throw new Error((result && result.error) || fnError?.message || 'Failed to import Etsy listings.');
    }

    showToast(`Successfully imported ${result.total_listings_imported} listings (${result.total_skus_mapped} SKUs)!`, 'success');
    return result;
  } catch (err) {
    console.error('Etsy import error:', err);
    showToast(err.message || 'Error importing Etsy listings', 'error');
    return null;
  }
}

/**
 * Fetch all local SKU mappings for the user/organization.
 */
export async function fetchSkuMappings() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('sku_mappings')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching SKU mappings:', error);
    return [];
  }

  return data || [];
}

// In-memory cache for modal interactions
let cachedSkuMappings = [];
let cachedInventoryOptions = [];
let activeSkuFilter = 'all';

/**
 * Opens and renders the Etsy SKU Inventory Mapping modal.
 */
export async function openSkuMappingModal() {
  const modal = document.getElementById('modal-sku-mapping');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  const tbody = document.getElementById('sku-mappings-tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-8 text-slate-400 animate-pulse">
          Loading Etsy listings and inventory mappings...
        </td>
      </tr>
    `;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    showToast('Supabase client not initialized.', 'error');
    return;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast('You must be logged in to view SKU mappings.', 'error');
      return;
    }

    // 1. Fetch existing sku_mappings
    const { data: mappingsData, error: mapErr } = await supabase
      .from('sku_mappings')
      .select('*')
      .eq('user_id', user.id);

    if (mapErr) console.error('Error fetching sku_mappings:', mapErr);
    cachedSkuMappings = mappingsData || [];

    // 2. Fetch inventory sources: supplies & fresh_produce_inventory
    const [suppliesRes, freshProduceRes] = await Promise.all([
      supabase.from('supplies').select('id, name, unit_of_measure, quantity_on_hand, category').order('name'),
      supabase.from('fresh_produce_inventory').select('id, strain, harvest_date, quality_grade, quantity_on_hand, unit').order('harvest_date', { ascending: false })
    ]);

    const supplies = suppliesRes.data || [];
    const freshProduce = freshProduceRes.data || [];

    cachedInventoryOptions = [
      ...supplies.map(s => ({
        id: s.id,
        name: `📦 [Supply] ${s.name} (${s.quantity_on_hand || 0} ${s.unit_of_measure || 'units'})`,
        type: 'supply'
      })),
      ...freshProduce.map(p => ({
        id: p.id,
        name: `🍄 [Produce] ${p.strain} (${p.quantity_on_hand || 0} ${p.unit || 'lbs'} - ${p.quality_grade || 'Fresh'})`,
        type: 'fresh_produce'
      }))
    ];

    renderSkuMappingsTable();
  } catch (err) {
    console.error('Error loading SKU Mapping Modal data:', err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-8 text-rose-400">
            Failed to load SKU mappings. Please check your network and try again.
          </td>
        </tr>
      `;
    }
  }
}

/**
 * Closes the Etsy SKU Inventory Mapping modal.
 */
export function closeSkuMappingModal() {
  const modal = document.getElementById('modal-sku-mapping');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

/**
 * Sets current tab filter (all, mapped, unmapped)
 */
export function setSkuMappingFilter(filterType) {
  activeSkuFilter = filterType;
  document.querySelectorAll('.sku-filter-btn').forEach(btn => {
    if (btn.dataset.filter === filterType) {
      btn.className = 'sku-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold transition bg-orange-600 text-slate-950';
    } else {
      btn.className = 'sku-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold transition bg-slate-800 text-slate-300 hover:text-white';
    }
  });
  renderSkuMappingsTable();
}

/**
 * Triggered on search input
 */
export function filterSkuMappingsTable() {
  renderSkuMappingsTable();
}

/**
 * Renders the table rows based on filter & search query
 */
export function renderSkuMappingsTable() {
  const tbody = document.getElementById('sku-mappings-tbody');
  if (!tbody) return;

  const searchInput = (document.getElementById('sku-mapping-search')?.value || '').toLowerCase().trim();

  let mappedCount = 0;
  let unmappedCount = 0;

  cachedSkuMappings.forEach(m => {
    const isMapped = !!(m.inventory_id || m.inventory_item_id);
    if (isMapped) mappedCount++;
    else unmappedCount++;
  });

  const countMappedEl = document.getElementById('count-sku-mapped');
  const countUnmappedEl = document.getElementById('count-sku-unmapped');
  if (countMappedEl) countMappedEl.textContent = mappedCount;
  if (countUnmappedEl) countUnmappedEl.textContent = unmappedCount;

  let filtered = cachedSkuMappings.filter(m => {
    const isMapped = !!(m.inventory_id || m.inventory_item_id);
    if (activeSkuFilter === 'mapped' && !isMapped) return false;
    if (activeSkuFilter === 'unmapped' && isMapped) return false;

    if (searchInput) {
      const titleMatch = (m.title || '').toLowerCase().includes(searchInput);
      const skuMatch = (m.sku || '').toLowerCase().includes(searchInput);
      const listingMatch = (m.listing_id || m.etsy_item_id || '').toLowerCase().includes(searchInput);
      return titleMatch || skuMatch || listingMatch;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-12 text-slate-500">
          <div class="text-3xl mb-2">🔍</div>
          <p class="font-semibold text-slate-400">No Etsy SKU listings match your filter.</p>
          <p class="text-[11px] text-slate-500 mt-1">Try syncing with Etsy or modifying your search query.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    const listingId = item.listing_id || item.etsy_item_id;
    const selectedInvId = item.inventory_id || item.inventory_item_id || '';
    const deductQty = item.deduct_qty != null ? item.deduct_qty : 1;
    const isMapped = !!selectedInvId;

    const inventoryOptionsHtml = `
      <option value="">-- Select Inventory Item --</option>
      ${cachedInventoryOptions.map(opt => `
        <option value="${opt.id}" ${opt.id === selectedInvId ? 'selected' : ''}>
          ${opt.name}
        </option>
      `).join('')}
    `;

    return `
      <tr class="hover:bg-slate-800/40 transition border-b border-slate-800/60 text-xs">
        <!-- Item & Image -->
        <td class="px-4 py-3">
          <div class="flex items-center gap-3">
            ${item.image_url ? `
              <img src="${item.image_url}" alt="" class="w-10 h-10 rounded-lg object-cover border border-slate-700 shrink-0 bg-slate-950">
            ` : `
              <div class="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-base shrink-0">
                🍄
              </div>
            `}
            <div class="min-w-0 max-w-xs">
              <div class="font-bold text-slate-200 truncate" title="${item.title || 'Untitled Etsy Listing'}">
                ${item.title || 'Untitled Listing'}
              </div>
              <div class="text-[10px] text-slate-500 font-mono">ID: ${listingId}</div>
            </div>
          </div>
        </td>

        <!-- Variation / SKU -->
        <td class="px-4 py-3">
          <span class="font-mono text-amber-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 font-semibold">
            ${item.sku || 'DEFAULT-SKU'}
          </span>
        </td>

        <!-- Price -->
        <td class="px-4 py-3 text-right font-mono font-semibold text-emerald-400">
          ${item.price ? `$${Number(item.price).toFixed(2)}` : '--'}
        </td>

        <!-- Inventory Select -->
        <td class="px-4 py-3">
          <select id="sku-inv-${item.id}" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:ring-1 focus:ring-orange-500">
            ${inventoryOptionsHtml}
          </select>
        </td>

        <!-- Deduct Qty -->
        <td class="px-4 py-3 text-center">
          <input type="number" id="sku-qty-${item.id}" min="0.01" step="any" value="${deductQty}" class="w-20 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-xs text-center font-mono text-slate-100 focus:ring-1 focus:ring-orange-500">
        </td>

        <!-- Status & Actions -->
        <td class="px-4 py-3 text-center">
          <div class="flex items-center justify-center gap-2">
            <button type="button" onclick="handleSaveSkuMapping('${item.id}', '${listingId}')" class="bg-orange-600 hover:bg-orange-500 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition shadow-sm flex items-center gap-1">
              <span>💾</span> Save
            </button>
            <span id="badge-sku-${item.id}" class="${isMapped ? 'text-emerald-400 bg-emerald-950/60 border-emerald-700/60' : 'text-slate-500 bg-slate-950 border-slate-800'} text-[10px] font-bold px-2 py-1 rounded border">
              ${isMapped ? 'Mapped' : 'Unmapped'}
            </span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Saves/Upserts a single SKU mapping to public.sku_mappings
 */
export async function saveSkuMapping(mappingRowId, etsyListingId, inventoryItemId, deductQty) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    showToast('Supabase client not initialized.', 'error');
    return false;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    showToast('You must be logged in to save SKU mappings.', 'error');
    return false;
  }

  try {
    const parsedQty = parseFloat(deductQty) || 1;

    const payload = {
      id: mappingRowId,
      user_id: user.id,
      organization_id: currentOrganizationId || null,
      listing_id: etsyListingId,
      etsy_item_id: etsyListingId,
      inventory_id: inventoryItemId ? inventoryItemId : null,
      inventory_item_id: inventoryItemId ? inventoryItemId : null,
      deduct_qty: parsedQty,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('sku_mappings')
      .upsert(payload)
      .select();

    if (error) {
      throw error;
    }

    // Update in-memory cache
    const target = cachedSkuMappings.find(m => m.id === mappingRowId);
    if (target) {
      target.inventory_id = inventoryItemId || null;
      target.inventory_item_id = inventoryItemId || null;
      target.deduct_qty = parsedQty;
    }

    const badge = document.getElementById(`badge-sku-${mappingRowId}`);
    if (badge) {
      if (inventoryItemId) {
        badge.className = 'text-emerald-400 bg-emerald-950/60 border-emerald-700/60 text-[10px] font-bold px-2 py-1 rounded border';
        badge.textContent = 'Mapped';
      } else {
        badge.className = 'text-slate-500 bg-slate-950 border-slate-800 text-[10px] font-bold px-2 py-1 rounded border';
        badge.textContent = 'Unmapped';
      }
    }

    showToast('SKU Mapping Saved Successfully!', 'success');
    return true;
  } catch (err) {
    console.error('Error saving SKU mapping:', err);
    showToast(err.message || 'Failed to save SKU mapping.', 'error');
    return false;
  }
}

/**
 * UI Handler called from button
 */
export async function handleSaveSkuMapping(mappingRowId, listingId) {
  const invSelect = document.getElementById(`sku-inv-${mappingRowId}`);
  const qtyInput = document.getElementById(`sku-qty-${mappingRowId}`);

  const inventoryItemId = invSelect ? invSelect.value : '';
  const deductQty = qtyInput ? qtyInput.value : 1;

  await saveSkuMapping(mappingRowId, listingId, inventoryItemId, deductQty);
}

// Attach functions to window object for inline onclick handlers
if (typeof window !== 'undefined') {
  window.connectEtsy = connectEtsy;
  window.disconnectEtsy = disconnectEtsy;
  window.importEtsyListings = importEtsyListings;
  window.openSkuMappingModal = openSkuMappingModal;
  window.closeSkuMappingModal = closeSkuMappingModal;
  window.setSkuMappingFilter = setSkuMappingFilter;
  window.filterSkuMappingsTable = filterSkuMappingsTable;
  window.handleSaveSkuMapping = handleSaveSkuMapping;
  window.saveSkuMapping = saveSkuMapping;
}
