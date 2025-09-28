// H&J Fence Supply POS System JavaScript
// Integrates with existing webshop infrastructure

class FencePOS {
    constructor() {
        // State variables
        this.currentLanguage = 'en';
        this.currentView = 'category';
        this.selectedCategory = null;
        this.selectedStyle = null;
        this.selectedHeight = null;
        this.selectedColor = null;
        this.selectedRailType = null;
        this.selectedLatticeType = null;
        this.selectedOrientation = null;
        this.selectedPicketType = null;
        this.currentPriceList = null; // Will be set when user selects a price list
        this.selectedCustomer = null;
        this.searchTerm = '';
        this.isBundlesMode = false;
        this.isTemplatesMode = false;
        
        // Order options state
        this.orderType = 'quote';
        this.fulfillmentMethod = null;
        this.scheduleType = null;
        this.selectedDate = null;
        this.selectedTime = null;
        this.currentCalendarDate = new Date();
        
        // Product data cache
        this.productCache = new Map();
        this.customerCache = new Map();
        
        // Simple style-to-filters mapping as requested
        this.styleFilters = {
            'Solid': ['Height', 'Color', 'Rail Type'],
            'Lattice': ['Height', 'Color', 'Rail Type', 'Lattice Type'], // Default for mixed classes
            'Open Spindle Top': ['Height', 'Color', 'Rail Type', 'Orientation'],
            'Closed Spindle Top': ['Height', 'Color', 'Rail Type', 'Orientation'],
            '3"  Open Picket': ['Height', 'Color', 'Orientation'],
            '1.5" Open Picket': ['Height', 'Color', 'Orientation'],
            'Picket': ['Height', 'Color', 'Picket Type'],
            'Ranch Rail': ['Height', 'Color']
        };
        
        // Special case: Lattice style has class-specific filters
        this.latticeClassFilters = {
            'Panel': ['Height', 'Color', 'Lattice Type', 'Rail Type'],
            'Panels': ['Height', 'Color', 'Lattice Type', 'Rail Type'],
            'Gate': ['Height', 'Color'],
            'Gates': ['Height', 'Color'],
            'Post': ['Height', 'Color', 'Rail Type'],
            'Posts': ['Height', 'Color', 'Rail Type']
        };
        
        // Initialize
        this.init();
    }
    
    sortCategoriesByPriority(categories) {
        // Define the exact priority order - panels, rail, posts, gates, hardware, caps
        const priorityOrder = {
            'Panel': 1, 'Panels': 1,
            'Rail': 2, 'Rails': 2,
            'Post': 3, 'Posts': 3, 
            'Gate': 4, 'Gates': 4,
            'Hardware': 5,
            'Cap': 6, 'Caps': 6
        };
        
        const getPriority = (category) => {
            const name = category.name || '';
            const materialTypeName = category.material_type_name || '';
            
            // Check exact matches
            if (priorityOrder[name] !== undefined) {
                return priorityOrder[name];
            }
            if (priorityOrder[materialTypeName] !== undefined) {
                return priorityOrder[materialTypeName];
            }
            
            // Keep original order for unmatched items
            return 999;
        };
        
        // Sort by priority, then by name alphabetically
        return categories.sort((a, b) => {
            const priorityA = getPriority(a);
            const priorityB = getPriority(b);
            
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
            
            return (a.name || '').localeCompare(b.name || '');
        });
    }
    
    getItemFallbackIcon(itemName, isBundleItem) {
        if (isBundleItem) {
            return '📦';
        }
        
        const nameLower = itemName.toLowerCase();
        
        // Check for item type based on name patterns
        if (nameLower.includes('panel')) return '🪟';
        if (nameLower.includes('rail')) return '━';
        if (nameLower.includes('post')) return '📏';
        if (nameLower.includes('gate')) return '🚪';
        if (nameLower.includes('hardware')) return '🔧';
        if (nameLower.includes('cap')) return '🎩';
        if (nameLower.includes('screw') || nameLower.includes('bolt') || nameLower.includes('nut')) return '🔩';
        if (nameLower.includes('bracket')) return '⚙️';
        if (nameLower.includes('hinge')) return '🔗';
        
        // Default fallback
        return '📦';
    }
    
    async init() {
        console.log('Initializing Fence POS System...');
        
        // Clear cart on session start
        await this.clearCartOnSessionStart();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadInitialData();
        
        // Set default category selection - use first available category
        if (this.categories && this.categories.length > 0) {
            this.selectCategory(this.categories[0].name);
        }
        
        // Update checkout button
        this.updateCheckoutButton();
        
        // Verify all buttons are working
        this.verifyButtonFunctionality();
        
        console.log('Fence POS System initialized successfully');
    }
    
    setupEventListeners() {
        // Search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.handleSearch();
            });
            
            // Add clear search functionality
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.clearSearch();
                }
            });
        }
        
        // Customer search
        const customerSearchInput = document.getElementById('customerSearchInput');
        if (customerSearchInput) {
            customerSearchInput.addEventListener('input', (e) => {
                this.searchCustomers(e.target.value);
            });
        }
        
        // Close modals on overlay click
        document.addEventListener('click', (e) => {
            if (e.target.id === 'customerSearchOverlay') {
                this.closeCustomerSearch();
            }
        });
        
        // Product card event delegation
        document.addEventListener('click', (e) => {
            // Product card buttons
            if (e.target.classList.contains('plus-btn') || e.target.classList.contains('minus-btn')) {
                const itemCard = e.target.closest('.item-card');
                if (itemCard) {
                    const itemId = itemCard.dataset.itemId;
                    const itemName = itemCard.dataset.itemName;
                    const price = parseFloat(itemCard.dataset.price);
                    
                    // Get current quantity from the input field
                    const qtyInput = itemCard.querySelector('.item-qty-input');
                    const currentQty = parseInt(qtyInput.value) || 0;
                    
                    // Calculate target quantity (absolute, not delta)
                    const isPlus = e.target.classList.contains('plus-btn');
                    const targetQty = isPlus ? currentQty + 1 : Math.max(0, currentQty - 1);
                    
                    this.updateItemQuantity(itemId, targetQty, itemName, price);
                }
            } 
            // Product card quantity input modal
            else if (e.target.classList.contains('item-qty-input')) {
                const itemCard = e.target.closest('.item-card');
                if (itemCard) {
                    const itemId = itemCard.dataset.itemId;
                    const itemName = itemCard.dataset.itemName;
                    const price = parseFloat(itemCard.dataset.price);
                    
                    this.openQuantityModal(itemId, itemName, price);
                }
            }
            // Cart item quantity buttons
            else if (e.target.classList.contains('cart-plus-btn') || e.target.classList.contains('cart-minus-btn')) {
                console.log('🖱️ Cart quantity button clicked');
                const cartItem = e.target.closest('.cart-item');
                console.log('📦 Cart item element:', cartItem);
                
                if (cartItem) {
                    const itemCode = cartItem.dataset.itemCode;
                    const delta = e.target.classList.contains('cart-plus-btn') ? 1 : -1;
                    console.log(`🔢 Item code: ${itemCode}, Delta: ${delta}`);
                    
                    this.updateCartItemQuantity(itemCode, delta);
                } else {
                    console.error('❌ Could not find cart item element');
                }
            }
            // Cart item delete buttons (handled via onclick attribute)
            else if (e.target.classList.contains('cart-delete-btn')) {
                console.log('🗑️ Cart delete button clicked');
                // Already handled via onclick attribute in HTML
            }
        });
    }
    
    async loadInitialData() {
        try {
            // Load price lists
            await this.loadPriceLists();
            
            // Load customer groups
            await this.loadCustomerGroups();
            
            // Load categories (item groups)
            await this.loadCategories();
            
            // Set price list dropdown to default Standard Selling
            this.updatePriceListDropdown();
            
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showError('Failed to load initial data');
        }
    }
    
    async loadPriceLists() {
        try {
            const response = await frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Price List',
                    filters: { enabled: 1 },
                    fields: ['name', 'price_list_name', 'currency']
                }
            });
            
            this.priceLists = response.message || [];
            console.log('Loaded price lists:', this.priceLists);
            console.log('🔥 ACTUAL PRICE LIST NAMES:', this.priceLists.map(pl => pl.name));
            console.log('🔥 PRICE LIST DETAILS:', this.priceLists);
            
            // Populate the price list dropdown with real data
            this.populatePriceListDropdown();
            this.populateCustomerFormPriceList();
            
        } catch (error) {
            console.error('Error loading price lists:', error);
            this.priceLists = [{ name: 'Standard Selling', price_list_name: 'Standard Selling', currency: 'USD' }];
            this.populatePriceListDropdown();
            this.populateCustomerFormPriceList();
        }
    }
    
    populatePriceListDropdown() {
        const priceListSelector = document.getElementById('priceListSelector');
        if (!priceListSelector) return;
        
        // Clear existing options
        priceListSelector.innerHTML = '';
        
        // Add options from actual price lists
        this.priceLists.forEach(priceList => {
            const option = document.createElement('option');
            option.value = priceList.name;
            option.textContent = priceList.price_list_name || priceList.name;
            
            // Select the current price list
            if (priceList.name === this.currentPriceList) {
                option.selected = true;
            }
            
            priceListSelector.appendChild(option);
        });
        
        console.log(`✅ Price list dropdown populated with ${this.priceLists.length} options`);
    }
    
    populateCustomerFormPriceList() {
        const customerFormPriceList = document.getElementById('newCustomerPriceList');
        if (!customerFormPriceList) return;
        
        // Clear existing options
        customerFormPriceList.innerHTML = '';
        
        // Add options from actual price lists
        this.priceLists.forEach(priceList => {
            const option = document.createElement('option');
            option.value = priceList.name;
            option.textContent = priceList.price_list_name || priceList.name;
            
            // Select Standard Selling as default
            if (priceList.name === 'Standard Selling') {
                option.selected = true;
            }
            
            customerFormPriceList.appendChild(option);
        });
        
        console.log(`✅ Customer form price list populated with ${this.priceLists.length} options`);
    }
    
    updatePriceListDropdown() {
        /**
         * Update the price list dropdown to show the current POS price list
         * POS defaults to 'Standard Selling' and only changes when user explicitly changes it
         */
        try {
            console.log(`🏷️ Setting price list dropdown to: ${this.currentPriceList}`);
            
            const priceListSelector = document.getElementById('priceListSelector');
            if (priceListSelector) {
                priceListSelector.value = this.currentPriceList;
                console.log(`✅ Price list dropdown updated to: ${this.currentPriceList}`);
            } else {
                console.log('⚠️ Price list selector not found, will be set when rendered');
            }
            
        } catch (error) {
            console.error('Error updating price list dropdown:', error);
        }
    }
    
    async loadCustomerGroups() {
        try {
            const response = await frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Customer Group',
                    filters: { is_group: 0 },
                    fields: ['name', 'customer_group_name']
                }
            });
            
            this.customerGroups = response.message || [];
            console.log('Loaded customer groups:', this.customerGroups);
        } catch (error) {
            console.error('Error loading customer groups:', error);
            this.customerGroups = [{ name: 'Individual', customer_group_name: 'Individual' }];
        }
    }
    
    async loadCategories() {
        try {
            // First try to get distinct material types from custom_material_type
            let response = await frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Item',
                    filters: { 
                        'custom_material_type': ['!=', ''],
                        disabled: 0 
                    },
                    fields: ['custom_material_type'],
                    limit: 50
                }
            });
            
            let items = response.message || [];
            
            if (items.length > 0) {
                // Get distinct material types
                const materialTypes = [...new Set(items.map(item => item.custom_material_type).filter(Boolean))];
                this.categories = materialTypes.map(type => ({
                    name: type,
                    material_type_name: type
                }));
                // Apply custom sorting
                this.categories = this.sortCategoriesByPriority(this.categories);
                console.log('Loaded material types from custom_material_type:', this.categories);
            } else {
                // Fallback to Item Groups
                console.log('No custom_material_type data, trying Item Groups');
                response = await frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Item Group',
                        filters: { is_group: 0 },
                        fields: ['name', 'item_group_name'],
                        limit: 20
                    }
                });
                
                const itemGroups = response.message || [];
                this.categories = itemGroups.map(group => ({
                    name: group.name,
                    material_type_name: group.item_group_name,
                    item_group_name: group.item_group_name,
                    icon: '📦'
                }));
                // Apply custom sorting
                this.categories = this.sortCategoriesByPriority(this.categories);
                console.log('Loaded categories from Item Groups:', this.categories);
            }
            
            // Populate category grid
            this.populateCategoryGrid();
        } catch (error) {
            console.error('Error loading categories:', error);
            this.categories = [];
            this.populateCategoryGrid();
        }
    }
    
    populateCategoryGrid() {
        const categoryGrid = document.getElementById('categoryGrid');
        if (!categoryGrid) return;
        
        // Use only loaded categories, no defaults
        const categoriesToShow = this.categories.slice(0, 6);
        
        categoryGrid.innerHTML = categoriesToShow.map(category => `
            <div class="category-button" data-category="${category.name}" onclick="window.fencePOS.selectCategory('${category.name}')">
                <div class="category-icon">${category.icon || ''}</div>
                <div class="category-name">${category.material_type_name || category.item_group_name}</div>
            </div>
        `).join('');
    }
    
    async selectCategory(category) {
        console.log('Selecting material type:', category);
        this.selectedCategory = category;
        this.selectedStyle = null;
        this.selectedHeight = null;
        this.selectedColor = null;
        this.selectedRailType = null;
        this.isPopularMode = false; // Reset popular mode when selecting category
        
        // Update sidebar button states
        document.querySelectorAll('.fence-type-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('popularBtn')?.classList.remove('active');
        const categoryBtn = document.querySelector(`[data-category="${category}"]`);
        if (categoryBtn) {
            categoryBtn.classList.add('active');
        }
        
        // Show style view
        await this.showStyleView();
    }
    
    async selectPopular() {
        console.log('Selecting Popular Items');
        this.isPopularMode = true;
        this.selectedCategory = null;
        this.selectedStyle = null;
        this.selectedHeight = null;
        this.selectedColor = null;
        this.selectedRailType = null;
        
        // Update button states
        document.querySelectorAll('.fence-type-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('popularBtn').classList.add('active');
        
        // Show material type filter for popular items
        await this.showPopularMaterialTypeView();
    }
    
    async selectBundles() {
        console.log('Selecting Bundles');
        this.isBundlesMode = true;
        this.isPopularMode = false;
        this.selectedCategory = null;
        this.selectedStyle = null;
        this.selectedHeight = null;
        this.selectedColor = null;
        this.selectedRailType = null;
        
        // Update button states
        document.querySelectorAll('.fence-type-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById('bundlesBtn').classList.add('active');
        document.getElementById('popularBtn').classList.remove('active');
        
        // Show material type filter for bundles
        await this.showBundlesMaterialTypeView();
    }
    
    async showPopularMaterialTypeView() {
        this.currentView = 'popular-material';
        
        // Hide other views
        document.getElementById('categoryView').style.display = 'none';
        document.getElementById('styleView').style.display = 'block'; // Reuse style view for layout
        document.getElementById('optionsView').style.display = 'none';
        document.getElementById('componentView').style.display = 'none';
        
        // Update the style view title and content for popular material selection
        const styleTitle = document.querySelector('#styleView .view-title');
        if (styleTitle) {
            styleTitle.textContent = 'Popular Items - Select Material Type';
        }
        
        const styleGrid = document.getElementById('styleGrid');
        if (!styleGrid) return;
        
        // Create material type options for popular items from loaded categories
        const materialTypes = [
            { id: 'all', name: 'All Popular Items' }
        ];
        
        // Add dynamic material types from loaded categories
        if (this.categories && this.categories.length > 0) {
            this.categories.forEach(category => {
                materialTypes.push({
                    id: category.name,
                    name: `Popular ${category.material_type_name || category.name}`
                });
            });
        }
        
        styleGrid.innerHTML = materialTypes.map(material => `
            <div class="style-option" onclick="selectPopularMaterial('${material.id}')">
                <div class="style-icon">${material.icon || ''}</div>
                <div class="style-name">${material.name}</div>
            </div>
        `).join('');
    }
    
    async showBundlesMaterialTypeView() {
        this.currentView = 'bundles-material';
        
        // Hide other views
        document.getElementById('categoryView').style.display = 'none';
        document.getElementById('styleView').style.display = 'block'; // Reuse style view for layout
        document.getElementById('optionsView').style.display = 'none';
        document.getElementById('componentView').style.display = 'none';
        
        // Update the style view title and content for bundles material selection
        const styleTitle = document.querySelector('#styleView .view-title');
        if (styleTitle) {
            styleTitle.textContent = 'Bundles - Select Material Type';
        }
        
        const styleGrid = document.getElementById('styleGrid');
        if (!styleGrid) return;
        
        // Create material type options for bundles from loaded categories
        const materialTypes = [
            { id: 'all', name: 'All Bundles', icon: '📦' }
        ];
        
        // Add dynamic material types from loaded categories
        if (this.categories && this.categories.length > 0) {
            this.categories.forEach(category => {
                materialTypes.push({
                    id: category.name,
                    name: `${category.material_type_name || category.name} Bundles`,
                    icon: this.getMaterialTypeIcon(category.material_type_name || category.name)
                });
            });
        }
        
        styleGrid.innerHTML = materialTypes.map(material => `
            <div class="style-option" onclick="selectBundlesMaterial('${material.id}')">
                <div class="style-icon">${material.icon || '📦'}</div>
                <div class="style-name">${material.name}</div>
            </div>
        `).join('');
    }
    
    async selectPopularMaterial(materialType) {
        console.log('Selecting popular material type:', materialType);
        
        if (materialType === 'all') {
            this.selectedCategory = null; // Show all popular items
        } else {
            this.selectedCategory = materialType; // Filter by material type
        }
        
        // Update the selected material type visually
        document.querySelectorAll('.style-option').forEach(option => option.classList.remove('selected'));
        event.target.closest('.style-option').classList.add('selected');
        
        // Show popular items filtered by material type
        await this.showComponentView();
    }
    
    async selectBundlesMaterial(materialType) {
        console.log('Selecting bundles material type:', materialType);
        
        if (materialType === 'all') {
            this.selectedCategory = null; // Show all bundles
        } else {
            this.selectedCategory = materialType; // Filter by material type
        }
        
        // Update the selected material type visually
        document.querySelectorAll('.style-option').forEach(option => option.classList.remove('selected'));
        event.target.closest('.style-option').classList.add('selected');
        
        // Show bundles filtered by material type
        await this.showBundlesView();
    }
    
    getMaterialTypeIcon(materialTypeName) {
        const nameLower = materialTypeName.toLowerCase();
        if (nameLower.includes('vinyl')) return '🪟';
        if (nameLower.includes('aluminum')) return '🔧';
        if (nameLower.includes('wood')) return '🪵';
        if (nameLower.includes('panel')) return '🪟';
        if (nameLower.includes('rail')) return '━';
        if (nameLower.includes('post')) return '📏';
        if (nameLower.includes('gate')) return '🚪';
        if (nameLower.includes('hardware')) return '🔧';
        if (nameLower.includes('cap')) return '🎩';
        return '📦';
    }
    
    async showStyleView() {
        this.currentView = 'style';
        
        // Hide other views
        document.getElementById('categoryView').style.display = 'none';
        document.getElementById('styleView').style.display = 'block';
        document.getElementById('optionsView').style.display = 'none';
        document.getElementById('componentView').style.display = 'none';
        
        // Show loading indicator
        const styleGrid = document.getElementById('styleGrid');
        styleGrid.innerHTML = '<div class="loading-indicator">Loading styles...</div>';
        
        try {
            // Fetch existing styles from Style doctype filtered by material type
            const materialTypeName = this.getMaterialTypeName(this.selectedCategory);
            
            console.log(`🔍 Fetching styles for material type: ${materialTypeName} (category: ${this.selectedCategory})`);
            
            const response = await frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Style',
                    filters: {
                        material_type: materialTypeName
                    },
                    fields: ['name', 'style', 'material_type'],
                    limit_page_length: 50
                }
            });
            
            if (response.message && response.message.length > 0) {
                // Transform the response to match expected format
                let styles = response.message.map(style => ({
                    id: style.name,
                    name: style.style,
                    material_type: style.material_type
                }));
                
                // Custom style ordering as requested - exactly 8 styles, no more no less
                const styleOrder = {
                    'Solid': 1,
                    'Lattice': 2,
                    'Open Spindle Top': 3,
                    'Closed Spindle Top': 4,
                    '3"  Open Picket': 5,  // Note: two spaces between 3" and Open
                    '1.5" Open Picket': 6,
                    'Picket': 7,
                    'Ranch Rail': 8
                };
                
                // Debug: Log the actual style names being loaded
                console.log('🎨 UPDATED CODE - Actual style names from database:', styles.map(s => s.name));
                console.log('📅 Code timestamp: ' + new Date().toISOString());
                
                // Sort styles according to the specified order
                styles.sort((a, b) => {
                    const orderA = styleOrder[a.name] || 999;
                    const orderB = styleOrder[b.name] || 999;
                    
                    // Debug: Log style ordering
                    console.log(`🔄 Sorting: "${a.name}" (order: ${orderA}) vs "${b.name}" (order: ${orderB})`);
                    
                    if (orderA !== orderB) {
                        return orderA - orderB;
                    }
                    
                    // If both styles have the same order (or both are not in the list), sort alphabetically
                    return a.name.localeCompare(b.name);
                });
                
                // Debug: Log final sorted order
                console.log('✅ Final sorted style order:', styles.map(s => s.name));
                
                // Render styles from existing doctype records
                styleGrid.innerHTML = styles.map(style => `
                    <div class="style-card" data-style-name="${style.name.replace(/"/g, '&quot;').replace(/'/g, '&#39;')}" onclick="window.fencePOS.selectStyleFromData(this)">
                        <div class="style-name">${style.name}</div>
                    </div>
                `).join('');
                
                // Store loaded styles for reference
                this.availableStyles = styles;
                
                console.log(`✅ Loaded ${styles.length} existing styles from Style doctype for material: ${materialTypeName}`);
                console.log('Available styles:', styles.map(s => s.name));
                
            } else {
                // No styles found in doctype for this material type
                console.warn(`⚠️ No styles found in Style doctype for material type: ${materialTypeName}`);
                console.log('Available material types in Style doctype - check if this matches your data');
                
                // Let's also check what material types exist in the Style doctype
                this.debugAvailableMaterialTypes();
                
                // Use fallback for now
                this.showFallbackStyles();
            }
            
        } catch (error) {
            console.error('Error loading styles from Style doctype:', error);
            this.showFallbackStyles();
        }
    }
    
    showFallbackStyles() {
        // No fallback styles - show message if no styles found
        const styleGrid = document.getElementById('styleGrid');
        styleGrid.innerHTML = '<div class="no-styles-message">No styles found for this material type</div>';
        this.availableStyles = [];
    }
    
    getMaterialTypeName(category) {
        // Return category as-is since we're using actual Material Type names
        return category;
    }
    
    async debugAvailableMaterialTypes() {
        try {
            console.log('🔍 Checking available material types in Style doctype...');
            
            const response = await frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Style',
                    fields: ['material_type', 'style'],
                    limit_page_length: 100
                }
            });
            
            if (response.message && response.message.length > 0) {
                const materialTypes = [...new Set(response.message.map(s => s.material_type))];
                console.log('📋 Available Material Types in Style doctype:', materialTypes);
                
                // Group styles by material type
                const groupedStyles = {};
                response.message.forEach(style => {
                    if (!groupedStyles[style.material_type]) {
                        groupedStyles[style.material_type] = [];
                    }
                    groupedStyles[style.material_type].push(style.style);
                });
                
                console.log('📊 Styles by Material Type:');
                for (const [matType, styles] of Object.entries(groupedStyles)) {
                    console.log(`  ${matType}: ${styles.join(', ')}`);
                }
            } else {
                console.warn('❌ No Style records found in doctype');
            }
        } catch (error) {
            console.error('Error debugging material types:', error);
        }
    }
    
    selectStyleFromData(element) {
        const styleName = element.getAttribute('data-style-name');
        this.selectStyle(styleName);
    }
    
    async selectStyle(styleId) {
        console.log('Selecting style:', styleId);
        this.selectedStyle = styleId;
        await this.showOptionsView();
    }
    
    async showOptionsView() {
        this.currentView = 'options';
        
        // Hide other views
        document.getElementById('categoryView').style.display = 'none';
        document.getElementById('styleView').style.display = 'none';
        document.getElementById('optionsView').style.display = 'block';
        document.getElementById('componentView').style.display = 'none';
        
        // Load dynamic options from item attributes
        await this.loadDynamicOptions();
        
        // Update filter visibility based on selected style
        this.updateFilterVisibility();
    }
    
    selectHeight(height) {
        this.selectedHeight = height;
        document.querySelectorAll('#heightGrid .option-button').forEach(btn => btn.classList.remove('selected'));
        document.getElementById(`height-${height.replace(/'/g, '')}`).classList.add('selected');
    }
    
    selectColor(color) {
        this.selectedColor = color;
        document.querySelectorAll('#colorGrid .option-button').forEach(btn => btn.classList.remove('selected'));
        document.getElementById(`color-${color.replace(/\s+/g, '-')}`).classList.add('selected');
    }
    
    clearHeight() {
        console.log('Clearing height selection');
        this.selectedHeight = null;
        document.querySelectorAll('#heightGrid .option-button').forEach(btn => btn.classList.remove('selected'));
    }
    
    clearColor() {
        console.log('Clearing color selection');
        this.selectedColor = null;
        document.querySelectorAll('#colorGrid .option-button').forEach(btn => btn.classList.remove('selected'));
    }
    
    selectRailType(railType) {
        this.selectedRailType = railType;
        document.querySelectorAll('#railTypeGrid .option-button').forEach(btn => btn.classList.remove('selected'));
        document.getElementById(`railtype-${railType.replace(/\s+/g, '-')}`).classList.add('selected');
    }
    
    clearRailType() {
        console.log('Clearing rail type selection');
        this.selectedRailType = null;
        document.querySelectorAll('#railTypeGrid .option-button').forEach(btn => btn.classList.remove('selected'));
    }
    
    selectLatticeType(latticeType) {
        this.selectedLatticeType = latticeType;
        document.querySelectorAll('#latticeTypeGrid .option-button').forEach(btn => btn.classList.remove('selected'));
        document.getElementById(`latticetype-${latticeType.replace(/\s+/g, '-')}`).classList.add('selected');
    }
    
    clearLatticeType() {
        console.log('Clearing lattice type selection');
        this.selectedLatticeType = null;
        document.querySelectorAll('#latticeTypeGrid .option-button').forEach(btn => btn.classList.remove('selected'));
    }
    
    selectOrientation(orientation) {
        this.selectedOrientation = orientation;
        document.querySelectorAll('#orientationGrid .option-button').forEach(btn => btn.classList.remove('selected'));
        document.getElementById(`orientation-${orientation.replace(/\s+/g, '-')}`).classList.add('selected');
    }
    
    clearOrientation() {
        console.log('Clearing orientation selection');
        this.selectedOrientation = null;
        document.querySelectorAll('#orientationGrid .option-button').forEach(btn => btn.classList.remove('selected'));
    }
    
    selectPicketType(picketType) {
        this.selectedPicketType = picketType;
        document.querySelectorAll('#picketTypeGrid .option-button').forEach(btn => btn.classList.remove('selected'));
        document.getElementById(`pickettype-${picketType.replace(/\s+/g, '-')}`).classList.add('selected');
    }
    
    clearPicketType() {
        console.log('Clearing picket type selection');
        this.selectedPicketType = null;
        document.querySelectorAll('#picketTypeGrid .option-button').forEach(btn => btn.classList.remove('selected'));
    }
    
    updateFilterVisibility() {
        console.log(`🔧 Updating filter visibility for style: ${this.selectedStyle}`);
        
        let neededFilters;
        
        // Special handling for Lattice style - check available material classes
        if (this.selectedStyle === 'Lattice') {
            const availableClasses = new Set();
            if (this.products && this.products.length > 0) {
                this.products.forEach(product => {
                    if (product.custom_material_class) {
                        availableClasses.add(product.custom_material_class);
                    }
                });
            }
            
            console.log(`🔧 Lattice style - available classes:`, Array.from(availableClasses));
            
            // Collect all unique filters needed for Lattice across available material classes
            const latticeFilters = new Set();
            availableClasses.forEach(materialClass => {
                const classFilters = this.latticeClassFilters[materialClass];
                if (classFilters) {
                    classFilters.forEach(filter => latticeFilters.add(filter));
                }
            });
            
            // If no products loaded yet, show all Lattice filters
            if (latticeFilters.size === 0) {
                neededFilters = ['Height', 'Color', 'Rail Type', 'Lattice Type'];
            } else {
                neededFilters = Array.from(latticeFilters);
            }
        } else {
            // For all other styles, use simple direct mapping
            neededFilters = this.styleFilters[this.selectedStyle] || ['Height', 'Color', 'Rail Type'];
        }
        
        console.log(`🔧 Filters needed for style ${this.selectedStyle}:`, neededFilters);
        
        // Show/hide filter sections based on what's needed
        const filterSections = [
            { name: 'Height', element: document.querySelector('#heightGrid').parentElement },
            { name: 'Color', element: document.querySelector('#colorGrid').parentElement },
            { name: 'Rail Type', element: document.querySelector('#railTypeGrid').parentElement },
            { name: 'Lattice Type', element: document.getElementById('latticeTypeSection') },
            { name: 'Orientation', element: document.getElementById('orientationSection') },
            { name: 'Picket Type', element: document.getElementById('picketTypeSection') }
        ];
        
        filterSections.forEach(section => {
            if (section.element) {
                if (neededFilters.includes(section.name)) {
                    section.element.style.display = 'block';
                    console.log(`✅ Showing ${section.name} filter`);
                } else {
                    section.element.style.display = 'none';
                    console.log(`❌ Hiding ${section.name} filter`);
                }
            }
        });
        
        // Update section title to reflect active filters
        const optionsTitle = document.getElementById('optionsTitle');
        if (optionsTitle) {
            const activeFilters = neededFilters.join(', ');
            optionsTitle.textContent = `Filter by ${activeFilters} (Optional)`;
        }
    }
    
    async proceedToComponents() {
        // Allow proceeding without height and color selection
        // Height and color are optional filters that will be applied if selected
        await this.showComponentView();
    }
    
    async showComponentView() {
        this.currentView = 'component';
        
        // Hide other views
        document.getElementById('categoryView').style.display = 'none';
        document.getElementById('styleView').style.display = 'none';
        document.getElementById('optionsView').style.display = 'none';
        document.getElementById('componentView').style.display = 'block';
        
        // Load and display components
        await this.loadComponents();
    }
    
    async showBundlesView() {
        this.currentView = 'bundles';
        
        // Hide other views
        document.getElementById('categoryView').style.display = 'none';
        document.getElementById('styleView').style.display = 'none';
        document.getElementById('optionsView').style.display = 'none';
        document.getElementById('componentView').style.display = 'block';
        
        // Load and display bundles
        await this.loadBundles();
    }
    
    async loadComponents() {
        console.log('Loading components for:', {
            category: this.selectedCategory,
            style: this.selectedStyle,
            height: this.selectedHeight,
            color: this.selectedColor,
            railType: this.selectedRailType
        });
        
        try {
            // Load real products from webshop only
            const products = await this.getProductsFromWebshop();
            
            if (products && products.length > 0) {
                console.log('Displaying real products:', products.length);
                await this.displayRealProducts(products);
            } else {
                console.log('No products found in database');
                this.displayNoProductsMessage();
            }
        } catch (error) {
            console.error('Error loading components:', error);
            this.displayNoProductsMessage();
        }
    }
    
    async loadBundles() {
        console.log('Loading bundles for:', {
            category: this.selectedCategory,
            isBundlesMode: this.isBundlesMode
        });
        
        try {
            // Load bundles from webshop
            const bundles = await this.getBundlesFromWebshop();
            
            if (bundles && bundles.length > 0) {
                console.log('Displaying bundles:', bundles.length);
                await this.displayBundles(bundles);
            } else {
                console.log('No bundles found in database');
                this.displayNoBundlesMessage();
            }
        } catch (error) {
            console.error('Error loading bundles:', error);
            this.displayNoBundlesMessage();
        }
    }
    
    async getBundlesFromWebshop() {
        try {
            console.log('Fetching bundles with filters:', {
                category: this.selectedCategory,
                isBundlesMode: this.isBundlesMode
            });
            
            // Use the existing POS API to get bundles
            const response = await frappe.call({
                method: 'webshop.pos_api.get_bundles_by_material_type',
                args: {
                    material_type: this.selectedCategory,
                    price_list: this.currentPriceList
                }
            });
            
            if (response && response.message) {
                console.log('Bundles API response:', response.message);
                return response.message.bundles || [];
            }
            
            return [];
        } catch (error) {
            console.error('Error fetching bundles:', error);
            return [];
        }
    }
    
    async displayBundles(bundles) {
        const componentGrid = document.getElementById('componentGrid');
        if (!componentGrid) return;
        
        // Group bundles by material type
        const groupedBundles = this.groupBundlesByMaterialType(bundles);
        
        let html = '';
        
        // Display each material type section
        Object.keys(groupedBundles).forEach(materialType => {
            const materialBundles = groupedBundles[materialType];
            const icon = this.getMaterialTypeIcon(materialType);
            
            html += `
                <div class="material-section">
                    <div class="material-header">
                        <span class="material-icon">${icon}</span>
                        <span class="material-name">${materialType} Bundles</span>
                        <span class="bundle-count">(${materialBundles.length} bundles)</span>
                    </div>
                    <div class="bundle-grid">
                        ${materialBundles.map(bundle => this.createBundleCard(bundle)).join('')}
                    </div>
                </div>
            `;
        });
        
        componentGrid.innerHTML = html;
    }
    
    groupBundlesByMaterialType(bundles) {
        const grouped = {};
        
        bundles.forEach(bundle => {
            // Extract material type from bundle name or item group
            const materialType = this.extractMaterialType(bundle);
            
            if (!grouped[materialType]) {
                grouped[materialType] = [];
            }
            grouped[materialType].push(bundle);
        });
        
        return grouped;
    }
    
    extractMaterialType(bundle) {
        // Try to extract material type from various fields
        const name = (bundle.item_name || bundle.item_code || '').toLowerCase();
        const itemGroup = (bundle.item_group || '').toLowerCase();
        const description = (bundle.description || '').toLowerCase();
        
        // For Cap and Hardware items, check if they have custom_type_of_material data
        if (itemGroup === 'cap' || itemGroup === 'hardware') {
            // If this item has custom_type_of_material, it might be available in multiple material types
            // For now, we'll still categorize it based on name/description, but it will be available in other material types too
            // due to the backend filtering logic
        }
        
        // Check for material types in name, description, or item group
        if (name.includes('vinyl') || itemGroup.includes('vinyl') || description.includes('vinyl')) return 'Vinyl';
        if (name.includes('aluminum') || itemGroup.includes('aluminum') || description.includes('aluminum')) return 'Aluminum';
        if (name.includes('wood') || itemGroup.includes('wood') || description.includes('wood')) return 'Wood';
        
        // Check for specific fence components that might indicate material type
        if (name.includes('fence') || description.includes('fence')) {
            // Try to infer from context
            if (name.includes('panel') || name.includes('post') || name.includes('rail')) {
                return 'Vinyl'; // Default to Vinyl for fence components
            }
        }
        
        // Check for specific product types
        if (name.includes('gate') || description.includes('gate')) return 'Vinyl';
        if (name.includes('panel') || description.includes('panel')) return 'Vinyl';
        if (name.includes('post') || description.includes('post')) return 'Vinyl';
        if (name.includes('rail') || description.includes('rail')) return 'Vinyl';
        
        // For Cap and Hardware items, default to Vinyl if no specific material type found
        if (itemGroup === 'cap' || itemGroup === 'hardware') {
            return 'Vinyl'; // Default material type for caps and hardware
        }
        
        // Default fallback
        return 'General';
    }
    
    createBundleCard(bundle) {
        const price = bundle.price_list_rate || bundle.rate || 0;
        const stockStatus = bundle.actual_qty > 0 ? 'In Stock' : 'Out of Stock';
        const stockClass = bundle.actual_qty > 0 ? 'in-stock' : 'out-of-stock';
        
        return `
            <div class="item-card bundle-card" data-item-id="${bundle.item_code}" data-item-name="${bundle.item_name}" data-price="${price}" id="card-${bundle.item_code.replace(/[^a-zA-Z0-9]/g, '')}">
                <div class="item-image">
                    <div class="bundle-icon">📦</div>
                </div>
                <div class="item-details">
                    <div class="item-name">${bundle.item_name}</div>
                    <div class="item-code">${bundle.item_code}</div>
                    <div class="item-price">$${price.toFixed(2)}</div>
                    <div class="stock-status ${stockClass}">${stockStatus}</div>
                </div>
                <div class="item-controls">
                    <div class="quantity-controls">
                        <button class="qty-btn minus-btn" onclick="updateItemQuantity('${bundle.item_code}', -1)" disabled>-</button>
                        <input type="number" class="qty-input" value="0" min="0" onchange="updateItemQuantity('${bundle.item_code}', 0, this.value)">
                        <button class="qty-btn plus-btn" onclick="updateItemQuantity('${bundle.item_code}', 1)">+</button>
                    </div>
                </div>
            </div>
        `;
    }
    
    displayNoBundlesMessage() {
        const componentGrid = document.getElementById('componentGrid');
        if (!componentGrid) return;
        
        componentGrid.innerHTML = `
            <div class="no-products-message">
                <div class="no-products-icon">📦</div>
                <div class="no-products-title">No Bundles Found</div>
                <div class="no-products-text">
                    No bundles are available for the selected material type.
                    <br>Try selecting a different material type or check back later.
                </div>
            </div>
        `;
    }
    
    // =============================================================================
    // TEMPLATE FUNCTIONS
    // =============================================================================
    
    selectTemplates() {
        console.log('📋 Selecting Templates mode');
        this.isTemplatesMode = true;
        this.isBundlesMode = false;
        this.isPopularMode = false;
        
        // Clear other selections
        this.clearAllSelections();
        
        // Update button states
        this.updateButtonStates();
        
        // Show templates view
        this.showTemplatesView();
    }
    
    showTemplatesView() {
        this.currentView = 'templates';
        this.hideAllViews();
        document.getElementById('templatesView').style.display = 'block';
        
        // Update title - templates view uses section-title, not view-header
        const titleElement = document.querySelector('#templatesView .section-title');
        if (titleElement) {
            titleElement.textContent = 'Quotation Templates';
        }
        
        // Load templates
        this.loadTemplates();
    }
    
    async loadTemplates() {
        try {
            console.log('📋 Loading quotation templates...');
            
            const response = await frappe.call({
                method: 'webshop.pos_api.get_quotation_templates',
                args: {
                    category: document.getElementById('templateCategoryFilter')?.value || 'all',
                    customer_type: document.getElementById('templateCustomerTypeFilter')?.value || 'all',
                    search_term: document.getElementById('templateSearchInput')?.value || null
                }
            });
            
            if (response.message && response.message.success) {
                this.displayTemplates(response.message.templates);
            } else {
                this.displayNoTemplatesMessage();
            }
        } catch (error) {
            console.error('❌ Error loading templates:', error);
            this.displayNoTemplatesMessage();
        }
    }
    
    displayTemplates(templates) {
        const templatesContent = document.getElementById('templatesContent');
        
        if (!templates || templates.length === 0) {
            this.displayNoTemplatesMessage();
            return;
        }
        
        let html = '<div class="template-grid">';
        
        templates.forEach(template => {
            html += this.createTemplateCard(template);
        });
        
        html += '</div>';
        templatesContent.innerHTML = html;
    }
    
    createTemplateCard(template) {
        const createdDate = new Date(template.created_date).toLocaleDateString();
        const lastUsed = template.last_used ? new Date(template.last_used).toLocaleDateString() : 'Never';
        const useCount = template.use_count || 0;
        
        return `
            <div class="template-card" onclick="loadTemplate('${template.name}')">
                <div class="template-header">
                    <h4 class="template-name">${template.template_name}</h4>
                    <span class="template-category">${template.category}</span>
                </div>
                <div class="template-description">
                    ${template.description || 'No description available'}
                </div>
                <div class="template-meta">
                    <div class="template-stats">
                        <span>📅 Created: ${createdDate}</span>
                        <span>🔄 Used: ${useCount} times</span>
                        <span>👤 By: ${template.created_by}</span>
                    </div>
                </div>
                <div class="template-actions-card">
                    <button class="btn btn-load" onclick="event.stopPropagation(); loadTemplate('${template.name}')">
                        📥 Load
                    </button>
                    <button class="btn btn-delete" onclick="event.stopPropagation(); deleteTemplate('${template.name}')">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `;
    }
    
    displayNoTemplatesMessage() {
        const templatesContent = document.getElementById('templatesContent');
        templatesContent.innerHTML = `
            <div class="no-templates-message">
                <div class="icon">📋</div>
                <h3>No Templates Found</h3>
                <p>No quotation templates found. Create your first template by saving your current cart.</p>
                <button class="btn btn-primary" onclick="showSaveTemplateModal()">
                    <i class="fa fa-save"></i> Create First Template
                </button>
            </div>
        `;
    }
    
    async saveTemplate() {
        try {
            const templateName = document.getElementById('templateName').value.trim();
            const description = document.getElementById('templateDescription').value.trim();
            const category = document.getElementById('templateCategory').value;
            const customerType = document.getElementById('templateCustomerType').value;
            const priceList = document.getElementById('templatePriceList').value;
            const notes = document.getElementById('templateNotes').value.trim();
            
            if (!templateName) {
                alert('Please enter a template name');
                return;
            }
            
            console.log('💾 Saving template:', templateName);
            
            const response = await frappe.call({
                method: 'webshop.pos_api.save_cart_as_template',
                args: {
                    template_name: templateName,
                    description: description,
                    category: category,
                    customer_type: customerType,
                    price_list: priceList || null,
                    template_notes: notes
                }
            });
            
            if (response.message && response.message.success) {
                alert(`Template '${templateName}' saved successfully!`);
                this.closeSaveTemplateModal();
                this.loadTemplates(); // Refresh templates list
            } else {
                alert(`Error saving template: ${response.message.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('❌ Error saving template:', error);
            alert('Error saving template. Please try again.');
        }
    }
    
    async loadTemplate(templateName) {
        try {
            console.log('📥 Loading template:', templateName);
            
            const response = await frappe.call({
                method: 'webshop.pos_api.load_quotation_template',
                args: {
                    template_name: templateName,
                    price_list: this.currentPriceList
                }
            });
            
            console.log('📋 Template loading response:', response);
            
            if (response.message && response.message.success) {
                alert(`Template loaded successfully! ${response.message.items_count} items added to cart.`);
                
                // Switch back to main view first
                this.clearAllSelections();
                this.hideAllViews();
                document.getElementById('categoryView').style.display = 'block';
                this.currentView = 'category';
                
                // Then refresh cart display (this will update product cards if they're visible)
                await this.updateCartDisplay();
            } else {
                console.error('❌ Template loading failed:', response.message);
                const errorMsg = response.message?.message || 'Unknown error';
                const debugInfo = response.message?.debug_info;
                
                if (debugInfo) {
                    console.error('🔍 Debug info:', debugInfo);
                    alert(`Error loading template: ${errorMsg}\n\nDebug info: ${JSON.stringify(debugInfo, null, 2)}`);
                } else {
                    alert(`Error loading template: ${errorMsg}`);
                }
            }
        } catch (error) {
            console.error('❌ Error loading template:', error);
            alert('Error loading template. Please try again.');
        }
    }
    
    async deleteTemplate(templateName) {
        if (!confirm(`Are you sure you want to delete template '${templateName}'?`)) {
            return;
        }
        
        try {
            console.log('🗑️ Deleting template:', templateName);
            
            const response = await frappe.call({
                method: 'webshop.pos_api.delete_quotation_template',
                args: {
                    template_name: templateName
                }
            });
            
            if (response.message && response.message.success) {
                alert('Template deleted successfully!');
                this.loadTemplates(); // Refresh templates list
            } else {
                alert(`Error deleting template: ${response.message.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('❌ Error deleting template:', error);
            alert('Error deleting template. Please try again.');
        }
    }
    
    showSaveTemplateModal() {
        // Check if cart has items
        if (!this.cartItems || this.cartItems.length === 0) {
            alert('Please add items to your cart before saving as template.');
            return;
        }
        
        // Set current price list in modal
        const priceListSelect = document.getElementById('templatePriceList');
        if (priceListSelect && this.currentPriceList) {
            priceListSelect.value = this.currentPriceList;
        }
        
        // Show modal
        document.getElementById('saveTemplateModal').style.display = 'flex';
    }
    
    closeSaveTemplateModal() {
        document.getElementById('saveTemplateModal').style.display = 'none';
        
        // Clear form
        document.getElementById('saveTemplateForm').reset();
    }
    
    filterTemplates() {
        this.loadTemplates();
    }
    
    searchTemplates() {
        // Debounce search
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.loadTemplates();
        }, 300);
    }
    
    refreshTemplates() {
        this.loadTemplates();
    }
    
    // Helper functions for template system
    hideAllViews() {
        const views = [
            'categoryView', 'styleView', 'optionsView', 'componentView', 
            'popularView', 'bundlesMaterialView', 'bundlesView', 'templatesView'
        ];
        
        views.forEach(viewId => {
            const element = document.getElementById(viewId);
            if (element) {
                element.style.display = 'none';
            }
        });
    }
    
    updateButtonStates() {
        // Update sidebar button states
        const buttons = [
            { id: 'popularBtn', active: this.isPopularMode },
            { id: 'bundlesBtn', active: this.isBundlesMode },
            { id: 'templatesBtn', active: this.isTemplatesMode }
        ];
        
        buttons.forEach(button => {
            const element = document.getElementById(button.id);
            if (element) {
                if (button.active) {
                    element.classList.add('active');
                } else {
                    element.classList.remove('active');
                }
            }
        });
    }
    
    clearAllSelections() {
        this.isPopularMode = false;
        this.isBundlesMode = false;
        this.isTemplatesMode = false;
        this.updateButtonStates();
    }
    
    async getProductsFromWebshop() {
        try {
            console.log('Fetching products with filters:', {
                category: this.selectedCategory,
                height: this.selectedHeight,
                color: this.selectedColor,
                railType: this.selectedRailType,
                style: this.selectedStyle,
                isPopularMode: this.isPopularMode
            });
            
            let products = [];
            
            // Handle Popular Items mode
            if (this.isPopularMode) {
                console.log('Fetching popular items with material filter:', this.selectedCategory);
                const response = await frappe.call({
                    method: 'webshop.webshop.pos_api.get_popular_items_for_pos',
                    args: {
                        price_list: this.currentPriceList,
                        material_type: this.selectedCategory || 'all'
                    }
                });
                products = response.message?.items || [];
                console.log('Popular items found:', products.length);
                return products;
            }
            
            // Method 1: Try new template-aware fence POS API (includes has_variants=1 items)
            if (this.selectedCategory || this.selectedHeight || this.selectedColor || this.selectedRailType || this.selectedStyle) {
                console.log('Using template-aware fence POS API...');
                console.log('🔥 FRONTEND FILTER - Before API call:', {
                    category: this.selectedCategory,
                    height: this.selectedHeight,
                    color: this.selectedColor,
                    style: this.selectedStyle,
                    railType: this.selectedRailType
                });

                console.log(`🔥 CALLING POS API WITH PRICE LIST: ${this.currentPriceList}`);
                const response1 = await frappe.call({
                    method: 'webshop.webshop.pos_api.get_fence_items_for_pos',
                    args: {
                        category: this.selectedCategory,
                        height: this.selectedHeight,
                        color: this.selectedColor,
                        style: this.selectedStyle,
                        railType: this.selectedRailType,
                        price_list: this.currentPriceList
                    }
                });
                console.log(`🔥 POS API RESPONSE:`, response1.message);
                console.log(`🔥 BACKEND CONFIRMS PRICE LIST: ${response1.message?.debug_price_list}`);
                products = response1.message?.items || [];
                console.log('Products found with template-aware POS API:', products.length);
                
                // Debug first few products to see the exact pricing data structure
                if (products.length > 0) {
                    console.log(`🔥 FIRST PRODUCT PRICING DEBUG:`, {
                        name: products[0].name,
                        pos_price: products[0].pos_price,
                        price_list_rate: products[0].price_list_rate,
                        all_keys: Object.keys(products[0])
                    });
                }
                
                // 🎯 COMPREHENSIVE FRONTEND FILTERING
                if (products.length > 0) {
                    console.log('🔥 APPLYING FRONTEND FILTERS');
                    let filteredProducts = [...products];
                    const originalCount = products.length;
                    
                    // DEBUG: Check sample product structure
                    if (filteredProducts.length > 0) {
                        console.log('🔍 Sample product:', {
                            name: filteredProducts[0].item_name,
                            material_class: filteredProducts[0].custom_material_class,
                            material_type: filteredProducts[0].custom_material_type,
                            style: filteredProducts[0].custom_style,
                            attributes: filteredProducts[0].attributes
                        });
                    }
                    
                    // MATERIAL TYPE FILTER (primary filter)
                    if (this.selectedCategory) {
                        const beforeMaterial = filteredProducts.length;
                        filteredProducts = filteredProducts.filter(product => 
                            product.custom_material_type === this.selectedCategory
                        );
                        console.log(`🏗️ Material Type filtering (${this.selectedCategory}): ${beforeMaterial} → ${filteredProducts.length} products`);
                    }
                    
                    // STYLE FILTER (exempt Hardware and Caps)
                    if (this.selectedStyle) {
                        const beforeStyle = filteredProducts.length;
                        
                        // Debug: Show what custom_style values exist
                        const uniqueStyles = [...new Set(filteredProducts.map(p => p.custom_style))];
                        console.log(`🎨 Available custom_style values:`, uniqueStyles);
                        console.log(`🎨 Looking for style: "${this.selectedStyle}"`);
                        
                        filteredProducts = filteredProducts.filter(product => {
                            const isHardwareOrCap = product.custom_material_class === 'Hardware' || product.custom_material_class === 'Cap';
                            if (isHardwareOrCap) {
                                return true; // Exempt Hardware and Caps from style filtering
                            }
                            
                            // Try exact match first
                            if (product.custom_style === this.selectedStyle) {
                                return true;
                            }
                            
                            // Try partial match for styles like "1.5" Open Picket" -> might be stored as "Open Picket"
                            const productStyle = product.custom_style || '';
                            const selectedStyle = this.selectedStyle || '';
                            
                            // Check if selected style contains the product style or vice versa
                            if (selectedStyle.includes(productStyle) || productStyle.includes(selectedStyle)) {
                                console.log(`✅ Partial match: "${selectedStyle}" matches "${productStyle}"`);
                                return true;
                            }
                            
                            console.log(`❌ Style mismatch: ${product.item_name} has custom_style="${productStyle}", need "${selectedStyle}"`);
                            return false;
                        });
                        console.log(`🎨 Style filtering (${this.selectedStyle}): ${beforeStyle} → ${filteredProducts.length} products (Hardware/Caps exempted)`);
                    }
                    
                    // HEIGHT FILTER (exempt Hardware and Caps)
                    if (this.selectedHeight) {
                        const beforeHeight = filteredProducts.length;
                        filteredProducts = filteredProducts.filter(product => {
                            const attributes = product.attributes || {};
                            const productHeight = attributes['Fence Height'];
                            const isHardwareOrCap = product.custom_material_class === 'Hardware' || product.custom_material_class === 'Cap';
                            
                            if (isHardwareOrCap) {
                                return true; // Exempt Hardware and Caps from height filtering
                            }
                            
                            const matches = productHeight === this.selectedHeight;
                            if (!matches && productHeight) {
                                console.log(`❌ Height mismatch: ${product.item_name} has ${productHeight}, need ${this.selectedHeight}`);
                            }
                            return matches;
                        });
                        console.log(`📏 Height filtering (${this.selectedHeight}): ${beforeHeight} → ${filteredProducts.length} products (Hardware/Caps exempted)`);
                    }
                    
                    // COLOR FILTER (apply to all items including Hardware and Caps)
                    if (this.selectedColor) {
                        const beforeColor = filteredProducts.length;
                        // Database stores full color names, not abbreviations
                        const selectedColor = this.selectedColor; // Use the selected color directly
                        
                        filteredProducts = filteredProducts.filter(product => {
                            const attributes = product.attributes || {};
                            const productColor = attributes['Color'];
                            const matches = productColor === selectedColor;
                            
                            if (!matches && productColor) {
                                console.log(`❌ Color mismatch: ${product.item_name} has ${productColor}, need ${selectedColor}`);
                            }
                            return matches;
                        });
                        console.log(`🌈 Color filtering (${this.selectedColor}): ${beforeColor} → ${filteredProducts.length} products`);
                    }
                    
                    // UNIFIED STYLE-BASED FILTERING
                    // Apply all selected filters for all styles
                    
                    // RAIL TYPE FILTER (exempt Hardware and Caps, and apply Lattice class-specific rules)
                    if (this.selectedRailType) {
                        const beforeRailType = filteredProducts.length;
                        filteredProducts = filteredProducts.filter(product => {
                            const attributes = product.attributes || {};
                            const productRailType = attributes['Rail Type'];
                            const isHardwareOrCap = product.custom_material_class === 'Hardware' || product.custom_material_class === 'Cap';
                            const materialClass = product.custom_material_class;
                            
                            if (isHardwareOrCap) {
                                return true; // Exempt Hardware and Caps from rail type filtering
                            }
                            
                            // Special handling for Lattice style
                            if (this.selectedStyle === 'Lattice') {
                                const allowedFilters = this.latticeClassFilters[materialClass];
                                if (allowedFilters && !allowedFilters.includes('Rail Type')) {
                                    return true; // This material class doesn't filter by Rail Type
                                }
                            }
                            
                            const matches = productRailType === this.selectedRailType;
                            if (!matches && productRailType) {
                                console.log(`❌ Rail Type mismatch: ${product.item_name} has ${productRailType}, need ${this.selectedRailType}`);
                            }
                            return matches;
                        });
                        console.log(`🚂 Rail Type filtering (${this.selectedRailType}): ${beforeRailType} → ${filteredProducts.length} products (Hardware/Caps exempted)`);
                    }
                    
                    // LATTICE TYPE FILTER (exempt Hardware and Caps, and apply Lattice class-specific rules)
                    if (this.selectedLatticeType) {
                        const beforeLatticeType = filteredProducts.length;
                        filteredProducts = filteredProducts.filter(product => {
                            const attributes = product.attributes || {};
                            const productLatticeType = attributes['Lattice Type'];
                            const isHardwareOrCap = product.custom_material_class === 'Hardware' || product.custom_material_class === 'Cap';
                            const materialClass = product.custom_material_class;
                            
                            if (isHardwareOrCap) {
                                return true; // Exempt Hardware and Caps
                            }
                            
                            // Special handling for Lattice style
                            if (this.selectedStyle === 'Lattice') {
                                const allowedFilters = this.latticeClassFilters[materialClass];
                                if (allowedFilters && !allowedFilters.includes('Lattice Type')) {
                                    return true; // This material class doesn't filter by Lattice Type
                                }
                            }
                            
                            const matches = productLatticeType === this.selectedLatticeType;
                            if (!matches && productLatticeType) {
                                console.log(`❌ Lattice Type mismatch: ${product.item_name} has ${productLatticeType}, need ${this.selectedLatticeType}`);
                            }
                            return matches;
                        });
                        console.log(`🔲 Lattice Type filtering (${this.selectedLatticeType}): ${beforeLatticeType} → ${filteredProducts.length} products (Hardware/Caps exempted)`);
                    }
                    
                    // ORIENTATION FILTER (exempt Hardware, Caps, and Posts)
                    if (this.selectedOrientation) {
                        const beforeOrientation = filteredProducts.length;
                        filteredProducts = filteredProducts.filter(product => {
                            const attributes = product.attributes || {};
                            const productOrientation = attributes['Orientation'];
                            const isHardwareOrCap = product.custom_material_class === 'Hardware' || product.custom_material_class === 'Cap';
                            const isPost = product.custom_material_class === 'Post';
                            
                            if (isHardwareOrCap || isPost) {
                                return true; // Exempt Hardware, Caps, and Posts
                            }
                            
                            const matches = productOrientation === this.selectedOrientation;
                            if (!matches && productOrientation) {
                                console.log(`❌ Orientation mismatch: ${product.item_name} has ${productOrientation}, need ${this.selectedOrientation}`);
                            }
                            return matches;
                        });
                        console.log(`🔄 Orientation filtering (${this.selectedOrientation}): ${beforeOrientation} → ${filteredProducts.length} products (Hardware/Caps/Posts exempted)`);
                    }
                    
                    // PICKET TYPE FILTER (exempt Hardware and Caps)
                    if (this.selectedPicketType) {
                        const beforePicketType = filteredProducts.length;
                        filteredProducts = filteredProducts.filter(product => {
                            const attributes = product.attributes || {};
                            const productPicketType = attributes['Picket Type'];
                            const isHardwareOrCap = product.custom_material_class === 'Hardware' || product.custom_material_class === 'Cap';
                            
                            if (isHardwareOrCap) {
                                return true; // Exempt Hardware and Caps
                            }
                            
                            const matches = productPicketType === this.selectedPicketType;
                            if (!matches && productPicketType) {
                                console.log(`❌ Picket Type mismatch: ${product.item_name} has ${productPicketType}, need ${this.selectedPicketType}`);
                            }
                            return matches;
                        });
                        console.log(`🔳 Picket Type filtering (${this.selectedPicketType}): ${beforePicketType} → ${filteredProducts.length} products (Hardware/Caps exempted)`);
                    }
                    
                    products = filteredProducts;
                    console.log(`✅ FINAL FILTERING RESULT: ${originalCount} → ${products.length} products`);
                    
                    // Show final product names for verification
                    if (products.length <= 20) {
                        console.log('📋 Final products:', products.map(p => p.item_name));
                    } else {
                        console.log('📋 Final products (first 10):', products.slice(0, 10).map(p => p.item_name));
                        console.log(`   ... and ${products.length - 10} more`);
                    }
                }
                

            }
            
            // Method 1.5: If no products found with complex filters, try simple template API
            if (products.length === 0 && this.selectedCategory) {
                console.log('Trying simple template items API...');
                const response1_5 = await frappe.call({
                    method: 'webshop.webshop.pos_api.get_template_items_for_pos',
                    args: {
                        category: this.selectedCategory
                    }
                });
                products = response1_5.message?.items || [];
                console.log('Template items found:', products.length);
            }
            
            // Method 2: If no products found, try custom_material_type filter
            if (products.length === 0 && this.selectedCategory) {
                console.log('No products with fence API, trying custom_material_type...');
                const response2 = await frappe.call({
                    method: 'webshop.webshop.api.get_product_filter_data', 
                    args: {
                        query_args: {
                            field_filters: {
                                custom_material_type: this.selectedCategory
                            }
                        }
                    }
                });
                products = response2.message?.items || [];
                console.log('Products found with custom_material_type:', products.length);
            }
            
            // Method 3: If no products found, try item_group as fallback
            if (products.length === 0 && this.selectedCategory) {
                console.log('No products with custom_material_type, trying item_group...');
                const response3 = await frappe.call({
                    method: 'webshop.webshop.api.get_product_filter_data',
                    args: {
                        query_args: {
                            field_filters: {
                                item_group: this.selectedCategory
                            }
                        }
                    }
                });
                products = response3.message?.items || [];
                console.log('Products found with item_group:', products.length);
            }
            
            // Method 4: Enhanced direct Website Item query with better filters
            if (products.length === 0) {
                console.log('Trying enhanced direct Website Item query...');
                products = await this.getWebsiteItemsDirectEnhanced();
            }
            
            console.log('Final products to display:', products);
            this.logProductDetails(products);
            return products;
            
        } catch (error) {
            console.error('Error loading products from webshop:', error);
            return [];
        }
    }
    
    async getWebsiteItemsDirectEnhanced() {
        try {
            // Get Website Items with enhanced filtering
            let filters = { published: 1 };
            
            // For Website Items, we can only use standard fields like item_group
            // custom_material_type is not available on Website Item doctype
            let websiteItems = [];
            
            if (this.selectedCategory) {
                console.log('Trying item_group filter for Website Items...');
                
                // Try item_group filter first (this is available on Website Item)
            const response = await frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Website Item',
                        filters: { 
                            published: 1,
                            item_group: this.selectedCategory 
                        },
                        fields: ['name', 'item_code', 'web_item_name', 'website_image', 'route', 'item_group'],
                        limit: 50
                    }
                });
                
                websiteItems = response.message || [];
                console.log(`Found ${websiteItems.length} items with item_group filter`);
                
                if (websiteItems.length === 0) {
                    console.log('No items found with item_group, trying broader search...');
                    // Fallback: get all published items and filter by name matching
                    const allResponse = await frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Website Item',
                    filters: { published: 1 },
                            fields: ['name', 'item_code', 'web_item_name', 'website_image', 'route', 'item_group'],
                            limit: 100
                        }
                    });
                    
                    const allItems = allResponse.message || [];
                    // Filter by name containing category
                    websiteItems = allItems.filter(item => 
                        item.web_item_name.toLowerCase().includes(this.selectedCategory.toLowerCase()) ||
                        item.item_group.toLowerCase().includes(this.selectedCategory.toLowerCase())
                    );
                    console.log(`Filtered items by name/group matching: ${websiteItems.length}`);
                }
            } else {
                // No category selected, get all published items
                console.log('Getting all published Website Items...');
                const response = await frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Website Item',
                        filters: filters,
                        fields: ['name', 'item_code', 'web_item_name', 'website_image', 'route', 'item_group'],
                    limit: 50
                }
            });
                websiteItems = response.message || [];
            }
            
            console.log('Website Items found:', websiteItems.length);
            
            // Enhanced validation for sellable items with detailed info
            const sellableItems = [];
            
            for (const websiteItem of websiteItems) {
                try {
                    // Get comprehensive item data including custom_material_type and custom_material_class from Item doctype
                    const itemResponse = await frappe.call({
                        method: 'frappe.client.get_value',
                        args: {
                            doctype: 'Item',
                            filters: { item_code: websiteItem.item_code },
                            fieldname: ['is_sales_item', 'has_variants', 'disabled', 'standard_rate', 'stock_uom', 'item_group', 'custom_material_type', 'custom_material_class', 'custom_rail_type', 'custom_ranch_rail_type']
                        }
                    });
                    
                    const itemData = itemResponse.message;
                    
                    // Enhanced sellability criteria - only actual sellable items
                    if (itemData && 
                        itemData.is_sales_item === 1 && 
                        itemData.disabled === 0 && 
                        itemData.has_variants === 0) {
                        
                        // Enhanced filtering using custom_material_type, custom_material_class, and selection criteria
                        let includeItem = true;
                        
                        // EXEMPTIONS: Special material class handling
                        const materialClass = itemData.custom_material_class ? itemData.custom_material_class.toLowerCase() : '';
                        const isHardware = materialClass === 'hardware';
                        const isCap = materialClass === 'cap';
                        
                        // Category/Material filtering with exemptions
                        if (this.selectedCategory) {
                            let categoryMatch = 
                                (itemData.custom_material_type && itemData.custom_material_type.toLowerCase() === this.selectedCategory.toLowerCase()) ||
                                (itemData.custom_material_class && itemData.custom_material_class.toLowerCase() === this.selectedCategory.toLowerCase()) ||
                                (itemData.item_group && itemData.item_group.toLowerCase() === this.selectedCategory.toLowerCase()) ||
                                (websiteItem.web_item_name.toLowerCase().includes(this.selectedCategory.toLowerCase()));
                            
                            // EXEMPTION 1: Hardware items - show if material type matches selected category
                            if (isHardware && itemData.custom_material_type && 
                                itemData.custom_material_type.toLowerCase() === this.selectedCategory.toLowerCase()) {
                                categoryMatch = true;
                                console.log(`🔧 HARDWARE EXEMPTION: ${websiteItem.item_code} - showing hardware item for material type match`);
                            }
                            
                            // EXEMPTION 2: Cap items - show if material type matches (color will be checked separately)
                            if (isCap && itemData.custom_material_type && 
                                itemData.custom_material_type.toLowerCase() === this.selectedCategory.toLowerCase()) {
                                categoryMatch = true;
                                console.log(`🧢 CAP EXEMPTION: ${websiteItem.item_code} - showing cap item for material type match`);
                            }
                            
                            includeItem = includeItem && categoryMatch;
                        }
                        
                        // Height filtering - check item name for height match
                        if (this.selectedHeight && includeItem) {
                            const heightMatch = websiteItem.web_item_name.toLowerCase().includes(this.selectedHeight.toLowerCase());
                            includeItem = includeItem && heightMatch;
                        }
                        
                        // Color filtering - check item name for color match
                        if (this.selectedColor && includeItem) {
                            let colorMatch = websiteItem.web_item_name.toLowerCase().includes(this.selectedColor.toLowerCase());
                            
                            // EXEMPTION for Cap items: Must match both material type AND color
                            if (isCap) {
                                // Cap items require color match when color is selected
                                includeItem = includeItem && colorMatch;
                            } else {
                                // Regular items: color filtering is optional
                                includeItem = includeItem && colorMatch;
                            }
                        } else if (this.selectedColor && isCap) {
                            // If color is selected but this cap item doesn't match, exclude it
                            includeItem = false;
                        }
                        
                        // Rail type filtering - check attributes first, then item name as fallback
                        if (this.selectedRailType && includeItem) {
                            let railTypeMatch = false;
                            
                            // For Ranch Rail style, check Ranch Rail Type attribute
                            if (this.selectedStyle === 'Ranch Rail' && itemData.custom_ranch_rail_type) {
                                railTypeMatch = itemData.custom_ranch_rail_type.toLowerCase() === this.selectedRailType.toLowerCase();
                            }
                            // For other styles, check generic Rail Type attribute
                            else if (itemData.custom_rail_type) {
                                railTypeMatch = itemData.custom_rail_type.toLowerCase() === this.selectedRailType.toLowerCase();
                            }
                            // Fallback: check item name
                            else {
                                railTypeMatch = websiteItem.web_item_name.toLowerCase().includes(this.selectedRailType.toLowerCase());
                            }
                            
                            includeItem = includeItem && railTypeMatch;
                        }
                        
                        // Style filtering - use custom_style field first, then custom_material_class as fallback
                        if (this.selectedStyle && includeItem) {
                            let styleMatch = false;
                            
                            // Primary: Use custom_style field for style filtering
                            if (itemData.custom_style) {
                                styleMatch = itemData.custom_style.toLowerCase() === this.selectedStyle.toLowerCase();
                            }
                            // Fallback: Use custom_material_class field if custom_style is not set
                            else if (itemData.custom_material_class) {
                                styleMatch = itemData.custom_material_class.toLowerCase() === this.selectedStyle.toLowerCase();
                            }
                            // If neither field is set, item doesn't match
                            else {
                                styleMatch = false;
                            }
                            
                            includeItem = includeItem && styleMatch;
                        }
                        
                        if (includeItem) {
                            // Check if item is a bundle
                            const bundleInfo = await this.checkIfProductBundle(websiteItem.item_code);
                        
                        sellableItems.push({
                            ...websiteItem,
                                standard_rate: itemData.standard_rate,
                                stock_uom: itemData.stock_uom,
                                material_type: itemData.custom_material_type,
                                material_class: itemData.custom_material_class,
                                category: itemData.item_group,
                                isBundle: bundleInfo.isBundle,
                                bundleItems: bundleInfo.bundleItems || []
                            });
                            
                            if (bundleInfo.isBundle) {
                                console.log('✅ Enhanced sellable bundle:', websiteItem.item_code, websiteItem.web_item_name, `(${bundleInfo.bundleItems.length} items)`);
                            } else {
                                console.log('✅ Enhanced sellable item:', websiteItem.item_code, websiteItem.web_item_name);
                            }
                        } else {
                            // Additional debug: show why item was filtered out
                            let filterReasons = [];
                            const itemNameLower = websiteItem.web_item_name.toLowerCase();
                            
                            if (this.selectedHeight && !itemNameLower.includes(this.selectedHeight.toLowerCase())) {
                                filterReasons.push(`Height: "${this.selectedHeight}" not found in name`);
                            }
                            if (this.selectedColor && !itemNameLower.includes(this.selectedColor.toLowerCase())) {
                                filterReasons.push(`Color: "${this.selectedColor}" not found in name`);
                            }
                            if (this.selectedRailType) {
                                let railTypeFound = false;
                                if (this.selectedStyle === 'Ranch Rail' && itemData.custom_ranch_rail_type) {
                                    railTypeFound = itemData.custom_ranch_rail_type.toLowerCase() === this.selectedRailType.toLowerCase();
                                } else if (itemData.custom_rail_type) {
                                    railTypeFound = itemData.custom_rail_type.toLowerCase() === this.selectedRailType.toLowerCase();
                                } else {
                                    railTypeFound = itemNameLower.includes(this.selectedRailType.toLowerCase());
                                }
                                if (!railTypeFound) {
                                    filterReasons.push(`Rail Type: "${this.selectedRailType}" not matched (custom_rail_type: ${itemData.custom_rail_type}, custom_ranch_rail_type: ${itemData.custom_ranch_rail_type})`);
                                }
                            }
                            
                            // Add exemption info to debug logs
                            if (isHardware) {
                                filterReasons.push(`✅ EXEMPTION: Hardware item - shown for material type match`);
                            }
                            if (isCap) {
                                if (this.selectedColor) {
                                    filterReasons.push(`✅ EXEMPTION: Cap item - requires material type + color match (color selected: ${this.selectedColor})`);
                                } else {
                                    filterReasons.push(`⚠️ EXEMPTION: Cap item - material type matches but no color selected`);
                                }
                            }
                            
                            if (this.selectedStyle) {
                                let styleFound = false;
                                
                                // Check custom_style field first
                                if (itemData.custom_style) {
                                    styleFound = itemData.custom_style.toLowerCase() === this.selectedStyle.toLowerCase();
                                }
                                // Check custom_material_class field as fallback
                                else if (itemData.custom_material_class) {
                                    styleFound = itemData.custom_material_class.toLowerCase() === this.selectedStyle.toLowerCase();
                                }
                                // If neither field is set, no match
                                else {
                                    styleFound = false;
                                }
                                
                                if (!styleFound) {
                                    filterReasons.push(`Style: "${this.selectedStyle}" not matched (custom_style: ${itemData.custom_style}, custom_material_class: ${itemData.custom_material_class})`);
                                }
                            }
                            
                            console.log('❌ Item filtered out by selection criteria:', websiteItem.item_code, {
                                custom_material_type: itemData.custom_material_type,
                                custom_material_class: itemData.custom_material_class,
                                item_group: itemData.item_group,
                                item_name: websiteItem.web_item_name,
                                filters: {
                                    selectedCategory: this.selectedCategory,
                                    selectedHeight: this.selectedHeight,
                                    selectedColor: this.selectedColor,
                                    selectedRailType: this.selectedRailType,
                                    selectedStyle: this.selectedStyle
                                },
                                filterReasons: filterReasons
                            });
                        }
                    } else {
                        console.log('❌ Skipping item:', websiteItem.item_code, {
                            is_sales_item: itemData?.is_sales_item,
                            disabled: itemData?.disabled,
                            has_variants: itemData?.has_variants
                        });
                    }
                } catch (itemError) {
                    console.log('Could not validate item:', websiteItem.item_code, itemError);
                }
            }
            
            console.log('Enhanced sellable items found after filtering:', sellableItems.length);
            
            // Get prices based on customer's price list - SMART FALLBACK
            const itemsWithPrices = await Promise.all(sellableItems.map(async (item) => {
                let price = 0.00; // Start with 0 - only use price list
                let usedPriceList = null;
                
                try {
                    // Try customer's default price list first, then current price list, then fallback to Contractor
                    const customerPriceList = this.selectedCustomer?.defaultPriceList || this.currentPriceList || 'Contractor';
                    
                    let priceResponse = await frappe.call({
                        method: 'frappe.client.get_list',
                        args: {
                            doctype: 'Item Price',
                            filters: { 
                                item_code: item.item_code,
                                price_list: customerPriceList
                            },
                            fields: ['price_list_rate'],
                            limit: 1
                        }
                    });
                    
                    if (priceResponse.message && priceResponse.message.length > 0) {
                        price = priceResponse.message[0].price_list_rate;
                        usedPriceList = customerPriceList;
                        console.log(`📈 Price from ${customerPriceList} for`, item.item_code, ':', price);
                    } else {
                        // Smart fallback: try to find price in any available price list
                        console.log(`⚠️ No price in ${customerPriceList} for ${item.item_code}, trying fallback price lists...`);
                        
                        // Get actual price lists from the system (no hardcoded fake ones)
                        const fallbackPriceLists = this.priceLists.map(pl => pl.name);
                        
                        for (const fallbackPriceList of fallbackPriceLists) {
                            if (fallbackPriceList === customerPriceList) continue; // Already tried
                            
                            try {
                                priceResponse = await frappe.call({
                                    method: 'frappe.client.get_list',
                                    args: {
                                        doctype: 'Item Price',
                                        filters: { 
                                            item_code: item.item_code,
                                            price_list: fallbackPriceList
                                        },
                                        fields: ['price_list_rate'],
                                        limit: 1
                                    }
                                });
                                
                                if (priceResponse.message && priceResponse.message.length > 0) {
                                    price = priceResponse.message[0].price_list_rate;
                                    usedPriceList = fallbackPriceList;
                                    console.log(`✅ Found fallback price in ${fallbackPriceList} for ${item.item_code}:`, price);
                                    break;
                                }
                            } catch (fallbackError) {
                                console.log(`❌ Error checking ${fallbackPriceList} for ${item.item_code}:`, fallbackError);
                            }
                        }
                        
                        if (!usedPriceList) {
                            console.log(`❌ No price found in any price list for ${item.item_code} - item will be excluded`);
                        }
                    }
                } catch (priceError) {
                    console.log('Could not get price list rate for item:', item.item_code, priceError);
                }
                
                return {
                    name: item.item_code,
                    item_name: item.web_item_name,
                    website_image: item.website_image,
                    route: item.route,
                    price_list_rate: price,
                    stock_uom: item.stock_uom || 'Unit',
                    material_type: item.material_type,
                    category: item.category,
                    isBundle: item.isBundle,
                    bundleItems: item.bundleItems
                };
            }));
            
            // Filter out items with zero or negative prices
            const itemsWithValidPrices = itemsWithPrices.filter(item => {
                const hasValidPrice = item.price_list_rate > 0;
                if (!hasValidPrice) {
                    console.log(`🔍 Filtering out item with invalid price: ${item.name} (Price: ${item.price_list_rate})`);
                }
                return hasValidPrice;
            });
            
            console.log(`Final enhanced items with valid pricing: ${itemsWithValidPrices.length} (filtered ${itemsWithPrices.length - itemsWithValidPrices.length} zero-price items)`);
            return itemsWithValidPrices;
            
        } catch (error) {
            console.error('Error getting enhanced Website Items:', error);
            return [];
        }
    }
    
    async getExemptedHardwareAndCapItems() {
        try {
            console.log('🔍 Starting exemption check for Hardware/Cap items...');
            console.log('🔍 Selected category:', this.selectedCategory);
            
            // Get Hardware items for the selected material type
            const hardwareResponse = await frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Website Item',
                    filters: {
                        published: 1
                    },
                    fields: ['name', 'item_code', 'web_item_name', 'website_image', 'route']
                }
            });
            
            if (!hardwareResponse.message) {
                console.log('❌ No Website Items found');
                return [];
            }
            
            console.log(`🔍 Found ${hardwareResponse.message.length} Website Items to check for exemptions`);
            
            const exemptedItems = [];
            let checkedCount = 0;
            
            // Check each website item for exemption criteria
            for (const websiteItem of hardwareResponse.message) {
                try {
                    const itemResponse = await frappe.call({
                        method: 'frappe.client.get_value',
                        args: {
                            doctype: 'Item',
                            filters: { item_code: websiteItem.item_code },
                            fieldname: ['is_sales_item', 'has_variants', 'disabled', 'custom_material_type', 'custom_material_class', 'standard_rate']
                        }
                    });
                    
                    const itemData = itemResponse.message;
                    if (!itemData || itemData.disabled === 1 || itemData.has_variants === 1 || itemData.is_sales_item !== 1) {
                        checkedCount++;
                        continue;
                    }
                    
                    const materialClass = (itemData.custom_material_class || '').toLowerCase();
                    const materialType = (itemData.custom_material_type || '').toLowerCase();
                    const selectedMaterialType = (this.selectedCategory || '').toLowerCase();
                    
                    checkedCount++;
                    
                    // Debug: Log every 10th item to see what we're finding
                    if (checkedCount % 10 === 0) {
                        console.log(`🔍 Checked ${checkedCount} items. Current: ${websiteItem.item_code} - Class: "${materialClass}", Type: "${materialType}"`);
                    }
                    
                    // EXEMPTION 1: Hardware items - show if material type matches
                    if (materialClass === 'hardware' && materialType === selectedMaterialType) {
                        exemptedItems.push({
                            ...websiteItem,
                            custom_material_class: 'Hardware',
                            material_class: 'Hardware',
                            price_list_rate: 0, // Will be set from price list lookup later
                            isExempted: true,
                            exemptionReason: 'Hardware exemption'
                        });
                        console.log(`🔧 HARDWARE EXEMPTION: ${websiteItem.item_code} - included for material type match`);
                    }
                    
                    // EXEMPTION 2: Cap items - show if material type matches (color checked during filtering)
                    if (materialClass === 'cap' && materialType === selectedMaterialType) {
                        // For caps, we'll include them but they'll be filtered by color later if color is selected
                        if (!this.selectedColor || websiteItem.web_item_name.toLowerCase().includes(this.selectedColor.toLowerCase())) {
                            exemptedItems.push({
                                ...websiteItem,
                                custom_material_class: 'Cap',
                                material_class: 'Cap',
                                price_list_rate: 0, // Will be set from price list lookup later
                                isExempted: true,
                                exemptionReason: 'Cap exemption'
                            });
                            console.log(`🧢 CAP EXEMPTION: ${websiteItem.item_code} - included for material type + color match`);
                        }
                    }
                    
                } catch (itemError) {
                    console.log('Could not check exemption for item:', websiteItem.item_code, itemError);
                }
            }
            
            console.log(`🔍 Finished checking ${checkedCount} items. Found ${exemptedItems.length} exempted items.`);
            
            // If we didn't find any exempted items, let's try a more direct approach
            if (exemptedItems.length === 0) {
                console.log('🔍 Trying direct search for Hardware/Cap items...');
                
                try {
                    // Direct search for Hardware items
                    const hardwareDirectResponse = await frappe.call({
                        method: 'frappe.client.get_list',
                        args: {
                            doctype: 'Item',
                            filters: {
                                custom_material_class: 'Hardware',
                                custom_material_type: this.selectedCategory,
                                is_sales_item: 1,
                                has_variants: 0,
                                disabled: 0
                            },
                            fields: ['item_code', 'item_name', 'standard_rate', 'custom_material_class', 'custom_material_type']
                        }
                    });
                    
                    console.log(`🔍 Direct Hardware search found: ${hardwareDirectResponse.message?.length || 0} items`);
                    
                    // Direct search for Cap items
                    const capDirectResponse = await frappe.call({
                        method: 'frappe.client.get_list',
                        args: {
                            doctype: 'Item',
                            filters: {
                                custom_material_class: 'Cap',
                                custom_material_type: this.selectedCategory,
                                is_sales_item: 1,
                                has_variants: 0,
                                disabled: 0
                            },
                            fields: ['item_code', 'item_name', 'standard_rate', 'custom_material_class', 'custom_material_type']
                        }
                    });
                    
                    console.log(`🔍 Direct Cap search found: ${capDirectResponse.message?.length || 0} items`);
                    
                    // Get Website Items for these Hardware/Cap items
                    const allHardwareCapCodes = [
                        ...(hardwareDirectResponse.message || []).map(item => item.item_code),
                        ...(capDirectResponse.message || []).map(item => item.item_code)
                    ];
                    
                    if (allHardwareCapCodes.length > 0) {
                        console.log(`🔍 Looking for Website Items for: ${allHardwareCapCodes.join(', ')}`);
                        
                        const websiteItemsResponse = await frappe.call({
                            method: 'frappe.client.get_list',
                            args: {
                                doctype: 'Website Item',
                                filters: {
                                    item_code: ['in', allHardwareCapCodes],
                                    published: 1
                                },
                                fields: ['name', 'item_code', 'web_item_name', 'website_image', 'route']
                            }
                        });
                        
                        console.log(`🔍 Found ${websiteItemsResponse.message?.length || 0} Website Items for Hardware/Cap items`);
                        
                        // Add these to exempted items
                        for (const websiteItem of (websiteItemsResponse.message || [])) {
                            const itemData = [...(hardwareDirectResponse.message || []), ...(capDirectResponse.message || [])]
                                .find(item => item.item_code === websiteItem.item_code);
                            
                            if (itemData) {
                                const isCap = itemData.custom_material_class === 'Cap';
                                const shouldInclude = !isCap || !this.selectedColor || 
                                    websiteItem.web_item_name.toLowerCase().includes(this.selectedColor.toLowerCase());
                                
                                if (shouldInclude) {
                                    exemptedItems.push({
                                        ...websiteItem,
                                        custom_material_class: itemData.custom_material_class,
                                        material_class: itemData.custom_material_class,
                                        price_list_rate: 0, // Will be set from price list lookup later
                                        isExempted: true,
                                        exemptionReason: `${itemData.custom_material_class} exemption (direct search)`
                                    });
                                    console.log(`🔧 DIRECT ${itemData.custom_material_class.toUpperCase()} EXEMPTION: ${websiteItem.item_code}`);
                                }
                            }
                        }
                    }
                    
                } catch (directError) {
                    console.error('Error in direct Hardware/Cap search:', directError);
                }
            }
            
            return exemptedItems;
            
        } catch (error) {
            console.error('Error getting exempted Hardware/Cap items:', error);
            return [];
        }
    }
    
    async displayRealProducts(products) {
        const container = document.getElementById('componentsContainer');
        if (!container) return;
        
        // Debug: Check what fields are available
        console.log('🔍 Sample product structure:', products[0]);
        console.log('🔍 Product material classes:', products.map(p => p.custom_material_class || p.material_class || 'undefined'));
        
        // Hardware and Caps are now included in the main API response
        let allProducts = [...products];
        
        // Enhanced grouping using attributes for sub-segmentation
        console.log('🔍 Analyzing products for attribute-based sub-segmentation...');
        
        // First, get all available attributes from products
        const allAttributes = {};
        allProducts.forEach(product => {
            if (product.attributes) {
                Object.entries(product.attributes).forEach(([attrName, attrValue]) => {
                    if (!allAttributes[attrName]) {
                        allAttributes[attrName] = new Set();
                    }
                    allAttributes[attrName].add(attrValue);
                });
            }
        });
        
        console.log('📋 Available attributes for sub-segmentation:', Object.keys(allAttributes));
        console.log('📋 Attribute values:', Object.fromEntries(
            Object.entries(allAttributes).map(([k, v]) => [k, Array.from(v)])
        ));
        
        // Create intelligent sections based on attributes and material class
        const sections = this.createAttributeBasedSections(allProducts, allAttributes);
        console.log('📊 Creating attribute-based sections:', sections);
        let html = '';
        
        sections.forEach((section, index) => {
            const sectionClass = (index === 1 || index === 3) ? 'component-section light-blue' : 'component-section';
            const sectionId = section.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
            
            html += `
                <div class="${sectionClass}">
                    <div class="component-header">${section.name.toUpperCase()}</div>
                    <div class="component-grid" id="${sectionId}Grid">
            `;
            
            // Use the products from the section object
            const sectionProducts = section.products.slice(0, 6);
            
            console.log(`📦 Section "${section.name}": ${sectionProducts.length} products found`);
            
            if (sectionProducts.length > 0) {
                sectionProducts.forEach(product => {
                    try {
                        const price = product.price_list_rate || product.pos_price || 0.00; // Use price_list_rate first, fallback to pos_price
                        console.log(`🔥 PRICING DEBUG - Product: ${product.name}, price_list_rate: ${product.price_list_rate}, pos_price: ${product.pos_price}, final price: ${price}`);
                        
                        // CRITICAL FIX: Ensure the product object has the correct price for display
                        product.price_list_rate = price;
                        // Use the original product name as unique ID
                        const productId = product.name || `product-${Math.random().toString(36).substr(2, 9)}`;
                        // Ensure item name is safe for display
                        const safeItemName = (product.item_name || product.name || 'Unknown Item').replace(/[<>"']/g, '');
                        // Ensure image URL is safe
                        const safeImageUrl = product.website_image || '';
                        
                        // Bundle information
                        const bundleInfo = {
                            isBundle: product.isBundle || false,
                            bundleItems: product.bundleItems || []
                        };
                        
                        console.log('Adding real product:', { productId, safeItemName, price, bundleInfo });
                        html += this.createProductCard(productId, safeItemName, price, safeImageUrl, bundleInfo);
                    } catch (error) {
                        console.error('Error processing product:', product, error);
                    }
                });
            }
            
            html += `</div></div>`;
        });
        
        console.log('Generated HTML for real products, length:', html.length);
        try {
            container.innerHTML = html;
            console.log('Successfully displayed real products');
        } catch (error) {
            console.error('Error displaying real products HTML:', error);
        }
    }
    
    displayNoProductsMessage() {
        const container = document.getElementById('componentsContainer');
        if (!container) {
            console.error('Components container not found!');
            return;
        }
        
        container.innerHTML = `
            <div class="component-section">
                <div class="component-header">NO SELLABLE PRODUCTS FOUND</div>
                <div style="text-align: center; padding: 40px; color: #6c757d;">
                    <div style="font-size: 48px; margin-bottom: 20px;">🚫</div>
                    <h3>No Sellable Products Available</h3>
                    <p>The items in your database are not properly configured for sales.</p>
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left;">
                        <h4 style="margin: 0 0 10px 0; color: #495057;">Items may be excluded because they are:</h4>
                        <ul style="margin: 0; padding-left: 20px; color: #6c757d;">
                            <li>Not marked as "Sales Item" in Item master</li>
                            <li>Template items (need specific variants)</li>
                            <li>Disabled items</li>
                            <li>Missing price information</li>
                        </ul>
                    </div>
                    <p><strong>To fix this:</strong> Go to your Frappe Item list and ensure items are enabled for sales.</p>
                    <button onclick="window.location.reload()" class="checkout-btn" style="margin-top: 20px; width: auto; padding: 10px 20px;">
                        Refresh After Fixing Items
                    </button>
                </div>
            </div>
        `;
    }
    
    createProductCard(itemId, itemName, price, image = null, bundleInfo = null) {
        // Safely encode parameters to avoid JavaScript injection and syntax errors
        const safeItemId = encodeURIComponent(itemId);
        const safeItemName = encodeURIComponent(itemName);
        
        // Simple HTML escaping for display (no double encoding)
        const displayItemName = itemName
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        
        // Generate unique data attributes to avoid onclick encoding issues
        const cardId = `card-${Math.random().toString(36).substr(2, 9)}`;
        
        // Bundle indicator
        const isBundleItem = bundleInfo && bundleInfo.isBundle;
        const bundleCount = isBundleItem ? (bundleInfo.bundleItems?.length || 0) : 0;
        
        console.log('Creating product card:', { 
            itemId, 
            safeItemId, 
            itemName, 
            safeItemName, 
            displayItemName, 
            cardId,
            isBundle: isBundleItem,
            bundleCount
        });
        
        // Get appropriate fallback icon based on item name/type
        const fallbackIcon = this.getItemFallbackIcon(itemName, isBundleItem);
        
        return `
            <div class="item-card ${isBundleItem ? 'bundle-card' : ''}" data-item-id="${safeItemId}" data-item-name="${safeItemName}" data-price="${price}" id="${cardId}">
                <div class="item-image">
                    ${image ? 
                        `<img src="${image}" alt="${displayItemName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" onerror="this.style.display='none'; this.parentNode.innerHTML='${fallbackIcon}';">` : 
                        fallbackIcon
                    }
                    ${isBundleItem ? `
                        <div class="bundle-badge" style="position: absolute; top: 4px; right: 4px; background: #007bff; color: white; border-radius: 10px; padding: 2px 6px; font-size: 10px; font-weight: bold;">
                            Bundle
                </div>
                    ` : ''}
                </div>
                <div class="item-name">
                    ${isBundleItem ? '📦 ' : ''}${displayItemName}
                </div>
                ${isBundleItem ? `
                    <div class="bundle-info" style="font-size: 11px; color: #6c757d; margin: 2px 0; text-align: center;">
                        Contains ${bundleCount} item${bundleCount !== 1 ? 's' : ''}
                    </div>
                ` : ''}
                <div class="item-price">$${price.toFixed(2)}</div>
                <div class="item-stock">In Stock</div>
                <div class="item-controls">
                    <button class="item-qty-btn minus-btn" data-action="decrease" disabled>-</button>
                    <input type="text" class="item-qty-input" value="0" readonly data-action="modal">
                    <button class="item-qty-btn plus-btn" data-action="increase">+</button>
                </div>
            </div>
        `;
    }
    

    
    async updateItemQuantity(encodedItemId, targetQty, encodedItemName, price) {
        // Decode the parameters
        const itemId = decodeURIComponent(encodedItemId);
        const itemName = decodeURIComponent(encodedItemName);
        
        console.log('Raw parameters received:', { encodedItemId, targetQty, encodedItemName, price });
        console.log('Decoded parameters:', { itemId, targetQty, itemName, price });
        
        try {
            // Always use POS-specific API to ensure price list is respected
            console.log(`🛒 Using POS API to add/update item ${itemId} with quantity ${targetQty} and price list ${this.currentPriceList}`);
            await this.addToWebshopCart(itemId, itemName, price, targetQty);
            
            console.log(`✅ Updated ${itemId} to quantity ${targetQty}`);
            
            // Update UI
            await this.updateCartDisplay();
            
        } catch (error) {
            console.error('Error updating quantity:', error);
            this.showError('Failed to update cart. Please try again.');
        }
        
        // Always update cart display at the end (with small delay to let backend process)
        setTimeout(async () => {
            try {
                await this.updateCartDisplay();
            } catch (displayError) {
                console.error('Error updating cart display:', displayError);
                this.showError('Failed to refresh cart display.');
            }
        }, 300);
    }
    

    
    async getCurrentCart() {
        try {
            const response = await frappe.call({
                method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation'
            });
            return response.message?.doc;
        } catch (error) {
            console.error('Error getting current cart:', error);
            return null;
        }
    }

    async addToWebshopCart(itemCode, itemName, price, qty) {
        try {
            // Check if the item is a product bundle first
            const bundleInfo = await this.checkIfProductBundle(itemCode);
            
            // Use POS-specific cart API that handles price list correctly
            const response = await frappe.call({
                method: 'webshop.pos_api.add_item_to_cart_with_price_list',
                args: {
                    item_code: itemCode,
                    qty: qty,
                    price_list: this.currentPriceList
                }
            });
            
            // The new API handles price list setting internally, but let's verify
            if (this.currentPriceList) {
                console.log(`🏷️ Item added with POS price list: ${this.currentPriceList}`);
            } else {
                console.log(`⚠️ No price list selected - item added with default pricing`);
            }
            
            console.log('✅ Successfully added to cart:', {
                item: itemCode,
                name: itemName,
                qty: qty,
                price: price,
                isBundle: bundleInfo.isBundle
            });
            console.log('Cart API response:', response);
            
            // Show success feedback with bundle info if applicable
            const notification = document.createElement('div');
            notification.className = 'cart-notification';
            
            let notificationText = `✅ Added ${itemName} to cart`;
            if (bundleInfo.isBundle) {
                if (bundleInfo.bundleItems.length > 0) {
                    notificationText += ` (Bundle: ${bundleInfo.bundleItems.length} items)`;
                } else {
                    notificationText += ` (Bundle - contents will show in cart)`;
                }
            }
            
            notification.innerHTML = notificationText;
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #28a745;
                color: white;
                padding: 10px 15px;
                border-radius: 5px;
                z-index: 9999;
                font-size: 14px;
                max-width: 300px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            `;
            document.body.appendChild(notification);
            
            // Remove notification after 3 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 3000);
            
            return response;
        } catch (error) {
            console.error('Error adding to webshop cart:', error);
            
            // Parse the error message to provide specific feedback
            let errorMessage = 'Failed to add item to cart.';
            
            if (error.responseText) {
                const errorText = error.responseText;
                if (errorText.includes('not marked as sales item')) {
                    errorMessage = `This item is not configured for sales. Please contact administrator to enable "${itemName}" as a sales item.`;
                } else if (errorText.includes('is a template')) {
                    errorMessage = `"${itemName}" is a template item. Please select a specific variant instead.`;
                } else if (errorText.includes('ValidationError')) {
                    // Try to extract the actual error message
                    const match = errorText.match(/ValidationError: (.+?)(?:\n|$)/);
                    if (match) {
                        errorMessage = match[1];
                    }
                }
            }
            
            this.showError(errorMessage);
            throw error;
        }
    }
    
    async checkIfProductBundle(itemCode) {
        try {
            console.log('🔍 Checking if item is a product bundle:', itemCode);
            
            // Use whitelisted function for efficient bundle checking (no permission errors)
            const bundleResponse = await frappe.call({
                method: 'webshop.webshop.pos_api.check_product_bundle',
                args: {
                    item_code: itemCode
                }
            });
            
            const bundleInfo = bundleResponse.message;
            
            if (bundleInfo.is_bundle) {
                console.log(`📦 Item is a product bundle: ${bundleInfo.bundle_name} with ${bundleInfo.bundle_items.length} items`);
                return {
                    isBundle: true,
                    bundleName: bundleInfo.bundle_name,
                    bundleItems: bundleInfo.bundle_items
                };
            } else {
                console.log('📦 Item is not a product bundle');
                return {
                    isBundle: false,
                    bundleItems: []
                };
            }
        } catch (error) {
            console.log('📦 Bundle check failed, treating as non-bundle item:', itemCode, error);
            return {
                isBundle: false,
                bundleItems: []
            };
        }
    }
    
    async removeFromWebshopCart(itemCode, qty) {
        try {
            // Get current cart to find current quantity
            const cartResponse = await frappe.call({
                method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation'
            });
            
            if (cartResponse.message && cartResponse.message.items) {
                const item = cartResponse.message.items.find(i => i.item_code === itemCode);
                if (item) {
                    const newQty = Math.max(0, item.qty - qty);
                    
                    // Use update_cart with new quantity
                    const response = await frappe.call({
                        method: 'webshop.webshop.shopping_cart.cart.update_cart',
                        args: {
                            item_code: itemCode,
                            qty: newQty,
                            with_items: 1
                        }
                    });
                    
                    console.log('Updated cart quantity:', response);
                    return response;
                }
            }
        } catch (error) {
            console.error('Error removing from webshop cart:', error);
            throw error;
        }
    }
    

    
        async updateCartDisplay() {
        try {
            // Get webshop cart only
            const response = await frappe.call({
                method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation'
            });
            
            // Cache the response for bundle item extraction
            this.lastCartResponse = response;
            
            console.log('Cart response:', response);
            console.log('Cart response structure:', JSON.stringify(response, null, 2));
            
            // The cart data is in response.message.doc, not response.message.items
            const cartDoc = response.message?.doc;
            const cartItems = cartDoc?.items || [];
            
            // Note: Cart price list may differ from POS price list
            // POS maintains its own price list setting (Standard Selling by default)
            // Cart pricing will be updated when user explicitly changes POS price list
            
            if (cartItems.length > 0) {
                console.log('Displaying webshop cart with', cartItems.length, 'items');
                console.log('Cart items details:', cartItems);
                
                // Debug: check field names in cart items
                cartItems.forEach((item, index) => {
                    console.log(`Cart item ${index} field names:`, Object.keys(item));
                    console.log(`Cart item ${index} data:`, item);
                });
                
                // Check for bundles in cart items
                const itemsWithBundleInfo = await this.addBundleInfoToCartItems(cartItems);
                
                // Create cart data structure that displayWebshopCart expects
                const cartData = {
                    items: itemsWithBundleInfo,
                    net_total: cartDoc.net_total || 0,
                    grand_total: cartDoc.grand_total || cartDoc.total || 0,
                    total_qty: cartItems.reduce((sum, item) => sum + (item.qty || 0), 0)
                };
                
                console.log('Formatted cart data with bundle info:', cartData);
                this.displayWebshopCart(cartData);
                // Update product card quantities
                this.updateProductCardQuantities(cartItems);
            } else {
                console.log('No items in cart - cartDoc:', cartDoc);
                this.displayEmptyCart();
                // Reset all product card quantities to 0
                this.updateProductCardQuantities([]);
            }
        } catch (error) {
            console.error('Error updating cart display:', error);
            this.displayEmptyCart();
        }
    }
    
    async addBundleInfoToCartItems(cartItems) {
        const itemsWithBundleInfo = [];
        
        for (const item of cartItems) {
            // No need for try-catch since whitelisted function won't throw permission errors
            const bundleInfo = await this.checkIfProductBundle(item.item_code);
            
            // Use bundle items directly from whitelisted API response, or fallback to cart data
            let bundleItems = bundleInfo.bundleItems || [];
            let isBundle = bundleInfo.isBundle;
            
            if (bundleInfo.isBundle && bundleItems.length === 0) {
                // Fallback: Look for packed_items in the cart response
                bundleItems = this.getBundleItemsFromCart(item.item_code);
            } else if (!bundleInfo.isBundle) {
                // Check if this item has packed_items anyway (might be a bundle without Product Bundle record)
                const packedItems = this.getBundleItemsFromCart(item.item_code);
                if (packedItems.length > 0) {
                    console.log(`📦 Detected bundle from packed_items: ${item.item_code} has ${packedItems.length} components`);
                    isBundle = true;
                    bundleItems = packedItems;
                }
            }
            
            const itemWithBundle = {
                ...item,
                isBundle: isBundle,
                bundleItems: bundleItems
            };
            itemsWithBundleInfo.push(itemWithBundle);
        }
        
        return itemsWithBundleInfo;
    }
    
    getBundleItemsFromCart(parentItemCode) {
        // Extract bundle items from cart's packed_items
        try {
            // Get the last cart response data
            if (this.lastCartResponse && this.lastCartResponse.message && this.lastCartResponse.message.doc) {
                const packedItems = this.lastCartResponse.message.doc.packed_items || [];
                
                // Filter packed items for this parent item
                const bundleItems = packedItems
                    .filter(packedItem => packedItem.parent_item === parentItemCode)
                    .map(packedItem => ({
                        item_code: packedItem.item_code,
                        item_name: packedItem.item_name,
                        qty: packedItem.qty,
                        uom: packedItem.uom,
                        rate: packedItem.rate,
                        description: packedItem.description
                    }));
                
                console.log(`📦 Found ${bundleItems.length} packed items for bundle ${parentItemCode}:`, bundleItems);
                return bundleItems;
            }
        } catch (error) {
            console.log('Could not extract bundle items from cart:', error);
        }
        
        return [];
    }
    
    displayEmptyCart() {
        const cartItems = document.getElementById('cartItems');
        const totalQty = document.getElementById('totalQty');
        const netTotal = document.getElementById('netTotal');
        const grandTotal = document.getElementById('grandTotal');
        const generateQuoteBtn = document.querySelector('.generate-quote-btn');
        
        if (cartItems) cartItems.innerHTML = '<div class="empty-cart">No items in cart</div>';
        if (totalQty) totalQty.textContent = '0';
        if (netTotal) netTotal.textContent = '$0.00';
        if (grandTotal) grandTotal.textContent = '$0.00';
        
        // Hide Generate Quote button when cart is empty
        if (generateQuoteBtn && this.orderType === 'quote') {
            generateQuoteBtn.style.display = 'none';
        }
    }
    
    updateProductCardQuantities(cartItems) {
        console.log('Updating product card quantities for', cartItems.length, 'items');
        
        // Reset all quantities to 0 first
        document.querySelectorAll('.item-qty-input').forEach(input => {
            input.value = '0';
            // Enable/disable minus button
            const minusBtn = input.parentElement.querySelector('.minus-btn');
            if (minusBtn) {
                minusBtn.disabled = true;
            }
        });
        
        // Update quantities for items in cart
        cartItems.forEach(cartItem => {
            console.log('Processing cart item:', cartItem);
            const encodedItemCode = encodeURIComponent(cartItem.item_code);
            const itemCard = document.querySelector(`[data-item-id="${encodedItemCode}"]`);
            
            console.log('Looking for item card with data-item-id:', encodedItemCode);
            console.log('Found item card:', itemCard);
            
            if (itemCard) {
                const qtyInput = itemCard.querySelector('.item-qty-input');
                const minusBtn = itemCard.querySelector('.minus-btn');
                
                if (qtyInput) {
                    qtyInput.value = cartItem.qty;
                    console.log('✅ Updated quantity input to:', cartItem.qty);
                }
                
                if (minusBtn) {
                    minusBtn.disabled = cartItem.qty <= 0;
                    console.log('✅ Updated minus button disabled state:', cartItem.qty <= 0);
                }
                
                console.log('✅ Updated product card quantity:', cartItem.item_code, 'to', cartItem.qty);
            } else {
                console.log('❌ Could not find product card for:', cartItem.item_code, 'encoded as:', encodedItemCode);
                // Debug: show all available data-item-id values
                const allCards = document.querySelectorAll('[data-item-id]');
                console.log('Available product cards:', Array.from(allCards).map(card => card.dataset.itemId));
            }
        });
    }

    
    displayWebshopCart(cartData) {
        const cartItems = document.getElementById('cartItems');
        const totalQty = document.getElementById('totalQty');
        const netTotal = document.getElementById('netTotal');
        const grandTotal = document.getElementById('grandTotal');
        
        if (!cartData.items || cartData.items.length === 0) {
            cartItems.innerHTML = '<div class="empty-cart">No items in cart</div>';
            totalQty.textContent = '0';
            netTotal.textContent = '$0.00';
            grandTotal.textContent = '$0.00';
            return;
        }
        
        let html = '';
        let totalQuantity = 0;
        
        cartData.items.forEach(item => {
            totalQuantity += item.qty;
            const lineTotal = item.amount || (item.rate * item.qty);
            
            // Main cart item
            html += `
                <div class="cart-item ${item.isBundle ? 'bundle-item' : ''}" data-item-code="${item.item_code}">
                    <div class="cart-item-info">
                        <div class="cart-item-name">
                            ${item.isBundle ? '📦 ' : ''}${item.item_name}
                            ${item.isBundle ? `<span class="bundle-indicator" style="font-size: 11px; color: #007bff; font-weight: normal;">(Bundle)</span>` : ''}
                        </div>
                        <div class="cart-item-price">$${item.rate.toFixed(2)} each</div>
                    </div>
                    <div class="cart-item-controls">
                        <div class="cart-item-qty">
                            <div class="qty-btn cart-minus-btn" data-action="decrease">-</div>
                            <span>${item.qty}</span>
                            <div class="qty-btn cart-plus-btn" data-action="increase">+</div>
                        </div>
                        <button class="cart-delete-btn" title="Remove item from cart" onclick="window.fencePOS.removeCartItem('${item.item_code.replace(/'/g, "\\'")}')" style="background: #f8f9fa; color: #6c757d; border: 1px solid #dee2e6; border-radius: 4px; padding: 6px 8px; margin-left: 8px; cursor: pointer; font-size: 14px; transition: all 0.2s;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle;">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                        </button>
                    </div>
                    <div style="color: #E74C3C; font-weight: 500;">$${lineTotal.toFixed(2)}</div>
                </div>
            `;
            
            // Show bundle contents if this is a bundle
            if (item.isBundle && item.bundleItems && item.bundleItems.length > 0) {
                html += `
                    <div class="bundle-contents" style="background: #f8f9fa; margin: 0 10px 10px 20px; border-radius: 6px; border-left: 3px solid #007bff;">
                        <div class="bundle-header" style="padding: 8px 12px; font-size: 12px; font-weight: 500; color: #495057; border-bottom: 1px solid #dee2e6;">
                            📋 Bundle Contains (${item.bundleItems.length} items):
                        </div>
                        <div class="bundle-items-list" style="padding: 8px 12px;">
                `;
                
                item.bundleItems.forEach((bundleItem, index) => {
                    // Show the per-bundle quantity, not the total calculated quantity
                    const perBundleQty = bundleItem.qty || 1;
                    const totalQty = perBundleQty * item.qty;
                    const componentId = `bundle-${item.item_code}-${bundleItem.item_code}`.replace(/[^a-zA-Z0-9-_]/g, '');
                    html += `
                        <div class="bundle-item-row" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; ${index > 0 ? 'border-top: 1px solid #e9ecef;' : ''} font-size: 12px;">
                            <div class="bundle-item-details" style="flex: 1;">
                                <span class="bundle-item-name" style="color: #495057; font-weight: 500;">
                                    ${bundleItem.item_name || bundleItem.item_code}
                                </span>
                                ${bundleItem.description ? `<div style="color: #6c757d; font-size: 11px; margin-top: 2px;">${bundleItem.description}</div>` : ''}
                                <div style="color: #6c757d; font-size: 10px; margin-top: 2px;">
                                    Total: ${totalQty} ${bundleItem.uom || 'Unit'}${totalQty > 1 ? 's' : ''} (${perBundleQty} per bundle × ${item.qty} bundles)
                                </div>
                            </div>
                            <div class="bundle-item-controls" style="display: flex; align-items: center; margin-left: 10px; gap: 8px;">
                                <div class="bundle-qty-controls" style="display: flex; align-items: center; background: white; border: 1px solid #dee2e6; border-radius: 4px;">
                                    <button class="bundle-qty-btn minus-btn" 
                                            onclick="window.fencePOS.updateBundleItemQuantity('${item.item_code}', '${bundleItem.item_code}', -1)"
                                            style="background: none; border: none; color: #6c757d; padding: 2px 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; min-width: 20px; height: 20px;"
                                            ${perBundleQty <= 1 ? 'disabled' : ''}>−</button>
                                    <span class="bundle-qty-display" id="${componentId}-qty" 
                                          style="padding: 2px 6px; color: #007bff; font-weight: 500; min-width: 20px; text-align: center; font-size: 11px;">
                                        ${perBundleQty}
                                    </span>
                                    <button class="bundle-qty-btn plus-btn" 
                                            onclick="window.fencePOS.updateBundleItemQuantity('${item.item_code}', '${bundleItem.item_code}', 1)"
                                            style="background: none; border: none; color: #6c757d; padding: 2px 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; min-width: 20px; height: 20px;">+</button>
                                </div>
                                <span style="color: #6c757d; font-size: 10px;">per bundle</span>
                            </div>
                </div>
            `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            } else if (item.isBundle) {
                // Bundle item without direct bundle contents - show from packed_items if available
                const packedItems = this.getPackedItemsForCartItem(item.item_code);
                if (packedItems.length > 0) {
                    html += `
                        <div class="bundle-contents" style="background: #f8f9fa; margin: 0 10px 10px 20px; border-radius: 6px; border-left: 3px solid #007bff;">
                            <div class="bundle-header" style="padding: 8px 12px; font-size: 12px; font-weight: 500; color: #495057; border-bottom: 1px solid #dee2e6;">
                                📋 Bundle Contains (${packedItems.length} items):
                            </div>
                            <div class="bundle-items-list" style="padding: 8px 12px;">
                    `;
                    
                    packedItems.forEach((packedItem, index) => {
                        const componentId = `bundle-${item.item_code}-${packedItem.item_code}`.replace(/[^a-zA-Z0-9-_]/g, '');
                        html += `
                            <div class="bundle-item-row" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; ${index > 0 ? 'border-top: 1px solid #e9ecef;' : ''} font-size: 12px;">
                                <div class="bundle-item-details" style="flex: 1;">
                                    <span class="bundle-item-name" style="color: #495057; font-weight: 500;">
                                        ${packedItem.item_name}
                                    </span>
                                    ${packedItem.description ? `<div style="color: #6c757d; font-size: 11px; margin-top: 2px;">${packedItem.description}</div>` : ''}
                                </div>
                                <div class="bundle-item-controls" style="display: flex; align-items: center; margin-left: 10px; gap: 8px;">
                                    <div class="bundle-qty-controls" style="display: flex; align-items: center; background: white; border: 1px solid #dee2e6; border-radius: 4px;">
                                        <button class="bundle-qty-btn minus-btn" 
                                                onclick="window.fencePOS.updateBundleItemQuantity('${item.item_code}', '${packedItem.item_code}', -1)"
                                                style="background: none; border: none; color: #6c757d; padding: 2px 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; min-width: 20px; height: 20px;"
                                                ${packedItem.qty <= 1 ? 'disabled' : ''}>−</button>
                                        <span class="bundle-qty-display" id="${componentId}-qty" 
                                              style="padding: 2px 6px; color: #007bff; font-weight: 500; min-width: 20px; text-align: center; font-size: 11px;">
                                            ${packedItem.qty}
                                        </span>
                                        <button class="bundle-qty-btn plus-btn" 
                                                onclick="window.fencePOS.updateBundleItemQuantity('${item.item_code}', '${packedItem.item_code}', 1)"
                                                style="background: none; border: none; color: #6c757d; padding: 2px 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; min-width: 20px; height: 20px;">+</button>
                                    </div>
                                    <span style="color: #6c757d; font-size: 10px;">${packedItem.uom || 'Unit'}${packedItem.qty > 1 ? 's' : ''}</span>
                                </div>
                            </div>
                        `;
                    });
                    
                    html += `
                            </div>
                        </div>
                    `;
                }
            }
        });
        
        cartItems.innerHTML = html;
        totalQty.textContent = totalQuantity;
        netTotal.textContent = `$${cartData.net_total.toFixed(2)}`;
        grandTotal.textContent = `$${cartData.grand_total.toFixed(2)}`;
        
        // Show Generate Quote button when there are items and order type is quote
        const generateQuoteBtn = document.querySelector('.generate-quote-btn');
        if (generateQuoteBtn && this.orderType === 'quote' && cartData.items && cartData.items.length > 0) {
            generateQuoteBtn.style.display = 'block';
        }
        
        // Add some custom CSS for bundle styling if not already added
        this.addBundleStyles();
    }
    
    async updateCartItemQuantity(itemCode, delta) {
        try {
            console.log(`🔄 Updating cart item quantity: ${itemCode}, delta: ${delta}`);
            
            // Get current cart to find current quantity
            const cartResponse = await frappe.call({
                method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation'
            });
            
            console.log('📋 Cart response:', cartResponse);
            console.log('📋 Cart response.message:', cartResponse.message);
            console.log('📋 Cart response.message.items:', cartResponse.message?.items);
            console.log('📋 Cart response.message.doc:', cartResponse.message?.doc);
            console.log('📋 Cart response.message.doc.items:', cartResponse.message?.doc?.items);
            
            // Try both possible locations for items
            const cartItems = cartResponse.message?.items || cartResponse.message?.doc?.items;
            console.log('📋 Final cart items array:', cartItems);
            
            if (cartResponse.message && cartItems) {
                const item = cartItems.find(i => i.item_code === itemCode);
                console.log('🔍 Found item in cart:', item);
                
                if (item) {
                    const newQty = Math.max(0, item.qty + delta);
                    console.log(`📊 Current qty: ${item.qty}, Delta: ${delta}, New qty: ${newQty}`);
                    
                    // Update cart with new quantity
                    const updateResponse = await frappe.call({
                        method: 'webshop.webshop.shopping_cart.cart.update_cart',
                        args: {
                            item_code: itemCode,
                            qty: newQty,
                            with_items: 1
                        }
                    });
                    
                    console.log('✅ Update response:', updateResponse);
                    
                    // Refresh cart display
                    await this.updateCartDisplay();
                    console.log('🔄 Cart display refreshed');
                } else {
                    console.error('❌ Item not found in cart:', itemCode);
                }
            } else {
                console.error('❌ No cart items found');
            }
        } catch (error) {
            console.error('❌ Error updating cart item quantity:', error);
        }
    }

    async removeCartItem(itemCode) {
        try {
            console.log(`🗑️ Removing cart item: ${itemCode}`);
            
            // Ask for confirmation
            if (!confirm('Are you sure you want to remove this item from the cart?')) {
                return;
            }
            
            // Set quantity to 0 to remove the item
            await frappe.call({
                method: 'webshop.webshop.shopping_cart.cart.update_cart',
                args: {
                    item_code: itemCode,
                    qty: 0,
                    with_items: 1
                }
            });
            
            console.log(`✅ Removed ${itemCode} from cart`);
            
            // Refresh cart display
            await this.updateCartDisplay();
            this.showNotification('✅ Item removed from cart', 'success');
            
        } catch (error) {
            console.error('❌ Error removing cart item:', error);
            this.showNotification('❌ Failed to remove item from cart', 'error');
        }
    }
    

    
    // Order Options Functions
    selectOrderType(type) {
        this.orderType = type;
        
        // Safely remove selected class from all option buttons
        document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
        
        // Safely add selected class to the clicked button
        const selectedBtn = document.querySelector(`[onclick*="selectOrderType('${type}')"]`);
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
        }
        
        const fulfillmentGroup = document.getElementById('fulfillmentGroup');
        const scheduleOptions = document.getElementById('scheduleOptions');
        
        if (type === 'order') {
            if (fulfillmentGroup) fulfillmentGroup.style.display = 'block';
        } else {
            if (fulfillmentGroup) fulfillmentGroup.style.display = 'none';
            if (scheduleOptions) scheduleOptions.classList.remove('show');
            this.fulfillmentMethod = null;
            this.scheduleType = null;
        }
        
        this.updateCheckoutButton();
    }
    
    async selectFulfillment(method) {
        this.fulfillmentMethod = method;
        
        document.querySelectorAll('#fulfillmentGroup .option-btn').forEach(btn => btn.classList.remove('selected'));
        
        const selectedBtn = document.querySelector(`[onclick*="selectFulfillment('${method}')"]`);
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
        }
        
        // Show/hide shipping options based on fulfillment method
        const shippingGroup = document.getElementById('shippingGroup');
        if (method === 'delivery') {
            if (shippingGroup) {
                shippingGroup.style.display = 'block';
                // Load shipping options
                await this.loadShippingOptions();
            }
        } else {
            if (shippingGroup) {
                shippingGroup.style.display = 'none';
                // Clear shipping selection
                this.selectedShippingOption = null;
            }
        }
        
        const scheduleOptions = document.getElementById('scheduleOptions');
        if (scheduleOptions) {
            scheduleOptions.classList.add('show');
        }
        
        this.updateCheckoutButton();
    }
    
    selectSchedule(type) {
        this.scheduleType = type;
        
        document.querySelectorAll('.schedule-btn').forEach(btn => btn.classList.remove('selected'));
        
        const selectedBtn = document.querySelector(`[onclick*="selectSchedule('${type}')"]`);
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
        }
        
        const calendarContainer = document.getElementById('calendarContainer');
        
        if (type === 'now') {
            if (calendarContainer) calendarContainer.classList.remove('show');
            this.selectedDate = null;
            this.selectedTime = null;
        } else {
            if (calendarContainer) calendarContainer.classList.add('show');
            this.initializeCalendar();
        }
        
        this.updateCheckoutButton();
    }
    
    initializeCalendar() {
        this.updateCalendarDisplay();
        this.generateTimeSlots();
    }
    
    updateCalendarDisplay() {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        const month = this.currentCalendarDate.getMonth();
        const year = this.currentCalendarDate.getFullYear();
        
        document.getElementById('calendarMonth').textContent = `${monthNames[month]} ${year}`;
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());
        
        const calendarGrid = document.getElementById('calendarGrid');
        calendarGrid.innerHTML = '';
        
        // Add day headers
        dayNames.forEach(day => {
            const dayHeader = document.createElement('div');
            dayHeader.className = 'calendar-day-header';
            dayHeader.textContent = day;
            calendarGrid.appendChild(dayHeader);
        });
        
        // Add calendar days
        const today = new Date();
        for (let i = 0; i < 42; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            
            const dayElement = document.createElement('div');
            dayElement.className = 'calendar-day';
            dayElement.textContent = date.getDate();
            
            const isCurrentMonth = date.getMonth() === month;
            const isToday = date.toDateString() === today.toDateString();
            const isPast = date < today && !isToday;
            
            if (!isCurrentMonth || isPast) {
                dayElement.classList.add('disabled');
            } else {
                if (isToday) {
                    dayElement.classList.add('today');
                }
                dayElement.onclick = () => this.selectDate(date);
            }
            
            calendarGrid.appendChild(dayElement);
        }
    }
    
    selectDate(date) {
        this.selectedDate = date.toLocaleDateString('en-US');
        this.selectedTime = null;
        
        document.querySelectorAll('.calendar-day').forEach(day => day.classList.remove('selected'));
        event.target.classList.add('selected');
        
        document.getElementById('timeSlots').style.display = 'block';
        this.updateSelectedScheduleDisplay();
    }
    
    generateTimeSlots() {
        const timeSlots = [
            '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
            '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'
        ];
        
        const timeGrid = document.getElementById('timeGrid');
        
        // Create enhanced time selection bar
        timeGrid.innerHTML = `
            <div class="time-bar-container" style="padding: 15px;">
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #495057;">
                        Select Preferred Time:
                    </label>
                    <div class="time-input-group" style="display: flex; gap: 10px; align-items: center;">
                        <input type="time" 
                               id="timePickerInput" 
                               min="08:00" 
                               max="17:00" 
                               value="09:00"
                               style="padding: 8px 12px; border: 2px solid #007bff; border-radius: 6px; font-size: 16px; font-weight: 500; color: #495057;"
                               onchange="window.fencePOS.selectTimeFromPicker(this.value)">
                        <span style="color: #6c757d; font-size: 14px;">
                            (Business Hours: 8:00 AM - 5:00 PM)
                        </span>
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <div style="font-weight: 500; margin-bottom: 10px; color: #495057;">
                        Or choose from common times:
                    </div>
                    <div class="quick-time-slots" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px;">
                        ${timeSlots.map(time => 
                            `<button class="time-slot-btn" onclick="window.fencePOS.selectQuickTime('${time}')" 
                                     style="padding: 8px 12px; border: 1px solid #dee2e6; background: white; border-radius: 4px; cursor: pointer; font-size: 13px; transition: all 0.2s;"
                                     onmouseover="this.style.background='#f8f9fa'; this.style.borderColor='#007bff';"
                                     onmouseout="this.style.background='white'; this.style.borderColor='#dee2e6';">
                                ${time}
                            </button>`
                        ).join('')}
                    </div>
                </div>
                
                <div class="time-visualization" style="margin-top: 20px;">
                    <div style="font-weight: 500; margin-bottom: 10px; color: #495057;">
                        Business Day Timeline:
                    </div>
                    <div class="time-bar" style="position: relative; height: 40px; background: linear-gradient(90deg, #e9ecef 0%, #007bff 20%, #28a745 50%, #ffc107 80%, #e9ecef 100%); border-radius: 20px; margin-bottom: 10px;">
                        <div class="time-marker" id="timeMarker" style="position: absolute; top: -5px; width: 3px; height: 50px; background: #dc3545; border-radius: 2px; transition: all 0.3s; left: 11.11%;"></div>
                        <div style="position: absolute; top: 45px; left: 0; right: 0; display: flex; justify-content: space-between; font-size: 12px; color: #6c757d;">
                            <span>8 AM</span>
                            <span>12 PM</span>
                            <span>5 PM</span>
                        </div>
                    </div>
                    <div style="font-size: 13px; color: #6c757d; text-align: center;">
                        <span style="color: #007bff;">●</span> Morning (8-12) 
                        <span style="color: #28a745;">●</span> Afternoon (12-3) 
                        <span style="color: #ffc107;">●</span> Evening (3-5)
                    </div>
                </div>
            </div>
        `;
        
        // Set default time and update marker
        this.updateTimeMarker('09:00');
    }
    
    selectTimeFromPicker(timeValue) {
        // Convert 24-hour format to 12-hour format
        const [hours, minutes] = timeValue.split(':');
        const hour24 = parseInt(hours);
        const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
        const ampm = hour24 >= 12 ? 'PM' : 'AM';
        const formattedTime = `${hour12}:${minutes} ${ampm}`;
        
        console.log('Time selected from picker:', timeValue, '→', formattedTime);
        
        this.selectedTime = formattedTime;
        this.updateTimeMarker(timeValue);
        this.updateSelectedScheduleDisplay();
        this.updateCheckoutButton();
        
        // Update quick time buttons
        document.querySelectorAll('.time-slot-btn').forEach(btn => {
            btn.style.background = 'white';
            btn.style.borderColor = '#dee2e6';
            btn.style.color = '#495057';
        });
    }
    
    selectQuickTime(time) {
        console.log('Quick time selected:', time);
        
        // Convert 12-hour format to 24-hour for time picker
        const [timePart, ampm] = time.split(' ');
        const [hours, minutes] = timePart.split(':');
        let hour24 = parseInt(hours);
        
        if (ampm === 'PM' && hour24 !== 12) {
            hour24 += 12;
        } else if (ampm === 'AM' && hour24 === 12) {
            hour24 = 0;
        }
        
        const timeValue = `${hour24.toString().padStart(2, '0')}:${minutes}`;
        
        // Update time picker
        const timePicker = document.getElementById('timePickerInput');
        if (timePicker) {
            timePicker.value = timeValue;
        }
        
        this.selectedTime = time;
        this.updateTimeMarker(timeValue);
        this.updateSelectedScheduleDisplay();
        this.updateCheckoutButton();
        
        // Update button styles
        document.querySelectorAll('.time-slot-btn').forEach(btn => {
            if (btn.textContent.trim() === time) {
                btn.style.background = '#007bff';
                btn.style.borderColor = '#007bff';
                btn.style.color = 'white';
            } else {
                btn.style.background = 'white';
                btn.style.borderColor = '#dee2e6';
                btn.style.color = '#495057';
            }
        });
    }
    
    updateTimeMarker(timeValue) {
        const [hours, minutes] = timeValue.split(':');
        const totalMinutes = parseInt(hours) * 60 + parseInt(minutes);
        
        // Business hours: 8:00 AM (480 min) to 5:00 PM (1020 min)
        const startMinutes = 8 * 60; // 8:00 AM
        const endMinutes = 17 * 60;  // 5:00 PM
        const businessDuration = endMinutes - startMinutes; // 9 hours
        
        // Calculate position percentage
        const relativeMinutes = Math.max(0, Math.min(businessDuration, totalMinutes - startMinutes));
        const percentage = (relativeMinutes / businessDuration) * 100;
        
        const marker = document.getElementById('timeMarker');
        if (marker) {
            marker.style.left = `${percentage}%`;
        }
        
        console.log(`Time marker updated: ${timeValue} → ${percentage.toFixed(1)}%`);
    }
    
    selectTime(time) {
        // Legacy function for backward compatibility
        this.selectQuickTime(time);
    }
    
    updateSelectedScheduleDisplay() {
        const selectedScheduleDiv = document.getElementById('selectedSchedule');
        const scheduleDisplay = document.getElementById('scheduleDisplay');
        
        if (this.selectedDate) {
            let displayText = this.selectedDate;
            if (this.selectedTime) {
                displayText += ` at ${this.selectedTime}`;
            }
            scheduleDisplay.textContent = displayText;
            selectedScheduleDiv.style.display = 'block';
        } else {
            selectedScheduleDiv.style.display = 'none';
        }
    }
    
    changeMonth(delta) {
        this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + delta);
        this.updateCalendarDisplay();
    }
    
    updateCheckoutButton() {
        const checkoutBtn = document.querySelector('.checkout-btn');
        const generateQuoteBtn = document.querySelector('.generate-quote-btn');
        
        if (this.orderType === 'quote') {
            checkoutBtn.textContent = 'See Items';
            checkoutBtn.disabled = false;
            
            // Show Generate Quote button for quotes
            if (generateQuoteBtn) {
                generateQuoteBtn.style.display = 'block';
            }
        } else if (this.orderType === 'order') {
            // Hide Generate Quote button for orders
            if (generateQuoteBtn) {
                generateQuoteBtn.style.display = 'none';
            }
            
            if (!this.fulfillmentMethod) {
                checkoutBtn.textContent = 'Select Fulfillment Method';
                checkoutBtn.disabled = true;
            } else if (!this.scheduleType) {
                checkoutBtn.textContent = 'Select Schedule';
                checkoutBtn.disabled = true;
            } else if (this.scheduleType === 'later' && (!this.selectedDate || !this.selectedTime)) {
                checkoutBtn.textContent = 'Select Date & Time';
                checkoutBtn.disabled = true;
            } else {
                checkoutBtn.textContent = 'Place Order';
                checkoutBtn.disabled = false;
            }
        }
    }
    
    async checkout() {
        try {
            // Check if webshop cart has items
            const hasItems = await this.checkWebshopCart();
            
            if (!hasItems) {
                this.showError('Cart is empty! Please add some products first.');
                return;
            }
            
            // Disable checkout button during processing
            const checkoutBtn = document.querySelector('.checkout-btn');
            if (checkoutBtn) {
                checkoutBtn.disabled = true;
            }
            
            // Different behavior based on order type
            if (this.orderType === 'quote') {
                // For quotes: Show all items (navigate to see items view)
                checkoutBtn.textContent = 'Loading Items...';
                
                // Force showing the component view with all items
                await this.showAllItems();
                
                // Reset button text and re-enable
                checkoutBtn.textContent = 'See Items';
                checkoutBtn.disabled = false;
                
            } else if (this.orderType === 'order') {
                // For orders: Verify cart contents and redirect to cart page
                checkoutBtn.textContent = 'Preparing Cart...';
                
                // Verify cart has items before redirecting
                const cartVerified = await this.verifyCartForCheckout();
                if (!cartVerified) {
                    this.showError('Unable to verify cart contents. Please try again.');
                    return;
                }
                
                checkoutBtn.textContent = 'Redirecting to Cart...';
                
                // Store the order configuration in session storage for the cart page
                const orderConfig = {
                    orderType: this.orderType,
                    fulfillmentMethod: this.fulfillmentMethod,
                    scheduleType: this.scheduleType,
                    selectedDate: this.selectedDate,
                    selectedTime: this.selectedTime,
                    selectedCategory: this.selectedCategory,
                    selectedStyle: this.selectedStyle,
                    selectedHeight: this.selectedHeight,
                    selectedColor: this.selectedColor,
                    selectedRailType: this.selectedRailType,
                    selectedCustomer: this.selectedCustomer,
                    selectedShipping: this.selectedShippingOption // Include shipping selection
                };
                
                sessionStorage.setItem('fencePOSConfig', JSON.stringify(orderConfig));
                
                // Add debugging info for cart verification
                console.log('🛒 POS to Cart Transfer - Order Config:', orderConfig);
                console.log('🛒 Redirecting to cart page with items verified');
                
                // Add a small delay to show the user what's happening
                setTimeout(() => {
                    // Redirect to cart page
                    window.location.href = '/cart';
                }, 500);
                return; // Exit early to avoid re-enabling button
            }
            
        } catch (error) {
            console.error('Error during checkout:', error);
            this.showError('Checkout failed. Please try again.');
        } finally {
            // Re-enable checkout button (only for quotes, orders redirect)
            if (this.orderType === 'quote') {
                const checkoutBtn = document.querySelector('.checkout-btn');
                if (checkoutBtn) {
                    checkoutBtn.disabled = false;
                    this.updateCheckoutButton();
                }
            }
        }
    }
    
    async createQuotation() {
        try {
            console.log('Creating Project Quote with fence_supply app...');
            
            // Prepare items for quotation
            const items = await this.prepareCartItems();
            
            if (items.length === 0) {
                return { success: false, error: 'No items to quote' };
            }
            
                            // Create Project Quote using fence_supply app
                                const projectQuoteData = {
                    doctype: 'Project Quote',
                    customer: this.selectedCustomer?.id || 'Administrator',
                    contact_person: this.selectedCustomer?.name || 'Walk-in Customer',
                    project_type: 'Residential', // Default, could be made configurable
                    location: '', // Could be added to POS interface later
                    delivery_address: '', // Could be added to POS interface later
                    taxes_and_charges: 'Standard Sales Tax', // Default tax template
                    notes: `Created from POS - Material: ${this.selectedCategory}, Style: ${this.selectedStyle}, Height: ${this.selectedHeight}, Color: ${this.selectedColor}, Rail Type: ${this.selectedRailType}`,
                item: items.map(item => ({
                    item_code: item.item_code,
                    item_name: item.item_name,
                    qty: item.qty,
                    rate: item.rate,
                    total: item.amount,
                    uom: 'Unit' // Default UOM
                }))
            };
            
            const response = await frappe.call({
                method: 'frappe.client.insert',
                args: {
                    doc: projectQuoteData
                }
            });
            
            if (response.message) {
                console.log('Project Quote created successfully:', response.message.name);
                
                // Optionally submit the Project Quote to trigger automatic workflow
                // (Creates Sales Order and Project Job automatically)
                try {
                    await frappe.call({
                        method: 'frappe.client.submit',
                        args: {
                            doc: response.message
                        }
                    });
                    console.log('Project Quote submitted - triggers Sales Order and Project Job creation');
                } catch (submitError) {
                    console.log('Project Quote created but not submitted:', submitError);
                }
                
                return { 
                    success: true, 
                    docname: response.message.name,
                    doc: response.message 
                };
            } else {
                // Fallback: create demo project quote
                console.log('Failed to create Project Quote, creating demo...');
                return await this.createDemoProjectQuote(items);
            }
            
        } catch (error) {
            console.error('Error creating Project Quote:', error);
            
            // Check if fence_supply app is installed
            if (error.responseText && error.responseText.includes('DocType Project Quote not found')) {
                console.log('fence_supply app not installed, creating demo quote...');
                const items = await this.prepareCartItems();
                return await this.createDemoProjectQuote(items);
            }
            
            // Fallback to demo quotation
            const items = await this.prepareCartItems();
            return await this.createDemoProjectQuote(items);
        }
    }
    
    async createSalesOrder() {
        try {
            console.log('Creating POS Invoice...');
            
            // Check if POS Invoice doctype exists (it should in standard ERPNext)
            const doctypeExists = await this.checkDoctypeExists('POS Invoice');
            if (!doctypeExists) {
                console.log('POS Invoice doctype not found, creating demo invoice...');
                const items = await this.prepareCartItems();
                return await this.createDemoPOSInvoice(items);
            }
            
            // Prepare items for POS invoice
            const items = await this.prepareCartItems();
            
            if (items.length === 0) {
                return { success: false, error: 'No items to invoice' };
            }
            
            // Create POS Invoice document
            const total = items.reduce((sum, item) => sum + item.amount, 0);
            
            const posInvoiceData = {
                doctype: 'POS Invoice',
                company: 'Fence Supply', // Use the company name from your system
                customer: this.selectedCustomer?.id || 'Administrator',
                customer_name: this.selectedCustomer?.name || 'Walk-in Customer',
                posting_date: frappe.datetime.get_today(),
                posting_time: frappe.datetime.get_time(),
                is_pos: 1,
                pos_profile: 'POS Profile',  // You may need to adjust this based on your setup
                items: items.map(item => ({
                    item_code: item.item_code,
                    item_name: item.item_name,
                    qty: item.qty,
                    rate: item.rate,
                    amount: item.amount
                })),
                // Custom fields for fence business
                material_type: this.selectedCategory,
                fence_style: this.selectedStyle,
                fence_height: this.selectedHeight,
                fence_color: this.selectedColor,
                fence_rail_type: this.selectedRailType,
                fulfillment_method: this.fulfillmentMethod,
                schedule_type: this.scheduleType,
                delivery_date: this.selectedDate,
                delivery_time: this.selectedTime,
                // Payment information (defaults)
                mode_of_payment: 'Cash',  // Default - can be customized
                paid_amount: total,
                change_amount: 0,
                naming_series: 'PINV-',
                status: 'Draft'
            };
            
            const response = await frappe.call({
                method: 'frappe.client.insert',
                args: {
                    doc: posInvoiceData
                }
            });
            
            if (response.message) {
                console.log('POS Invoice created successfully:', response.message.name);
                
                // Optionally submit the invoice automatically
                try {
                    await frappe.call({
                        method: 'frappe.client.submit',
                        args: {
                            doc: response.message
                        }
                    });
                    console.log('POS Invoice submitted successfully');
                } catch (submitError) {
                    console.log('POS Invoice created but not submitted:', submitError);
                }
                
                return { 
                    success: true, 
                    docname: response.message.name,
                    doc: response.message 
                };
            } else {
                // Fallback: create demo POS invoice
                console.log('Failed to create POS Invoice, creating demo...');
                return await this.createDemoPOSInvoice(items);
            }
            
        } catch (error) {
            console.error('Error creating POS Invoice:', error);
            const items = await this.prepareCartItems();
            return await this.createDemoPOSInvoice(items);
        }
    }
    
    async prepareCartItems() {
        let items = [];
        
        // Get webshop cart items only
        try {
            const cartResponse = await frappe.call({
                method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation'
            });
            
            console.log('Cart response:', cartResponse);
            
            // Cart items are nested under message.doc.items
            if (cartResponse.message && cartResponse.message.doc && cartResponse.message.doc.items) {
                items = cartResponse.message.doc.items.map(item => ({
                    item_code: item.item_code,
                    item_name: item.item_name,
                    qty: item.qty,
                    rate: item.rate,
                    amount: item.amount || (item.qty * item.rate)
                }));
                
                console.log('Prepared cart items:', items.length, 'items from webshop');
            } else {
                console.log('No cart items found in response structure:', cartResponse);
            }
        } catch (error) {
            console.error('Could not get webshop items:', error);
            throw new Error('Failed to get cart items');
        }
        
        return items;
    }
    
    async checkDoctypeExists(doctype) {
        try {
            const response = await frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: doctype,
                    limit: 1
                }
            });
            
            return true; // If we can query it, it exists
        } catch (error) {
            console.log(`Doctype ${doctype} not found:`, error);
            return false;
        }
    }
    
    async createDemoProjectQuote(items) {
        try {
            const docname = `PQ-${Date.now()}`;
            const total = items.reduce((sum, item) => sum + item.amount, 0);
            
            console.log('Created demo Project Quote:', { docname, items, total });
            
            // Simulate a brief delay like a real API call
            await new Promise(resolve => setTimeout(resolve, 500));
            
            return {
                success: true,
                docname: docname,
                doc: {
                    name: docname,
                    doctype: 'Project Quote',
                    customer: this.selectedCustomer?.id || 'Guest Customer',
                    customer_name: this.selectedCustomer?.name || 'Walk-in Customer',
                    items: items,
                    grand_total: total,
                                    material_type: this.selectedCategory,
                fence_style: this.selectedStyle,
                fence_height: this.selectedHeight,
                fence_color: this.selectedColor,
                fence_rail_type: this.selectedRailType,
                status: 'Draft'
                }
            };
        } catch (error) {
            console.error('Error creating demo project quote:', error);
            return {
                success: false,
                error: 'Failed to create demo project quote'
            };
        }
    }
    
    async createDemoPOSInvoice(items) {
        try {
            const docname = `PINV-${Date.now()}`;
            const total = items.reduce((sum, item) => sum + item.amount, 0);
            
            console.log('Created demo POS Invoice:', { docname, items, total });
            
            // Simulate a brief delay like a real API call
            await new Promise(resolve => setTimeout(resolve, 500));
            
            return {
                success: true,
                docname: docname,
                doc: {
                    name: docname,
                    doctype: 'POS Invoice',
                    customer: this.selectedCustomer?.id || 'Guest Customer',
                    customer_name: this.selectedCustomer?.name || 'Walk-in Customer',
                    items: items,
                    grand_total: total,
                    material_type: this.selectedCategory,
                    fence_style: this.selectedStyle,
                    fence_height: this.selectedHeight,
                    fence_color: this.selectedColor,
                    fulfillment_method: this.fulfillmentMethod,
                    schedule_type: this.scheduleType,
                                    delivery_date: this.selectedDate,
                delivery_time: this.selectedTime,
                is_pos: 1,
                status: 'Draft'
                }
            };
        } catch (error) {
            console.error('Error creating demo POS invoice:', error);
            return {
                success: false,
                error: 'Failed to create demo POS invoice'
            };
        }
    }
    
    async checkWebshopCart() {
        try {
            const response = await frappe.call({
                method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation'
            });
            
            // Check the correct path: response.message.doc.items
            const cartDoc = response.message?.doc;
            const cartItems = cartDoc?.items || [];
            
            console.log('Checking webshop cart:', cartItems.length, 'items found');
            return cartItems.length > 0;
        } catch (error) {
            console.error('Error checking webshop cart:', error);
            return false;
        }
    }

    async verifyCartForCheckout() {
        try {
            console.log('🔍 Verifying cart contents before checkout...');
            
            const response = await frappe.call({
                method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation'
            });
            
            const cartDoc = response.message?.doc;
            const cartItems = cartDoc?.items || [];
            
            console.log('📊 Cart verification results:');
            console.log(`   - Total items: ${cartItems.length}`);
            console.log(`   - Cart total: $${cartDoc?.grand_total || 0}`);
            console.log(`   - Cart currency: ${cartDoc?.currency || 'USD'}`);
            
            if (cartItems.length === 0) {
                console.warn('❌ Cart is empty - no items to transfer');
                return false;
            }
            
            // Log each item for verification
            cartItems.forEach((item, index) => {
                console.log(`   Item ${index + 1}: ${item.item_name} (${item.item_code}) - Qty: ${item.qty} - Rate: $${item.rate}`);
            });
            
            // Verify cart totals are reasonable
            const totalQty = cartItems.reduce((sum, item) => sum + (item.qty || 0), 0);
            if (totalQty === 0) {
                console.warn('❌ Cart has items but total quantity is 0');
                return false;
            }
            
            console.log('✅ Cart verification successful - ready for transfer to /cart page');
            
            // Store cart snapshot for reference
            sessionStorage.setItem('fencePOSCartSnapshot', JSON.stringify({
                items: cartItems,
                totalItems: cartItems.length,
                totalQty: totalQty,
                grandTotal: cartDoc?.grand_total || 0,
                timestamp: new Date().toISOString()
            }));
            
            return true;
            
        } catch (error) {
            console.error('❌ Error during cart verification:', error);
            return false;
        }
    }
    
    async clearCartOnSessionStart() {
        try {
            console.log('🧹 Clearing cart on POS session start...');
            
            // Try to get current cart, but handle cases where no cart exists
            let cartResponse;
            try {
                cartResponse = await frappe.call({
                    method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation'
                });
            } catch (getCartError) {
                console.log('📝 No existing cart found on session start - starting fresh');
                return;
            }
            
            const cartDoc = cartResponse.message?.doc;
            const cartItems = cartDoc?.items || [];
            
            if (cartItems.length === 0) {
                console.log('✅ Cart was already empty on session start');
                return;
            }
            
            console.log(`🔄 Clearing ${cartItems.length} items from previous session...`);
            
            // Use a more robust approach - try to clear the entire cart at once first
            try {
                await frappe.call({
                    method: 'webshop.webshop.shopping_cart.cart.update_cart',
                    args: {
                        item_code: cartItems[0].item_code,
                        qty: 0,
                        with_items: 1
                    }
                });
                
                // Check if cart is now empty
                const checkResponse = await frappe.call({
                    method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation'
                });
                
                const remainingItems = checkResponse.message?.doc?.items || [];
                if (remainingItems.length === 0) {
                    console.log('✅ Cart cleared successfully on session start');
                    return;
                }
            } catch (bulkClearError) {
                console.log('⚠️ Bulk clear failed, trying individual item clearing...');
            }
            
            // Fallback: Clear items individually, but with better error handling
            let clearedCount = 0;
            for (const item of cartItems) {
                try {
                    await frappe.call({
                        method: 'webshop.webshop.shopping_cart.cart.update_cart',
                        args: {
                            item_code: item.item_code,
                            qty: 0
                        }
                    });
                    clearedCount++;
                } catch (itemError) {
                    console.log(`⚠️ Could not clear item: ${item.item_code}`, itemError);
                    // Continue with other items even if one fails
                }
            }
            
            console.log(`✅ Cart clearing completed - cleared ${clearedCount}/${cartItems.length} items`);
            
        } catch (error) {
            console.log('⚠️ Cart clearing encountered issues but POS will continue:', error);
            // Don't throw error - just log it and continue with POS initialization
        }
    }
    
    async clearCart() {
        try {
            // Check if cart has items first
            const cartResponse = await frappe.call({
                method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation'
            });
            
            const cartDoc = cartResponse.message?.doc;
            const cartItems = cartDoc?.items || [];
            
            if (cartItems.length === 0) {
                this.showNotification('Cart is already empty', 'info');
                return;
            }
            
            // Ask for confirmation
            if (!confirm(`Are you sure you want to clear the cart? This will remove ${cartItems.length} item(s) and refresh the POS.`)) {
                return;
            }
            
            // Show loading state
            this.showNotification('Clearing cart and refreshing...', 'loading');
            
            // Clear webshop cart by setting all items to 0 quantity
            if (cartDoc && cartItems.length > 0) {
                // Set each item quantity to 0
                for (const item of cartItems) {
                    try {
                        await frappe.call({
                            method: 'webshop.webshop.shopping_cart.cart.update_cart',
                            args: {
                                item_code: item.item_code,
                                qty: 0
                            }
                        });
                    } catch (itemError) {
                        console.log('Could not clear item:', item.item_code, itemError);
                    }
                }
            }
            
            console.log('Webshop cart cleared successfully');
            this.showNotification('✅ Cart cleared! Refreshing POS...', 'success');
            
            // Hard refresh after successful cart clear to clear cache
            setTimeout(() => {
                window.location.reload(true);
            }, 1000);
            
        } catch (error) {
            console.error('Could not clear webshop cart:', error);
            this.showNotification('❌ Failed to clear cart. Please try again.', 'error');
            throw new Error('Failed to clear cart');
        }
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'cart-notification';
        notification.innerHTML = message;
        
        // Set styles based on type
        let backgroundColor = '#17a2b8'; // info
        if (type === 'success') backgroundColor = '#28a745';
        if (type === 'error') backgroundColor = '#dc3545';
        if (type === 'loading') backgroundColor = '#ffc107';
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${backgroundColor};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            z-index: 9999;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transform: translateX(300px);
            opacity: 0;
            transition: all 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
            notification.style.opacity = '1';
        }, 10);
        
        // Auto-remove after delay (except loading)
        if (type !== 'loading') {
            setTimeout(() => {
                notification.style.transform = 'translateX(300px)';
                notification.style.opacity = '0';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }, 3000);
        }
        
        return notification;
    }
    
    resetOrderOptions() {
        this.orderType = 'quote';
        this.fulfillmentMethod = null;
        this.scheduleType = null;
        this.selectedDate = null;
        this.selectedTime = null;
        
        // Reset UI safely
        document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
        
        const quoteBtn = document.querySelector('[onclick*="selectOrderType(\'quote\')"]');
        if (quoteBtn) {
            quoteBtn.classList.add('selected');
        }
        
        const fulfillmentGroup = document.getElementById('fulfillmentGroup');
        if (fulfillmentGroup) {
            fulfillmentGroup.style.display = 'none';
        }
        
        const scheduleOptions = document.getElementById('scheduleOptions');
        if (scheduleOptions) {
            scheduleOptions.classList.remove('show');
        }
        
        const calendarContainer = document.getElementById('calendarContainer');
        if (calendarContainer) {
            calendarContainer.classList.remove('show');
        }
        
        const selectedSchedule = document.getElementById('selectedSchedule');
        if (selectedSchedule) {
            selectedSchedule.style.display = 'none';
        }
        
        this.updateCheckoutButton();
    }
    
    // Customer functions
    openCustomerSearch() {
        document.getElementById('customerSearchOverlay').style.display = 'flex';
        document.getElementById('customerSearchInput').value = '';
        this.loadCustomers();
        document.getElementById('customerSearchInput').focus();
    }
    
    closeCustomerSearch() {
        document.getElementById('customerSearchOverlay').style.display = 'none';
    }
    
    async loadCustomers() {
        try {
            const response = await frappe.call({
                method: 'webshop.webshop.pos_api.search_customers_for_pos',
                args: {
                    search_term: ""
                }
            });
            
            this.displayCustomers(response.message || []);
        } catch (error) {
            console.error('Error loading customers:', error);
            this.displayCustomers([]);
        }
    }
    
    displayCustomers(customers) {
        const customerList = document.getElementById('customerList');
        
        if (customers.length === 0) {
            customerList.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #6c757d;">
                    <div>No customers found</div>
                    <button class="add-customer-btn" onclick="window.fencePOS.showAddCustomerForm()" style="margin-top: 15px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        + Add New Customer
                    </button>
                </div>
            `;
            return;
        }
        
        let html = `
            <div style="padding: 10px; border-bottom: 1px solid #dee2e6;">
                <button class="add-customer-btn" onclick="window.fencePOS.showAddCustomerForm()" style="width: 100%; padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    + Add New Customer
                </button>
            </div>
        `;
        
        html += customers.map(customer => `
            <div class="customer-item" onclick="window.fencePOS.selectCustomer('${customer.name}', '${customer.customer_name}', '${customer.customer_group}', '${customer.default_price_list || ''}')">
                <div class="customer-item-name">${customer.customer_name}</div>
                <div class="customer-item-details">
                    ${customer.customer_group} • ${customer.mobile_no || 'N/A'} • ${customer.email_id || 'N/A'}
                    ${customer.default_price_list ? `<br><small style="color: #007bff;">Price List: ${customer.default_price_list}</small>` : ''}
                </div>
            </div>
        `).join('');
        
        customerList.innerHTML = html;
    }
    
    async selectCustomer(customerId, customerName, customerGroup, defaultPriceList) {
        // Store customer's default price list but don't automatically apply it
        this.selectedCustomer = {
            id: customerId,
            name: customerName,
            group: customerGroup,
            defaultPriceList: defaultPriceList
        };
        
        // Update display
        document.getElementById('customerName').textContent = customerName;
        document.getElementById('customerType').textContent = customerGroup;
        
        // Only set price list if user hasn't already selected one
        if (!this.currentPriceList && defaultPriceList) {
            this.currentPriceList = defaultPriceList;
            
            // Update price list selector dropdown
            const priceListSelector = document.getElementById('priceListSelector');
            if (priceListSelector) {
                priceListSelector.value = defaultPriceList;
            }
            
            console.log(`🏷️ Customer selected: ${customerName}, Auto-applied default Price List: ${defaultPriceList}`);
        } else {
            console.log(`🏷️ Customer selected: ${customerName}, Keeping current Price List: ${this.currentPriceList || 'none'}`);
        }
        
        // Refresh component prices if on component view to apply new pricing
        if (this.currentView === 'component') {
            this.loadComponents();
        }
        
        // Update cart pricing to match current price list (like webshop)
        if (this.currentPriceList) {
            await this.setCartPriceList(this.currentPriceList);
            // Note: setCartPriceList now handles price recalculation internally with proper pricing rule reset
            // We don't need to call updateCartPricing to avoid double calculation and incremental increases
        }
        
        this.closeCustomerSearch();
    }
    
    showAddCustomerForm() {
        const customerList = document.getElementById('customerList');
        customerList.innerHTML = `
            <div class="add-customer-form" style="padding: 20px;">
                <h4 style="margin: 0 0 15px 0; color: #495057;">Add New Customer</h4>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">Customer Name *</label>
                    <input type="text" id="newCustomerName" placeholder="Enter customer name" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" required>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">Mobile Number</label>
                    <input type="tel" id="newCustomerMobile" placeholder="Enter mobile number" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">Email</label>
                    <input type="email" id="newCustomerEmail" placeholder="Enter email address" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">Customer Group</label>
                    <select id="newCustomerGroup" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        <option value="Individual">Individual</option>
                        <option value="Commercial">Commercial</option>
                        <option value="Contractor">Contractor</option>
                        <option value="Wholesale">Wholesale</option>
                    </select>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 500;">Default Price List</label>
                    <select id="newCustomerPriceList" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        <!-- Options will be populated from actual price lists -->
                    </select>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <button onclick="window.fencePOS.createNewCustomer()" style="flex: 1; padding: 10px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Create Customer
                    </button>
                    <button onclick="window.fencePOS.loadCustomers()" style="flex: 1; padding: 10px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Cancel
                    </button>
                </div>
            </div>
        `;
        
        // Focus on name field
        setTimeout(() => {
            document.getElementById('newCustomerName').focus();
        }, 100);
    }
    
    async createNewCustomer() {
        const name = document.getElementById('newCustomerName').value.trim();
        const mobile = document.getElementById('newCustomerMobile').value.trim();
        const email = document.getElementById('newCustomerEmail').value.trim();
        const customerGroup = document.getElementById('newCustomerGroup').value;
        const defaultPriceList = document.getElementById('newCustomerPriceList').value;
        
        if (!name) {
            this.showError('Customer name is required');
            return;
        }
        
        try {
            const customerData = {
                doctype: 'Customer',
                customer_name: name,
                customer_group: customerGroup,
                default_price_list: defaultPriceList
            };
            
            if (mobile) customerData.mobile_no = mobile;
            if (email) customerData.email_id = email;
            
            const response = await frappe.call({
                method: 'frappe.client.insert',
                args: {
                    doc: customerData
                }
            });
            
            if (response.message) {
                console.log('✅ Customer created successfully:', response.message.name);
                
                // Auto-select the new customer
                this.selectCustomer(response.message.name, name, customerGroup, defaultPriceList);
                
                // Show success message
                const notification = document.createElement('div');
                notification.style.cssText = `
                    position: fixed; top: 20px; right: 20px; background: #28a745; color: white; 
                    padding: 10px 15px; border-radius: 5px; z-index: 9999; font-size: 14px;
                    max-width: 300px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                `;
                notification.textContent = `✅ Customer "${name}" created successfully!`;
                document.body.appendChild(notification);
                
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 3000);
                
            } else {
                this.showError('Failed to create customer');
            }
        } catch (error) {
            console.error('Error creating customer:', error);
            this.showError('Failed to create customer: ' + (error.message || 'Unknown error'));
        }
    }
    
    // Utility functions
    switchLanguage(lang) {
        this.currentLanguage = lang;
        
        // Safely remove active class from all language buttons
        document.querySelectorAll('.language-btn').forEach(btn => btn.classList.remove('active'));
        
        // Safely add active class to the clicked button
        const activeBtn = document.querySelector(`[onclick="window.fencePOS.switchLanguage('${lang}')"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
        
        // Update text elements - simplified for now
        console.log('Language switched to:', lang);
    }
    
    showError(message) {
        alert(message);
    }
    
    handleSearch() {
        console.log('Searching for:', this.searchTerm);
        console.log('Current view:', this.currentView);
        
        if (this.searchTerm && this.searchTerm.length >= 2) {
            // Global search: search through all products in database
            this.performGlobalSearch();
        } else {
            // Local search: filter currently displayed items
            if (this.currentView === 'component') {
                this.filterDisplayedProducts();
            } else if (this.currentView === 'category') {
                this.filterCategoryItems();
            } else if (this.currentView === 'style') {
                this.filterStyleItems();
            }
        }
    }
    
    async performGlobalSearch() {
        try {
            console.log('Performing global search for:', this.searchTerm);
            
            // Search through Website Items by name first
            let searchResults = await this.searchWebsiteItems('web_item_name', this.searchTerm);
            
            // Also search in item_code if no results in name
            if (searchResults.length === 0) {
                searchResults = await this.searchWebsiteItems('item_code', this.searchTerm);
            }
            
            console.log('Raw search results:', searchResults.length, 'items found');
            
            // Filter to only sellable items and respect material class selection
            const sellableResults = [];
            for (const item of searchResults) {
                try {
                    const itemResponse = await frappe.call({
                        method: 'frappe.client.get_value',
                        args: {
                            doctype: 'Item',
                            filters: { item_code: item.item_code },
                            fieldname: ['is_sales_item', 'has_variants', 'disabled', 'custom_material_type', 'custom_material_class', 'item_group']
                        }
                    });
                    
                    const itemData = itemResponse.message;
                    if (itemData && 
                        itemData.is_sales_item === 1 && 
                        itemData.disabled === 0 && 
                        itemData.has_variants === 0) {
                        
                        // Enhanced filtering for search results (material, height, color)
                        let includeItem = true;
                        
                        // EXEMPTIONS: Special material class handling for search results
                        const materialClass = itemData.custom_material_class ? itemData.custom_material_class.toLowerCase() : '';
                        const isHardware = materialClass === 'hardware';
                        const isCap = materialClass === 'cap';
                        
                        // Category/Material filtering with exemptions
                        if (this.selectedCategory) {
                            let categoryMatch = 
                                (itemData.custom_material_type && itemData.custom_material_type.toLowerCase() === this.selectedCategory.toLowerCase()) ||
                                (itemData.custom_material_class && itemData.custom_material_class.toLowerCase() === this.selectedCategory.toLowerCase()) ||
                                (itemData.item_group && itemData.item_group.toLowerCase() === this.selectedCategory.toLowerCase()) ||
                                (item.web_item_name.toLowerCase().includes(this.selectedCategory.toLowerCase()));
                            
                            // EXEMPTION 1: Hardware items - show if material type matches selected category
                            if (isHardware && itemData.custom_material_type && 
                                itemData.custom_material_type.toLowerCase() === this.selectedCategory.toLowerCase()) {
                                categoryMatch = true;
                            }
                            
                            // EXEMPTION 2: Cap items - show if material type matches (color will be checked separately)
                            if (isCap && itemData.custom_material_type && 
                                itemData.custom_material_type.toLowerCase() === this.selectedCategory.toLowerCase()) {
                                categoryMatch = true;
                            }
                            
                            includeItem = includeItem && categoryMatch;
                        }
                        
                        // Additional filtering for Cap items - must match color when color is selected
                        if (this.selectedColor && isCap) {
                            const colorMatch = item.web_item_name.toLowerCase().includes(this.selectedColor.toLowerCase());
                            if (!colorMatch) {
                                includeItem = false;
                            }
                        }
                        
                        // Note: Height and Color filtering for search results now handled by backend API
                        // If search items appear here, they should already be filtered by attributes
                        // TODO: Ensure search also uses attribute-based filtering instead of name parsing
                        
                        if (includeItem) {
                            sellableResults.push(item);
                        } else {
                            console.log('❌ Search result filtered out by selection criteria:', item.item_code, {
                                custom_material_type: itemData.custom_material_type,
                                custom_material_class: itemData.custom_material_class,
                                item_group: itemData.item_group,
                                item_name: item.web_item_name,
                                filters: {
                                    selectedCategory: this.selectedCategory,
                                    selectedHeight: this.selectedHeight,
                                    selectedColor: this.selectedColor,
                                    selectedRailType: this.selectedRailType,
                                    exemptions: {
                                        isHardware: isHardware,
                                        isCap: isCap
                                    }
                                }
                            });
                        }
                    }
                } catch (error) {
                    console.log('Could not validate search result:', item.item_code);
                }
            }
            
            console.log('Sellable search results:', sellableResults.length, 'items found');
            
            if (sellableResults.length > 0) {
                // Show search results in component view
                this.displaySearchResults(sellableResults);
            } else {
                // No sellable results found - filter current view
                if (this.currentView === 'component') {
                    this.filterDisplayedProducts();
                }
                console.log('No sellable items found matching search term');
                if (searchResults.length > 0) {
                    this.showError(`Found ${searchResults.length} items matching "${this.searchTerm}", but none are configured for sales.`);
                }
            }
            
        } catch (error) {
            console.error('Error in global search:', error);
            // Fallback to local filtering
            if (this.currentView === 'component') {
                this.filterDisplayedProducts();
            }
        }
    }
    
    async searchWebsiteItems(field, searchTerm) {
        try {
            const response = await frappe.call({
                method: 'frappe.client.get_list',
                args: {
                    doctype: 'Website Item',
                    filters: { 
                        published: 1,
                        [field]: ['like', `%${searchTerm}%`]
                    },
                    fields: ['name', 'item_code', 'web_item_name', 'website_image', 'route'],
                    limit: 50
                }
            });
            
            return response.message || [];
        } catch (error) {
            console.error('Error searching website items:', error);
            return [];
        }
    }
    
    async displaySearchResults(searchResults) {
        // Switch to component view if not already there
        this.currentView = 'component';
        
        // Hide other views
        document.getElementById('categoryView').style.display = 'none';
        document.getElementById('styleView').style.display = 'none';
        document.getElementById('optionsView').style.display = 'none';
        document.getElementById('componentView').style.display = 'block';
        
        // Get prices and display results
        const productsWithPrices = await this.getProductPrices(searchResults);
        this.displaySearchResultsAsProducts(productsWithPrices);
    }
    
    async getProductPrices(products) {
        return await Promise.all(products.map(async (product) => {
            let price = 50.00; // Default price
            
            try {
                // Try to get price from Item Price
                const priceResponse = await frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Item Price',
                        filters: { 
                            item_code: product.item_code,
                            price_list: this.currentPriceList
                        },
                        fields: ['price_list_rate'],
                        limit: 1
                    }
                });
                
                if (priceResponse.message && priceResponse.message.length > 0) {
                    price = priceResponse.message[0].price_list_rate;
                }
            } catch (error) {
                console.log('Could not get price for item:', product.item_code);
            }
            
            return {
                name: product.item_code,
                item_name: product.web_item_name,
                website_image: product.website_image,
                route: product.route,
                price_list_rate: price
            };
        }));
    }
    
    displaySearchResultsAsProducts(products) {
        const container = document.getElementById('componentsContainer');
        if (!container) return;
        
        let html = `
            <div class="component-section">
                <div class="component-header">SEARCH RESULTS (${products.length} ITEMS FOUND)</div>
                <div class="component-grid">
        `;
        
        products.forEach(product => {
            const productId = product.name;
            const price = product.price_list_rate || 50.00;
            
            // Bundle information
            const bundleInfo = {
                isBundle: product.isBundle || false,
                bundleItems: product.bundleItems || []
            };
            
            html += this.createProductCard(productId, product.item_name, price, product.website_image, bundleInfo);
        });
        
        html += `</div></div>`;
        
        container.innerHTML = html;
        console.log('Displayed search results:', products.length, 'items');
    }
    
    filterDisplayedProducts() {
        const container = document.getElementById('componentsContainer');
        if (!container) return;
        
        const itemCards = container.querySelectorAll('.item-card');
        
        itemCards.forEach(card => {
            const itemNameElement = card.querySelector('.item-name');
            if (itemNameElement) {
                const itemName = itemNameElement.textContent.toLowerCase();
                const shouldShow = !this.searchTerm || itemName.includes(this.searchTerm);
                card.style.display = shouldShow ? 'block' : 'none';
            }
        });
    }
    
    filterCategoryItems() {
        const categoryGrid = document.getElementById('categoryGrid');
        if (!categoryGrid) return;
        
        const categoryButtons = categoryGrid.querySelectorAll('.category-button');
        
        categoryButtons.forEach(button => {
            const categoryName = button.querySelector('.category-name');
            if (categoryName) {
                const name = categoryName.textContent.toLowerCase();
                const shouldShow = !this.searchTerm || name.includes(this.searchTerm);
                button.style.display = shouldShow ? 'block' : 'none';
            }
        });
    }
    
    filterStyleItems() {
        const styleGrid = document.getElementById('styleGrid');
        if (!styleGrid) return;
        
        const styleCards = styleGrid.querySelectorAll('.style-card');
        
        styleCards.forEach(card => {
            const styleName = card.querySelector('.style-name');
            const styleDescription = card.querySelector('.style-description');
            if (styleName) {
                const name = styleName.textContent.toLowerCase();
                const description = styleDescription ? styleDescription.textContent.toLowerCase() : '';
                const shouldShow = !this.searchTerm || 
                                 name.includes(this.searchTerm) || 
                                 description.includes(this.searchTerm);
                card.style.display = shouldShow ? 'block' : 'none';
            }
        });
    }
    
    clearSearch() {
        this.searchTerm = '';
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = '';
        }
        
        // Reload current view to show all items
        if (this.currentView === 'component') {
            this.loadComponents();
        } else if (this.currentView === 'category') {
            this.filterCategoryItems();
        } else if (this.currentView === 'style') {
            this.filterStyleItems();
        }
    }
    
    openQuantityModal(encodedItemId, encodedItemName, price) {
        // Decode the parameters
        const itemId = decodeURIComponent(encodedItemId);
        const itemName = decodeURIComponent(encodedItemName);
        
        // For now, just prompt for quantity
        const qty = prompt(`Enter quantity for ${itemName}:`, '1');
        if (qty && parseInt(qty) > 0) {
            // Set absolute quantity - no delta calculation needed
            this.updateItemQuantity(encodedItemId, parseInt(qty), encodedItemName, price);
        }
    }

    logProductDetails(products) {
        console.log('=== PRODUCT DETAILS ===');
        console.log(`Total products loaded: ${products.length}`);
        
        products.forEach((product, index) => {
            console.log(`Product ${index + 1}:`, {
                name: product.name,
                item_name: product.item_name,
                price: product.price_list_rate || 'No price list rate',
                image: product.website_image || 'No image',
                route: product.route || 'No route'
            });
        });
        
        console.log('=== END PRODUCT DETAILS ===');
    }
    
    verifyButtonFunctionality() {
        console.log('🔍 Verifying button functionality...');
        
        const functionsToCheck = [
            'selectCategory', 'selectStyle', 'selectHeight', 'selectColor', 'clearHeight', 'clearColor', 'selectRailType', 'clearRailType',
            'selectOrderType', 'selectFulfillment', 'selectSchedule', 'selectTime',
            'changeMonth', 'checkout', 'openCustomerSearch', 'closeCustomerSearch',
            'selectCustomer', 'switchLanguage', 'proceedToComponents',
            'clearSearch', 'updateCartItemQuantity', 'removeCartItem', 'changePriceList', 'showAddCustomerForm', 'createNewCustomer',
            'selectTimeFromPicker', 'selectQuickTime', 'updateBundleItemQuantity'
        ];
        
        let allFunctionsReady = true;
        
        functionsToCheck.forEach(funcName => {
            if (typeof this[funcName] === 'function') {
                console.log(`✅ ${funcName} function ready`);
            } else {
                console.log(`❌ ${funcName} function missing!`);
                allFunctionsReady = false;
            }
        });
        
        if (allFunctionsReady) {
            console.log('✅ All buttons and functions verified successfully!');
        } else {
            console.log('⚠️ Some functions are missing!');
        }
        
        console.log(`📊 Button verification complete: ${functionsToCheck.length} functions checked`);
        
        return allFunctionsReady;
    }

    async searchCustomers(searchTerm) {
        try {
            const response = await frappe.call({
                method: 'webshop.webshop.pos_api.search_customers_for_pos',
                args: {
                    search_term: searchTerm || ""
                }
            });
            
            const customers = response.message || [];
            console.log(`🔍 Found ${customers.length} customers matching "${searchTerm}"`);
            this.displayCustomers(customers);
        } catch (error) {
            console.error('Error searching customers:', error);
            this.displayCustomers([]);
        }
    }

    async showAllItems() {
        try {
            console.log('🛍️ Showing all available items...');
            
            // Switch to component view
            this.currentView = 'component';
            
            // Hide other views and show component view
            document.getElementById('categoryView').style.display = 'none';
            document.getElementById('styleView').style.display = 'none';
            document.getElementById('optionsView').style.display = 'none';
            document.getElementById('componentView').style.display = 'block';
            
            // Clear any category filters to show all items
            const originalCategory = this.selectedCategory;
            this.selectedCategory = null;
            
            // Load all available items
            const allProducts = await this.getWebsiteItemsDirectEnhanced();
            
            // Restore original category
            this.selectedCategory = originalCategory;
            
            if (allProducts && allProducts.length > 0) {
                console.log(`📦 Displaying ${allProducts.length} available items`);
                this.displayAllItemsView(allProducts);
            } else {
                console.log('❌ No items available');
                this.displayNoProductsMessage();
            }
            
        } catch (error) {
            console.error('Error showing all items:', error);
            this.showError('Failed to load items. Please try again.');
        }
    }
    
    displayAllItemsView(products) {
        const container = document.getElementById('componentsContainer');
        if (!container) return;
        
        // Group products by material class for better organization (same as main display)
        const categories = {};
        products.forEach(product => {
            const category = product.custom_material_class || product.material_class || 'Other';
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(product);
        });
        
        let html = `
            <div class="all-items-header" style="background: #f8f9fa; padding: 15px 20px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #007bff;">
                <h3 style="margin: 0 0 5px 0; color: #495057;">🛍️ All Available Items</h3>
                <p style="margin: 0; color: #6c757d; font-size: 14px;">
                    Browse ${products.length} items • Prices shown for: ${this.selectedCustomer?.name || 'Walk-in Customer'} 
                    (${this.currentPriceList})
                </p>
            </div>
        `;
        
        // Sort categories by material class priority (same as main display)
        const materialClassPriority = {
            'Panel': 1, 'Panels': 1,
            'Rail': 2, 'Rails': 2,
            'Post': 3, 'Posts': 3,
            'Gate': 4, 'Gates': 4,
            'Hardware': 5,
            'Cap': 6, 'Caps': 6
        };
        
        const sortedCategoryNames = Object.keys(categories).sort((a, b) => {
            const priorityA = materialClassPriority[a] || 999;
            const priorityB = materialClassPriority[b] || 999;
            return priorityA - priorityB;
        });
        
        // Display items by category
        sortedCategoryNames.forEach((categoryName, index) => {
            const categoryProducts = categories[categoryName];
            const sectionClass = (index % 2 === 1) ? 'component-section light-blue' : 'component-section';
            
            html += `
                <div class="${sectionClass}">
                    <div class="component-header">
                        ${categoryName.toUpperCase()} (${categoryProducts.length} items)
                    </div>
                    <div class="component-grid">
            `;
            
            categoryProducts.forEach(product => {
                try {
                    const price = product.price_list_rate || 0.00;
                    const productId = product.name;
                    const safeItemName = (product.item_name || 'Unknown Item').replace(/[<>"']/g, '');
                    const safeImageUrl = product.website_image || '';
                    
                    // Bundle information
                    const bundleInfo = {
                        isBundle: product.isBundle || false,
                        bundleItems: product.bundleItems || []
                    };
                    
                    html += this.createProductCard(productId, safeItemName, price, safeImageUrl, bundleInfo);
                } catch (error) {
                    console.error('Error processing product for all items view:', product, error);
                }
            });
            
            html += `</div></div>`;
        });
        
        // Add search tip
        html += `
            <div style="background: #e7f3ff; padding: 15px; margin-top: 20px; border-radius: 8px; text-align: center;">
                <div style="color: #0066cc; font-size: 14px;">
                    💡 <strong>Tip:</strong> Use the search bar above to quickly find specific items, 
                    or select a material type from the sidebar to filter by category.
                </div>
            </div>
        `;
        
        try {
            container.innerHTML = html;
            console.log('✅ Successfully displayed all items view');
        } catch (error) {
            console.error('Error displaying all items HTML:', error);
        }
        }
    
    getPackedItemsForCartItem(itemCode) {
        // Extract packed items for a specific cart item
        try {
            if (this.lastCartResponse && this.lastCartResponse.message && this.lastCartResponse.message.doc) {
                const packedItems = this.lastCartResponse.message.doc.packed_items || [];
                
                // Filter packed items for this parent item
                const itemPackedItems = packedItems.filter(packedItem => packedItem.parent_item === itemCode);
                
                console.log(`📦 Found ${itemPackedItems.length} packed items for cart item ${itemCode}`);
                return itemPackedItems;
            }
        } catch (error) {
            console.log('Could not extract packed items for cart item:', error);
        }
        
        return [];
    }
    
    addBundleStyles() {
        // Check if styles already added
        if (document.getElementById('bundle-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'bundle-styles';
        style.textContent = `
            /* Cart Bundle Styles */
            .cart-item.bundle-item {
                border-left: 3px solid #007bff;
                background: linear-gradient(90deg, #f8f9fa 0%, #ffffff 5%);
            }
            
            .bundle-indicator {
                display: inline-block;
                margin-left: 8px;
                padding: 2px 6px;
                background: #e7f3ff;
                border-radius: 10px;
                font-size: 10px !important;
            }
            
            .bundle-contents {
                animation: slideDown 0.3s ease-out;
            }
            
            @keyframes slideDown {
                from {
                    opacity: 0;
                    max-height: 0;
                    transform: translateY(-10px);
                }
                to {
                    opacity: 1;
                    max-height: 300px;
                    transform: translateY(0);
                }
            }
            
            .bundle-item-row {
                transition: all 0.2s ease;
            }
            
            .bundle-item-row:hover {
                background: rgba(0, 123, 255, 0.05);
                border-radius: 4px;
                margin: 2px -4px;
                padding: 6px 4px !important;
            }
            
            .bundle-header {
                background: linear-gradient(90deg, #e7f3ff 0%, #f8f9fa 100%);
            }
            
            /* Bundle Quantity Control Styles */
            .bundle-qty-controls {
                transition: all 0.2s ease;
            }
            
            .bundle-qty-controls:hover {
                border-color: #007bff !important;
                box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
            }
            
            .bundle-qty-btn {
                transition: all 0.2s ease;
                border-radius: 2px;
            }
            
            .bundle-qty-btn:hover:not(:disabled) {
                background: #007bff !important;
                color: white !important;
                transform: scale(1.1);
            }
            
            .bundle-qty-btn:active:not(:disabled) {
                transform: scale(0.95);
            }
            
            .bundle-qty-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .bundle-qty-display {
                transition: color 0.2s ease;
                user-select: none;
            }
            
            .bundle-qty-controls:hover .bundle-qty-display {
                color: #0056b3 !important;
            }
            
            /* Bundle item details styling */
            .bundle-item-details {
                transition: all 0.2s ease;
            }
            
            .bundle-item-row:hover .bundle-item-name {
                color: #0056b3 !important;
            }
            
            /* Product Card Bundle Styles */
            .item-card.bundle-card {
                border: 2px solid #007bff;
                box-shadow: 0 2px 8px rgba(0, 123, 255, 0.15);
                background: linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%);
                position: relative;
                transform: translateY(0);
                transition: all 0.3s ease;
            }
            
            .item-card.bundle-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0, 123, 255, 0.25);
            }
            
            .item-card.bundle-card .item-image {
                position: relative;
                border-bottom: 1px solid #e7f3ff;
            }
            
            .bundle-badge {
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% {
                    box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.7);
                }
                70% {
                    box-shadow: 0 0 0 6px rgba(0, 123, 255, 0);
                }
                100% {
                    box-shadow: 0 0 0 0 rgba(0, 123, 255, 0);
                }
            }
            
            .item-card.bundle-card .item-name {
                color: #0056b3;
                font-weight: 600;
            }
            
            .bundle-info {
                background: rgba(0, 123, 255, 0.1);
                border-radius: 4px;
                padding: 2px 6px;
                margin: 4px 8px !important;
                border: 1px solid rgba(0, 123, 255, 0.2);
            }
            
            .item-card.bundle-card .item-price {
                color: #0056b3;
                font-weight: bold;
                font-size: 16px;
            }
            
            .item-card.bundle-card .item-controls {
                border-top: 1px solid #e7f3ff;
                background: rgba(0, 123, 255, 0.02);
            }
            
            .item-card.bundle-card .item-qty-btn:hover {
                background: #007bff;
                color: white;
            }
            
            /* Notification animations */
            .bundle-update-notification {
                animation: slideInBounce 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            }
            
            @keyframes slideInBounce {
                0% {
                    opacity: 0;
                    transform: translateX(100px) scale(0.8);
                }
                50% {
                    opacity: 1;
                    transform: translateX(-10px) scale(1.05);
                }
                100% {
                    opacity: 1;
                    transform: translateX(0) scale(1);
                }
            }
        `;
        
        document.head.appendChild(style);
    }
    
    async updateBundleItemQuantity(bundleItemCode, componentItemCode, delta) {
        try {
            console.log(`🔧 Updating bundle component: ${componentItemCode} in bundle ${bundleItemCode} by ${delta}`);
            
            // Get current cart
            const cartResponse = await frappe.call({
                method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation'
            });
            
            if (!cartResponse.message || !cartResponse.message.doc) {
                console.error('Could not get cart data');
                return;
            }
            
            const cartDoc = cartResponse.message.doc;
            const packedItems = cartDoc.packed_items || [];
            
            // Find the packed item to update
            const packedItem = packedItems.find(item => 
                item.parent_item === bundleItemCode && item.item_code === componentItemCode
            );
            
            if (!packedItem) {
                console.error(`Could not find packed item ${componentItemCode} in bundle ${bundleItemCode}`);
                return;
            }
            
            const currentQty = packedItem.qty || 0;
            const newQty = Math.max(1, currentQty + delta); // Minimum quantity of 1
            
            console.log(`📦 Updating ${componentItemCode}: ${currentQty} → ${newQty}`);
            
            // Update the packed item quantity directly using Frappe's document update
            try {
                await frappe.call({
                    method: 'frappe.client.set_value',
                    args: {
                        doctype: 'Packed Item',
                        name: packedItem.name,
                        fieldname: 'qty',
                        value: newQty
                    }
                });
                
                console.log(`✅ Successfully updated packed item ${packedItem.name} quantity to ${newQty}`);
                
                // Update UI immediately
                const componentId = `bundle-${bundleItemCode}-${componentItemCode}`.replace(/[^a-zA-Z0-9-_]/g, '');
                const qtyDisplay = document.getElementById(`${componentId}-qty`);
                if (qtyDisplay) {
                    qtyDisplay.textContent = newQty;
                }
                
                // Update button states
                const bundleRow = qtyDisplay?.closest('.bundle-item-row');
                if (bundleRow) {
                    const minusBtn = bundleRow.querySelector('.minus-btn');
                    if (minusBtn) {
                        minusBtn.disabled = newQty <= 1;
                    }
                }
                
                // Show success notification
                this.showBundleUpdateNotification(componentItemCode, newQty);
                
                // Refresh cart display after a short delay to allow server to process
                setTimeout(async () => {
                    await this.updateCartDisplay();
                }, 500);
                
            } catch (updateError) {
                console.error('Error updating packed item:', updateError);
                
                // Fallback: try updating via cart API
                console.log('Trying fallback: updating via shopping cart API...');
                await this.updateCartDisplay(); // Refresh to get current state
            }
            
        } catch (error) {
            console.error('Error updating bundle item quantity:', error);
            this.showError('Failed to update bundle item quantity');
        }
    }
    
    showBundleUpdateNotification(itemName, newQty) {
        const notification = document.createElement('div');
        notification.className = 'bundle-update-notification';
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">📦</span>
                <span>Updated ${itemName} to ${newQty}</span>
            </div>
        `;
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #007bff;
            color: white;
            padding: 8px 12px;
            border-radius: 5px;
            z-index: 9999;
            font-size: 12px;
            max-width: 300px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            animation: slideInBounce 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        `;
        
        document.body.appendChild(notification);
        
        // Remove notification after 2 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideInBounce 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) reverse';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 2000);
    }
    

    
    async loadDynamicOptions() {
        try {
            console.log('🔄 Loading dynamic attribute options...');
            
            const response = await frappe.call({
                method: 'webshop.webshop.pos_api.get_dynamic_fence_attributes'
            });
            
            if (response.message && response.message.success) {
                const data = response.message;
                const attributes = data.attributes;
                
                // Debug: Log all available attributes
                console.log('📊 Raw API response:', data);
                console.log('📊 All available attributes:', attributes);
                console.log('📊 Auto-detected height attribute:', data.height_attribute);
                console.log('📊 Auto-detected color attribute:', data.color_attribute);
                console.log('📊 Auto-detected rail type attribute:', data.rail_type_attribute);
                
                // MAINTENANCE FREE: Use dynamically detected height attribute
                const heightGrid = document.getElementById('heightGrid');
                const heightAttr = data.height_attribute;
                if (heightAttr && attributes[heightAttr]) {
                    const heightOptions = attributes[heightAttr].map(h => h.value);
                    heightGrid.innerHTML = heightOptions.map(height => `
                        <div class="option-button" onclick="window.fencePOS.selectHeight('${height.replace(/'/g, "\\'")}');event.stopPropagation();" id="height-${height.replace(/'/g, '')}">${height}</div>
                    `).join('');
                    console.log(`✅ Loaded height options from "${heightAttr}":`, heightOptions);
                } else {
                    console.log('❌ No height attribute found. Available:', data.available_attributes);
                    heightGrid.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">No height options available</div>';
                }
                
                // MAINTENANCE FREE: Use dynamically detected color attribute
                const colorGrid = document.getElementById('colorGrid');
                const colorAttr = data.color_attribute;
                if (colorAttr && attributes[colorAttr]) {
                    const colorOptions = attributes[colorAttr].map(c => c.value);
                    colorGrid.innerHTML = colorOptions.map(color => `
                        <div class="option-button" onclick="window.fencePOS.selectColor('${color}');event.stopPropagation();" id="color-${color.replace(/\s+/g, '-')}">${color}</div>
                    `).join('');
                    console.log(`✅ Loaded color options from "${colorAttr}":`, colorOptions);
                } else {
                    console.log('❌ No color attribute found. Available:', data.available_attributes);
                    colorGrid.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">No color options available</div>';
                }
                
                // MAINTENANCE FREE: Use dynamically detected rail type attribute with style-specific logic
                const railTypeGrid = document.getElementById('railTypeGrid');
                let railTypeAttr = data.rail_type_attribute;
                
                // Style-specific attribute detection
                if (this.selectedStyle === 'Ranch Rail' && attributes['Ranch Rail Type']) {
                    railTypeAttr = 'Ranch Rail Type';
                    console.log('🚜 Using Ranch Rail Type for Ranch Rail style');
                } else if (!railTypeAttr && attributes['Rail Type']) {
                    railTypeAttr = 'Rail Type';
                    console.log('🛤️ Using generic Rail Type attribute');
                }
                
                // Update rail type header based on style
                const railTypeHeader = document.getElementById('railTypeHeader');
                if (this.selectedStyle === 'Ranch Rail') {
                    railTypeHeader.innerHTML = `Ranch Rail Type Options <button onclick="window.fencePOS.clearRailType()" style="margin-left: 10px; padding: 2px 8px; font-size: 12px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer;">Clear</button>`;
                } else {
                    railTypeHeader.innerHTML = `Rail Type Options <button onclick="window.fencePOS.clearRailType()" style="margin-left: 10px; padding: 2px 8px; font-size: 12px; background: #dc3545; color: white; border: none; border-radius: 3px; cursor: pointer;">Clear</button>`;
                }
                
                if (railTypeAttr && attributes[railTypeAttr]) {
                    const railTypeOptions = attributes[railTypeAttr].map(rt => rt.value);
                    railTypeGrid.innerHTML = railTypeOptions.map(railType => `
                        <div class="option-button" onclick="window.fencePOS.selectRailType('${railType.replace(/'/g, "\\'")}');event.stopPropagation();" id="railtype-${railType.replace(/\s+/g, '-')}">${railType}</div>
                    `).join('');
                    console.log(`✅ Loaded rail type options from "${railTypeAttr}":`, railTypeOptions);
                } else {
                    console.log('❌ No rail type attribute found. Available:', data.available_attributes);
                    railTypeGrid.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">No rail type options available</div>';
                }
                
                // Load new attribute types
                this.loadNewAttributes(attributes);
                
            } else {
                console.warn('No dynamic attributes loaded, using fallback');
                this.loadFallbackOptions();
            }
            
        } catch (error) {
            console.error('Error loading dynamic options:', error);
            this.loadFallbackOptions();
        }
    }
    
    loadNewAttributes(attributes) {
        // Load Lattice Type options
        const latticeTypeGrid = document.getElementById('latticeTypeGrid');
        if (attributes['Lattice Type']) {
            const latticeTypeOptions = attributes['Lattice Type'].map(lt => lt.value);
            latticeTypeGrid.innerHTML = latticeTypeOptions.map(latticeType => `
                <div class="option-button" onclick="window.fencePOS.selectLatticeType('${latticeType.replace(/'/g, "\\'")}');event.stopPropagation();" id="latticetype-${latticeType.replace(/\s+/g, '-')}">${latticeType}</div>
            `).join('');
            console.log(`✅ Loaded lattice type options:`, latticeTypeOptions);
        } else {
            latticeTypeGrid.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">No lattice type options available</div>';
        }
        
        // Load Orientation options
        const orientationGrid = document.getElementById('orientationGrid');
        if (attributes['Orientation']) {
            const orientationOptions = attributes['Orientation'].map(o => o.value);
            orientationGrid.innerHTML = orientationOptions.map(orientation => `
                <div class="option-button" onclick="window.fencePOS.selectOrientation('${orientation.replace(/'/g, "\\'")}');event.stopPropagation();" id="orientation-${orientation.replace(/\s+/g, '-')}">${orientation}</div>
            `).join('');
            console.log(`✅ Loaded orientation options:`, orientationOptions);
        } else {
            orientationGrid.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">No orientation options available</div>';
        }
        
        // Load Picket Type options
        const picketTypeGrid = document.getElementById('picketTypeGrid');
        if (attributes['Picket Type']) {
            const picketTypeOptions = attributes['Picket Type'].map(pt => pt.value);
            picketTypeGrid.innerHTML = picketTypeOptions.map(picketType => `
                <div class="option-button" onclick="window.fencePOS.selectPicketType('${picketType.replace(/'/g, "\\'")}');event.stopPropagation();" id="pickettype-${picketType.replace(/\s+/g, '-')}">${picketType}</div>
            `).join('');
            console.log(`✅ Loaded picket type options:`, picketTypeOptions);
        } else {
            picketTypeGrid.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">No picket type options available</div>';
        }
    }

    loadFallbackOptions() {
        // Fallback to default options if dynamic loading fails
        const heightOptions = ['4\'', '5\'', '6\'', '8\''];
        const colorOptions = ['White', 'Tan', 'Khaki'];
        
        const heightGrid = document.getElementById('heightGrid');
        heightGrid.innerHTML = heightOptions.map(height => `
            <div class="option-button" onclick="window.fencePOS.selectHeight('${height.replace(/'/g, "\\'")}');event.stopPropagation();" id="height-${height.replace(/'/g, '')}">${height}</div>
        `).join('');
        
        const colorGrid = document.getElementById('colorGrid');
        colorGrid.innerHTML = colorOptions.map(color => `
            <div class="option-button" onclick="window.fencePOS.selectColor('${color}');event.stopPropagation();" id="color-${color.replace(/\s+/g, '-')}">${color}</div>
        `).join('');
        
        console.log('⚠️ Using fallback options');
    }

    async setupItemAttributes() {
        try {
            console.log('🔧 Optimizing fence items for POS...');
            
            // Show loading notification
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #17a2b8;
                color: white;
                padding: 10px 15px;
                border-radius: 5px;
                z-index: 9999;
                font-size: 14px;
                max-width: 300px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            `;
            notification.innerHTML = '⚙️ Optimizing items for POS...';
            document.body.appendChild(notification);
            
            const response = await frappe.call({
                method: 'webshop.webshop.pos_api.setup_fence_item_attributes'
            });
            
            // Remove loading notification
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            
            if (response.message && response.message.success) {
                // Show success notification
                const successNotification = document.createElement('div');
                successNotification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: #28a745;
                    color: white;
                    padding: 10px 15px;
                    border-radius: 5px;
                    z-index: 9999;
                    font-size: 14px;
                    max-width: 350px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                `;
                
                const result = response.message;
                successNotification.innerHTML = `
                    ✅ Items optimized successfully!<br>
                    <small>Optimized ${result.updated_items} items</small><br>
                    <small>${result.items_with_attributes} items have attributes</small><br>
                    <small>${result.test_items_ready_for_pos} items ready for POS</small>
                `;
                
                document.body.appendChild(successNotification);
                
                console.log('✅ Fence item optimization completed:', result);
                console.log('📊 Attribute summary:', result.attribute_summary);
                
                // Auto-remove success notification after 5 seconds
                setTimeout(() => {
                    if (successNotification.parentNode) {
                        successNotification.parentNode.removeChild(successNotification);
                    }
                }, 5000);
                
                // Refresh the current view to show updated items
                if (this.currentView === 'component') {
                    console.log('🔄 Refreshing components view to show updated items...');
                    this.loadComponents();
                }
                
                // Reload dynamic options to show any new attributes
                if (this.currentView === 'options') {
                    this.loadDynamicOptions();
                }
                
            } else {
                this.showError('Optimization completed but some items may not have been updated. Check console for details.');
                console.error('Setup result:', response.message);
            }
            
        } catch (error) {
            console.error('Error optimizing items for POS:', error);
            this.showError('Failed to optimize items: ' + (error.message || 'Unknown error'));
        }
    }
    
    createAttributeBasedSections(products, allAttributes) {
        const sections = [];
        
        // Group products by material class only (no sub-grouping by attributes)
        const materialClassGroups = {};
        products.forEach(product => {
            const materialClass = product.custom_material_class || product.material_class || 'Other';
            if (!materialClassGroups[materialClass]) {
                materialClassGroups[materialClass] = [];
            }
            materialClassGroups[materialClass].push(product);
        });
        
        // Create one section per material class (no attribute sub-grouping)
        Object.entries(materialClassGroups).forEach(([materialClass, classProducts]) => {
            console.log(`🔍 Processing material class: ${materialClass} (${classProducts.length} products)`);
            
            // Create single section for each material class
            sections.push({
                name: materialClass,
                products: classProducts,
                materialClass: materialClass,
                attribute: null,
                attributeValue: null
            });
            console.log(`📦 Created section: ${materialClass} (${classProducts.length} products)`);
        });
        
        // Sort sections by material class priority: Panels, Rail, Posts, Gates, Hardware, Caps
        const materialClassPriority = {
            'Panel': 1, 'Panels': 1,
            'Rail': 2, 'Rails': 2,
            'Post': 3, 'Posts': 3,
            'Gate': 4, 'Gates': 4,
            'Hardware': 5,
            'Cap': 6, 'Caps': 6
        };
        
        const getMaterialClassPriority = (materialClass) => {
            return materialClassPriority[materialClass] || 999;
        };
        
        sections.sort((a, b) => {
            const priorityA = getMaterialClassPriority(a.materialClass);
            const priorityB = getMaterialClassPriority(b.materialClass);
            
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
            
            // If same material class, sort by section name (for sub-sections like "Gate - 3'", "Gate - 4'")
            return a.name.localeCompare(b.name);
        });
        
        return sections;
    }
    
    async setCartPriceList(priceList) {
        /**
         * Set the cart price list - overrides customer default
         */
        try {
            console.log(`🏷️ Setting cart price list to: ${priceList}`);
            
            const response = await frappe.call({
                method: 'webshop.pos_api.set_cart_price_list',
                args: {
                    price_list: priceList
                }
            });
            
            console.log('Cart price list set response:', response);
            
            if (response && response.message) {
                console.log(`✅ Cart price list set: ${response.message}`);
            } else {
                console.warn('No response received from set cart price list');
            }
            
        } catch (error) {
            console.error('Error setting cart price list:', error);
            this.showNotification('❌ Error setting cart price list', 'error');
        }
    }
    
    async updateCartPricing(priceList) {
        /**
         * Update cart pricing when price list changes (like webshop)
         */
        try {
            console.log(`🏷️ Updating cart pricing to price list: ${priceList}`);
            
            const response = await frappe.call({
                method: 'webshop.pos_api.update_cart_pricing',
                args: {
                    price_list: priceList
                }
            });
            
            console.log('Cart pricing update response:', response);
            
            if (response) {
                // Handle different response formats
                let success = false;
                let messageText = '';
                
                if (response.message) {
                    if (typeof response.message === 'string') {
                        messageText = response.message;
                        success = messageText.includes('successfully') || messageText.includes('No cart found');
                    } else if (typeof response.message === 'object') {
                        // Handle object response - assume success if we got a proper response object
                        success = true;
                        messageText = 'Cart pricing updated successfully';
                    }
                } else if (response._server_messages) {
                    // Sometimes the message is in _server_messages
                    try {
                        const serverMsg = JSON.parse(response._server_messages);
                        if (Array.isArray(serverMsg) && serverMsg.length > 0) {
                            const parsed = JSON.parse(serverMsg[0]);
                            messageText = parsed.message || '';
                            success = messageText.includes('successfully') || messageText.includes('updated') || messageText.includes('added');
                        }
                    } catch (e) {
                        success = true; // Assume success if we can't parse but got a response
                        messageText = 'Cart pricing updated successfully';
                    }
                } else {
                    // If we get any response object, assume success
                    success = true;
                    messageText = 'Cart pricing updated successfully';
                }
                
                if (success) {
                    // Refresh cart display to show updated prices
                    await this.updateCartDisplay();
                    this.showNotification(`✅ Prices updated to ${priceList}`, 'success');
                    console.log(`✅ Cart pricing updated to ${priceList}`);
                } else {
                    console.error('Cart pricing update failed:', messageText || response);
                    this.showNotification('❌ Failed to update cart prices', 'error');
                }
            } else {
                console.error('No response received for cart pricing update');
                this.showNotification('❌ Failed to update cart prices', 'error');
            }
            
        } catch (error) {
            console.error('Error updating cart pricing:', error);
            this.showNotification('❌ Error updating cart prices', 'error');
        }
    }
    
    async changePriceList(newPriceList) {
        /**
         * Change the current price list and refresh all prices (like webshop)
         */
        try {
            const previousPriceList = this.currentPriceList;
            console.log(`🔄 Changing price list from ${previousPriceList || 'none'} to ${newPriceList}`);
            
            // Update current price list
            this.currentPriceList = newPriceList;
            
            // Update UI display
            const priceListSelector = document.getElementById('priceListSelector');
            if (priceListSelector) {
                priceListSelector.value = newPriceList;
            }
            
            // Set cart price list first (this overrides customer default and recalculates prices)
            console.log(`🏷️ Setting cart price list to: ${newPriceList}`);
            const setPriceListResponse = await this.setCartPriceList(newPriceList);
            console.log('Cart price list set response:', setPriceListResponse);
            
            // Note: setCartPriceList now handles price recalculation internally with proper pricing rule reset
            // We don't need to call updateCartPricing to avoid double calculation and incremental increases
            
            // Refresh cart display to show updated prices
            await this.updateCartDisplay();
            
            // Refresh product display with new prices based on current view
            if (this.currentView === 'component' && this.selectedCategory && this.selectedStyle) {
                await this.loadComponents();
            } else if (this.isPopularMode || this.currentView === 'popular-material') {
                // Refresh popular items with new price list by reloading components
                await this.loadComponents();
            }
            
            // Show notification about price list change
            if (previousPriceList) {
                this.showNotification(`Price list changed from ${previousPriceList} to ${newPriceList}`, 'success');
            } else {
                this.showNotification(`Price list set to ${newPriceList}`, 'success');
            }
            
            console.log(`✅ Price list changed to ${newPriceList} and all prices refreshed`);
            
        } catch (error) {
            console.error('Error changing price list:', error);
            this.showNotification('Error updating price list', 'error');
        }
    }
    
    async loadShippingOptions() {
        /**
         * Load available shipping options based on cart contents
         */
        try {
            console.log('🚚 Loading shipping options...');
            
            // Get cart total to calculate material value
            const cartResponse = await this.getCurrentCart();
            if (!cartResponse || !cartResponse.message || !cartResponse.message.doc || !cartResponse.message.doc.items) {
                this.showShippingMessage('Add items to cart to see shipping options');
                return;
            }
            
            const cartItems = cartResponse.message.doc.items;
            if (!cartItems || cartItems.length === 0) {
                this.showShippingMessage('Add items to cart to see shipping options');
                return;
            }
            
            // Calculate material value (sum of all items)
            let materialValue = 0;
            cartItems.forEach(item => {
                materialValue += parseFloat(item.amount || 0);
            });
            
            // For now, use a default distance (this would come from delivery address in full implementation)
            const defaultDistance = 15; // miles
            const defaultZipCode = '30309'; // This would come from delivery address form
            
            // Call shipping API to get available couriers
            const response = await frappe.call({
                method: 'fence_supply.api.shipping_api.get_available_couriers',
                args: {
                    material_value: materialValue,
                    distance: defaultDistance,
                    zip_code: defaultZipCode
                }
            });
            
            if (response.message && response.message.success) {
                this.displayShippingOptions(response.message.courier_options, materialValue, defaultDistance);
            } else {
                this.showShippingMessage('No shipping options available');
            }
            
        } catch (error) {
            console.error('Error loading shipping options:', error);
            this.showShippingMessage('Error loading shipping options');
        }
    }
    
    displayShippingOptions(courierOptions, materialValue, distance) {
        /**
         * Display shipping options in the POS interface
         */
        const container = document.getElementById('shippingOptionsContainer');
        if (!container) return;
        
        if (!courierOptions || courierOptions.length === 0) {
            container.innerHTML = '<div class="no-shipping">No shipping options available</div>';
            return;
        }
        
        let html = `
            <div class="shipping-info">
                <small>Material Value: $${materialValue.toFixed(2)} | Distance: ${distance} miles</small>
            </div>
        `;
        
        courierOptions.forEach((option, index) => {
            const isSelected = this.selectedShippingOption && 
                             this.selectedShippingOption.courier === option.courier && 
                             this.selectedShippingOption.service_type === option.service_type;
            
            html += `
                <div class="shipping-option ${isSelected ? 'selected' : ''}" 
                     onclick="selectShippingOption('${option.courier}', '${option.service_type}', ${option.rate})">
                    <div class="shipping-main">
                        <span class="courier-name">${option.courier}</span>
                        <span class="service-type">${option.service_type}</span>
                        <span class="shipping-rate">$${option.rate.toFixed(2)}</span>
                    </div>
                    <div class="shipping-breakdown">
                        Base: $${option.breakdown.base_rate.toFixed(2)} + 
                        Distance: $${option.breakdown.distance_cost.toFixed(2)} + 
                        Material: $${option.breakdown.material_cost.toFixed(2)}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }
    
    showShippingMessage(message) {
        /**
         * Show a message in the shipping options container
         */
        const container = document.getElementById('shippingOptionsContainer');
        if (container) {
            container.innerHTML = `<div class="shipping-message">${message}</div>`;
        }
    }
    
    selectShippingOption(courier, serviceType, rate) {
        /**
         * Select a shipping option
         */
        this.selectedShippingOption = {
            courier: courier,
            service_type: serviceType,
            rate: rate
        };
        
        // Update UI
        document.querySelectorAll('.shipping-option').forEach(opt => opt.classList.remove('selected'));
        if (event && event.target) {
            event.target.closest('.shipping-option').classList.add('selected');
        }
        
        console.log('🚚 Selected shipping option:', this.selectedShippingOption);
        
        this.updateCheckoutButton();
    }
}

// Global functions for onclick handlers - defined early to ensure availability
// Navigation and category functions
window.selectCategory = async (category) => {
    try { await window.fencePOS?.selectCategory(category); } catch(e) { console.error('selectCategory error:', e); }
}

window.selectPopular = async () => {
    try { await window.fencePOS?.selectPopular(); } catch(e) { console.error('selectPopular error:', e); }
};

window.selectBundles = async () => {
    try { await window.fencePOS?.selectBundles(); } catch(e) { console.error('selectBundles error:', e); }
};

window.clearCart = async () => {
    try { await window.fencePOS?.clearCart(); } catch(e) { console.error('clearCart error:', e); }
};

window.selectPopularMaterial = async (materialType) => {
    try { await window.fencePOS?.selectPopularMaterial(materialType); } catch(e) { console.error('selectPopularMaterial error:', e); }
};

window.selectBundlesMaterial = async (materialType) => {
    try { await window.fencePOS?.selectBundlesMaterial(materialType); } catch(e) { console.error('selectBundlesMaterial error:', e); }
};

window.selectTemplates = async () => {
    try { await window.fencePOS?.selectTemplates(); } catch(e) { console.error('selectTemplates error:', e); }
};

window.showSaveTemplateModal = () => {
    try { window.fencePOS?.showSaveTemplateModal(); } catch(e) { console.error('showSaveTemplateModal error:', e); }
};

window.closeSaveTemplateModal = () => {
    try { window.fencePOS?.closeSaveTemplateModal(); } catch(e) { console.error('closeSaveTemplateModal error:', e); }
};

window.saveTemplate = async () => {
    try { await window.fencePOS?.saveTemplate(); } catch(e) { console.error('saveTemplate error:', e); }
};

window.loadTemplate = async (templateName) => {
    try { await window.fencePOS?.loadTemplate(templateName); } catch(e) { console.error('loadTemplate error:', e); }
};

window.deleteTemplate = async (templateName) => {
    try { await window.fencePOS?.deleteTemplate(templateName); } catch(e) { console.error('deleteTemplate error:', e); }
};

window.filterTemplates = () => {
    try { window.fencePOS?.filterTemplates(); } catch(e) { console.error('filterTemplates error:', e); }
};

window.searchTemplates = () => {
    try { window.fencePOS?.searchTemplates(); } catch(e) { console.error('searchTemplates error:', e); }
};

window.refreshTemplates = () => {
    try { window.fencePOS?.refreshTemplates(); } catch(e) { console.error('refreshTemplates error:', e); }
};

window.selectStyle = async (styleId) => {
    try { await window.fencePOS?.selectStyle(styleId); } catch(e) { console.error('selectStyle error:', e); }
};
window.selectHeight = (height) => {
    try { window.fencePOS?.selectHeight(height); } catch(e) { console.error('selectHeight error:', e); }
};
window.selectColor = (color) => {
    try { window.fencePOS?.selectColor(color); } catch(e) { console.error('selectColor error:', e); }
};
window.clearHeight = () => {
    try { window.fencePOS?.clearHeight(); } catch(e) { console.error('clearHeight error:', e); }
};
window.clearColor = () => {
    try { window.fencePOS?.clearColor(); } catch(e) { console.error('clearColor error:', e); }
};
window.selectRailType = (railType) => {
    try { window.fencePOS?.selectRailType(railType); } catch(e) { console.error('selectRailType error:', e); }
};
window.clearRailType = () => {
    try { window.fencePOS?.clearRailType(); } catch(e) { console.error('clearRailType error:', e); }
};
window.selectLatticeType = (latticeType) => {
    try { window.fencePOS?.selectLatticeType(latticeType); } catch(e) { console.error('selectLatticeType error:', e); }
};
window.clearLatticeType = () => {
    try { window.fencePOS?.clearLatticeType(); } catch(e) { console.error('clearLatticeType error:', e); }
};
window.selectOrientation = (orientation) => {
    try { window.fencePOS?.selectOrientation(orientation); } catch(e) { console.error('selectOrientation error:', e); }
};
window.clearOrientation = () => {
    try { window.fencePOS?.clearOrientation(); } catch(e) { console.error('clearOrientation error:', e); }
};
window.selectPicketType = (picketType) => {
    try { window.fencePOS?.selectPicketType(picketType); } catch(e) { console.error('selectPicketType error:', e); }
};
window.clearPicketType = () => {
    try { window.fencePOS?.clearPicketType(); } catch(e) { console.error('clearPicketType error:', e); }
};
window.proceedToComponents = async () => {
    try { await window.fencePOS?.proceedToComponents(); } catch(e) { console.error('proceedToComponents error:', e); }
};

// Order management functions
window.selectOrderType = (type) => {
    try { window.fencePOS?.selectOrderType(type); } catch(e) { console.error('selectOrderType error:', e); }
};
window.selectFulfillment = async (method) => {
    try { await window.fencePOS?.selectFulfillment(method); } catch(e) { console.error('selectFulfillment error:', e); }
};
window.selectShippingOption = (courier, serviceType, rate) => {
    try { window.fencePOS?.selectShippingOption(courier, serviceType, rate); } catch(e) { console.error('selectShippingOption error:', e); }
};
window.selectSchedule = (type) => {
    try { window.fencePOS?.selectSchedule(type); } catch(e) { console.error('selectSchedule error:', e); }
};
window.selectTime = (time) => {
    try { window.fencePOS?.selectTime(time); } catch(e) { console.error('selectTime error:', e); }
};
window.changeMonth = (delta) => {
    try { window.fencePOS?.changeMonth(delta); } catch(e) { console.error('changeMonth error:', e); }
};

// Cart and checkout functions
window.checkout = async () => {
    try { await window.fencePOS?.checkout(); } catch(e) { console.error('checkout error:', e); }
};
window.updateCartItemQuantity = async (itemCode, delta) => {
    try { await window.fencePOS?.updateCartItemQuantity(itemCode, delta); } catch(e) { console.error('updateCartItemQuantity error:', e); }
};
window.removeCartItem = async (itemCode) => {
    try { await window.fencePOS?.removeCartItem(itemCode); } catch(e) { console.error('removeCartItem error:', e); }
};
window.changePriceList = async (priceList) => {
    try { await window.fencePOS?.changePriceList(priceList); } catch(e) { console.error('changePriceList error:', e); }
};
window.updateBundleItemQuantity = async (bundleItemCode, componentItemCode, delta) => {
    try { await window.fencePOS?.updateBundleItemQuantity(bundleItemCode, componentItemCode, delta); } catch(e) { console.error('updateBundleItemQuantity error:', e); }
};

// Customer and search functions
window.openCustomerSearch = () => {
    try { window.fencePOS?.openCustomerSearch(); } catch(e) { console.error('openCustomerSearch error:', e); }
};
window.closeCustomerSearch = () => {
    try { window.fencePOS?.closeCustomerSearch(); } catch(e) { console.error('closeCustomerSearch error:', e); }
};
window.selectCustomer = async (customerId, customerName, customerGroup, defaultPriceList) => {
    try { await window.fencePOS?.selectCustomer(customerId, customerName, customerGroup, defaultPriceList); } catch(e) { console.error('selectCustomer error:', e); }
};
window.clearSearch = () => {
    try { window.fencePOS?.clearSearch(); } catch(e) { console.error('clearSearch error:', e); }
};

// Settings functions
window.switchLanguage = (lang) => {
    try { window.fencePOS?.switchLanguage(lang); } catch(e) { console.error('switchLanguage error:', e); }
};

// New customer management functions
window.showAddCustomerForm = () => {
    try { window.fencePOS?.showAddCustomerForm(); } catch(e) { console.error('showAddCustomerForm error:', e); }
};
window.createNewCustomer = async () => {
    try { await window.fencePOS?.createNewCustomer(); } catch(e) { console.error('createNewCustomer error:', e); }
};

// Enhanced time selection functions
window.selectTimeFromPicker = (timeValue) => {
    try { window.fencePOS?.selectTimeFromPicker(timeValue); } catch(e) { console.error('selectTimeFromPicker error:', e); }
};
window.selectQuickTime = (time) => {
    try { window.fencePOS?.selectQuickTime(time); } catch(e) { console.error('selectQuickTime error:', e); }
};

// Setup and utility functions
window.setupItemAttributes = async () => {
    try { await window.fencePOS?.setupItemAttributes(); } catch(e) { console.error('setupItemAttributes error:', e); }
};
window.loadDynamicOptions = async () => {
    try { await window.fencePOS?.loadDynamicOptions(); } catch(e) { console.error('loadDynamicOptions error:', e); }
};

// Initialize POS when page loads
frappe.ready(() => {
    console.log('Frappe ready, initializing Fence POS...');
    window.fencePOS = new FencePOS();
    
    // Add debug function for cart transfer verification
    window.debugCartTransfer = () => {
        const posConfig = sessionStorage.getItem('fencePOSConfig');
        const cartSnapshot = sessionStorage.getItem('fencePOSCartSnapshot');
        
        console.log('=== POS TO CART TRANSFER DEBUG ===');
        
        if (posConfig) {
            console.log('📋 POS Configuration:', JSON.parse(posConfig));
        } else {
            console.log('❌ No POS configuration found in session storage');
        }
        
        if (cartSnapshot) {
            console.log('🛒 Cart Snapshot:', JSON.parse(cartSnapshot));
        } else {
            console.log('❌ No cart snapshot found in session storage');
        }
        
        // Also check current cart state
        frappe.call({
            method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation'
        }).then(response => {
            const cartDoc = response.message?.doc;
            const cartItems = cartDoc?.items || [];
            console.log('🔄 Current Cart State:', {
                itemCount: cartItems.length,
                items: cartItems.map(item => ({
                    code: item.item_code,
                    name: item.item_name,
                    qty: item.qty,
                    rate: item.rate
                })),
                total: cartDoc?.grand_total || 0
            });
        });
        
        console.log('=== END DEBUG ===');
    };
});
window.debugItemAttributes = async () => {
    try {
        console.log('🔍 Debugging item attributes...');
        const response = await frappe.call({
            method: 'webshop.webshop.pos_api.debug_item_attributes'
        });
        
        if (response.message && response.message.success) {
            const result = response.message;
            console.log('=== ITEM ATTRIBUTES DEBUG ===');
            console.log(`Total items with attributes: ${result.total_items_with_attributes}`);
            console.log(`Total items without attributes: ${result.total_items_without_attributes}`);
            console.log('');
            
            console.log('📊 ATTRIBUTE COUNTS:');
            result.attribute_counts.forEach(attr => {
                console.log(`  ${attr.attribute} = "${attr.attribute_value}": ${attr.sellable_count}/${attr.item_count} items (sellable/total)`);
            });
            console.log('');
            
            if (result.items_without_attributes.length > 0) {
                console.log('⚠️ ITEMS WITHOUT ATTRIBUTES (first 20):');
                result.items_without_attributes.forEach(item => {
                    console.log(`  ${item.name}: ${item.item_name} (variants: ${item.has_variants}, sales: ${item.is_sales_item}, disabled: ${item.disabled})`);
                });
                console.log('');
            }
            
            console.log('📋 SAMPLE ITEMS WITH ATTRIBUTES:');
            const sampleItems = result.items_with_attributes.slice(0, 10);
            sampleItems.forEach(item => {
                console.log(`  ${item.item_code}: ${item.attribute} = "${item.attribute_value}"`);
            });
            console.log('=== END DEBUG ===');
            
            return result;
        } else {
            console.error('Debug failed:', response.message);
        }
    } catch(e) { 
        console.error('debugItemAttributes error:', e); 
    }
};

// Generate Quote function
window.generateQuote = async () => {
    try { 
        if (window.fencePOS) {
            // Check if cart has items
            const hasItems = await window.fencePOS.checkWebshopCart();
            if (!hasItems) {
                window.fencePOS.showError('Cart is empty! Please add some products first.');
                return;
            }
            
            // Disable the generate quote button during processing
            const generateBtn = document.querySelector('.generate-quote-btn');
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.textContent = 'Generating Quote...';
            }
            
            // Create the quotation
            const result = await window.fencePOS.createQuotation();
            
            if (result && result.success) {
                // Show success message with quote number
                const quoteName = result.docname;
                frappe.show_alert({
                    message: `Quote ${quoteName} created successfully!`,
                    indicator: 'green'
                }, 5);
                
                // Optionally clear the cart after successful quote creation
                if (confirm('Quote created successfully! Would you like to clear the cart and start a new quote?')) {
                    await window.fencePOS.clearCart();
                }
            }
            
            // Re-enable button
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.textContent = 'Generate Quote';
            }
        }
    } catch(e) { 
        console.error('generateQuote error:', e);
        window.fencePOS?.showError('Failed to generate quote. Please try again.');
        
        // Re-enable button on error
        const generateBtn = document.querySelector('.generate-quote-btn');
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Generate Quote';
        }
    }
};

// Ensure pos is globally available as a fallback
if (!window.pos && window.fencePOS) {
    window.pos = window.fencePOS;
}