"""
Purchase workflow hooks and customizations
Integrates purchasing interface with ERPNext purchasing flow
"""

import frappe
from frappe import _

def setup_purchase_custom_fields():
    """Setup custom fields for purchase workflow integration"""
    
    # Add source field to Material Request to track interface source
    material_request_fields = [
        {
            "fieldname": "custom_source",
            "fieldtype": "Data",
            "label": "Source",
            "description": "Source of the purchase requisition",
            "insert_after": "company",
            "read_only": 1
        },
        {
            "fieldname": "custom_purchasing_interface_data",
            "fieldtype": "Long Text",
            "label": "Purchasing Interface Data",
            "description": "Additional data from purchasing interface",
            "insert_after": "custom_source",
            "hidden": 1
        }
    ]
    
    for field in material_request_fields:
        create_custom_field("Material Request", field)
    
    # Add fields to Purchase Order
    purchase_order_fields = [
        {
            "fieldname": "custom_source_requisition",
            "fieldtype": "Link",
            "options": "Purchase Requisition", 
            "label": "Source Requisition",
            "description": "Purchase Requisition that generated this order",
            "insert_after": "supplier"
        },
        {
            "fieldname": "custom_purchasing_notes",
            "fieldtype": "Text",
            "label": "Purchasing Notes",
            "description": "Notes from purchasing interface",
            "insert_after": "custom_source_requisition"
        }
    ]
    
    for field in purchase_order_fields:
        create_custom_field("Purchase Order", field)
    
    # Add purchasing-specific fields to Item
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
            "label": "Lead Time (Days)",
            "description": "Standard lead time for procurement",
            "insert_after": "custom_preferred_supplier",
            "default": 7
        }
    ]
    
    for field in item_fields:
        create_custom_field("Item", field)

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
        frappe.db.commit()

def before_material_request_save(doc, method):
    """Hook: Before Material Request save"""
    # Add any pre-save logic for material requests created via interface
    if hasattr(doc, 'custom_source') and doc.custom_source == "Purchasing Interface":
        # Validate or modify material request as needed
        validate_purchasing_interface_material_request(doc)

def validate_purchasing_interface_material_request(doc):
    """Validate material request created from purchasing interface"""
    
    # Ensure all required fields are populated
    if not doc.requested_by:
        doc.requested_by = frappe.session.user
    
    if not doc.department:
        # Try to get department from employee
        department = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "department")
        if department:
            doc.department = department
    
    # Set default schedule date if not provided
    if not doc.schedule_date:
        from frappe.utils import add_days, today
        doc.schedule_date = add_days(today(), 7)
    
    # Validate items
    for item in doc.items:
        if not item.warehouse:
            # Set default warehouse
            default_warehouse = frappe.db.get_single_value("Stock Settings", "default_warehouse")
            if default_warehouse:
                item.warehouse = default_warehouse
        
        if not item.schedule_date:
            from frappe.utils import add_days, today
            lead_time = frappe.db.get_value("Item", item.item_code, "custom_lead_time_days") or 7
            item.schedule_date = add_days(today(), lead_time)

def after_material_request_submit(doc, method):
    """Hook: After Material Request submit"""
    if hasattr(doc, 'custom_source') and doc.custom_source == "Purchasing Interface":
        # Log submission
        frappe.logger().info(f"Material Request {doc.name} submitted from Purchasing Interface by {frappe.session.user}")
        
        # Send notification if configured
        send_material_request_notification(doc)

def send_material_request_notification(doc):
    """Send notification for submitted material request"""
    try:
        # Get purchase manager or relevant users to notify
        purchase_managers = frappe.get_all("User", 
            filters={"role_profile_name": ["like", "%Purchase%"]},
            fields=["email", "full_name"],
            limit=10
        )
        
        if purchase_managers:
            recipients = [pm["email"] for pm in purchase_managers if pm["email"]]
            
            if recipients:
                frappe.sendmail(
                    recipients=recipients,
                    subject=f"New Material Request: {doc.name}",
                    message=f"""
                    <p>A new material request has been submitted:</p>
                    <ul>
                        <li><strong>Material Request:</strong> {doc.name}</li>
                        <li><strong>Requested By:</strong> {doc.requested_by}</li>
                        <li><strong>Department:</strong> {doc.department or 'N/A'}</li>
                        <li><strong>Items:</strong> {len(doc.items)}</li>
                    </ul>
                    <p><a href="{frappe.utils.get_url()}/app/material-request/{doc.name}">View Material Request</a></p>
                    """,
                    header="Material Request Notification"
                )
    except Exception as e:
        frappe.log_error(f"Error sending purchase requisition notification: {str(e)}")

def before_purchase_order_save(doc, method):
    """Hook: Before Purchase Order save"""
    # Link back to source requisition if available
    if doc.items:
        # Check if any item has a purchase_requisition reference
        for item in doc.items:
            if hasattr(item, 'purchase_requisition') and item.purchase_requisition:
                if not hasattr(doc, 'custom_source_requisition') or not doc.custom_source_requisition:
                    doc.custom_source_requisition = item.purchase_requisition
                break

def after_purchase_order_submit(doc, method):
    """Hook: After Purchase Order submit"""
    if hasattr(doc, 'custom_source_requisition') and doc.custom_source_requisition:
        # Update requisition status or add notes
        try:
            requisition = frappe.get_doc("Purchase Requisition", doc.custom_source_requisition)
            
            # Add comment about PO creation
            requisition.add_comment("Info", f"Purchase Order {doc.name} created from this requisition")
            
            frappe.logger().info(f"Purchase Order {doc.name} created from Requisition {doc.custom_source_requisition}")
        except Exception as e:
            frappe.log_error(f"Error updating source requisition: {str(e)}")

# Purchase Receipt hooks
def after_purchase_receipt_submit(doc, method):
    """Hook: After Purchase Receipt submit"""
    # Update stock levels and trigger reorder notifications if needed
    update_reorder_notifications(doc)

def update_reorder_notifications(doc):
    """Check if any items need reordering after receipt"""
    try:
        for item in doc.items:
            # Get current stock and reorder level
            current_stock = frappe.db.get_value("Bin", {
                "item_code": item.item_code,
                "warehouse": item.warehouse
            }, "actual_qty") or 0
            
            reorder_level = frappe.db.get_value("Item Reorder", {
                "parent": item.item_code,
                "warehouse": item.warehouse
            }, "warehouse_reorder_level") or 0
            
            # If still below reorder level, create notification
            if current_stock <= reorder_level and reorder_level > 0:
                create_reorder_notification(item.item_code, item.warehouse, current_stock, reorder_level)
                
    except Exception as e:
        frappe.log_error(f"Error checking reorder notifications: {str(e)}")

def create_reorder_notification(item_code, warehouse, current_stock, reorder_level):
    """Create reorder notification"""
    try:
        # Check if notification already exists
        existing = frappe.db.exists("ToDo", {
            "description": ["like", f"%{item_code}%reorder%"],
            "status": "Open"
        })
        
        if not existing:
            frappe.get_doc({
                "doctype": "ToDo",
                "description": f"Item {item_code} in {warehouse} is below reorder level. Current: {current_stock}, Reorder Level: {reorder_level}",
                "priority": "Medium",
                "status": "Open",
                "allocated_to": frappe.session.user,
                "reference_type": "Item",
                "reference_name": item_code
            }).insert(ignore_permissions=True)
            
    except Exception as e:
        frappe.log_error(f"Error creating reorder notification: {str(e)}")

# Document event handlers
doc_events = {
    "Material Request": {
        "before_save": "webshop.webshop.purchase_hooks.before_material_request_save",
        "on_submit": "webshop.webshop.purchase_hooks.after_material_request_submit"
    },
    "Purchase Order": {
        "before_save": "webshop.webshop.purchase_hooks.before_purchase_order_save", 
        "on_submit": "webshop.webshop.purchase_hooks.after_purchase_order_submit"
    },
    "Purchase Receipt": {
        "on_submit": "webshop.webshop.purchase_hooks.after_purchase_receipt_submit"
    }
}

