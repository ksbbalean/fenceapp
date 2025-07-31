import frappe
from frappe import _

sitemap = 1

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
        # First try to get distinct material types from custom_material_type field
        material_types = frappe.db.sql("""
            SELECT DISTINCT 
                i.custom_material_type as name,
                i.custom_material_type as material_type_name,
                '' as image
            FROM `tabItem` i
            WHERE i.custom_material_type IS NOT NULL 
                AND i.custom_material_type != ''
                AND i.disabled = 0
            ORDER BY i.custom_material_type
        """, as_dict=True)
        
        if material_types:
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
        
        # Final fallback: Return default material types
        frappe.log_error("No Item Groups found, using defaults")
        return [
            {"name": "vinyl", "material_type_name": "Vinyl", "image": ""},
            {"name": "aluminum", "material_type_name": "Aluminum", "image": ""},
            {"name": "wood", "material_type_name": "Wood", "image": ""}
        ]
        
    except Exception as e:
        frappe.log_error(f"Error getting material types: {str(e)}")
        # Return default material types on error
        return [
            {"name": "vinyl", "material_type_name": "Vinyl", "image": ""},
            {"name": "aluminum", "material_type_name": "Aluminum", "image": ""},
            {"name": "wood", "material_type_name": "Wood", "image": ""}
        ]

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
        return [{"name": "Standard Selling", "price_list_name": "Standard Selling", "currency": "USD"}] 