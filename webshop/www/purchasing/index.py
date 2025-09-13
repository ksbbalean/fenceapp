"""
H&J Fence Supply Purchasing Interface
Backend route handler for purchasing interface
Integrates with ERPNext purchasing workflow
"""

import frappe
from frappe import _

def get_context(context):
    """Get context for purchasing interface page"""
    
    # Check user permissions for purchasing
    if not frappe.has_permission("Purchase Order", "create") and not frappe.has_permission("Material Request", "create"):
        frappe.throw(_("You don't have permission to access purchasing"))
    
    # Auto-setup purchasing interface on first access
    ensure_purchasing_setup()
    
    context.no_cache = 1
    context.show_sidebar = False
    
    # Get suppliers for dropdown
    context.suppliers = get_suppliers()
    
    # Get item groups relevant to purchasing
    context.item_groups = get_purchasing_item_groups()
    
    # Get default company and settings
    context.default_company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
    
    # Get purchasing settings
    context.purchasing_settings = get_purchasing_settings()
    
    return context

def get_suppliers():
    """Get list of suppliers for interface"""
    try:
        suppliers = frappe.get_all("Supplier",
            filters={"disabled": 0},
            fields=["name", "supplier_name", "supplier_group", "country", "is_frozen"],
            order_by="supplier_name"
        )
        return suppliers
    except Exception as e:
        frappe.log_error(f"Error getting suppliers: {str(e)}")
        return []

def get_purchasing_item_groups():
    """Get item groups relevant to purchasing"""
    try:
        item_groups = frappe.get_all("Item Group",
            filters={"is_group": 0},
            fields=["name", "item_group_name", "image", "parent_item_group"],
            order_by="item_group_name"
        )
        return item_groups
    except Exception as e:
        frappe.log_error(f"Error getting item groups: {str(e)}")
        return []

def get_purchasing_settings():
    """Get purchasing-related settings"""
    try:
        settings = {}
        
        # Get buying settings
        buying_settings = frappe.get_single("Buying Settings")
        settings.update({
            "auto_create_purchase_receipt": buying_settings.get("auto_create_purchase_receipt", 0),
            "maintain_same_rate": buying_settings.get("maintain_same_rate", 0),
            "allow_multiple_items": buying_settings.get("allow_multiple_items", 1)
        })
        
        # Get stock settings
        stock_settings = frappe.get_single("Stock Settings")
        settings.update({
            "default_warehouse": stock_settings.get("default_warehouse"),
            "auto_insert_price_list_rate": stock_settings.get("auto_insert_price_list_rate", 1)
        })
        
        return settings
    except Exception as e:
        frappe.log_error(f"Error getting purchasing settings: {str(e)}")
        return {}

def ensure_purchasing_setup():
    """Ensure purchasing interface is set up - run setup if needed"""
    try:
        # Check if setup has been run by looking for a key custom field
        setup_complete = frappe.db.exists("Custom Field", {
            "dt": "Material Request",
            "fieldname": "custom_source"
        })
        
        if not setup_complete:
            # Run setup automatically in silent mode
            from webshop.webshop.setup_purchasing import setup_purchasing_interface
            setup_result = setup_purchasing_interface(silent=True)
            
            if setup_result.get("success"):
                frappe.logger().info("Purchasing interface auto-setup completed successfully")
            else:
                frappe.log_error(f"Purchasing interface auto-setup failed: {setup_result.get('message')}", "Auto Setup Error")
                
    except Exception as e:
        frappe.log_error(f"Error during auto-setup check: {str(e)}", "Auto Setup Error")

