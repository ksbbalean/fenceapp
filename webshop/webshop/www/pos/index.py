import frappe
from frappe import _

sitemap = 1

def sort_material_types_by_priority(material_types):
    """Sort material types according to specified priority order"""
    # Define the exact priority order - panels, rail, posts, gates, hardware, caps
    priority_order = {
        'Panel': 1, 'Panels': 1,
        'Rail': 2, 'Rails': 2,
        'Post': 3, 'Posts': 3, 
        'Gate': 4, 'Gates': 4,
        'Hardware': 5,
        'Cap': 6, 'Caps': 6
    }
    
    def get_priority(material_type):
        """Get priority for a material type using exact matching"""
        name = material_type.get('name', '')
        material_type_name = material_type.get('material_type_name', '')
        
        # Check exact matches first
        if name in priority_order:
            return priority_order[name]
        if material_type_name in priority_order:
            return priority_order[material_type_name]
        
        # Keep original order for unmatched items
        return 999
    
    # Sort by priority, then by name alphabetically
    return sorted(material_types, key=lambda x: (get_priority(x), x.get('name', '')))

def get_context(context):
    context.no_cache = 1
    context.body_class = "pos-interface"
    
    # Get webshop settings
    settings = frappe.get_cached_doc("Webshop Settings")
    context.settings = settings
    
    # Get material types from custom_material_type field
    context.material_types = get_fence_categories()
    
    # Get customer groups for pricing
    context.customer_groups = get_customer_groups()
    
    # Get price lists
    context.price_lists = get_price_lists()
    
    return context

def get_fence_categories():
    """Get material types using custom_material_type field from items, fallback to item groups"""
    try:
        # First try to get distinct material types from custom_material_type field with sample images
        material_types = frappe.db.sql("""
            SELECT DISTINCT 
                i.custom_material_type as name,
                i.custom_material_type as material_type_name,
                COALESCE(
                    (SELECT wi.website_image FROM `tabWebsite Item` wi 
                     WHERE wi.item_code = i.item_code AND wi.website_image IS NOT NULL AND wi.website_image != '' 
                     LIMIT 1),
                    (SELECT i2.image FROM `tabItem` i2 
                     WHERE i2.custom_material_type = i.custom_material_type AND i2.image IS NOT NULL AND i2.image != '' 
                     LIMIT 1),
                    ''
                ) as image
            FROM `tabItem` i
            WHERE i.custom_material_type IS NOT NULL 
                AND i.custom_material_type != ''
                AND i.disabled = 0
            ORDER BY i.custom_material_type
        """, as_dict=True)
        
        # Also check for custom_material_class if no material_type found
        if not material_types:
            material_classes = frappe.db.sql("""
                SELECT DISTINCT 
                    i.custom_material_class as name,
                    i.custom_material_class as material_type_name,
                    COALESCE(
                        (SELECT wi.website_image FROM `tabWebsite Item` wi 
                         WHERE wi.item_code = i.item_code AND wi.website_image IS NOT NULL AND wi.website_image != '' 
                         LIMIT 1),
                        (SELECT i2.image FROM `tabItem` i2 
                         WHERE i2.custom_material_class = i.custom_material_class AND i2.image IS NOT NULL AND i2.image != '' 
                         LIMIT 1),
                        ''
                    ) as image
                FROM `tabItem` i
                WHERE i.custom_material_class IS NOT NULL 
                    AND i.custom_material_class != ''
                    AND i.disabled = 0
                ORDER BY i.custom_material_class
            """, as_dict=True)
            
            if material_classes:
                material_types = material_classes
        
        if material_types:
            # Apply custom ordering
            material_types = sort_material_types_by_priority(material_types)
            frappe.log_error(f"Found {len(material_types)} material types from custom_material_type field")
            return material_types
        
        # Fallback: Try to get from Item Groups
        frappe.log_error("No custom_material_type data found, trying Item Groups")
        item_groups = frappe.get_all("Item Group", 
            filters={"is_group": 0},
            fields=["name", "item_group_name as material_type_name", "image"],
            limit=10
        )
        
        if item_groups:
            return item_groups
        
        # No defaults - return empty if no data found
        frappe.log_error("No Item Groups found")
        return []
        
    except Exception as e:
        frappe.log_error(f"Error getting material types: {str(e)}")
        # Return empty on error
        return []

def get_customer_groups():
    """Get customer groups for pricing"""
    try:
        return frappe.get_all("Customer Group",
            fields=["name", "customer_group_name"],
            filters={"is_group": 0}
        )
    except Exception as e:
        frappe.log_error(f"Error getting customer groups: {str(e)}")
        return [{"name": "Individual", "customer_group_name": "Individual"}]

def get_price_lists():
    """Get available price lists"""
    try:
        return frappe.get_all("Price List",
            filters={"enabled": 1},
            fields=["name", "price_list_name", "currency"]
        )
    except Exception as e:
        frappe.log_error(f"Error getting price lists: {str(e)}")
        return [{"name": "Contractor", "price_list_name": "Contractor", "currency": "USD"}] 