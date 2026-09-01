// Sierra Myco Lab - Sales & Customers Module

import { db, saveItems, currentOrganizationId, getSupabaseClient } from './db.js';

// --- Customer CRUD Operations ---

export async function fetchCustomers() {
  const supabase = getSupabaseClient();
  if (supabase && currentOrganizationId) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('organization_id', currentOrganizationId)
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error fetching customers:', error);
      return db.customers || [];
    }
    
    // Update local cache
    db.customers = data || [];
    return data || [];
  }
  
  // Fallback for local-only mode
  const customers = db.customers || [];
  if (currentOrganizationId) {
    return customers.filter(c => c.organization_id === currentOrganizationId);
  }
  return customers;
}

export async function createCustomer(customerData) {
  const newCustomer = {
    id: crypto.randomUUID ? crypto.randomUUID() : generateId(),
    organization_id: currentOrganizationId,
    first_name: customerData.firstName,
    last_name: customerData.lastName,
    company: customerData.company,
    email: customerData.email,
    phone: customerData.phone,
    type: customerData.type,
    shipping_address: customerData.shippingAddress,
    billing_address: customerData.billingAddress,
    notes: customerData.notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  const supabase = getSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('customers').insert([newCustomer]).select();
    if (error) {
      console.error('Error inserting customer:', error);
      throw error;
    }
    if (data && data.length > 0) {
      db.customers = db.customers || [];
      db.customers.push(data[0]);
      saveItems();
      return data[0];
    }
  }
  
  // Fallback for local-only mode
  db.customers = db.customers || [];
  db.customers.push(newCustomer);
  saveItems();
  return newCustomer;
}

export function updateCustomer(id, updates) {
  const customer = db.customers.find(c => c.id === id);
  if (!customer) return null;
  
  Object.assign(customer, updates, { updatedAt: new Date().toISOString() });
  saveItems();
  return customer;
}

export function deleteCustomer(id) {
  db.customers = (db.customers || []).filter(c => c.id !== id);
  saveItems();
  return true;
}

// --- Sales Order CRUD Operations ---

export async function fetchOrders() {
  const supabase = getSupabaseClient();
  if (supabase && currentOrganizationId) {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('organization_id', currentOrganizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching orders:', error);
      return db.orders || [];
    }

    db.orders = data || [];
    return data || [];
  }

  const orders = db.orders || [];
  if (currentOrganizationId) {
    return orders.filter(o => o.organization_id === currentOrganizationId);
  }
  return orders;
}

/**
 * Create a payment payload for Square API including the platform revenue split (1% application fee).
 * @param {number} orderTotalCents - Total order amount in cents
 * @param {string} sourceId - Payment source (nonce, token, or cash/external)
 * @param {string} currency - Currency code (default 'USD')
 * @returns {object} Square Payment API payload
 */
export function buildSquarePaymentPayload(orderTotalCents, sourceId, currency = 'USD') {
  return {
    source_id: sourceId,
    idempotency_key: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
    amount_money: {
      amount: orderTotalCents,
      currency: currency
    },
    app_fee_money: {
      amount: Math.round(orderTotalCents * 0.01),
      currency: currency
    }
  };
}

export async function createOrder(orderData) {
  const newOrder = {
    id: crypto.randomUUID ? crypto.randomUUID() : generateId(),
    organization_id: currentOrganizationId,
    customer_id: orderData.customerId || orderData.customer_id || null,
    order_date: orderData.orderDate || orderData.order_date || new Date().toISOString().split('T')[0],
    status: orderData.status || 'pending',
    payment_status: orderData.paymentStatus || orderData.payment_status || 'unpaid',
    payment_method: orderData.paymentMethod || orderData.payment_method || 'Cash',
    tax_rate: Number(orderData.taxRate || orderData.tax_rate || 0),
    discount: Number(orderData.discount || 0),
    notes: orderData.notes || '',
    line_items: orderData.lineItems || orderData.line_items || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const squarePaymentId = orderData.squarePaymentId || orderData.square_payment_id;
  if (squarePaymentId) {
    newOrder.square_payment_id = squarePaymentId;
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    // Clone payload for insertion and sanitize undefined/null keys
    const insertPayload = { ...newOrder };
    if (!insertPayload.square_payment_id) {
      delete insertPayload.square_payment_id;
    }

    let { data, error } = await supabase.from('orders').insert([insertPayload]).select();

    // Fallback retry if square_payment_id is not yet in the Supabase schema cache (PGRST204)
    if (error && (error.code === 'PGRST204' || (error.message && error.message.includes('square_payment_id')))) {
      console.warn('square_payment_id column not found in schema cache, retrying insert without column...');
      const fallbackPayload = { ...insertPayload };
      delete fallbackPayload.square_payment_id;
      const retryResult = await supabase.from('orders').insert([fallbackPayload]).select();
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      console.error('Error inserting order into Supabase:', error);
      // Fallback to local storage if remote fails
    } else if (data && data.length > 0) {
      db.orders = db.orders || [];
      db.orders.unshift(data[0]);
      saveItems();
      return data[0];
    }
  }

  db.orders = db.orders || [];
  db.orders.unshift(newOrder);
  saveItems();
  return newOrder;
}

export async function updateOrder(id, updates) {
  const supabase = getSupabaseClient();
  const updatePayload = {
    ...updates,
    updated_at: new Date().toISOString()
  };

  if (updatePayload.square_payment_id === undefined || updatePayload.square_payment_id === null) {
    delete updatePayload.square_payment_id;
  }

  if (supabase) {
    let { data, error } = await supabase.from('orders').update(updatePayload).eq('id', id).select();

    // Fallback retry if square_payment_id is missing from schema cache
    if (error && (error.code === 'PGRST204' || (error.message && error.message.includes('square_payment_id')))) {
      console.warn('square_payment_id column not found during update, retrying without column...');
      const fallbackPayload = { ...updatePayload };
      delete fallbackPayload.square_payment_id;
      const retryResult = await supabase.from('orders').update(fallbackPayload).eq('id', id).select();
      data = retryResult.data;
      error = retryResult.error;
    }

    if (!error && data && data.length > 0) {
      const idx = (db.orders || []).findIndex(o => o.id === id);
      if (idx !== -1) db.orders[idx] = data[0];
      saveItems();
      return data[0];
    }
  }

  const order = (db.orders || []).find(o => o.id === id);
  if (!order) return null;
  Object.assign(order, updatePayload);
  saveItems();
  return order;
}

export async function deleteOrder(id) {
  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from('orders').delete().eq('id', id);
  }
  db.orders = (db.orders || []).filter(o => o.id !== id);
  saveItems();
  return true;
}

// --- Customer Picker for Order Modal ---
export async function populateCustomerPicker(selectElement, selectedId = null) {
  if (!selectElement) return;
  const customers = await fetchCustomers();
  
  let html = '<option value="">Select Customer...</option>';
  customers.forEach(customer => {
    const name = customer.first_name ? `${customer.first_name} ${customer.last_name || ''}` : (customer.firstName ? `${customer.firstName} ${customer.lastName || ''}` : customer.name || 'Unknown');
    html += `<option value="${customer.id}" ${selectedId === customer.id ? 'selected' : ''}>
      ${name}${customer.company ? ` (${customer.company})` : ''}
    </option>`;
  });
  
  selectElement.innerHTML = html;
}

// Helper function to generate unique IDs
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// --- UI Interaction Functions ---

export function switchSalesTab(tab) {
  const customersTab = document.getElementById('customers-tab');
  const ordersTab = document.getElementById('orders-tab');
  const customersBtn = document.querySelector('button[onclick="switchSalesTab(\'customers\')"]');
  const ordersBtn = document.querySelector('button[onclick="switchSalesTab(\'orders\')"]');

  if (!customersTab || !ordersTab || !customersBtn || !ordersBtn) return;

  if (tab === 'customers') {
    customersTab.classList.remove('hidden');
    ordersTab.classList.add('hidden');
    customersBtn.classList.add('border-emerald-500', 'text-emerald-400');
    customersBtn.classList.remove('border-transparent', 'text-slate-400');
    ordersBtn.classList.add('border-transparent', 'text-slate-400');
    ordersBtn.classList.remove('border-emerald-500', 'text-emerald-400');
  } else {
    ordersTab.classList.remove('hidden');
    customersTab.classList.add('hidden');
    ordersBtn.classList.add('border-emerald-500', 'text-emerald-400');
    ordersBtn.classList.remove('border-transparent', 'text-slate-400');
    customersBtn.classList.add('border-transparent', 'text-slate-400');
    customersBtn.classList.remove('border-emerald-500', 'text-emerald-400');
  }
}

export function openAddCustomerModal() {
  const modal = document.getElementById('add-customer-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

export function closeAddCustomerModal() {
  const modal = document.getElementById('add-customer-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

export async function renderCustomers() {
  const list = document.getElementById('customers-list') || document.getElementById('customer-list');
  if (!list) return;
  
  const customers = await fetchCustomers();
  if (customers.length === 0) {
    list.innerHTML = '<div class="col-span-full text-center text-slate-500 py-8">No customers found. Add one to get started.</div>';
    return;
  }

  // Ensure customer list container has responsive grid classes
  list.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full";
  
  const escapeHtml = (unsafe) => {
    const div = document.createElement('div');
    div.textContent = (unsafe || '').toString();
    return div.innerHTML;
  };

  list.innerHTML = customers.map(c => {
    const firstName = c.first_name || c.firstName || '';
    const lastName = c.last_name || c.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim() || 'Unnamed Customer';
    const company = c.company || '';
    const email = c.email || '';
    const phone = c.phone || '';
    const type = (c.type || 'Retail').toUpperCase();

    return `
      <div class="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col justify-between shadow-sm hover:border-slate-600 transition overflow-hidden">
        <div class="overflow-hidden">
          <div class="flex justify-between items-start gap-2 mb-2">
            <h4 class="font-bold text-slate-100 truncate text-sm" title="${escapeHtml(fullName)}">${escapeHtml(fullName)}</h4>
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 uppercase tracking-wider">${escapeHtml(type)}</span>
          </div>
          ${company ? `<p class="text-xs text-slate-400 mb-1 truncate break-words" title="${escapeHtml(company)}">🏢 ${escapeHtml(company)}</p>` : ''}
          ${email ? `<p class="text-xs text-slate-300 mb-1 truncate break-words" title="${escapeHtml(email)}">📧 ${escapeHtml(email)}</p>` : ''}
          ${phone ? `<p class="text-xs text-slate-300 mb-3 truncate break-words" title="${escapeHtml(phone)}">📱 ${escapeHtml(phone)}</p>` : ''}
          ${!company && !email && !phone ? `<p class="text-xs text-slate-500 italic mb-3">No contact details</p>` : ''}
        </div>
        <div class="flex gap-2 pt-2.5 border-t border-slate-700/50 mt-2">
          <button onclick="if(typeof openRecordSaleModal==='function'){openRecordSaleModal('${c.id}');}else if(typeof openCreateOrderModal==='function'){openCreateOrderModal('${c.id}');}" class="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-2.5 py-1 rounded transition flex items-center gap-1">+ New Order</button>
        </div>
      </div>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const addCustomerForm = document.getElementById('add-customer-form');
  if (addCustomerForm) {
    addCustomerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const customerData = {
        firstName: document.getElementById('customer-first-name').value,
        lastName: document.getElementById('customer-last-name').value,
        company: document.getElementById('customer-company').value,
        email: document.getElementById('customer-email').value,
        phone: document.getElementById('customer-phone').value,
        type: document.getElementById('customer-type').value,
        shippingAddress: document.getElementById('customer-shipping-address').value,
        billingAddress: document.getElementById('customer-billing-address').value,
        notes: document.getElementById('customer-notes').value
      };
      
      try {
        await createCustomer(customerData);
        closeAddCustomerModal();
        addCustomerForm.reset();
        renderCustomers();
        
        if (typeof showToast === 'function') {
          showToast('Customer added successfully', 'success');
        }
      } catch (err) {
        if (typeof showToast === 'function') {
          showToast('Error saving customer: ' + err.message, 'error');
        } else {
          alert('Error saving customer: ' + err.message);
        }
      }
    });
  }
  
  // Initial render
  renderCustomers();
});

// Attach to global window object for inline HTML onclick handlers
window.switchSalesTab = switchSalesTab;
window.openAddCustomerModal = openAddCustomerModal;
window.closeAddCustomerModal = closeAddCustomerModal;
window.renderCustomers = renderCustomers;
