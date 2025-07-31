"""
Fence POS API - Extends webshop functionality for POS system
Integrates with existing webshop infrastructure
"""

import frappe
from frappe import _
from webshop.webshop.shopping_cart import cart
from webshop.webshop.api import get_product_filter_data

@frappe.whitelist()
def get_fence_items_for_pos(category=None, height=None, color=None, style=None, price_list=None):
    """Get fence items for POS using existing product engine"""
    
    query_args = {
        "field_filters": {}
    }
    
    if category:
        # Try to check if items exist with custom_material_type first
        custom_material_items = frappe.db.count("Item", {
            "custom_material_type": category,
            "disabled": 0
        })
        
        if custom_material_items > 0:
            # Filter by custom_material_type field if items exist
            query_args["field_filters"]["custom_material_type"] = category
        else:
            # Fallback to item_group filtering
            query_args["field_filters"]["item_group"] = category
    
    # Add attribute filters for fence-specific attributes
    attribute_filters = {}
    if height:
        attribute_filters["Fence Height"] = [height]
    if color:
        attribute_filters["Fence Color"] = [color]
    if style:
        attribute_filters["Fence Style"] = [style]
    
    if attribute_filters:
        query_args["attribute_filters"] = attribute_filters
    
    try:
        # Use existing product filter system
        result = get_product_filter_data(query_args)
        
        # Enhance with POS-specific data
        if result.get("items"):
            for item in result["items"]:
                # Add pricing for specific price list
                if price_list:
                    item_price = get_item_price_for_pos(item.get("name"), price_list)
                    if item_price:
                        item["pos_price"] = item_price
                
                # Add stock information
                item["stock_qty"] = get_item_stock_qty(item.get("name"))
                
                # Add fence-specific metadata
                item["fence_metadata"] = get_fence_item_metadata(item.get("name"))
        
        return result
        
    except Exception as e:
        frappe.log_error(f"Error in get_fence_items_for_pos: {str(e)}")
        return {"items": [], "item_count": 0}

@frappe.whitelist()
def get_fence_items_for_pos_simple(category=None):
    """Simplified version to get items directly from Website Item"""
    try:
        filters = {"published": 1}
        
        if category:
            # Try custom_material_type first
            custom_material_items = frappe.db.sql("""
                SELECT wi.name, wi.item_code, wi.web_item_name, wi.route, wi.website_image,
                       i.custom_material_type, i.item_group
                FROM `tabWebsite Item` wi
                INNER JOIN tabItem i ON wi.item_code = i.name
                WHERE wi.published = 1 
                    AND i.disabled = 0
                    AND (i.custom_material_type = %s OR i.item_group = %s)
                LIMIT 20
            """, (category, category), as_dict=True)
            
            return {"items": custom_material_items}
        else:
            # Get all published items
            all_items = frappe.db.sql("""
                SELECT wi.name, wi.item_code, wi.web_item_name, wi.route, wi.website_image,
                       i.custom_material_type, i.item_group
                FROM `tabWebsite Item` wi
                INNER JOIN tabItem i ON wi.item_code = i.name
                WHERE wi.published = 1 AND i.disabled = 0
                LIMIT 20
            """, as_dict=True)
            
            return {"items": all_items}
            
    except Exception as e:
        frappe.log_error(f"Error in get_fence_items_for_pos_simple: {str(e)}")
        return {"items": [], "error": str(e)}

@frappe.whitelist()
def get_item_price_for_pos(item_code, price_list):
    """Get item price for specific price list"""
    try:
        price = frappe.get_value("Item Price", {
            "item_code": item_code,
            "price_list": price_list
        }, "price_list_rate")
        
        if not price:
            # Fall back to standard selling price
            price = frappe.get_value("Item", item_code, "standard_rate")
        
        return float(price) if price else 0.0
        
    except Exception as e:
        frappe.log_error(f"Error getting price for {item_code}: {str(e)}")
        return 0.0

@frappe.whitelist()
def get_item_stock_qty(item_code, warehouse=None):
    """Get current stock quantity for item"""
    try:
        if not warehouse:
            # Get default warehouse
            warehouse = frappe.get_value("Stock Settings", None, "default_warehouse")
        
        if warehouse:
            stock_qty = frappe.get_value("Bin", {
                "item_code": item_code,
                "warehouse": warehouse
            }, "actual_qty")
            
            return float(stock_qty) if stock_qty else 0.0
        
        return 0.0
        
    except Exception as e:
        frappe.log_error(f"Error getting stock for {item_code}: {str(e)}")
        return 0.0

@frappe.whitelist()
def get_fence_item_metadata(item_code):
    """Get fence-specific metadata for item"""
    try:
        # Get item attributes
        attributes = frappe.get_all("Item Variant Attribute", {
            "parent": item_code
        }, ["attribute", "attribute_value"])
        
        metadata = {}
        for attr in attributes:
            metadata[attr.attribute] = attr.attribute_value
        
        # Add component type classification
        item_name = frappe.get_value("Item", item_code, "item_name")
        if item_name:
            metadata["component_type"] = classify_fence_component(item_name)
        
        return metadata
        
    except Exception as e:
        frappe.log_error(f"Error getting metadata for {item_code}: {str(e)}")
        return {}

def classify_fence_component(item_name):
    """Classify fence component type based on name"""
    item_lower = item_name.lower()
    
    if "panel" in item_lower:
        return "panels"
    elif "post" in item_lower:
        return "posts"
    elif "gate" in item_lower:
        return "gates"
    elif "cap" in item_lower:
        return "caps"
    elif any(word in item_lower for word in ["hinge", "latch", "hardware", "bracket"]):
        return "hardware"
    else:
        return "other"

@frappe.whitelist()
def add_fence_item_to_cart(item_code, qty=1, customer=None, price_list=None):
    """Add fence item to cart with POS enhancements"""
    try:
        # Set customer context if provided
        if customer:
            frappe.local.session.user = customer
        
        # Use existing cart functionality
        result = cart.add_to_cart(item_code, qty)
        
        # Update cart with POS-specific data
        if result and price_list:
            update_cart_pricing(price_list)
        
        return result
        
    except Exception as e:
        frappe.log_error(f"Error adding {item_code} to cart: {str(e)}")
        return {"message": "Failed to add item to cart"}

@frappe.whitelist()
def update_cart_pricing(price_list):
    """Update cart pricing based on price list"""
    try:
        quotation = cart.get_cart_quotation()
        if not quotation:
            return
        
        doc = frappe.get_doc("Quotation", quotation.name)
        doc.selling_price_list = price_list
        
        # Recalculate prices
        for item in doc.items:
            new_rate = get_item_price_for_pos(item.item_code, price_list)
            if new_rate:
                item.rate = new_rate
                item.amount = new_rate * item.qty
        
        doc.save()
        return {"message": "Cart pricing updated"}
        
    except Exception as e:
        frappe.log_error(f"Error updating cart pricing: {str(e)}")
        return {"message": "Failed to update pricing"}

@frappe.whitelist()
def create_pos_order(order_type="quote", delivery_method=None, scheduled_date=None, scheduled_time=None, customer=None):
    """Convert cart to quote/order using existing cart system with POS enhancements"""
    try:
        # Get current cart
        quotation = cart.get_cart_quotation()
        if not quotation:
            return {"message": "No items in cart"}
        
        doc = frappe.get_doc("Quotation", quotation.name)
        
        # Add POS-specific fields
        if hasattr(doc, 'order_type'):
            doc.order_type = order_type
        if hasattr(doc, 'delivery_method') and delivery_method:
            doc.delivery_method = delivery_method
        if hasattr(doc, 'scheduled_date') and scheduled_date:
            doc.scheduled_date = scheduled_date
        if hasattr(doc, 'scheduled_time') and scheduled_time:
            doc.scheduled_time = scheduled_time
        
        # Set customer if provided
        if customer:
            doc.customer = customer
        
        doc.save()
        
        # Convert to Sales Order if order type is "order"
        if order_type == "order":
            sales_order = convert_quotation_to_sales_order(doc.name)
            return {
                "message": "Order created successfully",
                "quotation": doc.name,
                "sales_order": sales_order.name if sales_order else None,
                "order_type": order_type
            }
        else:
            return {
                "message": "Quote created successfully",
                "quotation": doc.name,
                "order_type": order_type
            }
            
    except Exception as e:
        frappe.log_error(f"Error creating POS order: {str(e)}")
        return {"message": "Failed to create order"}

def convert_quotation_to_sales_order(quotation_name):
    """Convert quotation to sales order"""
    try:
        quotation = frappe.get_doc("Quotation", quotation_name)
        
        # Create Sales Order
        sales_order = frappe.get_doc({
            "doctype": "Sales Order",
            "customer": quotation.customer,
            "quotation_to": "Customer",
            "order_type": "Sales",
            "delivery_date": quotation.get("scheduled_date") or frappe.utils.add_days(frappe.utils.today(), 7),
            "selling_price_list": quotation.selling_price_list,
            "currency": quotation.currency,
            "items": []
        })
        
        # Copy items from quotation
        for item in quotation.items:
            sales_order.append("items", {
                "item_code": item.item_code,
                "item_name": item.item_name,
                "description": item.description,
                "qty": item.qty,
                "uom": item.uom,
                "rate": item.rate,
                "amount": item.amount
            })
        
        # Copy POS-specific fields
        if hasattr(quotation, 'delivery_method'):
            sales_order.delivery_method = quotation.delivery_method
        if hasattr(quotation, 'scheduled_date'):
            sales_order.delivery_date = quotation.scheduled_date
        if hasattr(quotation, 'scheduled_time'):
            sales_order.scheduled_time = quotation.scheduled_time
        
        sales_order.insert()
        sales_order.submit()
        
        # Update quotation status
        quotation.status = "Ordered"
        quotation.save()
        
        return sales_order
        
    except Exception as e:
        frappe.log_error(f"Error converting quotation to sales order: {str(e)}")
        return None

@frappe.whitelist()
def get_fence_categories():
    """Get fence categories/item groups for POS"""
    try:
        # First try to get fence-specific categories
        fence_categories = frappe.get_all("Item Group", 
            filters={
                "parent_item_group": ["in", ["Fence Products", "Fencing"]],
                "is_group": 0
            },
            fields=["name", "item_group_name", "image", "parent_item_group"]
        )
        
        # If no fence categories, get all item groups
        if not fence_categories:
            fence_categories = frappe.get_all("Item Group",
                filters={"is_group": 0},
                fields=["name", "item_group_name", "image", "parent_item_group"],
                limit=10
            )
        
        return fence_categories
        
    except Exception as e:
        frappe.log_error(f"Error getting fence categories: {str(e)}")
        return []

@frappe.whitelist()
def get_pos_customers(search_term=""):
    """Get customers for POS with search"""
    try:
        filters = {}
        if search_term:
            filters = {
                "customer_name": ["like", f"%{search_term}%"]
            }
        
        customers = frappe.get_all("Customer",
            filters=filters,
            fields=["name", "customer_name", "customer_group", "mobile_no", "email_id"],
            limit=20,
            order_by="customer_name"
        )
        
        return customers
        
    except Exception as e:
        frappe.log_error(f"Error getting customers: {str(e)}")
        return []

@frappe.whitelist()
def get_pos_price_lists():
    """Get available price lists for POS"""
    try:
        price_lists = frappe.get_all("Price List",
            filters={"enabled": 1},
            fields=["name", "price_list_name", "currency"],
            order_by="price_list_name"
        )
        
        return price_lists
        
    except Exception as e:
        frappe.log_error(f"Error getting price lists: {str(e)}")
        return []

@frappe.whitelist()
def setup_fence_pos_data():
    """Setup initial data for fence POS system"""
    try:
        # Create fence item groups if they don't exist
        setup_fence_item_groups()
        
        # Create fence attributes if they don't exist
        setup_fence_attributes()
        
        # Create fence price lists if they don't exist
        setup_fence_price_lists()
        
        # Add custom fields for POS functionality
        setup_pos_custom_fields()
        
        return {"message": "Fence POS data setup completed"}
        
    except Exception as e:
        frappe.log_error(f"Error setting up fence POS data: {str(e)}")
        return {"message": "Failed to setup fence POS data"}

def setup_fence_item_groups():
    """Create fence item groups"""
    fence_groups = [
        {"name": "Fence Products", "parent": "All Item Groups", "is_group": 1},
        {"name": "Vinyl Fence", "parent": "Fence Products", "is_group": 0},
        {"name": "Aluminum Fence", "parent": "Fence Products", "is_group": 0},
        {"name": "Pressure Treated Fence", "parent": "Fence Products", "is_group": 0}
    ]
    
    for group in fence_groups:
        if not frappe.db.exists("Item Group", group["name"]):
            doc = frappe.get_doc({
                "doctype": "Item Group",
                "item_group_name": group["name"],
                "parent_item_group": group["parent"],
                "is_group": group["is_group"]
            })
            doc.insert(ignore_permissions=True)

def setup_fence_attributes():
    """Create fence-specific item attributes"""
    attributes = [
        {"name": "Fence Height", "values": ["4'", "5'", "6'", "8'"]},
        {"name": "Fence Color", "values": ["White", "Tan", "Khaki"]},
        {"name": "Fence Style", "values": ["Privacy", "Picket", "Ranch", "Ornamental", "Pool", "Flat", "Dog Ear", "Shadowbox", "Board on Board"]},
        {"name": "Component Type", "values": ["Panels", "Posts", "Gates", "Caps", "Hardware"]}
    ]
    
    for attr in attributes:
        if not frappe.db.exists("Item Attribute", attr["name"]):
            doc = frappe.get_doc({
                "doctype": "Item Attribute",
                "attribute_name": attr["name"],
                "item_attribute_values": [{"attribute_value": val} for val in attr["values"]]
            })
            doc.insert(ignore_permissions=True)

def setup_fence_price_lists():
    """Create fence-specific price lists"""
    price_lists = [
        {"name": "Homeowner Price List", "currency": "USD"},
        {"name": "Contractor Price List", "currency": "USD"}
    ]
    
    for price_list in price_lists:
        if not frappe.db.exists("Price List", price_list["name"]):
            doc = frappe.get_doc({
                "doctype": "Price List",
                "price_list_name": price_list["name"],
                "currency": price_list["currency"],
                "enabled": 1
            })
            doc.insert(ignore_permissions=True)

def setup_pos_custom_fields():
    """Add custom fields for POS functionality"""
    # Add fields to Quotation
    quotation_fields = [
        {
            "fieldname": "order_type",
            "fieldtype": "Select",
            "options": "Quote\nOrder",
            "label": "Order Type",
            "insert_after": "customer"
        },
        {
            "fieldname": "delivery_method",
            "fieldtype": "Select", 
            "options": "Pickup\nDelivery",
            "label": "Delivery Method",
            "insert_after": "order_type"
        },
        {
            "fieldname": "scheduled_date",
            "fieldtype": "Date",
            "label": "Scheduled Date",
            "insert_after": "delivery_method"
        },
        {
            "fieldname": "scheduled_time",
            "fieldtype": "Time",
            "label": "Scheduled Time", 
            "insert_after": "scheduled_date"
        }
    ]
    
    for field in quotation_fields:
        create_custom_field("Quotation", field)
    
    # Add similar fields to Sales Order
    for field in quotation_fields:
        create_custom_field("Sales Order", field)

def create_custom_field(doctype, field_dict):
    """Create custom field if it doesn't exist"""
    field_name = f"{doctype}-{field_dict['fieldname']}"
    
    if not frappe.db.exists("Custom Field", field_name):
        custom_field = frappe.get_doc({
            "doctype": "Custom Field",
            "name": field_name,
            "dt": doctype,
            **field_dict
        })
        custom_field.insert(ignore_permissions=True) 

@frappe.whitelist()
def debug_pos_items():
    """Debug function to check POS item setup"""
    debug_info = {}
    
    try:
        # Check if custom_material_type field exists
        custom_field_exists = frappe.db.sql("SHOW COLUMNS FROM tabItem LIKE 'custom_material_type'")
        debug_info['custom_field_exists'] = bool(custom_field_exists)
        
        # Count items with custom_material_type
        if custom_field_exists:
            custom_material_count = frappe.db.count("Item", {
                "custom_material_type": ["!=", ""],
                "disabled": 0
            })
            debug_info['items_with_custom_material_type'] = custom_material_count
            
            # Get sample items with custom_material_type
            sample_items = frappe.db.get_list("Item", 
                filters={"custom_material_type": ["!=", ""], "disabled": 0},
                fields=["name", "item_name", "custom_material_type"],
                limit=5
            )
            debug_info['sample_custom_material_items'] = sample_items
        
        # Count total items
        total_items = frappe.db.count("Item", {"disabled": 0})
        debug_info['total_enabled_items'] = total_items
        
        # Count Website Items
        website_items_count = frappe.db.count("Website Item", {"published": 1})
        debug_info['published_website_items'] = website_items_count
        
        # Check if items have corresponding Website Items
        items_with_website_items = frappe.db.sql("""
            SELECT COUNT(*) as count
            FROM tabItem i
            INNER JOIN `tabWebsite Item` wi ON i.name = wi.item_code
            WHERE i.disabled = 0 AND wi.published = 1
        """)[0][0]
        debug_info['items_with_website_items'] = items_with_website_items
        
        # Sample Website Items
        sample_website_items = frappe.db.sql("""
            SELECT wi.name, wi.item_code, wi.published, i.custom_material_type, i.item_name
            FROM `tabWebsite Item` wi
            LEFT JOIN tabItem i ON wi.item_code = i.name
            WHERE wi.published = 1
            LIMIT 5
        """, as_dict=True)
        debug_info['sample_website_items'] = sample_website_items
        
        # Check Item Groups
        item_groups_count = frappe.db.count("Item Group", {"is_group": 0})
        debug_info['item_groups_count'] = item_groups_count
        
        return debug_info
        
    except Exception as e:
        debug_info['error'] = str(e)
        return debug_info 

@frappe.whitelist()
def check_available_items():
    """Debug function to check what items are available for POS"""
    result = {}
    
    try:
        # Check total items
        total_items = frappe.db.count("Item", {"disabled": 0})
        result['total_items'] = total_items
        
        # Check items with custom_material_type
        items_with_material_type = frappe.db.sql("""
            SELECT name, item_name, custom_material_type, item_group
            FROM tabItem 
            WHERE disabled = 0 
                AND custom_material_type IS NOT NULL 
                AND custom_material_type != ''
            LIMIT 10
        """, as_dict=True)
        result['items_with_material_type'] = items_with_material_type
        
        # Check Website Items
        website_items = frappe.db.sql("""
            SELECT wi.name, wi.item_code, wi.web_item_name, wi.published, i.custom_material_type, i.item_group
            FROM `tabWebsite Item` wi
            LEFT JOIN tabItem i ON wi.item_code = i.name
            WHERE wi.published = 1
            LIMIT 10
        """, as_dict=True)
        result['website_items'] = website_items
        
        # Check distinct material types
        material_types = frappe.db.sql("""
            SELECT DISTINCT custom_material_type
            FROM tabItem 
            WHERE custom_material_type IS NOT NULL 
                AND custom_material_type != ''
                AND disabled = 0
        """, as_dict=True)
        result['material_types'] = [mt['custom_material_type'] for mt in material_types]
        
        # Check item groups
        item_groups = frappe.db.get_list("Item Group", 
            filters={"is_group": 0}, 
            fields=["name", "item_group_name"],
            limit=10
        )
        result['item_groups'] = item_groups
        
        return result
        
    except Exception as e:
        result['error'] = str(e)
        return result 

@frappe.whitelist()
def create_sample_tax_template():
    """Create a basic sales tax template for fence operations"""
    try:
        # Check if Standard Sales Tax template already exists
        if not frappe.db.exists("Sales Taxes and Charges Template", "Standard Sales Tax"):
            tax_template = frappe.get_doc({
                "doctype": "Sales Taxes and Charges Template",
                "title": "Standard Sales Tax",
                "company": "Fence Supply",
                "is_default": 1,
                "taxes": [
                    {
                        "charge_type": "On Net Total",
                        "account_head": "Sales Tax - FS",  # You may need to adjust this
                        "description": "Sales Tax",
                        "rate": 8.25,  # Adjust rate as needed
                        "cost_center": "Main - FS"  # You may need to adjust this
                    }
                ]
            })
            tax_template.insert(ignore_permissions=True)
            frappe.db.commit()
            return {"success": True, "message": "Standard Sales Tax template created"}
        else:
            return {"success": True, "message": "Standard Sales Tax template already exists"}
    except Exception as e:
        frappe.log_error(f"Error creating tax template: {str(e)}")
        return {"success": False, "error": str(e)}

@frappe.whitelist()
def create_sample_fence_items():
    """Create sample fence items for testing POS system"""
    try:
        sample_items = [
            # Vinyl Fence Items
            {
                "item_code": "VINYL-PANEL-6FT-WHITE",
                "item_name": "6ft White Vinyl Privacy Panel",
                "item_group": "Vinyl Fence",
                "custom_material_type": "vinyl",
                "standard_rate": 85.00,
                "is_sales_item": 1,
                "has_variants": 0,
                "stock_uom": "Unit",
                "description": "6 foot white vinyl privacy fence panel"
            },
            {
                "item_code": "VINYL-POST-6FT-WHITE",
                "item_name": "6ft White Vinyl Fence Post",
                "item_group": "Vinyl Fence",
                "custom_material_type": "vinyl",
                "standard_rate": 45.00,
                "is_sales_item": 1,
                "has_variants": 0,
                "stock_uom": "Unit",
                "description": "6 foot white vinyl fence post"
            },
            {
                "item_code": "VINYL-GATE-6FT-WHITE",
                "item_name": "6ft White Vinyl Gate",
                "item_group": "Vinyl Fence",
                "custom_material_type": "vinyl",
                "standard_rate": 165.00,
                "is_sales_item": 1,
                "has_variants": 0,
                "stock_uom": "Unit",
                "description": "6 foot white vinyl gate with hardware"
            },
            # Aluminum Fence Items
            {
                "item_code": "ALU-PANEL-6FT-BLACK",
                "item_name": "6ft Black Aluminum Ornamental Panel",
                "item_group": "Aluminum Fence",
                "custom_material_type": "aluminum",
                "standard_rate": 125.00,
                "is_sales_item": 1,
                "has_variants": 0,
                "stock_uom": "Unit",
                "description": "6 foot black aluminum ornamental fence panel"
            },
            {
                "item_code": "ALU-POST-6FT-BLACK",
                "item_name": "6ft Black Aluminum Fence Post",
                "item_group": "Aluminum Fence",
                "custom_material_type": "aluminum",
                "standard_rate": 55.00,
                "is_sales_item": 1,
                "has_variants": 0,
                "stock_uom": "Unit",
                "description": "6 foot black aluminum fence post"
            },
            # Wood Fence Items
            {
                "item_code": "WOOD-PANEL-6FT-CEDAR",
                "item_name": "6ft Cedar Wood Privacy Panel",
                "item_group": "Pressure Treated Fence",
                "custom_material_type": "wood",
                "standard_rate": 95.00,
                "is_sales_item": 1,
                "has_variants": 0,
                "stock_uom": "Unit",
                "description": "6 foot cedar wood privacy fence panel"
            }
        ]
        
        created_items = []
        
        for item_data in sample_items:
            try:
                # Check if item already exists
                if frappe.db.exists("Item", item_data["item_code"]):
                    print(f"Item {item_data['item_code']} already exists")
                    continue
                
                # Create Item
                item = frappe.get_doc({
                    "doctype": "Item",
                    **item_data
                })
                item.insert(ignore_permissions=True)
                
                # Create Website Item
                website_item = frappe.get_doc({
                    "doctype": "Website Item",
                    "item_code": item_data["item_code"],
                    "web_item_name": item_data["item_name"],
                    "published": 1,
                    "route": f"/fence-products/{item_data['item_code'].lower()}",
                    "website_warehouse": frappe.get_value("Stock Settings", None, "default_warehouse")
                })
                website_item.insert(ignore_permissions=True)
                
                # Create Item Price
                item_price = frappe.get_doc({
                    "doctype": "Item Price",
                    "item_code": item_data["item_code"],
                    "price_list": "Standard Selling",
                    "price_list_rate": item_data["standard_rate"]
                })
                item_price.insert(ignore_permissions=True)
                
                created_items.append(item_data["item_code"])
                print(f"✅ Created: {item_data['item_code']} - {item_data['item_name']}")
                
            except Exception as item_error:
                print(f"❌ Error creating {item_data['item_code']}: {str(item_error)}")
        
        return {
            "message": f"Created {len(created_items)} sample fence items",
            "items": created_items
        }
        
    except Exception as e:
        frappe.log_error(f"Error creating sample fence items: {str(e)}")
        return {"message": "Failed to create sample items", "error": str(e)}

@frappe.whitelist()
def check_product_bundle(item_code):
    """
    Check if an item is a product bundle and return bundle information
    Whitelisted alternative to frappe.client.get_value for Product Bundle
    """
    try:
        # Check if Product Bundle exists for this item
        bundle = frappe.db.get_value(
            "Product Bundle", 
            {"new_item_code": item_code}, 
            ["name", "new_item_code"],
            as_dict=True
        )
        
        if bundle:
            # Get bundle items
            bundle_items = frappe.db.get_all(
                "Product Bundle Item",
                filters={"parent": bundle.name},
                fields=["item_code", "item_name", "qty", "uom", "rate", "description"],
                order_by="idx"
            )
            
            return {
                "is_bundle": True,
                "bundle_name": bundle.name,
                "bundle_items": bundle_items
            }
        else:
            return {
                "is_bundle": False,
                "bundle_items": []
            }
            
    except Exception as e:
        frappe.log_error(f"Error checking product bundle for {item_code}: {str(e)}")
        return {
            "is_bundle": False,
            "bundle_items": []
        }

@frappe.whitelist()
def get_product_bundle_items(bundle_name):
    """
    Get items for a specific product bundle
    Whitelisted alternative to frappe.client.get_list for Product Bundle Item
    """
    try:
        bundle_items = frappe.db.get_all(
            "Product Bundle Item",
            filters={"parent": bundle_name},
            fields=["item_code", "item_name", "qty", "uom", "rate", "description"],
            order_by="idx"
        )
        
        return bundle_items
        
    except Exception as e:
        frappe.log_error(f"Error getting bundle items for {bundle_name}: {str(e)}")
        return []

@frappe.whitelist()
def search_customers_for_pos(search_term=""):
    """
    Search customers for POS system
    Whitelisted alternative to frappe.client.get_list for Customer
    """
    try:
        if not search_term or len(search_term) < 2:
            # Return recent customers or top customers
            customers = frappe.db.get_all(
                "Customer",
                fields=["name", "customer_name", "customer_group", "mobile_no", "email_id", "default_price_list"],
                limit=20,
                order_by="modified desc"
            )
        else:
            # Search by name, mobile, or email
            customers = frappe.db.sql("""
                SELECT name, customer_name, customer_group, mobile_no, email_id, default_price_list
                FROM `tabCustomer`
                WHERE disabled = 0
                AND (
                    customer_name LIKE %(search)s 
                    OR mobile_no LIKE %(search)s 
                    OR email_id LIKE %(search)s
                    OR name LIKE %(search)s
                )
                ORDER BY customer_name
                LIMIT 20
            """, {
                "search": f"%{search_term}%"
            }, as_dict=True)
        
        return customers
        
    except Exception as e:
        frappe.log_error(f"Error searching customers: {str(e)}")
        return [] 