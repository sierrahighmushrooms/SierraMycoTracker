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

export function createOrder(orderData) {
  const newOrder = {
    id: generateId(),
    organization_id: currentOrganizationId,
    ...orderData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  db.orders = db.orders || [];
  db.orders.push(newOrder);
  saveItems();
  return newOrder;
}

export function updateOrder(id, updates) {
  const order = db.orders.find(o => o.id === id);
  if (!order) return null;
  
  Object.assign(order, updates, { updatedAt: new Date().toISOString() });
  saveItems();
  return order;
}

export function deleteOrder(id) {
  db.orders = (db.orders || []).filter(o => o.id !== id);
  saveItems();
  return true;
}

// --- Customer Picker for Order Modal ---
export async function populateCustomerPicker(selectElement, selectedId = null) {
  if (!selectElement) return; // Add this null check
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
  const list = document.getElementById('customers-list');
  if (!list) return;
  
  const customers = await fetchCustomers();
  if (customers.length === 0) {
    list.innerHTML = '<div class="col-span-full text-center text-slate-500 py-8">No customers found. Add one to get started.</div>';
    return;
  }
  
  list.innerHTML = customers.map(c => `
    <div class="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-2">
      <div class="flex justify-between items-start">
        <div>
          <h3 class="font-bold text-emerald-400">${c.first_name || c.firstName} ${c.last_name || c.lastName}</h3>
          ${c.company ? `<p class="text-xs text-slate-400">${c.company}</p>` : ''}
        </div>
        <span class="text-[10px] uppercase tracking-wider bg-slate-900 px-2 py-1 rounded text-slate-300 border border-slate-700">${c.type || 'Retail'}</span>
      </div>
      <div class="text-xs text-slate-300 space-y-1 pt-2 border-t border-slate-700/50">
        ${c.email ? `<p>📧 ${c.email}</p>` : ''}
        ${c.phone ? `<p>📱 ${c.phone}</p>` : ''}
      </div>
    </div>
  `).join('');
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
