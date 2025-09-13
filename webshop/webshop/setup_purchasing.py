"""
Setup script for purchasing interface
Run this to initialize purchasing functionality
"""

import frappe
from frappe import _

@frappe.whitelist()
def setup_purchasing_interface(silent=False):
    """
    Complete setup for purchasing interface
    Creates custom fields, price lists, and initial data
    """
    try:
        # Check if already set up
        if is_purchasing_setup_complete():
            if not silent:
                return {
                    "success": True,
                    "message": "Purchasing interface is already set up"
                }
            else:
                return {"success": True, "message": "Already set up"}
        
        # Setup custom fields
        setup_purchase_custom_fields()
        
        # Setup purchasing price lists
        setup_purchasing_price_lists()
        
        # Setup default purchasing settings
        setup_purchasing_settings()
        
        # Setup supplier categories
        setup_supplier_groups()
        
        # Setup purchase approval workflow (optional)
        setup_purchase_approval_workflow()
        
        # Mark setup as complete
        mark_setup_complete()
        
        return {
            "success": True,
            "message": "Purchasing interface setup completed successfully"
        }
        
    except Exception as e:
        frappe.log_error(f"Error setting up purchasing interface: {str(e)}")
        return {
            "success": False,
            "message": f"Setup failed: {str(e)}"
        }

def is_purchasing_setup_complete():
    """Check if purchasing setup has been completed"""
    try:
        # Check for key indicators that setup is complete
        indicators = [
            frappe.db.exists("Custom Field", {"dt": "Material Request", "fieldname": "custom_source"}),
            frappe.db.exists("Price List", "Standard Buying"),
            frappe.db.exists("Supplier Group", "Fence Materials")
        ]
        
        return all(indicators)
    except:
        return False

def mark_setup_complete():
    """Mark setup as complete"""
    try:
        # Create a system setting to track setup completion
        if not frappe.db.exists("System Settings"):
            frappe.get_doc({"doctype": "System Settings"}).insert()
        
        # Add custom field to track setup
        if not frappe.db.exists("Custom Field", {"dt": "System Settings", "fieldname": "purchasing_interface_setup"}):
            frappe.get_doc({
                "doctype": "Custom Field",
                "dt": "System Settings",
                "fieldname": "purchasing_interface_setup",
                "fieldtype": "Check",
                "label": "Purchasing Interface Setup Complete",
                "default": "1",
                "read_only": 1
            }).insert(ignore_permissions=True)
            
        frappe.db.commit()
    except Exception as e:
        frappe.log_error(f"Error marking setup complete: {str(e)}")

def setup_purchase_custom_fields():
    """Setup custom fields for purchasing workflow"""
    
    # Material Request custom fields
    material_request_fields = [
        {
            "fieldname": "custom_source",
            "fieldtype": "Select",
            "options": "\nPurchasing Interface\nManual Entry\nAPI\nBulk Import",
            "label": "Source",
            "description": "Source of the purchase requisition",
            "insert_after": "company",
            "default": "Manual Entry"
        },
        {
            "fieldname": "custom_purchase_reason",
            "fieldtype": "Select",
            "options": "\nStock Replenishment\nNew Project\nEmergency Purchase\nMaintenance\nOther",
            "label": "Purchase Reason",
            "description": "Reason for the purchase",
            "insert_after": "custom_source"
        },
        {
            "fieldname": "custom_priority",
            "fieldtype": "Select",
            "options": "\nLow\nMedium\nHigh\nUrgent",
            "label": "Priority",
            "description": "Purchase priority level",
            "insert_after": "custom_purchase_reason",
            "default": "Medium"
        },
        {
            "fieldname": "custom_budget_account",
            "fieldtype": "Link",
            "options": "Account",
            "label": "Budget Account",
            "description": "Account to charge for budget control",
            "insert_after": "custom_priority"
        },
        {
            "fieldname": "custom_approval_status",
            "fieldtype": "Select",
            "options": "\nPending\nApproved\nRejected\nConditional",
            "label": "Approval Status", 
            "description": "Current approval status",
            "insert_after": "custom_budget_account",
            "default": "Pending",
            "read_only": 1
        }
    ]
    
    for field in material_request_fields:
        create_custom_field("Material Request", field)
    
    # Purchase Order custom fields
    purchase_order_fields = [
        {
            "fieldname": "custom_source_material_request",
            "fieldtype": "Link",
            "options": "Material Request",
            "label": "Source Material Request",
            "description": "Material Request that generated this order",
            "insert_after": "supplier"
        },
        {
            "fieldname": "custom_purchase_category",
            "fieldtype": "Select",
            "options": "\nRegular\nEmergency\nCapital\nMaintenance",
            "label": "Purchase Category",
            "description": "Category of purchase",
            "insert_after": "custom_source_material_request",
            "default": "Regular"
        },
        {
            "fieldname": "custom_payment_priority",
            "fieldtype": "Select",
            "options": "\nStandard\nExpress\nImmediate",
            "label": "Payment Priority",
            "description": "Payment processing priority",
            "insert_after": "custom_purchase_category",
            "default": "Standard"
        }
    ]
    
    for field in purchase_order_fields:
        create_custom_field("Purchase Order", field)
    
    # Item custom fields for purchasing
    item_fields = [
        {
            "fieldname": "custom_purchasing_category",
            "fieldtype": "Data",
            "label": "Purchasing Category",
            "description": "Category for purchasing interface grouping",
            "insert_after": "item_group"
        },
        {
            "fieldname": "custom_preferred_supplier",
            "fieldtype": "Link",
            "options": "Supplier",
            "label": "Preferred Supplier",
            "description": "Default supplier for this item",
            "insert_after": "custom_purchasing_category"
        },
        {
            "fieldname": "custom_lead_time_days",
            "fieldtype": "Int",
            "label": "Standard Lead Time (Days)",
            "description": "Standard lead time for procurement",
            "insert_after": "custom_preferred_supplier",
            "default": 7
        },
        {
            "fieldname": "custom_minimum_order_qty",
            "fieldtype": "Float",
            "label": "Minimum Order Quantity",
            "description": "Minimum quantity that must be ordered",
            "insert_after": "custom_lead_time_days",
            "default": 1
        },
        {
            "fieldname": "custom_purchasing_notes",
            "fieldtype": "Text",
            "label": "Purchasing Notes",
            "description": "Special notes for purchasing this item",
            "insert_after": "custom_minimum_order_qty"
        }
    ]
    
    for field in item_fields:
        create_custom_field("Item", field)
    
    # Supplier custom fields
    supplier_fields = [
        {
            "fieldname": "custom_supplier_rating",
            "fieldtype": "Select",
            "options": "\n5 - Excellent\n4 - Good\n3 - Average\n2 - Below Average\n1 - Poor",
            "label": "Supplier Rating",
            "description": "Overall supplier performance rating",
            "insert_after": "supplier_group"
        },
        {
            "fieldname": "custom_preferred_payment_terms",
            "fieldtype": "Link",
            "options": "Payment Terms Template",
            "label": "Preferred Payment Terms",
            "description": "Default payment terms for this supplier",
            "insert_after": "custom_supplier_rating"
        },
        {
            "fieldname": "custom_delivery_performance",
            "fieldtype": "Percent",
            "label": "On-Time Delivery Rate",
            "description": "Percentage of on-time deliveries",
            "insert_after": "custom_preferred_payment_terms"
        },
        {
            "fieldname": "custom_quality_rating",
            "fieldtype": "Select",
            "options": "\nExcellent\nGood\nAverage\nPoor",
            "label": "Quality Rating",
            "description": "Quality of products from this supplier",
            "insert_after": "custom_delivery_performance",
            "default": "Good"
        }
    ]
    
    for field in supplier_fields:
        create_custom_field("Supplier", field)

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

def setup_purchasing_price_lists():
    """Create purchasing-specific price lists"""
    price_lists = [
        {
            "name": "Standard Buying",
            "currency": "USD",
            "enabled": 1,
            "buying": 1,
            "selling": 0
        },
        {
            "name": "Emergency Purchase",
            "currency": "USD", 
            "enabled": 1,
            "buying": 1,
            "selling": 0
        },
        {
            "name": "Bulk Purchase",
            "currency": "USD",
            "enabled": 1,
            "buying": 1,
            "selling": 0
        },
        {
            "name": "Preferred Supplier",
            "currency": "USD",
            "enabled": 1,
            "buying": 1,
            "selling": 0
        }
    ]
    
    for price_list_data in price_lists:
        if not frappe.db.exists("Price List", price_list_data["name"]):
            price_list = frappe.get_doc({
                "doctype": "Price List",
                "price_list_name": price_list_data["name"],
                **price_list_data
            })
            price_list.insert(ignore_permissions=True)

def setup_purchasing_settings():
    """Configure purchasing-related settings"""
    
    # Update Buying Settings
    buying_settings = frappe.get_single("Buying Settings")
    buying_settings.auto_create_purchase_receipt = 0
    buying_settings.maintain_same_rate = 1
    buying_settings.allow_multiple_items = 1
    buying_settings.save(ignore_permissions=True)
    
    # Update Stock Settings for purchasing
    stock_settings = frappe.get_single("Stock Settings")
    if not stock_settings.auto_insert_price_list_rate:
        stock_settings.auto_insert_price_list_rate = 1
        stock_settings.save(ignore_permissions=True)

def setup_supplier_groups():
    """Create default supplier groups"""
    supplier_groups = [
        "Fence Materials",
        "Hardware Supplies", 
        "Tools & Equipment",
        "Office Supplies",
        "Maintenance",
        "Professional Services",
        "Raw Materials",
        "Packaging",
        "Transportation"
    ]
    
    for group_name in supplier_groups:
        if not frappe.db.exists("Supplier Group", group_name):
            supplier_group = frappe.get_doc({
                "doctype": "Supplier Group",
                "supplier_group_name": group_name
            })
            supplier_group.insert(ignore_permissions=True)

def setup_purchase_approval_workflow():
    """Setup basic purchase approval workflow"""
    try:
        # Create workflow states
        workflow_states = [
            {
                "state": "Draft",
                "doc_status": 0,
                "allow_edit": "Purchasing User"
            },
            {
                "state": "Pending Approval",
                "doc_status": 0,
                "allow_edit": "Purchasing Manager"
            },
            {
                "state": "Approved",
                "doc_status": 1,
                "allow_edit": "System Manager"
            },
            {
                "state": "Rejected",
                "doc_status": 2,
                "allow_edit": "System Manager"
            }
        ]
        
        # Create workflow if it doesn't exist
        workflow_name = "Purchase Requisition Approval"
        if not frappe.db.exists("Workflow", workflow_name):
            workflow = frappe.get_doc({
                "doctype": "Workflow",
                "workflow_name": workflow_name,
                "document_type": "Purchase Requisition",
                "is_active": 1,
                "send_email_alert": 1,
                "workflow_state_field": "custom_approval_status",
                "states": [],
                "transitions": []
            })
            
            # Add states
            for state in workflow_states:
                workflow.append("states", state)
            
            # Add transitions
            transitions = [
                {
                    "state": "Draft",
                    "action": "Submit for Approval",
                    "next_state": "Pending Approval",
                    "allowed": "Purchasing User",
                    "allow_self_approval": 0
                },
                {
                    "state": "Pending Approval", 
                    "action": "Approve",
                    "next_state": "Approved",
                    "allowed": "Purchasing Manager",
                    "allow_self_approval": 0
                },
                {
                    "state": "Pending Approval",
                    "action": "Reject", 
                    "next_state": "Rejected",
                    "allowed": "Purchasing Manager",
                    "allow_self_approval": 0
                }
            ]
            
            for transition in transitions:
                workflow.append("transitions", transition)
            
            workflow.insert(ignore_permissions=True)
            
    except Exception as e:
        frappe.log_error(f"Error setting up workflow: {str(e)}")
        # Workflow setup is optional, don't fail the entire setup

@frappe.whitelist()
def create_sample_purchasing_data():
    """Create sample data for testing purchasing interface"""
    try:
        # Create sample suppliers
        sample_suppliers = [
            {
                "supplier_name": "ABC Fence Materials",
                "supplier_group": "Fence Materials",
                "country": "United States",
                "custom_supplier_rating": "4 - Good",
                "custom_quality_rating": "Good"
            },
            {
                "supplier_name": "Hardware Plus Inc",
                "supplier_group": "Hardware Supplies", 
                "country": "United States",
                "custom_supplier_rating": "5 - Excellent",
                "custom_quality_rating": "Excellent"
            },
            {
                "supplier_name": "Office Depot",
                "supplier_group": "Office Supplies",
                "country": "United States",
                "custom_supplier_rating": "3 - Average",
                "custom_quality_rating": "Average"
            }
        ]
        
        created_suppliers = []
        for supplier_data in sample_suppliers:
            if not frappe.db.exists("Supplier", supplier_data["supplier_name"]):
                supplier = frappe.get_doc({
                    "doctype": "Supplier",
                    **supplier_data
                })
                supplier.insert(ignore_permissions=True)
                created_suppliers.append(supplier.name)
        
        # Update existing items with purchasing data
        update_items_with_purchasing_data()
        
        return {
            "success": True,
            "message": f"Created {len(created_suppliers)} sample suppliers and updated items",
            "suppliers": created_suppliers
        }
        
    except Exception as e:
        frappe.log_error(f"Error creating sample data: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to create sample data: {str(e)}"
        }

def update_items_with_purchasing_data():
    """Update existing items with purchasing-related data"""
    try:
        # Get items that need purchasing data
        items = frappe.get_all("Item", 
            filters={"disabled": 0, "is_purchase_item": 1},
            fields=["name", "item_name", "item_group"],
            limit=50
        )
        
        for item in items:
            # Set purchasing category based on item group
            purchasing_category = map_item_group_to_purchasing_category(item.item_group)
            
            # Set preferred supplier based on category
            preferred_supplier = get_preferred_supplier_for_category(purchasing_category)
            
            # Update item
            frappe.db.set_value("Item", item.name, {
                "custom_purchasing_category": purchasing_category,
                "custom_preferred_supplier": preferred_supplier,
                "custom_lead_time_days": 7,
                "custom_minimum_order_qty": 1
            })
        
        frappe.db.commit()
        
    except Exception as e:
        frappe.log_error(f"Error updating items with purchasing data: {str(e)}")

def map_item_group_to_purchasing_category(item_group):
    """Map item group to purchasing category"""
    category_mapping = {
        "Vinyl Fence": "Fence Materials",
        "Aluminum Fence": "Fence Materials", 
        "Pressure Treated Fence": "Fence Materials",
        "Hardware": "Hardware Supplies",
        "Tools": "Tools & Equipment",
        "Office": "Office Supplies"
    }
    
    # Check for exact match first
    if item_group in category_mapping:
        return category_mapping[item_group]
    
    # Check for partial matches
    item_group_lower = item_group.lower() if item_group else ""
    
    if "fence" in item_group_lower:
        return "Fence Materials"
    elif "hardware" in item_group_lower:
        return "Hardware Supplies"
    elif "tool" in item_group_lower:
        return "Tools & Equipment"
    elif "office" in item_group_lower:
        return "Office Supplies"
    else:
        return "General Supplies"

def get_preferred_supplier_for_category(category):
    """Get preferred supplier for a purchasing category"""
    supplier_mapping = {
        "Fence Materials": "ABC Fence Materials",
        "Hardware Supplies": "Hardware Plus Inc",
        "Office Supplies": "Office Depot"
    }
    
    supplier_name = supplier_mapping.get(category)
    if supplier_name and frappe.db.exists("Supplier", supplier_name):
        return supplier_name
    
    return None

@frappe.whitelist()
def reset_purchasing_setup():
    """Reset purchasing setup (for development/testing)"""
    try:
        # Delete custom fields
        custom_fields = frappe.get_all("Custom Field", 
            filters={"fieldname": ["like", "custom_%"]},
            fields=["name"]
        )
        
        for field in custom_fields:
            frappe.delete_doc("Custom Field", field.name, ignore_permissions=True)
        
        # Delete sample price lists
        sample_price_lists = ["Emergency Purchase", "Bulk Purchase", "Preferred Supplier"]
        for price_list in sample_price_lists:
            if frappe.db.exists("Price List", price_list):
                frappe.delete_doc("Price List", price_list, ignore_permissions=True)
        
        frappe.db.commit()
        
        return {
            "success": True,
            "message": "Purchasing setup reset successfully"
        }
        
    except Exception as e:
        frappe.log_error(f"Error resetting purchasing setup: {str(e)}")
        return {
            "success": False,
            "message": f"Reset failed: {str(e)}"
        }

