"""
Fence POS API - Extends webshop functionality for POS system
Integrates with existing webshop infrastructure
"""

import frappe
from frappe import _
from webshop.webshop.shopping_cart import cart
from webshop.webshop.api import get_product_filter_data

def get_attribute_name_mapping():
    """
    MAINTENANCE FREE: Get current attribute name mapping dynamically.
    Returns the actual attribute names being used in the system.
    """
    try:
        # Get all distinct attribute names from the system
        attributes = frappe.db.sql("""
            SELECT DISTINCT attribute
            FROM `tabItem Variant Attribute` iva
            INNER JOIN `tabItem` i ON iva.parent = i.name
            WHERE i.disabled = 0 AND i.has_variants = 0
        """, as_dict=True)
        
        # Map common attribute patterns to actual attribute names
        mapping = {}
        
        height_keywords = ['height', 'fence height', 'post height']
        color_keywords = ['color', 'fence color']
        style_keywords = ['style', 'fence style', 'type']
        
        for attr in attributes:
            attr_name = attr.attribute
            attr_lower = attr_name.lower()
            
            # Find height attribute
            if 'height' not in mapping and any(keyword in attr_lower for keyword in height_keywords):
                mapping['height'] = attr_name
            
            # Find color attribute  
            if 'color' not in mapping and any(keyword in attr_lower for keyword in color_keywords):
                mapping['color'] = attr_name
                
            # Find style attribute
            if 'style' not in mapping and any(keyword in attr_lower for keyword in style_keywords):
                mapping['style'] = attr_name
        
        return mapping
        
    except Exception as e:
        frappe.log_error(f"Error getting attribute mapping: {str(e)}")
        return {}

@frappe.whitelist()
def get_fence_items_for_pos(category=None, height=None, color=None, style=None, price_list=None):
    """Get fence items for POS using SIMPLE filtering: custom_material_type -> custom_style -> sort by custom_material_class"""
    
    try:
        # Start with base item filtering (only sellable variants, not templates)
        where_conditions = [
            "i.disabled = 0", 
            "i.is_sales_item = 1",
            "(i.has_variants = 0 OR i.variant_of IS NOT NULL)"
        ]
        query_params = []
        
        # PRIMARY FILTER: custom_material_type
        if category:
            where_conditions.append("i.custom_material_type = %s")
            query_params.append(category)
            frappe.logger().info(f"POS API Debug - Primary filter (custom_material_type): '{category}'")
        
        # SECONDARY FILTER: custom_style
        if style:
            where_conditions.append("i.custom_style = %s")
            query_params.append(style)
            frappe.logger().info(f"POS API Debug - Secondary filter (custom_style): '{style}'")
        
        # HEIGHT FILTER: Text matching in item name/code
        if height:
            height_pattern = height.replace("'", "").replace('"', '')
            where_conditions.append("(i.item_name LIKE %s OR i.item_code LIKE %s OR i.name LIKE %s)")
            query_params.extend([f'%{height_pattern}%', f'%{height_pattern}%', f'%{height_pattern}%'])
            frappe.logger().info(f"POS API Debug - Height filter: '{height_pattern}'")
        
        # Build the complete query
        where_clause = " AND ".join(where_conditions)
        
        # SIMPLE QUERY with SORTING by custom_material_class
        items_query = f"""
            SELECT DISTINCT
                i.name,
                i.item_name,
                i.item_code,
                i.item_group,
                i.stock_uom,
                i.image,
                i.has_variants,
                i.variant_of,
                i.custom_material_type,
                i.custom_material_class,
                i.custom_style,
                wi.web_item_name,
                wi.website_image,
                wi.route,
                wi.short_description,
                wi.published
            FROM `tabItem` i
            LEFT JOIN `tabWebsite Item` wi ON wi.item_code = i.name
            WHERE {where_clause}
            ORDER BY i.custom_material_class, i.item_name
            LIMIT 100
        """
        
        frappe.logger().info(f"POS API Debug - Simple Query: {items_query}")
        frappe.logger().info(f"POS API Debug - Query params: {query_params}")
        
        items = frappe.db.sql(items_query, query_params, as_dict=True)
        
        frappe.logger().info(f"POS API Debug - Items found: {len(items)}")
        if items:
            frappe.logger().info(f"POS API Debug - Sample items: {[item.get('item_name', 'N/A')[:50] for item in items[:3]]}")
        
        # Format items for POS display
        formatted_items = []
        for item in items:
            formatted_item = {
                "name": item.name,
                "item_name": item.item_name or item.name,
                "item_code": item.item_code or item.name,
                "item_group": item.item_group,
                "stock_uom": item.stock_uom,
                "image": item.website_image or item.image,
                "route": item.route,
                "published_in_website": bool(item.published),
                "short_description": item.short_description,
                "has_variants": item.has_variants,
                "variant_of": item.variant_of,
                "custom_material_type": item.custom_material_type,
                "custom_material_class": item.custom_material_class,
                "custom_style": item.custom_style,
                "web_item_name": item.web_item_name or item.item_name
            }
            
            # Add pricing for specific price list
            if price_list:
                item_price = get_item_price_for_pos(item.name, price_list)
                if item_price:
                    formatted_item["pos_price"] = item_price
            
            # Add stock information
            formatted_item["stock_qty"] = get_item_stock_qty(item.name)
            
            # Add fence-specific metadata
            formatted_item["fence_metadata"] = get_fence_item_metadata(item.name)
            
            formatted_items.append(formatted_item)
        
        frappe.logger().info(f"POS API Debug - Final formatted items: {len(formatted_items)}")
        return {"items": formatted_items, "item_count": len(formatted_items)}
        
    except Exception as e:
        frappe.log_error(f"Error in get_fence_items_for_pos: {str(e)}")
        frappe.logger().error(f"POS API Error: {str(e)}")
        return {"items": [], "item_count": 0}

@frappe.whitelist()
def get_fence_items_for_pos_original(category=None, height=None, color=None, style=None, price_list=None):
    """Original fence items logic as fallback"""
    
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
    
    # Add custom field filters first (higher priority than attributes)
    if style:
        # Try custom_style field first
        custom_style_items = frappe.db.count("Item", {
            "custom_style": style,
            "disabled": 0
        })
        
        if custom_style_items > 0:
            # Use custom_style field directly
            query_args["field_filters"]["custom_style"] = style
        else:
            # Fallback to attribute-based style filtering
            attr_mapping = get_attribute_name_mapping()
            if attr_mapping.get("style"):
                if "attribute_filters" not in query_args:
                    query_args["attribute_filters"] = {}
                query_args["attribute_filters"][attr_mapping["style"]] = [style]
    
    # MAINTENANCE FREE: Add other attribute filters using dynamic attribute detection
    attribute_filters = query_args.get("attribute_filters", {})
    
    # Get the current attribute names dynamically
    attr_mapping = get_attribute_name_mapping()
    
    if height and attr_mapping.get("height"):
        attribute_filters[attr_mapping["height"]] = [height]
    if color and attr_mapping.get("color"):
        attribute_filters[attr_mapping["color"]] = [color]
    
    if attribute_filters:
        query_args["attribute_filters"] = attribute_filters
    
    try:
        # Debug logging
        frappe.logger().info(f"POS API Debug - Query args: {query_args}")
        frappe.logger().info(f"POS API Debug - Attribute mapping: {attr_mapping}")
        frappe.logger().info(f"POS API Debug - Attribute filters: {attribute_filters}")
        
        # Use existing product filter system
        result = get_product_filter_data(query_args)
        
        # Debug the result
        item_count = len(result.get("items", []))
        frappe.logger().info(f"POS API Debug - Found {item_count} items")
        
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
        frappe.logger().error(f"POS API Error - Query args: {query_args}, Error: {str(e)}")
        return {"items": [], "item_count": 0}

@frappe.whitelist()
def get_popular_items_for_pos(price_list=None, material_type=None):
    """Get popular items for POS using custom_popular field - includes variants and material type filtering"""
    
    try:
        # Build WHERE conditions
        where_conditions = [
            "i.custom_popular = 1",
            "i.disabled = 0",
            "i.is_sales_item = 1",
            "(i.has_variants = 0 OR i.variant_of IS NOT NULL)"
        ]
        
        query_params = []
        
        # Add material type filtering if provided
        if material_type and material_type != 'all':
            where_conditions.append("(i.custom_material_type = %s OR i.item_group = %s)")
            query_params.extend([material_type, material_type])
        
        where_clause = " AND ".join(where_conditions)
        
        # Get items directly from Item doctype including variants
        popular_items = frappe.db.sql(f"""
            SELECT 
                i.name, 
                i.item_name,
                i.item_code,
                i.item_group,
                i.stock_uom,
                i.image,
                i.has_variants,
                i.variant_of,
                i.custom_material_type,
                i.custom_material_class,
                wi.web_item_name,
                wi.website_image,
                wi.route,
                wi.short_description,
                wi.published
            FROM `tabItem` i
            LEFT JOIN `tabWebsite Item` wi ON wi.item_code = i.name
            WHERE {where_clause}
            ORDER BY i.item_name
        """, query_params, as_dict=True)
        
        frappe.logger().info(f"POS API Debug - Found {len(popular_items)} popular items including variants")
        
        # Format items for POS display
        formatted_items = []
        for item in popular_items:
            formatted_item = {
                "name": item.name,
                "item_name": item.item_name or item.name,
                "item_code": item.item_code or item.name,
                "item_group": item.item_group,
                "stock_uom": item.stock_uom,
                "image": item.website_image or item.image,
                "route": item.route,
                "published_in_website": bool(item.published),
                "short_description": item.short_description,
                "has_variants": item.has_variants,
                "variant_of": item.variant_of,
                "custom_material_type": item.custom_material_type,
                "custom_material_class": item.custom_material_class,
                "web_item_name": item.web_item_name or item.item_name
            }
            
            # Add pricing for specific price list
            if price_list:
                item_price = get_item_price_for_pos(item.name, price_list)
                if item_price:
                    formatted_item["pos_price"] = item_price
            
            # Add stock information
            formatted_item["stock_qty"] = get_item_stock_qty(item.name)
            
            # Add fence-specific metadata
            formatted_item["fence_metadata"] = get_fence_item_metadata(item.name)
            
            formatted_items.append(formatted_item)
        
        return {"items": formatted_items, "item_count": len(formatted_items)}
        
    except Exception as e:
        frappe.log_error(f"Error in get_popular_items_for_pos: {str(e)}")
        frappe.logger().error(f"POS API Popular Items Error: {str(e)}")
        return {"items": [], "item_count": 0}

@frappe.whitelist()
def setup_popular_items_field():
    """Setup custom_popular field and mark some sample items as popular"""
    try:
        setup_pos_custom_fields()  # This will create the custom_popular field
        
        # Mark some sample variant items as popular for testing
        # Priority: actual variants > standalone items > template items
        items = frappe.get_all("Item", 
                              filters={
                                  "disabled": 0, 
                                  "is_sales_item": 1,
                                  "variant_of": ["is", "set"]  # Get variant items first
                              }, 
                              fields=["name", "item_name", "variant_of"], 
                              limit=5)
        
        # If no variants found, get standalone items
        if len(items) < 5:
            standalone_items = frappe.get_all("Item", 
                                            filters={
                                                "disabled": 0, 
                                                "is_sales_item": 1,
                                                "has_variants": 0,
                                                "variant_of": ["is", "not set"]
                                            }, 
                                            fields=["name", "item_name"], 
                                            limit=5-len(items))
            items.extend(standalone_items)
        
        count = 0
        for item in items:
            try:
                frappe.db.set_value("Item", item.name, "custom_popular", 1)
                count += 1
            except Exception as e:
                continue
        
        frappe.db.commit()
        # Get summary info about what was marked
        variant_info = []
        for item in items[:count]:
            if item.get("variant_of"):
                variant_info.append(f"{item.get('item_name', item.name)} (variant of {item.variant_of})")
            else:
                variant_info.append(f"{item.get('item_name', item.name)}")
        
        message = f"Setup completed! Created custom_popular field and marked {count} items as popular:\n" + "\n".join(variant_info)
        return {"success": True, "message": message}
        
    except Exception as e:
        frappe.log_error(f"Error setting up popular items: {str(e)}")
        return {"success": False, "message": f"Setup failed: {str(e)}"}

@frappe.whitelist()
def check_item_variants_status():
    """Debug function to check item variant status"""
    try:
        # Get summary of items by type
        template_count = frappe.db.count("Item", {"has_variants": 1, "disabled": 0, "is_sales_item": 1})
        variant_count = frappe.db.count("Item", {"variant_of": ["is", "set"], "disabled": 0, "is_sales_item": 1})
        standalone_count = frappe.db.count("Item", {"has_variants": 0, "variant_of": ["is", "not set"], "disabled": 0, "is_sales_item": 1})
        popular_count = frappe.db.count("Item", {"custom_popular": 1, "disabled": 0})
        
        # Get some examples
        templates = frappe.get_all("Item", 
                                 filters={"has_variants": 1, "disabled": 0, "is_sales_item": 1}, 
                                 fields=["name", "item_name"], 
                                 limit=3)
        
        variants = frappe.get_all("Item", 
                                filters={"variant_of": ["is", "set"], "disabled": 0, "is_sales_item": 1}, 
                                fields=["name", "item_name", "variant_of"], 
                                limit=3)
        
        popular = frappe.get_all("Item", 
                               filters={"custom_popular": 1, "disabled": 0}, 
                               fields=["name", "item_name", "has_variants", "variant_of"], 
                               limit=5)
        
        return {
            "success": True,
            "summary": {
                "template_items": template_count,
                "variant_items": variant_count, 
                "standalone_items": standalone_count,
                "popular_items": popular_count
            },
            "examples": {
                "templates": templates,
                "variants": variants,
                "popular": popular
            }
        }
        
    except Exception as e:
        return {"success": False, "message": str(e)}

@frappe.whitelist()
def get_template_items_for_pos(category=None):
    """Get template items (has_variants=1) for POS - simplified version"""
    try:
        where_conditions = ["i.disabled = 0", "i.is_sales_item = 1"]
        query_params = []
        
        # Category filtering
        if category:
            where_conditions.append("(i.custom_material_type = %s OR i.item_group = %s)")
            query_params.extend([category, category])
        
        where_clause = " AND ".join(where_conditions)
        
        # Get all sellable items including templates
        items_query = f"""
            SELECT 
                i.name,
                i.item_name,
                i.item_group,
                i.has_variants,
                i.custom_material_type,
                i.custom_material_class
            FROM `tabItem` i
            WHERE {where_clause}
            ORDER BY i.item_name
            LIMIT 20
        """
        
        items = frappe.db.sql(items_query, query_params, as_dict=True)
        
        # Format items simply
        formatted_items = []
        for item in items:
            formatted_item = {
                "name": item.name,
                "item_name": item.item_name,
                "item_group": item.item_group,
                "has_variants": item.has_variants,
                "custom_material_type": item.custom_material_type,
                "custom_material_class": item.custom_material_class,
                "item_code": item.name,
                "stock_uom": "Nos",
                "published_in_website": True
            }
            formatted_items.append(formatted_item)
        
        return {"items": formatted_items, "item_count": len(formatted_items)}
        
    except Exception as e:
        frappe.log_error(f"Error in get_template_items_for_pos: {str(e)}")
        return {"items": [], "item_count": 0}

@frappe.whitelist()
def get_fence_items_for_pos_simple(category=None, style=None):
    """Simplified version to get items directly from Website Item with custom_style support"""
    try:
        filters = {"published": 1}
        
        # Build WHERE conditions
        where_conditions = ["wi.published = 1", "i.disabled = 0"]
        params = []
        
        if category:
            where_conditions.append("(i.custom_material_type = %s OR i.item_group = %s)")
            params.extend([category, category])
        
        if style:
            where_conditions.append("i.custom_style = %s")
            params.append(style)
        
        where_clause = " AND ".join(where_conditions)
        
        items = frappe.db.sql(f"""
            SELECT wi.name, wi.item_code, wi.web_item_name, wi.route, wi.website_image,
                   i.custom_material_type, i.custom_style, i.item_group
            FROM `tabWebsite Item` wi
            INNER JOIN tabItem i ON wi.item_code = i.name
            WHERE {where_clause}
            LIMIT 50
        """, params, as_dict=True)
        
        return {"items": items}
            
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
        
        # MAINTENANCE FREE: Use existing attributes from Customize Form
        # setup_fence_attributes()  # Commented out - user manages attributes via UI
        
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
    # Note: custom_material_type and custom_material_class fields are added via Customize Form
    
    # Add custom_popular field to Item doctype
    try:
        if not frappe.db.exists("Custom Field", {"dt": "Item", "fieldname": "custom_popular"}):
            custom_field = frappe.get_doc({
                "doctype": "Custom Field",
                "dt": "Item",
                "fieldname": "custom_popular",
                "fieldtype": "Check",
                "label": "Popular Item",
                "description": "Mark this item as popular for POS display",
                "default": "0",
                "insert_after": "published_in_website",
                "permlevel": 0
            })
            custom_field.insert(ignore_permissions=True)
            frappe.db.commit()
            frappe.logger().info("Created custom_popular field in Item doctype")
    except Exception as e:
        frappe.log_error(f"Error creating custom_popular field: {str(e)}")
    
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

@frappe.whitelist()
def setup_fence_item_attributes():
    """
    Optimize fence items for POS by ensuring proper sellability flags.
    No pattern mapping needed - uses existing Item Variant Attributes.
    """
    
    try:
        # MAINTENANCE FREE: Use existing attributes from Customize Form
        # setup_fence_attributes()  # Commented out - user manages attributes via UI
        
        # Get all fence items (items that already have variant attributes)
        fence_items = frappe.db.sql("""
            SELECT DISTINCT i.name, i.item_name, i.has_variants, i.is_sales_item, i.disabled
            FROM `tabItem` i
            LEFT JOIN `tabItem Variant Attribute` iva ON i.name = iva.parent
            WHERE (i.name LIKE '%Vinyl%' OR i.item_name LIKE '%Vinyl%')
                AND i.disabled = 0
            ORDER BY i.name
        """, as_dict=True)
        
        updated_count = 0
        processed_items = []
        items_with_attributes = 0
        
        for item in fence_items:
            item_name = item.name
            needs_update = False
            updates = {}
            
            # Check if item has any variant attributes
            has_attributes = frappe.db.count("Item Variant Attribute", {"parent": item_name}) > 0
            if has_attributes:
                items_with_attributes += 1
            
            # Ensure item is sellable if it has attributes
            if has_attributes:
                # Make sure it's not a template (has_variants should be 0 for sellable items)
                if item.has_variants != 0:
                    updates["has_variants"] = 0
                    needs_update = True
                
                # Ensure it's marked as sales item
                if item.is_sales_item != 1:
                    updates["is_sales_item"] = 1
                    needs_update = True
                
                # Ensure it's not disabled
                if item.disabled != 0:
                    updates["disabled"] = 0
                    needs_update = True
            
            # Apply updates if needed
            if needs_update and updates:
                try:
                    frappe.db.set_value("Item", item_name, updates)
                    updated_count += 1
                    processed_items.append(item_name)
                except Exception as e:
                    frappe.log_error(f"Error updating item {item_name}: {str(e)}")
        
        frappe.db.commit()
        
        # Get summary of attribute coverage
        attribute_summary = frappe.db.sql("""
            SELECT 
                iva.attribute,
                iva.attribute_value,
                COUNT(*) as item_count
            FROM `tabItem Variant Attribute` iva
            INNER JOIN `tabItem` i ON iva.parent = i.name
            WHERE (i.name LIKE '%Vinyl%' OR i.item_name LIKE '%Vinyl%')
                AND i.disabled = 0
                AND i.has_variants = 0
            GROUP BY iva.attribute, iva.attribute_value
            ORDER BY iva.attribute, iva.attribute_value
        """, as_dict=True)
        
        # Test filtering functionality
        # Test count: Check items with any height/color attributes (dynamic)
        attr_mapping = get_attribute_name_mapping()
        test_attributes = []
        if attr_mapping.get("height"):
            test_attributes.append(attr_mapping["height"])
        if attr_mapping.get("color"):
            test_attributes.append(attr_mapping["color"])
        
        if test_attributes:
            test_count = frappe.db.sql("""
                SELECT COUNT(DISTINCT i.name) as count
                FROM `tabItem` i
                INNER JOIN `tabItem Variant Attribute` iva ON i.name = iva.parent
                WHERE i.disabled = 0 AND i.has_variants = 0
                    AND iva.attribute IN %s
            """, [tuple(test_attributes)])[0][0]
        else:
            test_count = 0
        
        return {
            "success": True,
            "message": f"Successfully optimized {updated_count} fence items for POS",
            "total_items": len(fence_items),
            "updated_items": updated_count,
            "items_with_attributes": items_with_attributes,
            "test_items_ready_for_pos": test_count,
            "attribute_summary": attribute_summary,
            "processed_items": processed_items[:10]  # Show first 10 for reference
        }
        
    except Exception as e:
        frappe.log_error(f"Error optimizing fence items for POS: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

@frappe.whitelist()
def get_dynamic_fence_attributes():
    """
    Get all available fence attribute values from items with attributes.
    This makes the POS system completely dynamic - new attributes appear automatically.
    """
    
    try:
        # Get ALL attribute values from ANY sellable items (completely dynamic)
        attributes = frappe.db.sql("""
            SELECT 
                iva.attribute,
                iva.attribute_value,
                COUNT(DISTINCT i.name) as item_count
            FROM `tabItem Variant Attribute` iva
            INNER JOIN `tabItem` i ON iva.parent = i.name
            WHERE i.disabled = 0
                AND i.has_variants = 0
                AND i.is_sales_item = 1
                AND (i.custom_material_type IS NOT NULL OR i.item_group IS NOT NULL)
            GROUP BY iva.attribute, iva.attribute_value
            HAVING item_count > 0
            ORDER BY iva.attribute, iva.attribute_value
        """, as_dict=True)
        
        # Organize by attribute type
        organized_attributes = {}
        for attr in attributes:
            attr_name = attr.attribute
            if attr_name not in organized_attributes:
                organized_attributes[attr_name] = []
            
            organized_attributes[attr_name].append({
                "value": attr.attribute_value,
                "item_count": attr.item_count
            })
        
        # MAINTENANCE FREE: Auto-detect which attributes to use for height/color selection
        # Based on common naming patterns - completely scalable
        height_keywords = ['height', 'fence height', 'post height']
        color_keywords = ['color', 'fence color']
        
        # Find the best height and color attributes dynamically
        height_attribute = None
        color_attribute = None
        
        for attr_name in organized_attributes.keys():
            attr_lower = attr_name.lower()
            # Find height attribute
            if not height_attribute and any(keyword in attr_lower for keyword in height_keywords):
                height_attribute = attr_name
            # Find color attribute  
            if not color_attribute and any(keyword in attr_lower for keyword in color_keywords):
                color_attribute = attr_name
        
        return {
            "success": True,
            "attributes": organized_attributes,
            "height_attribute": height_attribute,  # Which attribute to use for height selection
            "color_attribute": color_attribute,    # Which attribute to use for color selection
            "available_attributes": list(organized_attributes.keys()),  # All available attributes
            "total_attribute_types": len(organized_attributes),
            "total_items_with_attributes": sum(attr.item_count for attr in attributes)
        }
        
    except Exception as e:
        frappe.log_error(f"Error getting dynamic fence attributes: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

@frappe.whitelist()
def debug_item_attributes():
    """
    Debug function to see what attributes are currently set on items.
    Helps troubleshoot why colors/heights aren't showing up.
    """
    
    try:
        # Get all items with any attributes
        items_with_attributes = frappe.db.sql("""
            SELECT 
                i.name as item_code,
                i.item_name,
                iva.attribute,
                iva.attribute_value,
                i.has_variants,
                i.is_sales_item,
                i.disabled
            FROM `tabItem` i
            INNER JOIN `tabItem Variant Attribute` iva ON i.name = iva.parent
            WHERE (i.name LIKE '%Vinyl%' OR i.item_name LIKE '%Vinyl%')
            ORDER BY i.name, iva.attribute
        """, as_dict=True)
        
        # Get count of items by attribute
        attribute_counts = frappe.db.sql("""
            SELECT 
                iva.attribute,
                iva.attribute_value,
                COUNT(*) as item_count,
                COUNT(CASE WHEN i.has_variants = 0 AND i.disabled = 0 AND i.is_sales_item = 1 THEN 1 END) as sellable_count
            FROM `tabItem Variant Attribute` iva
            INNER JOIN `tabItem` i ON iva.parent = i.name
            WHERE (i.name LIKE '%Vinyl%' OR i.item_name LIKE '%Vinyl%')
            GROUP BY iva.attribute, iva.attribute_value
            ORDER BY iva.attribute, iva.attribute_value
        """, as_dict=True)
        
        # Get items without any attributes
        items_without_attributes = frappe.db.sql("""
            SELECT i.name, i.item_name, i.has_variants, i.is_sales_item, i.disabled
            FROM `tabItem` i
            LEFT JOIN `tabItem Variant Attribute` iva ON i.name = iva.parent
            WHERE (i.name LIKE '%Vinyl%' OR i.item_name LIKE '%Vinyl%')
                AND iva.parent IS NULL
            ORDER BY i.name
            LIMIT 20
        """, as_dict=True)
        
        return {
            "success": True,
            "items_with_attributes": items_with_attributes,
            "attribute_counts": attribute_counts,
            "items_without_attributes": items_without_attributes,
            "total_items_with_attributes": len(items_with_attributes),
            "total_items_without_attributes": len(items_without_attributes)
        }
        
    except Exception as e:
        frappe.log_error(f"Error debugging item attributes: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

@frappe.whitelist()
def populate_custom_style_field():
    """
    Populate custom_style field for existing items based on item name patterns.
    This is a one-time utility to set custom_style values automatically.
    """
    
    try:
        # Get all items that don't have custom_style set
        items_to_update = frappe.db.sql("""
            SELECT name, item_name 
            FROM `tabItem` 
            WHERE (custom_style IS NULL OR custom_style = '')
                AND disabled = 0
                AND item_name IS NOT NULL
        """, as_dict=True)
        
        updated_count = 0
        updated_items = []
        
        for item in items_to_update:
            item_name = item.item_name.lower()
            custom_style = None
            
            # Only set custom_style if it's not already set
            # The custom_style field should be populated manually or via data import
            # We don't auto-populate based on text matching
            if not item.custom_style:
                custom_style = None  # Let user populate this field manually
            
            # Update the item if we determined a style
            if custom_style:
                try:
                    frappe.db.set_value("Item", item.name, "custom_style", custom_style)
                    updated_count += 1
                    updated_items.append({
                        "item_code": item.name,
                        "item_name": item.item_name,
                        "assigned_style": custom_style
                    })
                except Exception as e:
                    frappe.log_error(f"Error updating custom_style for {item.name}: {str(e)}")
        
        frappe.db.commit()
        
        return {
            "success": True,
            "message": f"Successfully populated custom_style for {updated_count} items",
            "total_items_processed": len(items_to_update),
            "updated_count": updated_count,
            "sample_updates": updated_items[:10]  # Show first 10 as examples
        }
        
    except Exception as e:
        frappe.log_error(f"Error populating custom_style field: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

@frappe.whitelist()
def get_custom_style_distribution():
    """
    Get distribution of custom_style values to understand current data.
    Useful for verifying the custom_style field setup.
    """
    
    try:
        # Get distribution of custom_style values
        style_distribution = frappe.db.sql("""
            SELECT 
                custom_style,
                COUNT(*) as item_count
            FROM `tabItem`
            WHERE disabled = 0
                AND custom_style IS NOT NULL 
                AND custom_style != ''
            GROUP BY custom_style
            ORDER BY item_count DESC
        """, as_dict=True)
        
        # Get sample items for each style
        style_samples = {}
        for style_info in style_distribution:
            style = style_info.custom_style
            samples = frappe.db.get_list("Item",
                filters={"custom_style": style, "disabled": 0},
                fields=["name", "item_name", "custom_material_type"],
                limit=5
            )
            style_samples[style] = samples
        
        # Get items without custom_style
        items_without_style = frappe.db.count("Item", {
            "custom_style": ["in", ["", None]],
            "disabled": 0
        })
        
        return {
            "success": True,
            "style_distribution": style_distribution,
            "style_samples": style_samples,
            "items_without_style": items_without_style,
            "total_items_with_style": sum(style.item_count for style in style_distribution)
        }
        
    except Exception as e:
        frappe.log_error(f"Error getting custom_style distribution: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

@frappe.whitelist()
def get_item_data_analysis():
    """
    Analyze current item data to understand what's populated in custom fields
    and variant attributes. Use this to guide proper data-driven filtering.
    """
    
    try:
        # Check custom field population
        custom_fields_data = frappe.db.sql("""
            SELECT 
                COUNT(*) as total_items,
                COUNT(custom_style) as items_with_style,
                COUNT(custom_material_type) as items_with_material_type,
                COUNT(custom_material_class) as items_with_material_class
            FROM `tabItem` 
            WHERE disabled = 0
        """, as_dict=True)[0]
        
        # Check custom_style distribution
        style_distribution = frappe.db.sql("""
            SELECT custom_style, COUNT(*) as count
            FROM `tabItem` 
            WHERE disabled = 0 AND custom_style IS NOT NULL
            GROUP BY custom_style
        """, as_dict=True)
        
        # Check custom_material_type distribution  
        material_type_distribution = frappe.db.sql("""
            SELECT custom_material_type, COUNT(*) as count
            FROM `tabItem` 
            WHERE disabled = 0 AND custom_material_type IS NOT NULL
            GROUP BY custom_material_type
        """, as_dict=True)
        
        # Check custom_material_class distribution
        material_class_distribution = frappe.db.sql("""
            SELECT custom_material_class, COUNT(*) as count
            FROM `tabItem` 
            WHERE disabled = 0 AND custom_material_class IS NOT NULL
            GROUP BY custom_material_class
        """, as_dict=True)
        
        # Check variant attributes
        variant_attributes = frappe.db.sql("""
            SELECT DISTINCT attribute
            FROM `tabItem Variant Attribute`
            ORDER BY attribute
        """, as_dict=True)
        
        # Sample items with their data
        sample_items = frappe.db.sql("""
            SELECT name, item_name, custom_style, custom_material_type, custom_material_class, has_variants
            FROM `tabItem` 
            WHERE disabled = 0
            ORDER BY modified DESC
            LIMIT 10
        """, as_dict=True)
        
        return {
            "success": True,
            "custom_fields_summary": custom_fields_data,
            "style_distribution": style_distribution,
            "material_type_distribution": material_type_distribution,
            "material_class_distribution": material_class_distribution,
            "variant_attributes": [attr.attribute for attr in variant_attributes],
            "sample_items": sample_items
        }
        
    except Exception as e:
        frappe.log_error(f"Error analyzing item data: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

@frappe.whitelist()
def check_specific_items_status(item_codes):
    """
    Check the database status of specific item codes to understand why they might be filtered
    """
    try:
        if isinstance(item_codes, str):
            import json
            item_codes = json.loads(item_codes)
        
        items_data = []
        
        for item_code in item_codes:
            # Get item details
            item = frappe.db.get_value('Item', item_code, [
                'item_code', 'item_name', 'has_variants', 'is_sales_item', 'disabled',
                'is_stock_item', 'custom_style', 'custom_material_type', 'custom_material_class'
            ], as_dict=True)
            
            if item:
                items_data.append(item)
            else:
                items_data.append({
                    'item_code': item_code,
                    'error': 'Item not found in database'
                })
        
        return items_data
        
    except Exception as e:
        frappe.log_error(f"Error checking specific items: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        } 