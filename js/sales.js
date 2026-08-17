// Sierra Myco Lab - Sales & Customers Module

import { db, saveItems, currentOrganizationId } from './db.js';

// --- Customer CRUD Operations ---

export function fetchCustomers() {
  return db.customers || [];
}

export function createCustomer(customerData) {
  const newCustomer = {
    id: generateId(),
    organizationId: currentOrganizationId,
    ...customerData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
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
    organizationId: currentOrganizationId,
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
export function populateCustomerPicker(selectElement, selectedId = null) {
  if (!selectElement) return; // Add this null check
  const customers = fetchCustomers();
  
  let html = '<option value="">Select Customer...</option>';
  customers.forEach(customer => {
    html += `<option value="${customer.id}" ${selectedId === customer.id ? 'selected' : ''}>
      ${customer.name}${customer.company ? ` (${customer.company})` : ''}
    </option>`;
  });
  
  selectElement.innerHTML = html;
}

// Helper function to generate unique IDs
function generateId() {
  return Math.random().toString(36).substring(2, 9);
}