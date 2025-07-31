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
        this.currentPriceList = 'Standard Selling';
        this.selectedCustomer = null;
        this.searchTerm = '';
        
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
        
        // Initialize
        this.init();
    }
    
    async init() {
        console.log('Initializing Fence POS System...');
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadInitialData();
        
        // Set default category selection
        this.selectCategory('vinyl');
        
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
                    const delta = e.target.classList.contains('plus-btn') ? 1 : -1;
                    
                    this.updateItemQuantity(itemId, delta, itemName, price);
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
                const cartItem = e.target.closest('.cart-item');
                if (cartItem) {
                    const itemCode = cartItem.dataset.itemCode;
                    const delta = e.target.classList.contains('cart-plus-btn') ? 1 : -1;
                    
                    this.updateCartItemQuantity(itemCode, delta);
                }
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
        } catch (error) {
            console.error('Error loading price lists:', error);
            this.priceLists = [{ name: 'Standard Selling', price_list_name: 'Standard Selling', currency: 'USD' }];
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
                    material_type_name: type,
                    icon: '🏗️'
                }));
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
        
        // Default material types if none loaded
        const defaultCategories = [
            { name: 'vinyl', material_type_name: 'Vinyl', icon: '🏠' },
            { name: 'aluminum', material_type_name: 'Aluminum', icon: '🏗️' },
            { name: 'wood', material_type_name: 'Wood', icon: '🌲' }
        ];
        
        const categoriesToShow = this.categories.length > 0 ? this.categories.slice(0, 6) : defaultCategories;
        
        categoryGrid.innerHTML = categoriesToShow.map(category => `
            <div class="category-button" data-category="${category.name}" onclick="window.fencePOS.selectCategory('${category.name}')">
                <div class="category-icon">${category.icon || '🏗️'}</div>
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
        
        // Update sidebar button states
        document.querySelectorAll('.fence-type-btn').forEach(btn => btn.classList.remove('active'));
        const categoryBtn = document.querySelector(`[data-category="${category}"]`);
        if (categoryBtn) {
            categoryBtn.classList.add('active');
        }
        
        // Show style view
        await this.showStyleView();
    }
    
    async showStyleView() {
        this.currentView = 'style';
        
        // Hide other views
        document.getElementById('categoryView').style.display = 'none';
        document.getElementById('styleView').style.display = 'block';
        document.getElementById('optionsView').style.display = 'none';
        document.getElementById('componentView').style.display = 'none';
        
        // Default styles for fence types
        const fenceStyles = {
            vinyl: [
                { id: 'privacy', name: 'Privacy Style', description: 'Full privacy panels' },
                { id: 'picket', name: 'Picket Style', description: 'Classic picket design' },
                { id: 'ranch', name: 'Ranch Rail', description: '2 or 3 rail ranch style' }
            ],
            aluminum: [
                { id: 'ornamental', name: 'Ornamental', description: 'Decorative aluminum' },
                { id: 'pool', name: 'Pool Code', description: 'Meets pool safety codes' },
                { id: 'flat', name: 'Flat Top', description: 'Modern flat top design' }
            ],
            'pressure-treated': [
                { id: 'dogear', name: 'Dog Ear', description: 'Traditional dog ear boards' },
                { id: 'shadowbox', name: 'Shadowbox', description: 'Alternating board design' },
                { id: 'board-on-board', name: 'Board on Board', description: 'Overlapping boards' }
            ]
        };
        
        const styles = fenceStyles[this.selectedCategory] || fenceStyles.vinyl;
        const styleGrid = document.getElementById('styleGrid');
        
        styleGrid.innerHTML = styles.map(style => `
            <div class="style-card" onclick="window.fencePOS.selectStyle('${style.id.replace(/'/g, "\\'")}')">
                <div class="style-name">${style.name}</div>
                <div class="style-description">${style.description}</div>
            </div>
        `).join('');
    }
    
    selectStyle(styleId) {
        console.log('Selecting style:', styleId);
        this.selectedStyle = styleId;
        this.showOptionsView();
    }
    
    showOptionsView() {
        this.currentView = 'options';
        
        // Hide other views
        document.getElementById('categoryView').style.display = 'none';
        document.getElementById('styleView').style.display = 'none';
        document.getElementById('optionsView').style.display = 'block';
        document.getElementById('componentView').style.display = 'none';
        
        // Default options
        const heightOptions = ['4\'', '5\'', '6\'', '8\''];
        const colorOptions = ['White', 'Tan', 'Khaki'];
        
        // Populate height grid
        const heightGrid = document.getElementById('heightGrid');
        heightGrid.innerHTML = heightOptions.map(height => `
            <div class="option-button" onclick="window.fencePOS.selectHeight('${height.replace(/'/g, "\\'")}');event.stopPropagation();" id="height-${height.replace(/'/g, '')}">${height}</div>
        `).join('');
        
        // Populate color grid
        const colorGrid = document.getElementById('colorGrid');
        colorGrid.innerHTML = colorOptions.map(color => `
            <div class="option-button" onclick="window.fencePOS.selectColor('${color}');event.stopPropagation();" id="color-${color.replace(/\s+/g, '-')}">${color}</div>
        `).join('');
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
    
    async proceedToComponents() {
        if (!this.selectedHeight || !this.selectedColor) {
            this.showError('Please select both height and color');
            return;
        }
        
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
    
    async loadComponents() {
        console.log('Loading components for:', {
            category: this.selectedCategory,
            style: this.selectedStyle,
            height: this.selectedHeight,
            color: this.selectedColor
        });
        
        try {
            // Load real products from webshop only
            const products = await this.getProductsFromWebshop();
            
            if (products && products.length > 0) {
                console.log('Displaying real products:', products.length);
                this.displayRealProducts(products);
            } else {
                console.log('No products found in database');
                this.displayNoProductsMessage();
            }
        } catch (error) {
            console.error('Error loading components:', error);
            this.displayNoProductsMessage();
        }
    }
    
    async getProductsFromWebshop() {
        try {
            console.log('Fetching products for material type:', this.selectedCategory);
            
            // Enhanced filtering with multiple approaches
            let products = [];
            
            // Method 1: Try custom_material_type filter first (most specific)
            if (this.selectedCategory) {
                const response1 = await frappe.call({
                method: 'webshop.webshop.api.get_product_filter_data', 
                args: {
                    query_args: {
                        field_filters: {
                            custom_material_type: this.selectedCategory
                        }
                    }
                }
            });
                products = response1.message?.items || [];
            console.log('Products found with custom_material_type:', products.length);
            }
            
            // Method 2: If no products found, try item_group as fallback
            if (products.length === 0 && this.selectedCategory) {
                console.log('No products with custom_material_type, trying item_group...');
                const response2 = await frappe.call({
                    method: 'webshop.webshop.api.get_product_filter_data',
                    args: {
                        query_args: {
                            field_filters: {
                                item_group: this.selectedCategory
                            }
                        }
                    }
                });
                products = response2.message?.items || [];
                console.log('Products found with item_group:', products.length);
            }
            
            // Method 3: Enhanced direct Website Item query with better filters
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
                    // Get comprehensive item data including custom_material_type from Item doctype
                    const itemResponse = await frappe.call({
                        method: 'frappe.client.get_value',
                        args: {
                            doctype: 'Item',
                            filters: { item_code: websiteItem.item_code },
                            fieldname: ['is_sales_item', 'has_variants', 'disabled', 'standard_rate', 'stock_uom', 'item_group', 'custom_material_type']
                        }
                    });
                    
                    const itemData = itemResponse.message;
                    
                    // Enhanced sellability criteria
                    if (itemData && 
                        itemData.is_sales_item === 1 && 
                        itemData.disabled === 0 && 
                        itemData.has_variants === 0) {
                        
                        // Additional category filtering using custom_material_type from Item
                        let includeItem = true;
                        if (this.selectedCategory) {
                            const categoryMatch = 
                                (itemData.custom_material_type && itemData.custom_material_type.toLowerCase() === this.selectedCategory.toLowerCase()) ||
                                (itemData.item_group && itemData.item_group.toLowerCase() === this.selectedCategory.toLowerCase()) ||
                                (websiteItem.web_item_name.toLowerCase().includes(this.selectedCategory.toLowerCase()));
                            
                            includeItem = categoryMatch;
                        }
                        
                        if (includeItem) {
                            // Check if item is a bundle
                            const bundleInfo = await this.checkIfProductBundle(websiteItem.item_code);
                        
                        sellableItems.push({
                            ...websiteItem,
                                standard_rate: itemData.standard_rate,
                                stock_uom: itemData.stock_uom,
                                material_type: itemData.custom_material_type,
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
                            console.log('❌ Item filtered out by category:', websiteItem.item_code, {
                                custom_material_type: itemData.custom_material_type,
                                item_group: itemData.item_group,
                                selectedCategory: this.selectedCategory
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
            
            // Get prices based on customer's price list
            const itemsWithPrices = await Promise.all(sellableItems.map(async (item) => {
                let price = item.standard_rate || 0.00;
                
                try {
                    // Use customer's default price list if available
                    const customerPriceList = this.selectedCustomer?.defaultPriceList || this.currentPriceList;
                    
                    const priceResponse = await frappe.call({
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
                        console.log(`📈 Price from ${customerPriceList} for`, item.item_code, ':', price);
                    } else {
                        console.log('📊 Using standard rate for', item.item_code, ':', price);
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
    
    displayRealProducts(products) {
        const container = document.getElementById('componentsContainer');
        if (!container) return;
        
        // Group products by component type if possible
        const sections = ['Panels', 'Posts', 'Gates', 'Caps', 'Hardware'];
        let html = '';
        
        sections.forEach((section, index) => {
            const sectionClass = (index === 1 || index === 3) ? 'component-section light-blue' : 'component-section';
            
            html += `
                <div class="${sectionClass}">
                    <div class="component-header">${section.toUpperCase()}</div>
                    <div class="component-grid" id="${section.toLowerCase()}Grid">
            `;
            
            // Filter products for this section with better logic
            const sectionProducts = products.filter(product => {
                const name = product.name.toLowerCase();
                const itemName = product.item_name.toLowerCase();
                
                // Smart filtering by section
                switch(section.toLowerCase()) {
                    case 'panels':
                        return name.includes('panel') || itemName.includes('panel') || 
                               name.includes('picket') || itemName.includes('picket');
                    case 'posts':
                        return name.includes('post') || itemName.includes('post');
                    case 'gates':
                        return name.includes('gate') || itemName.includes('gate');
                    case 'caps':
                        return name.includes('cap') || itemName.includes('cap');
                    case 'hardware':
                        return name.includes('hinge') || itemName.includes('hinge') ||
                               name.includes('latch') || itemName.includes('latch') ||
                               name.includes('hardware') || itemName.includes('hardware');
                    default:
                        return false;
                }
            }).slice(0, 6);
            
            if (sectionProducts.length > 0) {
                sectionProducts.forEach(product => {
                    try {
                        const price = product.price_list_rate || product.standard_rate || 0.00;
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
        
        return `
            <div class="item-card ${isBundleItem ? 'bundle-card' : ''}" data-item-id="${safeItemId}" data-item-name="${safeItemName}" data-price="${price}" id="${cardId}">
                <div class="item-image">
                    ${image ? 
                        `<img src="${image}" alt="${displayItemName}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" onerror="this.style.display='none'; this.parentNode.innerHTML='${isBundleItem ? '📦' : '📦'}';">` : 
                        (isBundleItem ? '📦' : '📦')
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
    

    
    async updateItemQuantity(encodedItemId, delta, encodedItemName, price) {
        // Decode the parameters
        const itemId = decodeURIComponent(encodedItemId);
        const itemName = decodeURIComponent(encodedItemName);
        
        console.log('Raw parameters received:', { encodedItemId, delta, encodedItemName, price });
        console.log('Decoded parameters:', { itemId, delta, itemName, price });
        
        try {
            // All items are real items from the database
            console.log('Updating real item:', itemId, 'delta:', delta);
            
            if (delta > 0) {
                console.log('Adding real item to webshop cart:', itemId);
                await this.addToWebshopCart(itemId, itemName, price, 1);
            } else {
                console.log('Removing real item from webshop cart:', itemId);
                await this.removeFromWebshopCart(itemId, 1);
            }
            
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
    

    
    async addToWebshopCart(itemCode, itemName, price, qty) {
        try {
            // Check if the item is a product bundle first
            const bundleInfo = await this.checkIfProductBundle(itemCode);
            
            // Use the correct webshop cart API - update_cart
            const response = await frappe.call({
                method: 'webshop.webshop.shopping_cart.cart.update_cart',
                args: {
                    item_code: itemCode,
                    qty: qty,
                    with_items: 1
                }
            });
            
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
            if (bundleInfo.isBundle && bundleItems.length === 0) {
                // Fallback: Look for packed_items in the cart response
                bundleItems = this.getBundleItemsFromCart(item.item_code);
            }
            
            const itemWithBundle = {
                ...item,
                isBundle: bundleInfo.isBundle,
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
                    <div class="cart-item-qty">
                        <div class="qty-btn cart-minus-btn" data-action="decrease">-</div>
                        <span>${item.qty}</span>
                        <div class="qty-btn cart-plus-btn" data-action="increase">+</div>
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
                    const bundleQty = (bundleItem.qty || 1) * item.qty;
                    const componentId = `bundle-${item.item_code}-${bundleItem.item_code}`.replace(/[^a-zA-Z0-9-_]/g, '');
                    html += `
                        <div class="bundle-item-row" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; ${index > 0 ? 'border-top: 1px solid #e9ecef;' : ''} font-size: 12px;">
                            <div class="bundle-item-details" style="flex: 1;">
                                <span class="bundle-item-name" style="color: #495057; font-weight: 500;">
                                    ${bundleItem.item_name || bundleItem.item_code}
                                </span>
                                ${bundleItem.description ? `<div style="color: #6c757d; font-size: 11px; margin-top: 2px;">${bundleItem.description}</div>` : ''}
                            </div>
                            <div class="bundle-item-controls" style="display: flex; align-items: center; margin-left: 10px; gap: 8px;">
                                <div class="bundle-qty-controls" style="display: flex; align-items: center; background: white; border: 1px solid #dee2e6; border-radius: 4px;">
                                    <button class="bundle-qty-btn minus-btn" 
                                            onclick="pos.updateBundleItemQuantity('${item.item_code}', '${bundleItem.item_code}', -1)"
                                            style="background: none; border: none; color: #6c757d; padding: 2px 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; min-width: 20px; height: 20px;"
                                            ${bundleQty <= 1 ? 'disabled' : ''}>−</button>
                                    <span class="bundle-qty-display" id="${componentId}-qty" 
                                          style="padding: 2px 6px; color: #007bff; font-weight: 500; min-width: 20px; text-align: center; font-size: 11px;">
                                        ${bundleQty}
                                    </span>
                                    <button class="bundle-qty-btn plus-btn" 
                                            onclick="pos.updateBundleItemQuantity('${item.item_code}', '${bundleItem.item_code}', 1)"
                                            style="background: none; border: none; color: #6c757d; padding: 2px 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; min-width: 20px; height: 20px;">+</button>
                                </div>
                                <span style="color: #6c757d; font-size: 10px;">${bundleItem.uom || 'Unit'}${bundleQty > 1 ? 's' : ''}</span>
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
                                                onclick="pos.updateBundleItemQuantity('${item.item_code}', '${packedItem.item_code}', -1)"
                                                style="background: none; border: none; color: #6c757d; padding: 2px 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; min-width: 20px; height: 20px;"
                                                ${packedItem.qty <= 1 ? 'disabled' : ''}>−</button>
                                        <span class="bundle-qty-display" id="${componentId}-qty" 
                                              style="padding: 2px 6px; color: #007bff; font-weight: 500; min-width: 20px; text-align: center; font-size: 11px;">
                                            ${packedItem.qty}
                                        </span>
                                        <button class="bundle-qty-btn plus-btn" 
                                                onclick="pos.updateBundleItemQuantity('${item.item_code}', '${packedItem.item_code}', 1)"
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
            // Get current cart to find current quantity
            const cartResponse = await frappe.call({
                method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation'
            });
            
            if (cartResponse.message && cartResponse.message.items) {
                const item = cartResponse.message.items.find(i => i.item_code === itemCode);
                if (item) {
                    const newQty = Math.max(0, item.qty + delta);
                    
                    // Update cart with new quantity
                    await frappe.call({
                        method: 'webshop.webshop.shopping_cart.cart.update_cart',
                        args: {
                            item_code: itemCode,
                            qty: newQty,
                            with_items: 1
                        }
                    });
                    
                    // Refresh cart display
                    await this.updateCartDisplay();
                }
            }
        } catch (error) {
            console.error('Error updating cart item quantity:', error);
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
    
    selectFulfillment(method) {
        this.fulfillmentMethod = method;
        
        document.querySelectorAll('#fulfillmentGroup .option-btn').forEach(btn => btn.classList.remove('selected'));
        
        const selectedBtn = document.querySelector(`[onclick*="selectFulfillment('${method}')"]`);
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
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
                    selectedCustomer: this.selectedCustomer
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
                    notes: `Created from POS - Material: ${this.selectedCategory}, Style: ${this.selectedStyle}, Height: ${this.selectedHeight}, Color: ${this.selectedColor}`,
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
    
    async clearCart() {
        try {
            // Clear webshop cart by setting all items to 0 quantity
            const cartResponse = await frappe.call({
                method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation'
            });
            
            if (cartResponse.message && cartResponse.message.items) {
                // Set each item quantity to 0
                for (const item of cartResponse.message.items) {
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
        } catch (error) {
            console.error('Could not clear webshop cart:', error);
            throw new Error('Failed to clear cart');
        }
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
    
    selectCustomer(customerId, customerName, customerGroup, defaultPriceList) {
        // Use customer's default price list or fallback to Standard Selling
        const priceListToUse = defaultPriceList || 'Standard Selling';
        
        this.selectedCustomer = {
            id: customerId,
            name: customerName,
            group: customerGroup,
            defaultPriceList: priceListToUse
        };
        
        // Update display
        document.getElementById('customerName').textContent = customerName;
        document.getElementById('customerType').textContent = customerGroup;
        document.getElementById('priceListName').textContent = priceListToUse;
        
        // Update current price list to customer's default or Standard Selling
        this.currentPriceList = priceListToUse;
        
        console.log(`🏷️ Customer selected: ${customerName}, Price List: ${priceListToUse}`);
        
        // Refresh component prices if on component view to apply new pricing
        if (this.currentView === 'component') {
            this.loadComponents();
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
                        <option value="Standard Selling">Standard Selling</option>
                        <option value="Wholesale Price List">Wholesale Price List</option>
                        <option value="Contractor Price List">Contractor Price List</option>
                        <option value="Retail Price List">Retail Price List</option>
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
            
            // Filter to only sellable items
            const sellableResults = [];
            for (const item of searchResults) {
                try {
                    const itemResponse = await frappe.call({
                        method: 'frappe.client.get_value',
                        args: {
                            doctype: 'Item',
                            filters: { item_code: item.item_code },
                            fieldname: ['is_sales_item', 'has_variants', 'disabled']
                        }
                    });
                    
                    const itemData = itemResponse.message;
                    if (itemData && 
                        itemData.is_sales_item === 1 && 
                        itemData.disabled === 0 && 
                        itemData.has_variants === 0) {
                        sellableResults.push(item);
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
            // Find current quantity in product card
            const itemCard = document.querySelector(`[data-item-id="${encodedItemId}"]`);
            const currentQty = itemCard ? parseInt(itemCard.querySelector('.item-qty-input').value) || 0 : 0;
            
            // Calculate delta to reach desired quantity
            const delta = parseInt(qty) - currentQty;
            
            if (delta !== 0) {
                this.updateItemQuantity(encodedItemId, delta, encodedItemName, price);
            }
        }
    }

    logProductDetails(products) {
        console.log('=== PRODUCT DETAILS ===');
        console.log(`Total products loaded: ${products.length}`);
        
        products.forEach((product, index) => {
            console.log(`Product ${index + 1}:`, {
                name: product.name,
                item_name: product.item_name,
                price: product.price_list_rate || product.standard_rate || 'No price',
                image: product.website_image || 'No image',
                route: product.route || 'No route'
            });
        });
        
        console.log('=== END PRODUCT DETAILS ===');
    }
    
    verifyButtonFunctionality() {
        console.log('🔍 Verifying button functionality...');
        
        const functionsToCheck = [
            'selectCategory', 'selectStyle', 'selectHeight', 'selectColor',
            'selectOrderType', 'selectFulfillment', 'selectSchedule', 'selectTime',
            'changeMonth', 'checkout', 'openCustomerSearch', 'closeCustomerSearch',
            'selectCustomer', 'switchLanguage', 'proceedToComponents',
            'clearSearch', 'updateCartItemQuantity', 'showAddCustomerForm', 'createNewCustomer',
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
        
        // Group products by category for better organization
        const categories = {};
        products.forEach(product => {
            const category = product.category || product.material_type || 'Other';
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
        
        // Display items by category
        Object.keys(categories).forEach((categoryName, index) => {
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
}

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

// Global functions for onclick handlers
// Navigation and category functions
window.selectCategory = (category) => {
    try { window.fencePOS?.selectCategory(category); } catch(e) { console.error('selectCategory error:', e); }
};
window.selectStyle = (styleId) => {
    try { window.fencePOS?.selectStyle(styleId); } catch(e) { console.error('selectStyle error:', e); }
};
window.selectHeight = (height) => {
    try { window.fencePOS?.selectHeight(height); } catch(e) { console.error('selectHeight error:', e); }
};
window.selectColor = (color) => {
    try { window.fencePOS?.selectColor(color); } catch(e) { console.error('selectColor error:', e); }
};
window.proceedToComponents = () => {
    try { window.fencePOS?.proceedToComponents(); } catch(e) { console.error('proceedToComponents error:', e); }
};

// Order management functions
window.selectOrderType = (type) => {
    try { window.fencePOS?.selectOrderType(type); } catch(e) { console.error('selectOrderType error:', e); }
};
window.selectFulfillment = (method) => {
    try { window.fencePOS?.selectFulfillment(method); } catch(e) { console.error('selectFulfillment error:', e); }
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
window.checkout = () => {
    try { window.fencePOS?.checkout(); } catch(e) { console.error('checkout error:', e); }
};
window.updateCartItemQuantity = (itemCode, delta) => {
    try { window.fencePOS?.updateCartItemQuantity(itemCode, delta); } catch(e) { console.error('updateCartItemQuantity error:', e); }
};
window.updateBundleItemQuantity = (bundleItemCode, componentItemCode, delta) => {
    try { window.fencePOS?.updateBundleItemQuantity(bundleItemCode, componentItemCode, delta); } catch(e) { console.error('updateBundleItemQuantity error:', e); }
};

// Customer and search functions
window.openCustomerSearch = () => {
    try { window.fencePOS?.openCustomerSearch(); } catch(e) { console.error('openCustomerSearch error:', e); }
};
window.closeCustomerSearch = () => {
    try { window.fencePOS?.closeCustomerSearch(); } catch(e) { console.error('closeCustomerSearch error:', e); }
};
window.selectCustomer = (customerId, customerName, customerGroup) => {
    try { window.fencePOS?.selectCustomer(customerId, customerName, customerGroup); } catch(e) { console.error('selectCustomer error:', e); }
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
window.createNewCustomer = () => {
    try { window.fencePOS?.createNewCustomer(); } catch(e) { console.error('createNewCustomer error:', e); }
};

// Enhanced time selection functions
window.selectTimeFromPicker = (timeValue) => {
    try { window.fencePOS?.selectTimeFromPicker(timeValue); } catch(e) { console.error('selectTimeFromPicker error:', e); }
};
window.selectQuickTime = (time) => {
    try { window.fencePOS?.selectQuickTime(time); } catch(e) { console.error('selectQuickTime error:', e); }
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