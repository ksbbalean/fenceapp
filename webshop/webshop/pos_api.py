"""
Fence POS API - Extends webshop functionality for POS system
Integrates with existing webshop infrastructure
"""

import frappe
from frappe import _
from webshop.webshop.shopping_cart import cart
from webshop.webshop.shopping_cart.cart import get_party
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
def get_fence_items_for_pos(category=None, height=None, color=None, style=None, railType=None, price_list=None):
    print(f"🔥 POS API CALLED WITH PRICE LIST: {price_list}")
    """Get fence items for POS using SIMPLE filtering: custom_material_type -> custom_style -> sort by custom_material_class"""
    
    try:
        # Start with base item filtering (only sellable variants, not templates)
        where_conditions = [
            "i.disabled = 0", 
            "i.is_sales_item = 1",
            "(i.has_variants = 0 OR i.variant_of IS NOT NULL)"
        ]
        
        # Include Hardware and Cap items in the main query
        # These should be filtered by material type and color, but not by style/height/rail type
        include_hardware_caps = True
        query_params = []
        
        # PRIMARY FILTER: custom_material_type
        if category:
            # For Cap and Hardware items, also check custom_type_of_material field
            where_conditions.append("""
                (i.custom_material_type = %s 
                OR (i.custom_material_class IN ('Cap', 'Hardware') 
                    AND i.name IN (
                        SELECT parent 
                        FROM `tabCustom Type Of Material` 
                        WHERE material_type = %s
                    )
                ))
            """)
            query_params.append(category)
            query_params.append(category)
            frappe.logger().info(f"POS API Debug - Primary filter (custom_material_type): '{category}' (including custom_type_of_material for Cap/Hardware)")
        
        # SECONDARY FILTER: custom_style (but exclude Hardware and Caps from style filtering)
        if style:
            where_conditions.append("(i.custom_style = %s OR i.custom_material_class IN ('Hardware', 'Cap'))")
            query_params.append(style)
            frappe.logger().info(f"POS API Debug - Secondary filter (custom_style): '{style}' (Hardware/Caps exempted)")
        
        # HEIGHT FILTER: Use Item Attribute system (exclude Hardware and Caps)
        if height:
            where_conditions.append("""
                (i.custom_material_class NOT IN ('Hardware', 'Cap') AND EXISTS (
                    SELECT 1 FROM `tabItem Variant Attribute` iva 
                    WHERE iva.parent = i.name 
                    AND iva.attribute = 'Fence Height' 
                    AND iva.attribute_value = %s
                )) OR i.custom_material_class IN ('Hardware', 'Cap')
            """)
            query_params.append(height)
            frappe.logger().info(f"POS API Debug - Height filter (attribute): '{height}' (Hardware/Caps exempted)")
        
        # COLOR FILTER: Use Item Attribute system (include Hardware and Caps)
        if color:
            # Map color names to abbreviations
            color_mapping = {
                'White': 'WHI',
                'Khaki': 'Kha', 
                'Tan': 'Tan',
                'Black': 'BLA',
                'Gray': 'Gry'
            }
            color_abbreviation = color_mapping.get(color, color)
            
            where_conditions.append("""
                EXISTS (
                    SELECT 1 FROM `tabItem Variant Attribute` iva 
                    WHERE iva.parent = i.name 
                    AND iva.attribute = 'Color' 
                    AND iva.attribute_value = %s
                )
            """)
            query_params.append(color_abbreviation)
            frappe.logger().info(f"POS API Debug - Color filter (attribute): '{color}' -> '{color_abbreviation}'")
        
        # RAIL TYPE FILTER: Use Item Attribute system (exclude Hardware and Caps)
        if railType:
            where_conditions.append("""
                (i.custom_material_class NOT IN ('Hardware', 'Cap') AND EXISTS (
                    SELECT 1 FROM `tabItem Variant Attribute` iva 
                    WHERE iva.parent = i.name 
                    AND iva.attribute = 'Rail Type' 
                    AND iva.attribute_value = %s
                )) OR (i.custom_material_class IN ('Hardware', 'Cap') AND i.custom_material_type = %s)
            """)
            query_params.extend([railType, category])
            frappe.logger().info(f"POS API Debug - Rail Type filter (attribute): '{railType}' (Hardware/Caps exempted but must match material type)")
        
        # Build the complete query
        where_clause = " AND ".join(where_conditions)
        
        # ENHANCED QUERY with ATTRIBUTES for sub-segmentation
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
                wi.published,
                -- Add attribute data for sub-segmentation
                GROUP_CONCAT(
                    CONCAT(iva.attribute, ':', iva.attribute_value) 
                    ORDER BY iva.attribute 
                    SEPARATOR '|'
                ) as attributes
            FROM `tabItem` i
            LEFT JOIN `tabWebsite Item` wi ON wi.item_code = i.name
            LEFT JOIN `tabItem Variant Attribute` iva ON iva.parent = i.name
            WHERE {where_clause}
            GROUP BY i.name, i.item_name, i.item_code, i.item_group, i.stock_uom, 
                     i.image, i.has_variants, i.variant_of, i.custom_material_type, 
                     i.custom_material_class, i.custom_style, wi.web_item_name, 
                     wi.website_image, wi.route, wi.short_description, wi.published
            ORDER BY i.custom_material_class, i.item_name
            LIMIT 100
        """
        
        frappe.logger().info(f"POS API Debug - Complete WHERE clause: {where_clause}")
        frappe.logger().info(f"POS API Debug - Query params: {query_params}")
        
        items = frappe.db.sql(items_query, query_params, as_dict=True)
        
        frappe.logger().info(f"POS API Debug - Items found: {len(items)}")
        if items:
            frappe.logger().info(f"POS API Debug - Sample items: {[item.get('item_name', 'N/A')[:50] for item in items[:3]]}")
        
        # Format items for POS display
        formatted_items = []
        for item in items:
            # Parse attributes string into object
            attributes = {}
            if item.attributes:
                for attr_pair in item.attributes.split('|'):
                    if ':' in attr_pair:
                        attr_name, attr_value = attr_pair.split(':', 1)
                        attributes[attr_name] = attr_value
            
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
                "web_item_name": item.web_item_name or item.item_name,
                "attributes": attributes
            }
            
            # Add pricing for specific price list
            if price_list:
                item_price = get_item_price_for_pos(item.name, price_list)
                if item_price:
                    formatted_item["pos_price"] = item_price
                    formatted_item["price_list_rate"] = item_price  # Frontend compatibility
                    print(f"✅ Price found for {item.name}: {item_price} in {price_list}")
                else:
                    print(f"❌ No price found for {item.name} in {price_list}")
                    formatted_item["price_list_rate"] = 0
                    formatted_item["pos_price"] = 0
            
            # Add stock information
            formatted_item["stock_qty"] = get_item_stock_qty(item.name)
            
            # Add fence-specific metadata
            formatted_item["fence_metadata"] = get_fence_item_metadata(item.name)
            
            formatted_items.append(formatted_item)
        
        frappe.logger().info(f"POS API Debug - Final formatted items: {len(formatted_items)}")
        return {
            "items": formatted_items, 
            "item_count": len(formatted_items),
            "debug_price_list": price_list
        }
        
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
                    formatted_item["price_list_rate"] = item_price  # Frontend compatibility
                    print(f"✅ Price found for {item.name}: {item_price} in {price_list}")
                else:
                    print(f"❌ No price found for {item.name} in {price_list}")
                    formatted_item["price_list_rate"] = 0
                    formatted_item["pos_price"] = 0
            
            # Add stock information
            formatted_item["stock_qty"] = get_item_stock_qty(item.name)
            
            # Add fence-specific metadata
            formatted_item["fence_metadata"] = get_fence_item_metadata(item.name)
            
            formatted_items.append(formatted_item)
        
        return {
            "items": formatted_items, 
            "item_count": len(formatted_items),
            "debug_price_list": price_list
        }
        
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
        
        return {
            "items": formatted_items, 
            "item_count": len(formatted_items),
            "debug_price_list": price_list
        }
        
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
            # Smart fallback: try other enabled price lists from the system
            try:
                other_price_lists = frappe.get_all("Price List", 
                    filters={"enabled": 1}, 
                    fields=["name"], 
                    pluck="name"
                )
                
                for fallback_list in other_price_lists:
                    if fallback_list == price_list:
                        continue  # Already tried
                        
                    try:
                        price = frappe.get_value("Item Price", {
                            "item_code": item_code,
                            "price_list": fallback_list
                        }, "price_list_rate")
                        
                        if price:
                            frappe.logger().info(f"Found fallback price for {item_code} in {fallback_list}: {price}")
                            break
                    except Exception:
                        continue
            except Exception as e:
                frappe.logger().error(f"Error getting fallback price lists: {str(e)}")
        
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
        print(f"🏷️ POS API: Updating cart pricing to {price_list}")
        
        # Get cart quotation with better error handling
        cart_response = cart.get_cart_quotation()
        print(f"🔍 POS API: Cart response: {cart_response}")
        
        if not cart_response:
            print("❌ POS API: No cart response received")
            return {"message": "No cart found - please add items to cart first"}
        
        # Handle different response formats
        quotation_doc = None
        if hasattr(cart_response, 'doc'):
            quotation_doc = cart_response.doc
        elif isinstance(cart_response, dict) and 'doc' in cart_response:
            quotation_doc = cart_response['doc']
        elif isinstance(cart_response, dict) and 'message' in cart_response:
            # Sometimes the response is wrapped in a message
            if isinstance(cart_response['message'], dict) and 'doc' in cart_response['message']:
                quotation_doc = cart_response['message']['doc']
            else:
                quotation_doc = cart_response['message']
        
        if not quotation_doc:
            print("❌ POS API: No quotation document found in response")
            return {"message": "No cart found - please add items to cart first"}
        
        # Get quotation name
        quotation_name = None
        if hasattr(quotation_doc, 'name'):
            quotation_name = quotation_doc.name
        elif isinstance(quotation_doc, dict) and 'name' in quotation_doc:
            quotation_name = quotation_doc['name']
        
        if not quotation_name:
            print("❌ POS API: No quotation name found")
            return {"message": "Invalid cart document - no quotation name"}
        
        print(f"📋 POS API: Found cart {quotation_name}")
        
        # Get the quotation document
        try:
            doc = frappe.get_doc("Quotation", quotation_name)
        except Exception as e:
            print(f"❌ POS API: Error getting quotation {quotation_name}: {str(e)}")
            return {"message": f"Cart not found: {str(e)}"}
        
        # Force update price list - this is critical for POS
        old_price_list = doc.selling_price_list
        doc.selling_price_list = price_list
        print(f"🔄 POS API: Price list changed from {old_price_list} to {price_list}")
        
        # Reset pricing rule effects to prevent incremental increases
        doc.ignore_pricing_rule = 1  # Temporarily ignore pricing rules
        doc.discount_amount = 0
        doc.additional_discount_percentage = 0
        doc.coupon_code = ""
        
        print(f"🔄 POS API: Updating {len(doc.items)} items to price list {price_list}")
        
        # Recalculate prices and update quantities to trigger price refresh
        for item in doc.items:
            old_rate = item.rate
            new_rate = get_item_price_for_pos(item.item_code, price_list)
            if new_rate:
                item.rate = new_rate
                item.amount = new_rate * item.qty
                # Reset any pricing rule effects on the item
                item.discount_percentage = 0
                item.discount_amount = 0
                print(f"💰 POS API: {item.item_code}: {old_rate} → {new_rate}")
            else:
                # If no price found, keep existing rate or set to 0
                print(f"⚠️ POS API: No price found for {item.item_code} in {price_list}, keeping rate {old_rate}")
        
        # Recalculate taxes and totals only once
        doc.run_method("calculate_taxes_and_totals")
        
        # Force save with ignore_permissions to ensure price list change is saved
        doc.flags.ignore_permissions = True
        doc.save()
        
        print(f"✅ POS API: Cart pricing updated successfully to {price_list}")
        return {"message": "Cart pricing updated successfully"}
        
    except Exception as e:
        print(f"❌ POS API Error: {str(e)}")
        frappe.log_error(f"Error updating cart pricing: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"message": f"Failed to update pricing: {str(e)}"}

@frappe.whitelist()
def set_cart_price_list(price_list):
    """Set the cart price list from POS - overrides customer default"""
    try:
        print(f"🏷️ POS API: Setting cart price list to {price_list}")
        
        # Get or create cart quotation
        cart_response = cart.get_cart_quotation()
        
        if not cart_response:
            print("❌ POS API: No cart response received")
            return {"message": "No cart found"}
        
        # Handle different response formats
        quotation_doc = None
        if hasattr(cart_response, 'doc'):
            quotation_doc = cart_response.doc
        elif isinstance(cart_response, dict) and 'doc' in cart_response:
            quotation_doc = cart_response['doc']
        elif isinstance(cart_response, dict) and 'message' in cart_response:
            if isinstance(cart_response['message'], dict) and 'doc' in cart_response['message']:
                quotation_doc = cart_response['message']['doc']
            else:
                quotation_doc = cart_response['message']
        
        if not quotation_doc:
            print("❌ POS API: No quotation document found in response")
            return {"message": "No cart found"}
        
        # Get quotation name
        quotation_name = None
        if hasattr(quotation_doc, 'name'):
            quotation_name = quotation_doc.name
        elif isinstance(quotation_doc, dict) and 'name' in quotation_doc:
            quotation_name = quotation_doc['name']
        
        # Check if this is a local document (not yet saved)
        is_local = False
        if isinstance(quotation_doc, dict) and quotation_doc.get('__islocal'):
            is_local = True
            print(f"📋 POS API: Cart is local document (not yet saved)")
        elif not quotation_name:
            print("❌ POS API: No quotation name found")
            return {"message": "Invalid cart document - no quotation name"}
        
        if is_local:
            # For local documents, work directly with the quotation_doc
            doc = quotation_doc
            print(f"📋 POS API: Working with local cart document")
        else:
            print(f"📋 POS API: Setting price list for cart {quotation_name}")
            # Get the quotation document
            try:
                doc = frappe.get_doc("Quotation", quotation_name)
            except Exception as e:
                print(f"❌ POS API: Error getting quotation {quotation_name}: {str(e)}")
                return {"message": f"Cart not found: {str(e)}"}
        
        # Set the price list
        doc.selling_price_list = price_list
        
        # Reset pricing rule effects to prevent incremental increases
        doc.ignore_pricing_rule = 1  # Temporarily ignore pricing rules
        doc.discount_amount = 0
        doc.additional_discount_percentage = 0
        doc.coupon_code = ""
        
        # If there are items, recalculate their prices
        if doc.items:
            print(f"🔄 POS API: Recalculating prices for {len(doc.items)} items")
            for item in doc.items:
                new_rate = get_item_price_for_pos(item.item_code, price_list)
                if new_rate:
                    item.rate = new_rate
                    item.amount = new_rate * item.qty
                    # Reset any pricing rule effects on the item
                    item.discount_percentage = 0
                    item.discount_amount = 0
                    print(f"💰 POS API: {item.item_code}: {item.rate}")
        
        # Recalculate taxes and totals only once
        if hasattr(doc, 'run_method'):
            doc.run_method("calculate_taxes_and_totals")
        
        # Save the document
        if is_local:
            # For local documents, we can't save them directly
            # The cart system will handle saving when items are added
            print(f"📋 POS API: Local cart updated with price list {price_list}")
        else:
            doc.save()
            print(f"✅ POS API: Cart price list set to {price_list}")
        
        return {"message": f"Cart price list set to {price_list}"}
        
    except Exception as e:
        print(f"❌ POS API Error: {str(e)}")
        frappe.log_error(f"Error setting cart price list: {str(e)}")
        return {"message": f"Failed to set price list: {str(e)}"}

@frappe.whitelist()
def add_item_to_cart_with_price_list(item_code, qty=1, price_list=None):
    """Add item to cart with specific price list - overrides customer default"""
    try:
        print(f"🛒 POS API: Adding {item_code} (qty: {qty}) with price list: {price_list}")
        
        # Use POS-specific cart creation that respects the price list from the beginning
        result = create_pos_cart_with_price_list(item_code, qty, price_list)
        
        print(f"✅ POS API: Successfully added {item_code} to cart with price list {price_list}")
        return result
        
    except Exception as e:
        print(f"❌ POS API Error: {str(e)}")
        frappe.log_error(f"Error adding item to cart with price list: {str(e)}")
        return {"message": f"Failed to add item to cart: {str(e)}"}

@frappe.whitelist()
def create_pos_cart_with_price_list(item_code, qty=1, price_list=None):
    """Create or update cart with POS-specific price list from the beginning"""
    try:
        print(f"🏗️ POS API: Creating cart with price list: {price_list}")
        
        # Get or create cart quotation
        cart_response = cart.get_cart_quotation()
        
        if not cart_response:
            print("❌ POS API: No cart response received")
            return {"message": "Failed to get cart"}
        
        # Handle different response formats to get the quotation document
        quotation_doc = None
        if hasattr(cart_response, 'doc'):
            quotation_doc = cart_response.doc
        elif isinstance(cart_response, dict) and 'doc' in cart_response:
            quotation_doc = cart_response['doc']
        elif isinstance(cart_response, dict) and 'message' in cart_response:
            if isinstance(cart_response['message'], dict) and 'doc' in cart_response['message']:
                quotation_doc = cart_response['message']['doc']
            else:
                quotation_doc = cart_response['message']
        
        if not quotation_doc:
            print("❌ POS API: No quotation document found in response")
            return {"message": "Failed to get cart document"}
        
        # Check if this is a local document (not yet saved)
        is_local = False
        if isinstance(quotation_doc, dict) and quotation_doc.get('__islocal'):
            is_local = True
            print(f"📋 POS API: Working with local cart document")
        else:
            print(f"📋 POS API: Working with saved cart document")
        
        # Set the price list BEFORE adding the item
        if price_list:
            old_price_list = quotation_doc.selling_price_list
            quotation_doc.selling_price_list = price_list
            print(f"🏷️ POS API: Price list set from {old_price_list} to {price_list}")
        
        # Now add the item to the cart
        # Check if item already exists in cart
        existing_item = None
        if hasattr(quotation_doc, 'items') and quotation_doc.items:
            for item in quotation_doc.items:
                if item.item_code == item_code:
                    existing_item = item
                    break
        
        if existing_item:
            # Set existing item quantity to the new value (not add to it)
            existing_item.qty = float(qty)
            print(f"🔄 POS API: Set existing item {item_code} quantity to {existing_item.qty}")
        else:
            # Add new item to cart
            warehouse = frappe.get_cached_value(
                "Website Item", {"item_code": item_code}, "website_warehouse"
            )
            
            new_item = {
                "doctype": "Quotation Item",
                "item_code": item_code,
                "qty": qty,
                "warehouse": warehouse,
            }
            
            if hasattr(quotation_doc, 'append'):
                quotation_doc.append("items", new_item)
            else:
                # For local documents, we might need to handle this differently
                if not hasattr(quotation_doc, 'items'):
                    quotation_doc.items = []
                quotation_doc.items.append(new_item)
            
            print(f"➕ POS API: Added new item {item_code} with quantity {qty}")
        
        # Apply cart settings to recalculate prices and totals
        if hasattr(quotation_doc, 'run_method'):
            quotation_doc.run_method("set_missing_values")
            quotation_doc.run_method("calculate_taxes_and_totals")
        
        # Force save with ignore_permissions
        quotation_doc.flags.ignore_permissions = True
        quotation_doc.save()
        
        print(f"✅ POS API: Cart created/updated with price list {price_list}")
        return {"message": "Item added to cart successfully", "quotation": quotation_doc.name if hasattr(quotation_doc, 'name') else None}
        
    except Exception as e:
        print(f"❌ POS API Error: {str(e)}")
        frappe.log_error(f"Error creating POS cart with price list: {str(e)}")
        return {"message": f"Failed to create cart: {str(e)}"}

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
            sales_order = convert_quotation_to_sales_order_enhanced(doc.name)
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

def convert_quotation_to_sales_order_enhanced(quotation_name, submit_order=True):
    """Convert quotation to sales order with enhanced tax and shipping preservation"""
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
            "taxes_and_charges": quotation.taxes_and_charges,  # Copy tax template
            "items": []
        })
        
        frappe.log_error(f"DEBUG: Sales Order created with tax template: {sales_order.taxes_and_charges}", "Sales Order Tax Debug")
        
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
        
        # Store quotation taxes for restoration after calculate_taxes_and_totals
        frappe.log_error(f"Quotation {quotation_name} has {len(quotation.taxes) if hasattr(quotation, 'taxes') and quotation.taxes else 0} taxes", "SO Tax Debug")
        frappe.log_error(f"Tax template: {getattr(quotation, 'taxes_and_charges', 'None')}", "SO Tax Debug")
        
        # Store quotation taxes for later restoration
        quotation_taxes = []
        if hasattr(quotation, 'taxes') and quotation.taxes:
            for tax in quotation.taxes:
                quotation_taxes.append({
                    "charge_type": tax.charge_type,
                    "account_head": tax.account_head,
                    "description": tax.description,
                    "rate": getattr(tax, 'rate', None),
                    "tax_amount": getattr(tax, 'tax_amount', None),
                    "total": getattr(tax, 'total', None),
                    "cost_center": getattr(tax, 'cost_center', None),
                    "included_in_print_rate": getattr(tax, 'included_in_print_rate', 0),
                    "included_in_paid_amount": getattr(tax, 'included_in_paid_amount', 0)
                })
        
        # Copy POS-specific fields
        if hasattr(quotation, 'delivery_method'):
            sales_order.delivery_method = quotation.delivery_method
        if hasattr(quotation, 'scheduled_date'):
            sales_order.delivery_date = quotation.scheduled_date
        if hasattr(quotation, 'scheduled_time'):
            sales_order.scheduled_time = quotation.scheduled_time
        
        # DON'T call calculate_taxes_and_totals first - it clears manually copied taxes
        # Instead, directly restore quotation taxes and then calculate once
        
        frappe.log_error(f"SO before tax restore: {len(sales_order.taxes)} taxes", "SO Tax Debug")
        
        # Restore quotation taxes (including shipping) directly
        if quotation_taxes:
            frappe.log_error(f"Restoring {len(quotation_taxes)} taxes to SO", "SO Tax Debug")
            
            # Clear and restore all taxes from quotation
            sales_order.set("taxes", [])
            for tax_data in quotation_taxes:
                # Only add fields that have values
                clean_tax = {"charge_type": tax_data["charge_type"], "account_head": tax_data["account_head"], "description": tax_data["description"]}
                if tax_data.get("rate"):
                    clean_tax["rate"] = tax_data["rate"]
                if tax_data.get("tax_amount"):
                    clean_tax["tax_amount"] = tax_data["tax_amount"]
                if tax_data.get("total"):
                    clean_tax["total"] = tax_data["total"]
                if tax_data.get("cost_center"):
                    clean_tax["cost_center"] = tax_data["cost_center"]
                if tax_data.get("included_in_print_rate") is not None:
                    clean_tax["included_in_print_rate"] = tax_data["included_in_print_rate"]
                if tax_data.get("included_in_paid_amount") is not None:
                    clean_tax["included_in_paid_amount"] = tax_data["included_in_paid_amount"]
                    
                sales_order.append("taxes", clean_tax)
            
            frappe.log_error(f"SO after tax restore: {len(sales_order.taxes)} taxes", "SO Tax Debug")
            
            # Single final calculation to update totals
            sales_order.run_method("calculate_taxes_and_totals")
            frappe.log_error(f"SO after final calc: {len(sales_order.taxes)} taxes", "SO Tax Debug")
        else:
            # No quotation taxes, use standard calculation
            sales_order.run_method("calculate_taxes_and_totals")
        
        sales_order.insert()
        frappe.log_error(f"SO {sales_order.name} created with {len(sales_order.taxes)} taxes", "SO Tax Debug")
        
        if submit_order:
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
                        "rate": 6.625,  # NJ sales tax rate
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
    Now checks both Product Bundle doctype and Product Bundle item group
    """
    try:
        # First check: Is the item in the 'Product Bundle' item group?
        item_info = frappe.db.get_value(
            "Item",
            {"item_code": item_code},
            ["item_group", "item_name", "description"],
            as_dict=True
        )
        
        if item_info and item_info.item_group == "Product Bundle":
            print(f"📦 Item {item_code} is in Product Bundle item group")
            return {
                "is_bundle": True,
                "bundle_name": item_info.item_name,
                "bundle_items": []  # Will be populated from packed_items if available
            }
        
        # Second check: Check if Product Bundle doctype exists for this item
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
                fields=["item_code", "qty", "uom", "rate", "description"],
                order_by="idx"
            )
            
            # Get item names for each bundle item
            for bundle_item in bundle_items:
                item_name = frappe.db.get_value("Item", bundle_item.item_code, "item_name")
                bundle_item["item_name"] = item_name
            
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

# =============================================================================
# QUOTATION TEMPLATE FUNCTIONS
# =============================================================================

@frappe.whitelist()
def save_cart_as_template(template_name, description=None, category="Standard Fence", customer_type="Both", price_list=None, template_notes=None):
    """
    Save current cart as a quotation template
    """
    try:
        print(f"💾 Saving cart as template: {template_name}")
        
        # Get current cart quotation
        cart_quotation = get_current_cart_quotation()
        if not cart_quotation:
            return {
                "success": False,
                "message": "No active cart found"
            }
        
        # Check if template name already exists
        existing_template = frappe.db.exists("Quotation Template", {"template_name": template_name})
        if existing_template:
            return {
                "success": False,
                "message": f"Template '{template_name}' already exists"
            }
        
        # Create new template
        template_doc = frappe.get_doc({
            "doctype": "Quotation Template",
            "template_name": template_name,
            "description": description or f"Template created from cart on {frappe.utils.now_datetime().strftime('%Y-%m-%d %H:%M')}",
            "category": category,
            "customer_type": customer_type,
            "default_price_list": price_list,
            "created_by": frappe.session.user,
            "created_date": frappe.utils.now_datetime(),
            "template_notes": template_notes,
            "is_active": 1
        })
        
        # Add items from cart
        for item in cart_quotation.items:
            template_item = {
                "item_code": item.item_code,
                "item_name": item.item_name,
                "description": item.description,
                "qty": item.qty,
                "uom": item.uom,
                "rate": item.rate,
                "amount": item.amount,
                "additional_notes": item.additional_notes or ""
            }
            
            # Check if item is a bundle
            bundle_info = check_product_bundle(item.item_code)
            if bundle_info.get("is_bundle"):
                template_item["is_bundle"] = 1
                
                # Add bundle items
                bundle_items = get_bundle_items_from_cart(item.item_code)
                for bundle_item in bundle_items:
                    template_item.setdefault("bundle_items", []).append({
                        "item_code": bundle_item.item_code,
                        "item_name": bundle_item.item_name,
                        "description": bundle_item.description,
                        "qty": bundle_item.qty,
                        "uom": bundle_item.uom,
                        "rate": bundle_item.rate,
                        "amount": bundle_item.amount
                    })
            
            template_doc.append("template_items", template_item)
        
        # Save template
        template_doc.insert(ignore_permissions=True)
        
        print(f"✅ Template saved successfully: {template_doc.name}")
        return {
            "success": True,
            "message": f"Template '{template_name}' saved successfully",
            "template_name": template_doc.name
        }
        
    except Exception as e:
        print(f"❌ Error saving template: {str(e)}")
        frappe.log_error(f"Error saving quotation template: {str(e)}")
        return {
            "success": False,
            "message": str(e)
        }

@frappe.whitelist()
def get_quotation_templates(category="all", customer_type="all", search_term=None):
    """
    Get quotation templates for POS system
    """
    try:
        frappe.logger().info(f"🔍 DEBUG: Getting quotation templates - category: {category}, customer_type: {customer_type}, search_term: {search_term}")
        
        filters = {}
        
        # Apply filters
        if category and category != "all":
            filters["category"] = category
        
        if customer_type and customer_type != "all":
            filters["customer_type"] = customer_type
        
        if search_term:
            filters["template_name"] = ["like", f"%{search_term}%"]
        
        frappe.logger().info(f"🔍 DEBUG: Applied filters: {filters}")
        
        # Get templates from Quotation Template doctype (if it exists) or use Quotation doctype
        templates = []
        
        # First try to get from Quotation Template doctype
        if frappe.db.exists("DocType", "Quotation Template"):
            frappe.logger().info(f"🔍 DEBUG: Quotation Template doctype exists, querying...")
            templates = frappe.get_all("Quotation Template",
                filters=filters,
                fields=["name", "template_name", "description", "category", "customer_type", "use_count"],
                order_by="modified desc"
            )
            frappe.logger().info(f"✅ DEBUG: Found {len(templates)} templates in Quotation Template doctype")
        else:
            frappe.logger().info(f"🔍 DEBUG: Quotation Template doctype doesn't exist, checking Quotation doctype...")
            # Fallback: get from Quotation doctype where status = "Template"
            filters["status"] = "Template"
            frappe.logger().info(f"🔍 DEBUG: Querying Quotation doctype with filters: {filters}")
            templates = frappe.get_all("Quotation",
                filters=filters,
                fields=["name", "template_name", "description", "category", "customer_type", "use_count"],
                order_by="modified desc"
            )
            frappe.logger().info(f"✅ DEBUG: Found {len(templates)} templates in Quotation doctype")
        
        # Debug: Check what templates were found
        for i, template in enumerate(templates):
            frappe.logger().info(f"🔍 DEBUG: Template {i+1}: {template.get('name', 'N/A')} - {template.get('template_name', 'N/A')}")
        
        # If no templates found, create a sample one for testing
        if not templates:
            frappe.logger().info(f"🔍 DEBUG: No templates found, creating sample template...")
            # Create a sample template for testing
            sample_template = create_sample_template()
            if sample_template:
                templates = [sample_template]
                frappe.logger().info(f"✅ DEBUG: Sample template created: {sample_template.get('template_name', 'N/A')}")
            else:
                frappe.logger().error(f"❌ DEBUG: Failed to create sample template")
        
        frappe.logger().info(f"✅ DEBUG: Returning {len(templates)} templates")
        
        return {
            "success": True,
            "templates": templates,
            "count": len(templates),
            "debug_info": {
                "filters_applied": filters,
                "doctype_checked": "Quotation Template" if frappe.db.exists("DocType", "Quotation Template") else "Quotation",
                "templates_found": len(templates)
            }
        }
        
    except Exception as e:
        frappe.log_error(f"Error getting quotation templates: {str(e)}")
        frappe.logger().error(f"❌ DEBUG: Error getting templates: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to load templates: {str(e)}",
            "templates": [],
            "count": 0,
            "debug_info": {
                "error": str(e),
                "traceback": frappe.get_traceback()
            }
        }

@frappe.whitelist()
def load_quotation_template(template_name, price_list=None):
    """
    Load a quotation template and create a cart quotation from it
    """
    try:
        frappe.logger().info(f"🔍 DEBUG: Starting template load for '{template_name}'")
        frappe.logger().info(f"🔍 DEBUG: Current user: {frappe.session.user}")
        frappe.logger().info(f"🔍 DEBUG: Price list: {price_list}")
        
        # Clear existing cart first
        frappe.logger().info(f"🔍 DEBUG: Clearing existing cart...")
        try:
            cart.clear_cart()
            frappe.logger().info(f"✅ DEBUG: Cart cleared successfully")
        except Exception as clear_error:
            frappe.logger().info(f"⚠️ DEBUG: Cart clear warning (may be expected): {str(clear_error)}")
        
        # Get template data
        template = None
        frappe.logger().info(f"🔍 DEBUG: Looking for template '{template_name}'...")
        
        # Try to get from Quotation Template doctype first
        if frappe.db.exists("DocType", "Quotation Template"):
            frappe.logger().info(f"🔍 DEBUG: Quotation Template doctype exists, trying to get template...")
            if frappe.db.exists("Quotation Template", template_name):
                template = frappe.get_doc("Quotation Template", template_name)
                frappe.logger().info(f"✅ DEBUG: Found template in Quotation Template doctype")
            else:
                frappe.logger().info(f"❌ DEBUG: Template '{template_name}' not found in Quotation Template doctype")
        else:
            frappe.logger().info(f"🔍 DEBUG: Quotation Template doctype doesn't exist, checking Quotation doctype...")
            # Fallback: get from Quotation doctype
            if frappe.db.exists("Quotation", template_name):
                template = frappe.get_doc("Quotation", template_name)
                frappe.logger().info(f"✅ DEBUG: Found template in Quotation doctype")
            else:
                frappe.logger().info(f"❌ DEBUG: Template '{template_name}' not found in Quotation doctype")
        
        if not template:
            frappe.logger().error(f"❌ DEBUG: Template '{template_name}' not found in any doctype")
            return {
                "success": False,
                "message": f"Template '{template_name}' not found"
            }
        
        frappe.logger().info(f"✅ DEBUG: Template found: {template.name}, status: {getattr(template, 'status', 'N/A')}")
        
        # Handle different template structures
        template_items = []
        if hasattr(template, 'items'):
            template_items = template.items
            frappe.logger().info(f"🔍 DEBUG: Template has {len(template_items)} items (standard items)")
        elif hasattr(template, 'template_items'):
            template_items = template.template_items
            frappe.logger().info(f"🔍 DEBUG: Template has {len(template_items)} items (template_items)")
        else:
            frappe.logger().info(f"🔍 DEBUG: Template structure unknown - checking available attributes")
            available_attrs = [attr for attr in dir(template) if not attr.startswith('_')]
            frappe.logger().info(f"🔍 DEBUG: Available template attributes: {available_attrs}")
            
            # Try to find any item-like attributes
            for attr in available_attrs:
                try:
                    attr_value = getattr(template, attr)
                    if hasattr(attr_value, '__len__') and attr != 'name':
                        frappe.logger().info(f"🔍 DEBUG: Attribute '{attr}' has length {len(attr_value)}")
                except:
                    pass
        
        frappe.logger().info(f"🔍 DEBUG: Template has {len(template_items)} items to process")
        
        # Check user permissions
        frappe.logger().info(f"🔍 DEBUG: Checking user permissions for Quotation doctype...")
        try:
            can_read = frappe.has_permission("Quotation", "read")
            can_write = frappe.has_permission("Quotation", "write")
            can_create = frappe.has_permission("Quotation", "create")
            frappe.logger().info(f"🔍 DEBUG: Permissions - Read: {can_read}, Write: {can_write}, Create: {can_create}")
        except Exception as perm_error:
            frappe.logger().error(f"❌ DEBUG: Permission check failed: {str(perm_error)}")
        
        # Get or create webshop cart quotation
        frappe.logger().info(f"🔍 DEBUG: Getting webshop cart quotation...")
        cart_response = cart.get_cart_quotation()
        cart_quotation = cart_response.get("doc")
        
        if not cart_quotation:
            frappe.logger().info(f"🔍 DEBUG: No existing cart found, creating new one...")
            cart_quotation = frappe.new_doc("Quotation")
            cart_quotation.quotation_to = "Customer"
            cart_quotation.party_name = frappe.session.user
            cart_quotation.selling_price_list = price_list or "Standard Selling"
            cart_quotation.status = "Draft"
        else:
            frappe.logger().info(f"🔍 DEBUG: Using existing cart: {cart_quotation.name}")
        
        frappe.logger().info(f"🔍 DEBUG: Cart quotation created, copying {len(template_items)} items...")
        
        # Copy items from template
        items_added = 0
        for i, item in enumerate(template_items):
            try:
                frappe.logger().info(f"🔍 DEBUG: Adding item {i+1}: {item.item_code} (qty: {item.qty}, rate: {item.rate})")
                cart_quotation.append("items", {
                    "item_code": item.item_code,
                    "item_name": item.item_name,
                    "description": item.description,
                    "qty": item.qty,
                    "uom": item.uom,
                    "rate": item.rate,
                    "amount": item.amount
                })
                items_added += 1
                frappe.logger().info(f"✅ DEBUG: Item {i+1} added successfully")
            except Exception as item_error:
                frappe.logger().error(f"❌ DEBUG: Failed to add item {i+1} ({item.item_code}): {str(item_error)}")
        
        frappe.logger().info(f"✅ DEBUG: {items_added} items copied to cart quotation")
        
        # Save the cart quotation
        if cart_quotation.is_new():
            frappe.logger().info(f"🔍 DEBUG: Inserting new cart quotation...")
            try:
                cart_quotation.insert(ignore_permissions=True)
                frappe.logger().info(f"✅ DEBUG: Cart quotation inserted successfully: {cart_quotation.name}")
            except Exception as insert_error:
                frappe.logger().error(f"❌ DEBUG: Failed to insert cart quotation: {str(insert_error)}")
                raise insert_error
        else:
            frappe.logger().info(f"🔍 DEBUG: Updating existing cart quotation...")
        
        frappe.logger().info(f"🔍 DEBUG: Saving cart quotation...")
        try:
            cart_quotation.save(ignore_permissions=True)
            frappe.logger().info(f"✅ DEBUG: Cart quotation saved successfully")
        except Exception as save_error:
            frappe.logger().error(f"❌ DEBUG: Failed to save cart quotation: {str(save_error)}")
            raise save_error
        
        # Update template use count
        if hasattr(template, 'use_count'):
            frappe.logger().info(f"🔍 DEBUG: Updating template use count...")
            try:
                template.use_count = (template.use_count or 0) + 1
                template.save(ignore_permissions=True)
                frappe.logger().info(f"✅ DEBUG: Template use count updated to {template.use_count}")
            except Exception as use_count_error:
                frappe.logger().error(f"⚠️ DEBUG: Failed to update use count (non-critical): {str(use_count_error)}")
        
        frappe.logger().info(f"✅ DEBUG: Template loading completed successfully")
        
        return {
            "success": True,
            "message": f"Template loaded successfully",
            "items_count": items_added,
            "quotation": cart_quotation.name,
            "debug_info": {
                "template_name": template_name,
                "template_found": True,
                "items_copied": items_added,
                "quotation_created": cart_quotation.name,
                "user": frappe.session.user
            }
        }
        
    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)
        
        frappe.logger().error(f"❌ DEBUG: Template loading failed - {error_type}: {error_message}")
        frappe.log_error(f"Template loading failed: {error_type}: {error_message}")
        
        return {
            "success": False,
            "message": f"Failed to create cart quotation. Please check your user permissions and try again.",
            "debug_info": {
                "error_type": error_type,
                "error_message": error_message,
                "template_name": template_name,
                "user": frappe.session.user
            }
        }

@frappe.whitelist()
def delete_quotation_template(template_name):
    """
    Delete a quotation template
    """
    try:
        # Check if template exists
        if frappe.db.exists("DocType", "Quotation Template"):
            if not frappe.db.exists("Quotation Template", template_name):
                return {
                    "success": False,
                    "message": "Template not found"
                }
            template = frappe.get_doc("Quotation Template", template_name)
        else:
            # Fallback: check Quotation doctype
            if not frappe.db.exists("Quotation", template_name):
                return {
                    "success": False,
                    "message": "Template not found"
                }
            template = frappe.get_doc("Quotation", template_name)
        
        # Delete template
        template.delete(ignore_permissions=True)
        
        return {
            "success": True,
            "message": f"Template '{template_name}' deleted successfully"
        }
        
    except Exception as e:
        frappe.log_error(f"Error deleting template {template_name}: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to delete template: {str(e)}"
        }

def create_sample_template():
    """
    Create a sample template for testing if no templates exist
    """
    try:
        frappe.logger().info(f"🔍 DEBUG: Creating sample template...")
        
        # Create a sample template with basic fence items
        sample_template = frappe.new_doc("Quotation")
        sample_template.quotation_to = "Customer"
        sample_template.party_name = "Template Customer"
        sample_template.selling_price_list = "Standard Selling"
        sample_template.status = "Template"
        sample_template.template_name = "Test Template 1"
        sample_template.description = "Sample fence template for testing"
        sample_template.category = "Standard Fence"
        sample_template.customer_type = "Both"
        sample_template.use_count = 0
        
        frappe.logger().info(f"✅ DEBUG: Sample template document created")
        
        # Add sample items (you may need to adjust these item codes based on your actual items)
        sample_items = [
            {
                "item_code": "VINYL-PANEL-6FT-WHITE",
                "item_name": "6ft White Vinyl Privacy Panel",
                "qty": 10,
                "uom": "Unit",
                "rate": 85.00
            },
            {
                "item_code": "VINYL-POST-6FT-WHITE", 
                "item_name": "6ft White Vinyl Fence Post",
                "qty": 11,
                "uom": "Unit",
                "rate": 45.00
            }
        ]
        
        items_added = 0
        for item_data in sample_items:
            # Check if item exists before adding
            frappe.logger().info(f"🔍 DEBUG: Checking if item exists: {item_data['item_code']}")
            if frappe.db.exists("Item", item_data["item_code"]):
                frappe.logger().info(f"✅ DEBUG: Item {item_data['item_code']} exists, adding to template")
                sample_template.append("items", {
                    "item_code": item_data["item_code"],
                    "item_name": item_data["item_name"],
                    "qty": item_data["qty"],
                    "uom": item_data["uom"],
                    "rate": item_data["rate"],
                    "amount": item_data["qty"] * item_data["rate"]
                })
                items_added += 1
            else:
                frappe.logger().info(f"⚠️ DEBUG: Item {item_data['item_code']} doesn't exist, skipping")
        
        frappe.logger().info(f"✅ DEBUG: Added {items_added} items to sample template")
        
        frappe.logger().info(f"🔍 DEBUG: Inserting sample template...")
        sample_template.insert(ignore_permissions=True)
        frappe.logger().info(f"✅ DEBUG: Sample template inserted: {sample_template.name}")
        
        frappe.logger().info(f"🔍 DEBUG: Saving sample template...")
        sample_template.save(ignore_permissions=True)
        frappe.logger().info(f"✅ DEBUG: Sample template saved successfully")
        
        result = {
            "name": sample_template.name,
            "template_name": "Test Template 1",
            "description": "Sample fence template for testing",
            "category": "Standard Fence",
            "customer_type": "Both",
            "use_count": 0
        }
        
        frappe.logger().info(f"✅ DEBUG: Sample template created successfully: {result}")
        return result
        
    except Exception as e:
        frappe.log_error(f"Error creating sample template: {str(e)}")
        frappe.logger().error(f"❌ DEBUG: Failed to create sample template: {str(e)}")
        frappe.logger().error(f"❌ DEBUG: Traceback: {frappe.get_traceback()}")
        return None

# Helper functions for quotation templates
def get_current_cart_quotation():
    """Get or create current cart quotation"""
    try:
        # Try to get existing cart quotation
        existing_quotation = frappe.db.get_value(
            "Quotation",
            {
                "contact_email": frappe.session.user,
                "order_type": "Shopping Cart",
                "docstatus": 0
            },
            "name",
            order_by="modified desc"
        )
        
        if existing_quotation:
            return frappe.get_doc("Quotation", existing_quotation)
        
        # Create new cart quotation
        party = get_party()
        if not party:
            print(f"❌ Error: Could not get party for user {frappe.session.user}")
            return None
            
        company = frappe.db.get_single_value("Webshop Settings", "company")
        if not company:
            print(f"❌ Error: No company set in Webshop Settings")
            return None
        
        quotation = frappe.get_doc({
            "doctype": "Quotation",
            "naming_series": "QTN-CART-",
            "quotation_to": party.doctype,
            "company": company,
            "order_type": "Shopping Cart",
            "status": "Draft",
            "docstatus": 0,
            "party_name": party.name,
            "contact_email": frappe.session.user
        })
        
        quotation.flags.ignore_permissions = True
        quotation.insert()
        
        print(f"✅ Created new cart quotation: {quotation.name}")
        return quotation
        
    except Exception as e:
        print(f"❌ Error getting cart quotation: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def clear_current_cart():
    """Clear current cart items"""
    try:
        cart_quotation = get_current_cart_quotation()
        if cart_quotation:
            # Clear items and packed items
            cart_quotation.items = []
            cart_quotation.packed_items = []
            cart_quotation.flags.ignore_permissions = True
            cart_quotation.save()
    except Exception as e:
        print(f"❌ Error clearing cart: {str(e)}")

def get_bundle_items_from_cart(item_code):
    """Get bundle items from current cart for a specific item"""
    try:
        cart_quotation = get_current_cart_quotation()
        if not cart_quotation:
            return []
        
        # Find the item in cart
        cart_item = None
        for item in cart_quotation.items:
            if item.item_code == item_code:
                cart_item = item
                break
        
        if not cart_item:
            return []
        
        # Get packed items for this cart item
        packed_items = []
        for packed_item in cart_quotation.packed_items:
            if packed_item.parent_detail_docname == cart_item.name:
                packed_items.append(packed_item)
        
        return packed_items
        
    except Exception as e:
        print(f"❌ Error getting bundle items: {str(e)}")
        return []

def get_item_price(item_code, price_list):
    """Get current price for item from price list"""
    try:
        if not price_list:
            return None
        
        price = frappe.db.get_value(
            "Item Price",
            {
                "item_code": item_code,
                "price_list": price_list
            },
            "price_list_rate"
        )
        
        return price
        
    except Exception as e:
        print(f"❌ Error getting item price: {str(e)}")
        return None

# =============================================================================
# EXISTING FUNCTIONS
# =============================================================================

@frappe.whitelist()
def get_bundles_by_material_type(material_type=None, price_list=None):
    """
    Get all bundles filtered by material type
    Now uses the 'Product Bundle' item group for proper bundle detection
    """
    try:
        print(f"🔍 Getting bundles for material type: {material_type}")
        
        # Primary method: Get items from 'Product Bundle' item group
        bundles_query = """
            SELECT 
                item_code,
                item_name,
                item_group,
                rate,
                price_list_rate,
                actual_qty,
                description,
                stock_uom,
                has_variants,
                variant_of
            FROM `tabItem`
            WHERE item_group = 'Product Bundle'
            AND disabled = 0
        """
        
        # Add material type filter if specified
        if material_type and material_type != 'all':
            # For Cap and Hardware items, also check custom_type_of_material field
            # For other items, use name/description matching
            bundles_query += f"""
                AND (
                    item_name LIKE '%{material_type}%' 
                    OR description LIKE '%{material_type}%'
                    OR (
                        item_group IN ('Cap', 'Hardware') 
                        AND item_code IN (
                            SELECT parent 
                            FROM `tabCustom Type Of Material` 
                            WHERE material_type = '{material_type}'
                        )
                    )
                )
            """
        
        bundles = frappe.db.sql(bundles_query, as_dict=True)
        
        # Fallback method: Also check for items with packed_items (existing bundles in cart)
        if not bundles:
            print("📦 No bundles found in Product Bundle item group, checking for items with packed_items...")
            packed_bundles_query = """
                SELECT DISTINCT 
                    qi.item_code,
                    qi.item_name,
                    qi.item_group,
                    qi.rate,
                    qi.price_list_rate,
                    qi.actual_qty,
                    qi.description
                FROM `tabQuotation Item` qi
                INNER JOIN `tabPacked Item` pi ON qi.name = pi.parent_detail_docname
                WHERE qi.docstatus = 0
            """
            
            if material_type and material_type != 'all':
                packed_bundles_query += f" AND (qi.item_group LIKE '%{material_type}%' OR qi.item_name LIKE '%{material_type}%')"
            
            bundles = frappe.db.sql(packed_bundles_query, as_dict=True)
        
        # Apply price list pricing if specified
        if price_list and bundles:
            for bundle in bundles:
                try:
                    # Get price from price list
                    price_list_rate = frappe.db.get_value(
                        "Item Price",
                        {"item_code": bundle.item_code, "price_list": price_list},
                        "price_list_rate"
                    )
                    if price_list_rate:
                        bundle.price_list_rate = price_list_rate
                        bundle.rate = price_list_rate
                except:
                    pass
        
        print(f"📦 Found {len(bundles)} bundles from Product Bundle item group")
        return {
            "bundles": bundles,
            "material_type": material_type,
            "count": len(bundles)
        }
        
    except Exception as e:
        print(f"❌ Error getting bundles: {str(e)}")
        frappe.log_error(f"Error getting bundles by material type: {str(e)}")
        return {
            "bundles": [],
            "material_type": material_type,
            "count": 0,
            "error": str(e)
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
            fields=["item_code", "qty", "uom", "rate", "description"],
            order_by="idx"
        )
        
        # Get item names for each bundle item
        for bundle_item in bundle_items:
            item_name = frappe.db.get_value("Item", bundle_item.item_code, "item_name")
            bundle_item["item_name"] = item_name
        
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
        
        # MAINTENANCE FREE: Auto-detect which attributes to use for height/color/rail type selection
        # Based on common naming patterns - completely scalable
        height_keywords = ['height', 'fence height', 'post height']
        color_keywords = ['color', 'fence color']
        rail_type_keywords = ['rail type', 'ranch rail type', 'rail style']
        
        # Find the best height, color, and rail type attributes dynamically
        height_attribute = None
        color_attribute = None
        rail_type_attribute = None
        
        for attr_name in organized_attributes.keys():
            attr_lower = attr_name.lower()
            # Find height attribute
            if not height_attribute and any(keyword in attr_lower for keyword in height_keywords):
                height_attribute = attr_name
            # Find color attribute  
            if not color_attribute and any(keyword in attr_lower for keyword in color_keywords):
                color_attribute = attr_name
            # Find rail type attribute
            if not rail_type_attribute and any(keyword in attr_lower for keyword in rail_type_keywords):
                rail_type_attribute = attr_name
        
        return {
            "success": True,
            "attributes": organized_attributes,
            "height_attribute": height_attribute,  # Which attribute to use for height selection
            "color_attribute": color_attribute,    # Which attribute to use for color selection
            "rail_type_attribute": rail_type_attribute,  # Which attribute to use for rail type selection
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
def get_styles_for_material_type(material_type=None):
    """
    Get styles from Style doctype, optionally filtered by material type.
    This replaces the hard-coded styles in POS JavaScript.
    """
    try:
        filters = {}
        
        # Filter by material type if provided
        if material_type:
            # Map common material type variations to standard names
            material_type_mapping = {
                'vinyl': 'Vinyl',
                'aluminum': 'Aluminum', 
                'wood': 'Wood',
                'pressure-treated': 'Pressure Treated',
                'chain-link': 'Chain Link'
            }
            
            # Use mapped name or original value
            mapped_material_type = material_type_mapping.get(material_type.lower(), material_type)
            filters['material_type'] = mapped_material_type
        
        # Get styles from Style doctype
        styles = frappe.get_all('Style', 
            filters=filters,
            fields=['name as id', 'style as name', 'material_type'],
            order_by='style'
        )
        
        # No fallback descriptions - use only what's in doctype
        
        frappe.logger().info(f"Found {len(styles)} styles for material type: {material_type}")
        
        return {
            "success": True,
            "styles": styles,
            "material_type": material_type
        }
        
    except Exception as e:
        frappe.log_error(f"Error getting styles for material type {material_type}: {str(e)}")
        
        # No fallback styles - return empty
        return {
            "success": True,
            "styles": [],
            "material_type": material_type,
            "message": "No styles found in Style doctype"
        }





@frappe.whitelist()
def update_item_custom_style_field():
    """
    Update Item custom_style field to be a Link field pointing to Style doctype.
    This ensures data integrity and provides dropdown selection.
    """
    try:
        # Check if custom_style custom field exists
        custom_field_name = frappe.db.exists("Custom Field", {
            "dt": "Item", 
            "fieldname": "custom_style"
        })
        
        if not custom_field_name:
            print("custom_style field does not exist. Creating it as Link field...")
            
            # Create new Link field
            custom_field = frappe.get_doc({
                "doctype": "Custom Field",
                "dt": "Item",
                "fieldname": "custom_style",
                "fieldtype": "Link",
                "options": "Style",
                "label": "Style",
                "description": "Fence style for this item",
                "insert_after": "custom_material_type",
                "permlevel": 0
            })
            custom_field.insert(ignore_permissions=True)
            frappe.db.commit()
            
            return {
                "success": True,
                "message": "Created custom_style field as Link field to Style doctype",
                "action": "created"
            }
        else:
            # Get existing field details
            existing_field = frappe.get_doc("Custom Field", custom_field_name)
            
            if existing_field.fieldtype == "Link" and existing_field.options == "Style":
                return {
                    "success": True,
                    "message": "custom_style field is already properly configured as Link to Style",
                    "action": "no_change_needed"
                }
            else:
                # Update existing field to Link type
                existing_field.fieldtype = "Link"
                existing_field.options = "Style"
                existing_field.save(ignore_permissions=True)
                frappe.db.commit()
                
                return {
                    "success": True,
                    "message": f"Updated custom_style field from {existing_field.fieldtype} to Link field pointing to Style doctype",
                    "action": "updated",
                    "previous_type": existing_field.fieldtype
                }
                
    except Exception as e:
        frappe.log_error(f"Error updating custom_style field: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

@frappe.whitelist()
def migrate_existing_style_data():
    """
    Migrate existing custom_style data to use Style doctype names.
    This handles data migration when switching from Data to Link field.
    """
    try:
        # Get all items with custom_style values
        items_with_styles = frappe.db.sql("""
            SELECT name, custom_style, custom_material_type
            FROM `tabItem`
            WHERE custom_style IS NOT NULL 
                AND custom_style != ''
                AND disabled = 0
        """, as_dict=True)
        
        updated_count = 0
        error_count = 0
        mapping_log = []
        
        for item in items_with_styles:
            try:
                # Try to find matching Style record
                style_filter = {"style": item.custom_style}
                
                # Add material type filter if available
                if item.custom_material_type:
                    style_filter["material_type"] = item.custom_material_type
                
                # Find Style record
                style_record = frappe.db.get_value("Style", style_filter, "name")
                
                if style_record:
                    # Update item to use Style record name
                    frappe.db.set_value("Item", item.name, "custom_style", style_record)
                    updated_count += 1
                    mapping_log.append({
                        "item": item.name,
                        "old_style": item.custom_style,
                        "new_style": style_record,
                        "material_type": item.custom_material_type
                    })
                else:
                    # Style not found - log for manual review
                    error_count += 1
                    mapping_log.append({
                        "item": item.name,
                        "old_style": item.custom_style,
                        "new_style": None,
                        "material_type": item.custom_material_type,
                        "error": "Style record not found"
                    })
                    
            except Exception as e:
                error_count += 1
                mapping_log.append({
                    "item": item.name,
                    "old_style": item.custom_style,
                    "error": str(e)
                })
        
        frappe.db.commit()
        
        return {
            "success": True,
            "message": f"Migrated {updated_count} items, {error_count} errors",
            "updated_count": updated_count,
            "error_count": error_count,
            "total_items": len(items_with_styles),
            "mapping_log": mapping_log[:20]  # Show first 20 for review
        }
        
    except Exception as e:
        frappe.log_error(f"Error migrating style data: {str(e)}")
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