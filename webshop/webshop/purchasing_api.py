"""
Purchasing API - Backend functions for purchasing interface
Integrates with ERPNext purchasing workflow
Based on POS API structure but adapted for purchasing
"""

import frappe
from frappe import _
from frappe.utils import flt, today, add_days
import json

@frappe.whitelist()
def get_supplier_items(supplier=None, item_group=None, search_term=None, item_type=None):
    """
    Get items available from specific supplier or all suppliers
    Similar to get_fence_items_for_pos but focused on purchasing
    """
    try:
        # Build WHERE conditions
        where_conditions = [
            "i.disabled = 0",
            "i.is_purchase_item = 1",
            "i.has_variants = 0 OR i.variant_of IS NOT NULL"  # Include variants but not templates
        ]
        
        query_params = []
        
        # Filter by supplier if specified
        if supplier:
            where_conditions.append("""
                EXISTS (
                    SELECT 1 FROM `tabItem Supplier` isup 
                    WHERE isup.parent = i.name 
                    AND isup.supplier = %s
                )
            """)
            query_params.append(supplier)
        
        # Filter by item group
        if item_group:
            where_conditions.append("i.item_group = %s")
            query_params.append(item_group)
        
        # Filter by item type (using custom fields if available)
        if item_type:
            where_conditions.append("(i.custom_material_type = %s OR i.item_group = %s)")
            query_params.extend([item_type, item_type])
        
        # Search filter
        if search_term:
            where_conditions.append("(i.item_name LIKE %s OR i.item_code LIKE %s)")
            search_pattern = f"%{search_term}%"
            query_params.extend([search_pattern, search_pattern])
        
        where_clause = " AND ".join(where_conditions)
        
        # Get items with supplier information
        items_query = f"""
            SELECT DISTINCT
                i.name,
                i.item_name,
                i.item_code,
                i.item_group,
                i.stock_uom,
                i.image,
                i.standard_rate,
                i.last_purchase_rate,
                i.is_stock_item,
                i.custom_material_type,
                i.custom_material_class,
                wi.website_image,
                wi.short_description,
                -- Get supplier information
                GROUP_CONCAT(
                    CONCAT(isup.supplier, ':', isup.supplier_part_no, ':', IFNULL(isup.lead_time_days, 0))
                    SEPARATOR '|'
                ) as supplier_info
            FROM `tabItem` i
            LEFT JOIN `tabWebsite Item` wi ON wi.item_code = i.name
            LEFT JOIN `tabItem Supplier` isup ON isup.parent = i.name
            WHERE {where_clause}
            GROUP BY i.name, i.item_name, i.item_code, i.item_group, i.stock_uom,
                     i.image, i.standard_rate, i.last_purchase_rate, i.is_stock_item,
                     i.custom_material_type, i.custom_material_class, wi.website_image,
                     wi.short_description
            ORDER BY i.item_name
            LIMIT 100
        """
        
        items = frappe.db.sql(items_query, query_params, as_dict=True)
        
        # Format items for purchasing interface
        formatted_items = []
        for item in items:
            # Parse supplier information
            suppliers = []
            if item.supplier_info:
                for supplier_data in item.supplier_info.split('|'):
                    if ':' in supplier_data:
                        supplier_parts = supplier_data.split(':')
                        if len(supplier_parts) >= 3:
                            suppliers.append({
                                "supplier": supplier_parts[0],
                                "supplier_part_no": supplier_parts[1],
                                "lead_time_days": int(supplier_parts[2]) if supplier_parts[2] else 0
                            })
            
            formatted_item = {
                "name": item.name,
                "item_name": item.item_name,
                "item_code": item.item_code,
                "item_group": item.item_group,
                "stock_uom": item.stock_uom,
                "image": item.website_image or item.image,
                "standard_rate": float(item.standard_rate or 0),
                "last_purchase_rate": float(item.last_purchase_rate or 0),
                "is_stock_item": item.is_stock_item,
                "custom_material_type": item.custom_material_type,
                "custom_material_class": item.custom_material_class,
                "short_description": item.short_description,
                "suppliers": suppliers,
                "stock_qty": get_item_stock_qty(item.name),
                "reorder_level": get_item_reorder_level(item.name)
            }
            
            # Get supplier-specific pricing if supplier is selected
            if supplier:
                supplier_price = get_supplier_price(item.name, supplier)
                if supplier_price:
                    formatted_item["supplier_price"] = supplier_price
            
            formatted_items.append(formatted_item)
        
        return {"items": formatted_items, "item_count": len(formatted_items)}
        
    except Exception as e:
        frappe.log_error(f"Error in get_supplier_items: {str(e)}")
        return {"items": [], "item_count": 0}

@frappe.whitelist()
def get_supplier_price(item_code, supplier, qty=1):
    """Get supplier-specific price for item"""
    try:
        # Check for supplier quotation first
        supplier_quotation = frappe.db.sql("""
            SELECT sq.name, sqi.rate, sqi.valid_till
            FROM `tabSupplier Quotation` sq
            INNER JOIN `tabSupplier Quotation Item` sqi ON sq.name = sqi.parent
            WHERE sq.supplier = %s 
                AND sqi.item_code = %s 
                AND sq.docstatus = 1
                AND (sqi.valid_till IS NULL OR sqi.valid_till >= %s)
            ORDER BY sq.creation DESC
            LIMIT 1
        """, [supplier, item_code, today()], as_dict=True)
        
        if supplier_quotation:
            return {
                "rate": float(supplier_quotation[0].rate),
                "source": "Supplier Quotation",
                "quotation": supplier_quotation[0].name,
                "valid_till": supplier_quotation[0].valid_till
            }
        
        # Fall back to last purchase rate from this supplier
        last_purchase = frappe.db.sql("""
            SELECT poi.rate, po.transaction_date
            FROM `tabPurchase Order` po
            INNER JOIN `tabPurchase Order Item` poi ON po.name = poi.parent
            WHERE po.supplier = %s 
                AND poi.item_code = %s 
                AND po.docstatus = 1
            ORDER BY po.transaction_date DESC
            LIMIT 1
        """, [supplier, item_code], as_dict=True)
        
        if last_purchase:
            return {
                "rate": float(last_purchase[0].rate),
                "source": "Last Purchase",
                "date": last_purchase[0].transaction_date
            }
        
        # Fall back to item's standard rate
        standard_rate = frappe.db.get_value("Item", item_code, "standard_rate")
        if standard_rate:
            return {
                "rate": float(standard_rate),
                "source": "Standard Rate"
            }
        
        return None
        
    except Exception as e:
        frappe.log_error(f"Error getting supplier price for {item_code}: {str(e)}")
        return None

@frappe.whitelist()
def get_item_stock_qty(item_code, warehouse=None):
    """Get current stock quantity for item"""
    try:
        if not warehouse:
            warehouse = frappe.db.get_single_value("Stock Settings", "default_warehouse")
        
        if warehouse:
            stock_qty = frappe.db.get_value("Bin", {
                "item_code": item_code,
                "warehouse": warehouse
            }, "actual_qty")
            
            return float(stock_qty) if stock_qty else 0.0
        
        return 0.0
        
    except Exception as e:
        frappe.log_error(f"Error getting stock for {item_code}: {str(e)}")
        return 0.0

@frappe.whitelist()
def get_item_reorder_level(item_code, warehouse=None):
    """Get reorder level for item"""
    try:
        if not warehouse:
            warehouse = frappe.db.get_single_value("Stock Settings", "default_warehouse")
        
        reorder_level = frappe.db.get_value("Item Reorder", {
            "parent": item_code,
            "warehouse": warehouse
        }, "warehouse_reorder_level")
        
        return float(reorder_level) if reorder_level else 0.0
        
    except Exception as e:
        frappe.log_error(f"Error getting reorder level for {item_code}: {str(e)}")
        return 0.0

@frappe.whitelist()
def add_to_purchase_cart(item_code, qty=1, supplier=None, warehouse=None):
    """
    Add item to material request cart
    Creates or updates a draft Material Request
    """
    try:
        # Get or create draft material request
        material_request = get_or_create_material_request()
        
        if not material_request:
            return {"success": False, "message": "Failed to create material request"}
        
        # Check if item already exists in material request
        existing_item = None
        for item in material_request.items:
            if item.item_code == item_code:
                existing_item = item
                break
        
        if existing_item:
            # Update quantity
            existing_item.qty = float(existing_item.qty) + float(qty)
        else:
            # Add new item
            item_details = frappe.get_doc("Item", item_code)
            
            # Validate item is purchaseable
            if not item_details.is_purchase_item:
                return {"success": False, "message": f"Item {item_code} is not marked as purchase item"}
            
            # Set default warehouse
            if not warehouse:
                warehouse = frappe.db.get_single_value("Stock Settings", "default_warehouse")
                
            if not warehouse:
                return {"success": False, "message": "No default warehouse found. Please set default warehouse in Stock Settings."}
            
            # Validate required fields
            if not item_details.item_name:
                return {"success": False, "message": f"Item {item_code} missing item name"}
                
            if not item_details.stock_uom:
                return {"success": False, "message": f"Item {item_code} missing stock UOM"}
            
            material_request.append("items", {
                "item_code": item_code,
                "item_name": item_details.item_name,
                "description": item_details.description or item_details.item_name,
                "qty": float(qty),
                "uom": item_details.stock_uom,
                "warehouse": warehouse,
                "schedule_date": add_days(today(), 7),  # Default 7 days
                "item_group": item_details.item_group,
                "conversion_factor": 1.0  # Add conversion factor
            })
        
        # Save material request with validation
        try:
            material_request.save()
            frappe.db.commit()
        except Exception as save_error:
            frappe.db.rollback()
            error_msg = str(save_error)
            if "Data missing in table" in error_msg:
                return {"success": False, "message": "Invalid item data. Please check that the item exists and has all required fields."}
            else:
                return {"success": False, "message": f"Failed to save material request: {error_msg}"}
        
        return {
            "success": True,
            "message": "Item added to purchase cart", 
            "material_request_name": material_request.name,
            "total_qty": sum([float(item.qty) for item in material_request.items])
        }
        
    except Exception as e:
        frappe.log_error(f"Error adding {item_code} to purchase cart: {str(e)}")
        return {"success": False, "message": f"Failed to add item: {str(e)}"}

@frappe.whitelist()
def get_or_create_material_request():
    """
    Get existing draft material request for current user or create new one
    """
    try:
        # Check for existing draft material request by current user
        existing_request = frappe.db.get_value("Material Request", {
            "owner": frappe.session.user,
            "docstatus": 0,
            "material_request_type": "Purchase"
        }, "name")
        
        if existing_request:
            return frappe.get_doc("Material Request", existing_request)
        
        # Create new material request
        company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
        
        if not company:
            frappe.throw("No default company found. Please set default company in Global Defaults.")
        
        material_request = frappe.get_doc({
            "doctype": "Material Request",
            "company": company,
            "transaction_date": today(),
            "schedule_date": add_days(today(), 7),
            "requested_by": frappe.session.user,
            "department": get_user_department(),
            "material_request_type": "Purchase",
            "custom_source": "Purchasing Interface"  # Track source
        })
        
        material_request.insert()
        return material_request
        
    except Exception as e:
        frappe.log_error(f"Error getting/creating material request: {str(e)}")
        return None

@frappe.whitelist()
def get_user_department():
    """Get department for current user"""
    try:
        department = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "department")
        return department
    except:
        return None

@frappe.whitelist()
def get_purchase_cart():
    """Get current purchase cart (draft material request) details"""
    try:
        material_request = get_or_create_material_request()
        
        if not material_request or not material_request.items:
            return {
                "items": [],
                "total_qty": 0,
                "material_request_name": None
            }
        
        # Format items for display
        cart_items = []
        for item in material_request.items:
            cart_items.append({
                "name": item.name,
                "item_code": item.item_code,
                "item_name": item.item_name,
                "description": item.description,
                "qty": float(item.qty),
                "uom": item.uom,
                "warehouse": item.warehouse,
                "schedule_date": str(item.schedule_date) if item.schedule_date else None
            })
        
        return {
            "items": cart_items,
            "total_qty": sum([float(item.qty) for item in material_request.items]),
            "material_request_name": material_request.name,
            "company": material_request.company,
            "requested_by": material_request.requested_by,
            "department": material_request.department
        }
        
    except Exception as e:
        frappe.log_error(f"Error getting purchase cart: {str(e)}")
        return {"items": [], "total_qty": 0}

@frappe.whitelist()
def update_cart_item_qty(item_row_name, new_qty):
    """Update quantity of item in purchase cart"""
    try:
        new_qty = float(new_qty)
        
        if new_qty <= 0:
            return remove_cart_item(item_row_name)
        
        # Get the material request item
        material_request_item = frappe.get_doc("Material Request Item", item_row_name)
        parent_request = frappe.get_doc("Material Request", material_request_item.parent)
        
        # Update quantity
        material_request_item.qty = new_qty
        material_request_item.save()
        
        # Recalculate totals and save parent
        parent_request.save()
        
        return {
            "success": True,
            "message": "Quantity updated"
        }
        
    except Exception as e:
        frappe.log_error(f"Error updating cart item quantity: {str(e)}")
        return {"success": False, "message": f"Failed to update quantity: {str(e)}"}

@frappe.whitelist()
def remove_cart_item(item_row_name):
    """Remove item from purchase cart"""
    try:
        # Get the material request item
        material_request_item = frappe.get_doc("Material Request Item", item_row_name)
        parent_request = frappe.get_doc("Material Request", material_request_item.parent)
        
        # Remove the item
        parent_request.remove(material_request_item)
        parent_request.save()
        
        return {
            "success": True,
            "message": "Item removed from cart"
        }
        
    except Exception as e:
        frappe.log_error(f"Error removing cart item: {str(e)}")
        return {"success": False, "message": f"Failed to remove item: {str(e)}"}

@frappe.whitelist()
def submit_material_request(material_request_name=None):
    """Submit material request for approval"""
    try:
        if not material_request_name:
            material_request = get_or_create_material_request()
            if not material_request:
                return {"success": False, "message": "No draft material request found"}
        else:
            material_request = frappe.get_doc("Material Request", material_request_name)
        
        if not material_request.items:
            return {"success": False, "message": "Cannot submit empty material request"}
        
        # Validate material request
        material_request.validate()
        
        # Submit the material request
        material_request.submit()
        
        return {
            "success": True,
            "message": "Material request submitted successfully",
            "material_request_name": material_request.name,
            "status": material_request.workflow_state or "Submitted"
        }
        
    except Exception as e:
        frappe.log_error(f"Error submitting material request: {str(e)}")
        return {"success": False, "message": f"Failed to submit material request: {str(e)}"}

@frappe.whitelist()
def create_purchase_order_from_material_request(material_request_name, selected_items=None):
    """
    Create purchase order from material request
    Integrates with ERPNext's standard Purchase Order flow
    """
    try:
        from erpnext.buying.doctype.material_request.material_request import make_purchase_order
        
        # Get material request
        material_request = frappe.get_doc("Material Request", material_request_name)
        
        if material_request.docstatus != 1:
            return {"success": False, "message": "Material request must be submitted first"}
        
        # Parse selected items if provided
        if selected_items:
            if isinstance(selected_items, str):
                selected_items = json.loads(selected_items)
        
        # Create purchase order using ERPNext standard function
        purchase_order = make_purchase_order(material_request_name)
        
        # Filter items if selection provided
        if selected_items:
            filtered_items = []
            for item in purchase_order.items:
                if item.material_request_item in selected_items:
                    filtered_items.append(item)
            purchase_order.items = filtered_items
        
        # Save the purchase order
        purchase_order.insert()
        
        return {
            "success": True,
            "message": "Purchase order created successfully",
            "purchase_order_name": purchase_order.name,
            "total_amount": purchase_order.grand_total
        }
        
    except Exception as e:
        frappe.log_error(f"Error creating purchase order from material request: {str(e)}")
        return {"success": False, "message": f"Failed to create purchase order: {str(e)}"}

@frappe.whitelist()
def get_suppliers():
    """Get list of active suppliers"""
    try:
        suppliers = frappe.get_all("Supplier",
            filters={"disabled": 0, "is_frozen": 0},
            fields=["name", "supplier_name", "supplier_group", "country", "default_price_list"],
            order_by="supplier_name"
        )
        
        return suppliers
        
    except Exception as e:
        frappe.log_error(f"Error getting suppliers: {str(e)}")
        return []

@frappe.whitelist()
def search_suppliers(search_term=""):
    """Search suppliers for purchasing interface"""
    try:
        if not search_term or len(search_term) < 2:
            # Return recent suppliers
            suppliers = frappe.get_all("Supplier",
                filters={"disabled": 0, "is_frozen": 0},
                fields=["name", "supplier_name", "supplier_group", "country", "default_price_list"],
                limit=20,
                order_by="modified desc"
            )
        else:
            # Search by name or supplier group
            suppliers = frappe.db.sql("""
                SELECT name, supplier_name, supplier_group, country, default_price_list
                FROM `tabSupplier`
                WHERE disabled = 0 AND is_frozen = 0
                AND (
                    supplier_name LIKE %(search)s 
                    OR supplier_group LIKE %(search)s
                    OR name LIKE %(search)s
                )
                ORDER BY supplier_name
                LIMIT 20
            """, {
                "search": f"%{search_term}%"
            }, as_dict=True)
        
        return suppliers
        
    except Exception as e:
        frappe.log_error(f"Error searching suppliers: {str(e)}")
        return []

@frappe.whitelist()
def get_purchase_analytics():
    """Get purchasing analytics for dashboard"""
    try:
        analytics = {}
        
        # Pending material requests
        analytics["pending_material_requests"] = frappe.db.count("Material Request", {
            "docstatus": 1,
            "material_request_type": "Purchase",
            "status": ["in", ["Pending", "Partially Ordered"]]
        })
        
        # Open purchase orders
        analytics["open_purchase_orders"] = frappe.db.count("Purchase Order", {
            "docstatus": 1,
            "status": ["not in", ["Completed", "Closed", "Cancelled"]]
        })
        
        # Items below reorder level
        analytics["items_to_reorder"] = get_items_below_reorder_level_count()
        
        # Monthly purchase value (current month)
        from frappe.utils import get_first_day, get_last_day
        current_month_start = get_first_day(today())
        current_month_end = get_last_day(today())
        
        monthly_purchase_value = frappe.db.sql("""
            SELECT IFNULL(SUM(grand_total), 0) as total
            FROM `tabPurchase Order`
            WHERE docstatus = 1
            AND transaction_date BETWEEN %s AND %s
        """, [current_month_start, current_month_end])[0][0]
        
        analytics["monthly_purchase_value"] = float(monthly_purchase_value or 0)
        
        return analytics
        
    except Exception as e:
        frappe.log_error(f"Error getting purchase analytics: {str(e)}")
        return {}

def get_items_below_reorder_level_count():
    """Get count of items below reorder level"""
    try:
        count = frappe.db.sql("""
            SELECT COUNT(DISTINCT ir.parent) as count
            FROM `tabItem Reorder` ir
            INNER JOIN `tabBin` b ON ir.parent = b.item_code AND ir.warehouse = b.warehouse
            WHERE b.actual_qty <= ir.warehouse_reorder_level
            AND ir.warehouse_reorder_level > 0
        """)[0][0]
        
        return int(count or 0)
        
    except Exception as e:
        frappe.log_error(f"Error getting reorder count: {str(e)}")
        return 0

@frappe.whitelist()
def get_items_below_reorder_level():
    """Get items that are below reorder level"""
    try:
        items = frappe.db.sql("""
            SELECT 
                i.name,
                i.item_name,
                i.item_code,
                b.actual_qty,
                ir.warehouse_reorder_level,
                ir.warehouse_reorder_qty,
                ir.warehouse,
                i.item_group
            FROM `tabItem Reorder` ir
            INNER JOIN `tabBin` b ON ir.parent = b.item_code AND ir.warehouse = b.warehouse
            INNER JOIN `tabItem` i ON ir.parent = i.name
            WHERE b.actual_qty <= ir.warehouse_reorder_level
            AND ir.warehouse_reorder_level > 0
            AND i.disabled = 0
            ORDER BY (ir.warehouse_reorder_level - b.actual_qty) DESC
            LIMIT 50
        """, as_dict=True)
        
        return items
        
    except Exception as e:
        frappe.log_error(f"Error getting items below reorder level: {str(e)}")
        return []

@frappe.whitelist()
def debug_item_for_purchasing(item_code):
    """Debug function to check if an item is suitable for purchasing"""
    try:
        # Get item details
        item = frappe.get_doc("Item", item_code)
        
        # Check all requirements
        checks = {
            "item_exists": bool(item),
            "is_purchase_item": getattr(item, 'is_purchase_item', False),
            "not_disabled": not getattr(item, 'disabled', True),
            "has_item_name": bool(getattr(item, 'item_name', None)),
            "has_stock_uom": bool(getattr(item, 'stock_uom', None)),
            "has_item_group": bool(getattr(item, 'item_group', None)),
            "not_template": not getattr(item, 'has_variants', False) or bool(getattr(item, 'variant_of', None))
        }
        
        # Get system requirements
        default_warehouse = frappe.db.get_single_value("Stock Settings", "default_warehouse")
        default_company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
        
        system_checks = {
            "has_default_warehouse": bool(default_warehouse),
            "has_default_company": bool(default_company)
        }
        
        # Overall status
        all_passed = all(checks.values()) and all(system_checks.values())
        
        return {
            "item_code": item_code,
            "suitable_for_purchasing": all_passed,
            "item_checks": checks,
            "system_checks": system_checks,
            "item_details": {
                "item_name": getattr(item, 'item_name', None),
                "stock_uom": getattr(item, 'stock_uom', None),
                "item_group": getattr(item, 'item_group', None),
                "is_purchase_item": getattr(item, 'is_purchase_item', False),
                "disabled": getattr(item, 'disabled', True),
                "has_variants": getattr(item, 'has_variants', False),
                "variant_of": getattr(item, 'variant_of', None)
            },
            "system_settings": {
                "default_warehouse": default_warehouse,
                "default_company": default_company
            }
        }
        
    except Exception as e:
        return {
            "item_code": item_code,
            "error": str(e),
            "suitable_for_purchasing": False
        }

@frappe.whitelist()
def get_purchase_item_requirements():
    """Get system requirements for purchase items"""
    try:
        # Check system settings
        default_warehouse = frappe.db.get_single_value("Stock Settings", "default_warehouse")
        default_company = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
        
        # Count purchase items
        total_items = frappe.db.count("Item", {"disabled": 0})
        purchase_items = frappe.db.count("Item", {"disabled": 0, "is_purchase_item": 1})
        
        # Get sample purchase items
        sample_items = frappe.get_all("Item", 
            filters={"disabled": 0, "is_purchase_item": 1},
            fields=["name", "item_name", "stock_uom", "item_group"],
            limit=5
        )
        
        return {
            "system_ready": bool(default_warehouse and default_company),
            "system_settings": {
                "default_warehouse": default_warehouse,
                "default_company": default_company,
                "current_user": frappe.session.user
            },
            "item_counts": {
                "total_items": total_items,
                "purchase_items": purchase_items,
                "percentage": round((purchase_items / total_items * 100), 2) if total_items > 0 else 0
            },
            "sample_purchase_items": sample_items,
            "requirements": {
                "item_must_have": [
                    "is_purchase_item = 1",
                    "disabled = 0", 
                    "item_name is not null",
                    "stock_uom is not null",
                    "item_group is not null"
                ],
                "system_must_have": [
                    "Default warehouse in Stock Settings",
                    "Default company in Global Defaults"
                ]
            }
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "system_ready": False
        }

