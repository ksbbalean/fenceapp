// H&J Fence Supply Purchasing Interface JavaScript
// Based on POS system but adapted for purchasing workflow
// Integrates with ERPNext purchasing documents

class PurchasingInterface {
    constructor() {
        // State variables
        this.selectedSupplier = null;
        this.selectedItemGroup = null;
        this.searchTerm = '';
        this.stockFilter = '';
        this.currentItems = [];
        this.purchaseCart = [];
        
        // Data caches
        this.suppliersCache = new Map();
        this.itemsCache = new Map();
        
        // Current material request
        this.currentMaterialRequest = null;
        
        // Initialize
        this.init();
    }
    
    async init() {
        console.log('Initializing Purchasing Interface...');
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadAnalytics();
        await this.loadPurchaseCart();
        await this.loadItems();
        
        // Setup auto-refresh
        this.setupAutoRefresh();
        
        console.log('Purchasing Interface initialized successfully');
    }
    
    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(() => {
                this.searchTerm = searchInput.value;
                this.loadItems();
            }, 300));
        }
        
        // Filters
        const itemGroupFilter = document.getElementById('itemGroupFilter');
        if (itemGroupFilter) {
            itemGroupFilter.addEventListener('change', () => {
                this.selectedItemGroup = itemGroupFilter.value;
                this.loadItems();
            });
        }
        
        const stockFilter = document.getElementById('stockFilter');
        if (stockFilter) {
            stockFilter.addEventListener('change', () => {
                this.stockFilter = stockFilter.value;
                this.loadItems();
            });
        }
        
        // Expected delivery date default
        const expectedDelivery = document.getElementById('expectedDelivery');
        if (expectedDelivery) {
            // Set default to 7 days from now
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 7);
            expectedDelivery.value = defaultDate.toISOString().split('T')[0];
        }
    }
    
    setupAutoRefresh() {
        // Refresh analytics every 5 minutes
        setInterval(() => {
            this.loadAnalytics();
        }, 5 * 60 * 1000);
        
        // Refresh cart every 30 seconds
        setInterval(() => {
            this.loadPurchaseCart();
        }, 30 * 1000);
    }
    
    async loadAnalytics() {
        try {
            const response = await frappe.call({
                method: 'webshop.webshop.purchasing_api.get_purchase_analytics'
            });
            
            if (response.message) {
                this.updateAnalyticsDisplay(response.message);
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
        }
    }
    
    updateAnalyticsDisplay(analytics) {
        const elements = {
            'pendingRequisitions': analytics.pending_material_requests || 0,
            'openOrders': analytics.open_purchase_orders || 0,
            'itemsToReorder': analytics.items_to_reorder || 0,
            'monthlyValue': this.formatCurrency(analytics.monthly_purchase_value || 0)
        };
        
        for (const [id, value] of Object.entries(elements)) {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        }
    }
    
    async loadItems() {
        try {
            const loadingContainer = document.getElementById('itemsContainer');
            if (loadingContainer) {
                loadingContainer.innerHTML = '<div class="loading-message">Loading items...</div>';
            }
            
            const params = {
                supplier: this.selectedSupplier,
                item_group: this.selectedItemGroup,
                search_term: this.searchTerm
            };
            
            const response = await frappe.call({
                method: 'webshop.webshop.purchasing_api.get_supplier_items',
                args: params
            });
            
            if (response.message && response.message.items) {
                this.currentItems = response.message.items;
                this.renderItems();
            }
        } catch (error) {
            console.error('Error loading items:', error);
            this.showError('Failed to load items');
        }
    }
    
    renderItems() {
        const container = document.getElementById('itemsContainer');
        if (!container) return;
        
        if (this.currentItems.length === 0) {
            container.innerHTML = '<div class="loading-message">No items found matching your criteria</div>';
            return;
        }
        
        // Filter items based on stock filter
        let filteredItems = this.currentItems;
        if (this.stockFilter === 'low_stock') {
            filteredItems = this.currentItems.filter(item => 
                item.stock_qty <= item.reorder_level && item.reorder_level > 0
            );
        } else if (this.stockFilter === 'out_of_stock') {
            filteredItems = this.currentItems.filter(item => item.stock_qty <= 0);
        }
        
        const itemsGrid = document.createElement('div');
        itemsGrid.className = 'items-grid';
        
        filteredItems.forEach(item => {
            const itemCard = this.createItemCard(item);
            itemsGrid.appendChild(itemCard);
        });
        
        container.innerHTML = '';
        container.appendChild(itemsGrid);
    }
    
    createItemCard(item) {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.onclick = () => this.showItemDetail(item);
        
        // Determine stock status
        let stockClass = 'in-stock';
        let stockText = 'In Stock';
        if (item.stock_qty <= 0) {
            stockClass = 'out-of-stock';
            stockText = 'Out of Stock';
        } else if (item.stock_qty <= item.reorder_level && item.reorder_level > 0) {
            stockClass = 'low-stock';
            stockText = 'Low Stock';
        }
        
        // Get price to display
        const price = item.supplier_price?.rate || item.last_purchase_rate || item.standard_rate || 0;
        
        card.innerHTML = `
            <div class="item-image">
                ${item.image ? 
                    `<img src="${item.image}" alt="${item.item_name}" onerror="this.style.display='none'; this.parentNode.innerHTML='<div class=\\"placeholder\\">📦</div>';">` :
                    '<div class="placeholder">📦</div>'
                }
                <div class="stock-badge ${stockClass}">${stockText}</div>
            </div>
            <div class="item-content">
                <div class="item-name">${item.item_name}</div>
                <div class="item-code">${item.item_code}</div>
                <div class="item-group">${item.item_group || ''}</div>
                <div class="item-details">
                    <div class="item-price">${this.formatCurrency(price)}</div>
                    <div class="item-stock">Stock: ${item.stock_qty}</div>
                </div>
                <div class="item-suppliers">
                    <span class="supplier-count">${item.suppliers.length}</span> supplier${item.suppliers.length !== 1 ? 's' : ''}
                </div>
                <div class="item-actions" onclick="event.stopPropagation()">
                    <button class="add-to-cart-btn" onclick="window.purchasing.quickAddToCart('${item.name}')">
                        Add to Cart
                    </button>
                    <button class="view-details-btn" onclick="window.purchasing.showItemDetail(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                        Details
                    </button>
                </div>
            </div>
        `;
        
        return card;
    }
    
    async showItemDetail(item) {
        const modal = document.getElementById('itemDetailOverlay');
        const title = document.getElementById('itemDetailTitle');
        const content = document.getElementById('itemDetailContent');
        const quantityInput = document.getElementById('itemQuantity');
        const uomSpan = document.getElementById('itemUOM');
        
        if (!modal || !title || !content) return;
        
        title.textContent = item.item_name;
        uomSpan.textContent = item.stock_uom;
        quantityInput.value = 1;
        
        // Store current item for adding to cart
        this.selectedItem = item;
        
        // Build detail content
        const suppliers = item.suppliers.map(s => 
            `<tr>
                <td>${s.supplier}</td>
                <td>${s.supplier_part_no || '-'}</td>
                <td>${s.lead_time_days} days</td>
            </tr>`
        ).join('');
        
        content.innerHTML = `
            <div class="item-detail-section">
                <h4>Item Information</h4>
                <p><strong>Code:</strong> ${item.item_code}</p>
                <p><strong>Group:</strong> ${item.item_group}</p>
                <p><strong>Description:</strong> ${item.short_description || 'No description available'}</p>
            </div>
            
            <div class="item-detail-section">
                <h4>Stock Information</h4>
                <p><strong>Current Stock:</strong> ${item.stock_qty} ${item.stock_uom}</p>
                <p><strong>Reorder Level:</strong> ${item.reorder_level} ${item.stock_uom}</p>
            </div>
            
            <div class="item-detail-section">
                <h4>Pricing</h4>
                <p><strong>Standard Rate:</strong> ${this.formatCurrency(item.standard_rate)}</p>
                <p><strong>Last Purchase Rate:</strong> ${this.formatCurrency(item.last_purchase_rate)}</p>
                ${item.supplier_price ? 
                    `<p><strong>Supplier Price:</strong> ${this.formatCurrency(item.supplier_price.rate)} (${item.supplier_price.source})</p>` :
                    ''
                }
            </div>
            
            ${suppliers ? `
            <div class="item-detail-section">
                <h4>Suppliers</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f8f9fa;">
                            <th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">Supplier</th>
                            <th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">Part No</th>
                            <th style="padding: 8px; text-align: left; border: 1px solid #dee2e6;">Lead Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${suppliers}
                    </tbody>
                </table>
            </div>
            ` : ''}
        `;
        
        modal.style.display = 'flex';
    }
    
    closeItemDetail() {
        const modal = document.getElementById('itemDetailOverlay');
        if (modal) {
            modal.style.display = 'none';
        }
        this.selectedItem = null;
    }
    
    async quickAddToCart(itemCode) {
        const item = this.currentItems.find(i => i.name === itemCode);
        if (!item) return;
        
        await this.addToCart(item, 1);
    }
    
    async addSelectedItemToCart() {
        if (!this.selectedItem) return;
        
        const quantity = parseFloat(document.getElementById('itemQuantity').value) || 1;
        await this.addToCart(this.selectedItem, quantity);
        this.closeItemDetail();
    }
    
    async addToCart(item, quantity) {
        try {
            const response = await frappe.call({
                method: 'webshop.webshop.purchasing_api.add_to_purchase_cart',
                args: {
                    item_code: item.name,
                    qty: quantity,
                    supplier: this.selectedSupplier,
                    warehouse: null // Will use default warehouse
                }
            });
            
            if (response.message && response.message.success) {
                this.showSuccess(`Added ${quantity} ${item.stock_uom} of ${item.item_name} to cart`);
                await this.loadPurchaseCart();
            } else {
                this.showError(response.message?.message || 'Failed to add item to cart');
            }
        } catch (error) {
            console.error('Error adding to cart:', error);
            this.showError('Failed to add item to cart');
        }
    }
    
    async loadPurchaseCart() {
        try {
            const response = await frappe.call({
                method: 'webshop.webshop.purchasing_api.get_purchase_cart'
            });
            
            if (response.message) {
                this.purchaseCart = response.message;
                this.renderCart();
                this.updateCartTotals();
            }
        } catch (error) {
            console.error('Error loading purchase cart:', error);
        }
    }
    
    renderCart() {
        const container = document.getElementById('cartItems');
        if (!container) return;
        
        if (!this.purchaseCart.items || this.purchaseCart.items.length === 0) {
            container.innerHTML = '<div class="empty-cart">No items in cart</div>';
            return;
        }
        
        const cartItemsHtml = this.purchaseCart.items.map(item => `
            <div class="cart-item">
                <div class="cart-item-header">
                    <div class="cart-item-name">${item.item_name}</div>
                    <button class="cart-item-remove" onclick="window.purchasing.removeCartItem('${item.name}')" title="Remove item">
                        ×
                    </button>
                </div>
                <div class="cart-item-details">
                    <span>${item.item_code}</span>
                    <span>${this.formatCurrency(item.rate)} per ${item.uom}</span>
                </div>
                ${item.supplier ? `<div class="cart-item-supplier">Supplier: ${item.supplier}</div>` : ''}
                <div class="cart-item-controls">
                    <div class="quantity-controls">
                        <button class="qty-btn" onclick="window.purchasing.updateCartItemQty('${item.name}', ${item.qty - 1})">-</button>
                        <input type="number" class="qty-input" value="${item.qty}" min="1" 
                               onchange="window.purchasing.updateCartItemQty('${item.name}', this.value)">
                        <span>${item.uom}</span>
                        <button class="qty-btn" onclick="window.purchasing.updateCartItemQty('${item.name}', ${item.qty + 1})">+</button>
                    </div>
                    <div class="cart-item-amount">${this.formatCurrency(item.amount)}</div>
                </div>
            </div>
        `).join('');
        
        container.innerHTML = cartItemsHtml;
        
        // Update material request info
        const materialRequestInfo = document.getElementById('requisitionName');
        if (materialRequestInfo) {
            materialRequestInfo.textContent = this.purchaseCart.material_request_name || 'Draft Material Request';
        }
    }
    
    updateCartTotals() {
        const totalItems = document.getElementById('totalItems');
        const totalQty = document.getElementById('totalQty');
        const grandTotal = document.getElementById('grandTotal');
        
        if (totalItems) totalItems.textContent = this.purchaseCart.items?.length || 0;
        if (totalQty) totalQty.textContent = this.purchaseCart.total_qty || 0;
        if (grandTotal) grandTotal.textContent = this.formatCurrency(this.purchaseCart.total_amount || 0);
    }
    
    async updateCartItemQty(itemRowName, newQty) {
        newQty = parseFloat(newQty);
        if (newQty <= 0) {
            return this.removeCartItem(itemRowName);
        }
        
        try {
            const response = await frappe.call({
                method: 'webshop.webshop.purchasing_api.update_cart_item_qty',
                args: {
                    item_row_name: itemRowName,
                    new_qty: newQty
                }
            });
            
            if (response.message?.success) {
                await this.loadPurchaseCart();
            } else {
                this.showError(response.message?.message || 'Failed to update quantity');
            }
        } catch (error) {
            console.error('Error updating cart item quantity:', error);
            this.showError('Failed to update quantity');
        }
    }
    
    async removeCartItem(itemRowName) {
        try {
            const response = await frappe.call({
                method: 'webshop.webshop.purchasing_api.remove_cart_item',
                args: {
                    item_row_name: itemRowName
                }
            });
            
            if (response.message?.success) {
                await this.loadPurchaseCart();
                this.showSuccess('Item removed from cart');
            } else {
                this.showError(response.message?.message || 'Failed to remove item');
            }
        } catch (error) {
            console.error('Error removing cart item:', error);
            this.showError('Failed to remove item');
        }
    }
    
    async submitRequisition() {
        if (!this.purchaseCart.items || this.purchaseCart.items.length === 0) {
            this.showError('Cannot submit empty material request');
            return;
        }
        
        if (!confirm('Submit material request for approval?')) {
            return;
        }
        
        try {
            const response = await frappe.call({
                method: 'webshop.webshop.purchasing_api.submit_material_request',
                args: {
                    material_request_name: this.purchaseCart.material_request_name
                }
            });
            
            if (response.message?.success) {
                this.showSuccess('Material request submitted successfully');
                await this.loadPurchaseCart();
                await this.loadAnalytics();
                
                // Show create PO button if applicable
                const createPOBtn = document.getElementById('createPOBtn');
                if (createPOBtn) {
                    createPOBtn.style.display = 'block';
                }
            } else {
                this.showError(response.message?.message || 'Failed to submit material request');
            }
        } catch (error) {
            console.error('Error submitting material request:', error);
            this.showError('Failed to submit material request');
        }
    }
    
    async createPurchaseOrder() {
        if (!this.purchaseCart.material_request_name) {
            this.showError('No material request available for purchase order creation');
            return;
        }
        
        try {
            const response = await frappe.call({
                method: 'webshop.webshop.purchasing_api.create_purchase_order_from_material_request',
                args: {
                    material_request_name: this.purchaseCart.material_request_name
                }
            });
            
            if (response.message?.success) {
                this.showSuccess(`Purchase order ${response.message.purchase_order_name} created successfully`);
                await this.loadAnalytics();
                
                // Open purchase order in ERPNext
                if (response.message.purchase_order_name) {
                    window.open(`/app/purchase-order/${response.message.purchase_order_name}`, '_blank');
                }
            } else {
                this.showError(response.message?.message || 'Failed to create purchase order');
            }
        } catch (error) {
            console.error('Error creating purchase order:', error);
            this.showError('Failed to create purchase order');
        }
    }
    
    async saveDraft() {
        if (!this.purchaseCart.items || this.purchaseCart.items.length === 0) {
            this.showError('No items to save');
            return;
        }
        
        this.showSuccess('Draft requisition saved automatically');
    }
    
    async clearCart() {
        if (!confirm('Clear all items from cart?')) {
            return;
        }
        
        try {
            // Remove all items one by one
            if (this.purchaseCart.items) {
                for (const item of this.purchaseCart.items) {
                    await frappe.call({
                        method: 'webshop.webshop.purchasing_api.remove_cart_item',
                        args: {
                            item_row_name: item.name
                        }
                    });
                }
            }
            
            await this.loadPurchaseCart();
            this.showSuccess('Cart cleared');
        } catch (error) {
            console.error('Error clearing cart:', error);
            this.showError('Failed to clear cart');
        }
    }
    
    async selectSupplier(supplierName) {
        this.selectedSupplier = supplierName;
        
        // Update UI
        const currentSupplier = document.getElementById('currentSupplier');
        const supplierDetails = document.getElementById('supplierDetails');
        
        if (currentSupplier && supplierDetails) {
            if (supplierName) {
                // Get supplier details
                try {
                    const suppliers = await this.getSuppliers();
                    const supplier = suppliers.find(s => s.name === supplierName);
                    
                    currentSupplier.textContent = supplier?.supplier_name || supplierName;
                    supplierDetails.textContent = `${supplier?.supplier_group || ''} ${supplier?.country ? '• ' + supplier.country : ''}`.trim();
                } catch (error) {
                    currentSupplier.textContent = supplierName;
                    supplierDetails.textContent = '';
                }
            } else {
                currentSupplier.textContent = 'All Suppliers';
                supplierDetails.textContent = 'Browse products from all suppliers';
            }
        }
        
        // Update supplier buttons
        document.querySelectorAll('.supplier-btn').forEach(btn => {
            btn.classList.remove('selected');
            if (btn.dataset.supplier === supplierName) {
                btn.classList.add('selected');
            }
        });
        
        // Reload items
        await this.loadItems();
    }
    
    clearSupplier() {
        this.selectSupplier(null);
    }
    
    async openSupplierSearch() {
        const modal = document.getElementById('supplierSearchOverlay');
        const input = document.getElementById('supplierSearchInput');
        const list = document.getElementById('supplierList');
        
        if (!modal || !input || !list) return;
        
        // Load suppliers
        const suppliers = await this.getSuppliers();
        this.renderSupplierList(suppliers);
        
        input.value = '';
        input.addEventListener('input', debounce(async () => {
            if (input.value.length >= 2) {
                const searchResults = await this.searchSuppliers(input.value);
                this.renderSupplierList(searchResults);
            } else {
                this.renderSupplierList(suppliers);
            }
        }, 300));
        
        modal.style.display = 'flex';
        input.focus();
    }
    
    closeSupplierSearch() {
        const modal = document.getElementById('supplierSearchOverlay');
        if (modal) {
            modal.style.display = 'none';
        }
    }
    
    renderSupplierList(suppliers) {
        const list = document.getElementById('supplierList');
        if (!list) return;
        
        if (suppliers.length === 0) {
            list.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">No suppliers found</div>';
            return;
        }
        
        list.innerHTML = suppliers.map(supplier => `
            <div class="supplier-list-item" onclick="window.purchasing.selectSupplierFromModal('${supplier.name}')">
                <div style="font-weight: 500;">${supplier.supplier_name}</div>
                <div style="font-size: 12px; color: #6c757d;">${supplier.supplier_group || ''} ${supplier.country ? '• ' + supplier.country : ''}</div>
            </div>
        `).join('');
    }
    
    selectSupplierFromModal(supplierName) {
        this.selectSupplier(supplierName);
        this.closeSupplierSearch();
    }
    
    async getSuppliers() {
        try {
            const response = await frappe.call({
                method: 'webshop.webshop.purchasing_api.get_suppliers'
            });
            return response.message || [];
        } catch (error) {
            console.error('Error getting suppliers:', error);
            return [];
        }
    }
    
    async searchSuppliers(searchTerm) {
        try {
            const response = await frappe.call({
                method: 'webshop.webshop.purchasing_api.search_suppliers',
                args: { search_term: searchTerm }
            });
            return response.message || [];
        } catch (error) {
            console.error('Error searching suppliers:', error);
            return [];
        }
    }
    
    async showReorderItems() {
        try {
            const response = await frappe.call({
                method: 'webshop.webshop.purchasing_api.get_items_below_reorder_level'
            });
            
            if (response.message) {
                this.currentItems = response.message.map(item => ({
                    name: item.name,
                    item_name: item.item_name,
                    item_code: item.item_code,
                    item_group: item.item_group,
                    stock_qty: item.actual_qty,
                    reorder_level: item.warehouse_reorder_level,
                    stock_uom: 'Nos', // Default UOM
                    suppliers: [],
                    standard_rate: 0,
                    last_purchase_rate: 0
                }));
                
                // Show reorder view
                document.getElementById('itemsView').style.display = 'none';
                document.getElementById('reorderView').style.display = 'block';
                
                this.renderReorderItems();
            }
        } catch (error) {
            console.error('Error loading reorder items:', error);
            this.showError('Failed to load items to reorder');
        }
    }
    
    renderReorderItems() {
        const container = document.getElementById('reorderContainer');
        if (!container) return;
        
        if (this.currentItems.length === 0) {
            container.innerHTML = '<div class="loading-message">No items below reorder level</div>';
            return;
        }
        
        const itemsGrid = document.createElement('div');
        itemsGrid.className = 'items-grid';
        
        this.currentItems.forEach(item => {
            const shortageQty = item.reorder_level - item.stock_qty;
            const itemCard = document.createElement('div');
            itemCard.className = 'item-card';
            
            itemCard.innerHTML = `
                <div class="item-image">
                    <div class="placeholder">⚠️</div>
                    <div class="stock-badge out-of-stock">Reorder: ${shortageQty}</div>
                </div>
                <div class="item-content">
                    <div class="item-name">${item.item_name}</div>
                    <div class="item-code">${item.item_code}</div>
                    <div class="item-group">${item.item_group}</div>
                    <div class="item-details">
                        <div class="item-stock">Current: ${item.stock_qty}</div>
                        <div class="item-stock">Reorder: ${item.reorder_level}</div>
                    </div>
                    <div class="item-actions">
                        <button class="add-to-cart-btn" onclick="window.purchasing.quickAddToCart('${item.name}')">
                            Add ${shortageQty} to Cart
                        </button>
                    </div>
                </div>
            `;
            
            itemsGrid.appendChild(itemCard);
        });
        
        container.innerHTML = '';
        container.appendChild(itemsGrid);
    }
    
    showAllSuppliers() {
        // Reset view to show all items
        document.getElementById('reorderView').style.display = 'none';
        document.getElementById('itemsView').style.display = 'block';
        
        this.clearSupplier();
    }
    
    async showPendingRequisitions() {
        // Open ERPNext Material Request list
        window.open('/app/material-request?docstatus=1', '_blank');
    }
    
    // Utility functions
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount || 0);
    }
    
    showSuccess(message) {
        frappe.show_alert({
            message: message,
            indicator: 'green'
        });
    }
    
    showError(message) {
        frappe.show_alert({
            message: message,
            indicator: 'red'
        });
    }
}

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Global functions for onclick handlers
window.selectSupplier = (supplierName) => window.purchasing?.selectSupplier(supplierName);
window.clearSupplier = () => window.purchasing?.clearSupplier();
window.openSupplierSearch = () => window.purchasing?.openSupplierSearch();
window.closeSupplierSearch = () => window.purchasing?.closeSupplierSearch();
window.showReorderItems = () => window.purchasing?.showReorderItems();
window.showAllSuppliers = () => window.purchasing?.showAllSuppliers();
window.showPendingRequisitions = () => window.purchasing?.showPendingRequisitions();
window.applyFilters = () => window.purchasing?.loadItems();
window.submitRequisition = () => window.purchasing?.submitRequisition();
window.createPurchaseOrder = () => window.purchasing?.createPurchaseOrder();
window.saveDraft = () => window.purchasing?.saveDraft();
window.clearCart = () => window.purchasing?.clearCart();
window.closeItemDetail = () => window.purchasing?.closeItemDetail();
window.addSelectedItemToCart = () => window.purchasing?.addSelectedItemToCart();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.purchasing = new PurchasingInterface();
});

