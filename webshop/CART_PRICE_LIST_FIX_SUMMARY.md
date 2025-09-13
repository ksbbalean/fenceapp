# Cart Price List Fix - Root Cause Resolution

## Problem Identified

The issue was that the cart system was using the **customer's default price list** instead of respecting the POS user's price list selection. Here's what was happening:

1. **Customer "Joseph Migrala"** has `default_price_list = "Contractor"` in the database
2. **POS user selects "Homeowner"** price list in the interface
3. **Cart creation process** calls `_set_price_list()` which:
   - First checks customer's default price list → finds "Contractor"
   - Uses "Contractor" instead of webshop settings default
   - **Ignores POS selection completely**

## Root Cause

The `_set_price_list()` function in `webshop/shopping_cart/cart.py` has this logic:
```python
# check if default customer price list exists
if party_name and frappe.db.exists("Customer", party_name):
    selling_price_list = get_default_price_list(
        frappe.get_doc("Customer", party_name)
    )

# check default price list in shopping cart
if not selling_price_list:
    selling_price_list = cart_settings.price_list
```

This means:
- **Customer default price list takes precedence** over webshop settings
- **POS price list selection is completely ignored**
- Cart is created with customer's default, not user's choice

## Solution Implemented

### 1. New API Function: `set_cart_price_list()`
**File**: `pos_api.py`
**Purpose**: Override the cart's price list regardless of customer defaults

```python
@frappe.whitelist()
def set_cart_price_list(price_list):
    """Set the cart price list from POS - overrides customer default"""
    # Gets cart quotation and sets selling_price_list directly
    # Recalculates item prices with new price list
    # Saves the cart with updated pricing
```

### 2. Enhanced POS JavaScript
**File**: `www/pos/index.js`

#### New Method: `setCartPriceList()`
```javascript
async setCartPriceList(priceList) {
    // Calls the new API to override cart price list
    // This happens BEFORE updateCartPricing()
}
```

#### Updated `changePriceList()` Method
```javascript
async changePriceList(newPriceList) {
    // 1. Set cart price list first (overrides customer default)
    await this.setCartPriceList(newPriceList);
    
    // 2. Then update cart pricing
    await this.updateCartPricing(newPriceList);
    
    // 3. Refresh product display
    // 4. Show notifications
}
```

#### Updated `addToWebshopCart()` Method
```javascript
// After adding to cart, ensure cart uses current POS price list
if (this.currentPriceList) {
    await this.setCartPriceList(this.currentPriceList);
    await this.updateCartPricing(this.currentPriceList);
}
```

#### Updated `selectCustomer()` Method
```javascript
// Update cart pricing to match current price list
if (this.currentPriceList) {
    await this.setCartPriceList(this.currentPriceList);
    await this.updateCartPricing(this.currentPriceList);
}
```

## How It Works Now

### Scenario 1: Price List Selected Before Item Addition
1. User selects "Homeowner" price list in POS
2. `changePriceList()` calls `setCartPriceList("Homeowner")`
3. Cart's `selling_price_list` is set to "Homeowner"
4. User adds item to cart
5. Item is added with "Homeowner" pricing ✅

### Scenario 2: Price List Changed After Item Addition
1. User adds item (cart uses current price list)
2. User changes to "Contractor" price list
3. `changePriceList()` calls `setCartPriceList("Contractor")`
4. Cart's `selling_price_list` is updated to "Contractor"
5. All existing items are recalculated with "Contractor" pricing ✅

### Scenario 3: Customer Selection
1. User selects customer with default "Contractor" price list
2. If no price list selected: Customer's default is applied
3. If price list already selected: User's choice is preserved
4. Cart is updated to use the correct price list ✅

## Key Changes Made

### Files Modified:
1. **`pos_api.py`** - Added `set_cart_price_list()` function
2. **`www/pos/index.js`** - Added `setCartPriceList()` method and updated existing methods

### Functions Added:
- `set_cart_price_list()` - Python API to override cart price list
- `setCartPriceList()` - JavaScript method to call the API

### Functions Updated:
- `changePriceList()` - Now calls `setCartPriceList()` first
- `addToWebshopCart()` - Now calls `setCartPriceList()` when adding items
- `selectCustomer()` - Now calls `setCartPriceList()` when selecting customers

## Result

The cart now **respects the POS user's price list selection** instead of defaulting to the customer's default price list. The price list shown in the POS interface will match the price list used in the cart, eliminating the discrepancy between frontend display ($94.99) and cart pricing ($79.99).

## Testing

The fix addresses both scenarios mentioned in the original issue:
1. ✅ **Price list selected before item addition** - Cart uses selected price list
2. ✅ **Price list changed after item addition** - Cart updates to new price list

The solution maintains backward compatibility and doesn't break existing functionality while ensuring the POS system works as expected.
