#!/usr/bin/env python3
"""
Script to add custom_popular field to Item doctype for POS Popular Items functionality
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_field

def setup_popular_field():
    """Create the custom_popular field in Item doctype"""
    
    # Check if field already exists
    if frappe.db.exists("Custom Field", {"dt": "Item", "fieldname": "custom_popular"}):
        print("✅ custom_popular field already exists in Item doctype")
        return True
    
    try:
        # Create the custom field
        custom_field = {
            "dt": "Item",
            "fieldname": "custom_popular",
            "fieldtype": "Check",
            "label": "Popular Item",
            "description": "Mark this item as popular for POS display",
            "default": "0",
            "insert_after": "published_in_website",
            "permlevel": 0
        }
        
        # Use create_custom_field function
        create_custom_field("Item", custom_field)
        
        print("✅ Successfully created custom_popular field in Item doctype")
        frappe.db.commit()
        return True
        
    except Exception as e:
        print(f"❌ Error creating custom_popular field: {str(e)}")
        frappe.log_error(f"Error creating custom_popular field: {str(e)}")
        return False

def mark_sample_items_as_popular():
    """Mark some sample items as popular for testing"""
    try:
        # Get first few items and mark them as popular
        items = frappe.get_all("Item", 
                              filters={"disabled": 0, "is_sales_item": 1}, 
                              fields=["name"], 
                              limit=5)
        
        count = 0
        for item in items:
            try:
                frappe.db.set_value("Item", item.name, "custom_popular", 1)
                count += 1
            except Exception as e:
                print(f"Warning: Could not update item {item.name}: {str(e)}")
                continue
        
        if count > 0:
            frappe.db.commit()
            print(f"✅ Marked {count} items as popular for testing")
        else:
            print("⚠️ No items were marked as popular")
            
    except Exception as e:
        print(f"❌ Error marking items as popular: {str(e)}")
        frappe.log_error(f"Error marking sample items as popular: {str(e)}")

if __name__ == "__main__":
    # Initialize Frappe
    frappe.init()
    frappe.connect()
    
    print("🚀 Setting up Popular Items functionality...")
    
    # Setup the custom field
    if setup_popular_field():
        # Mark some sample items as popular
        mark_sample_items_as_popular()
        print("🎉 Popular Items setup completed successfully!")
    else:
        print("❌ Setup failed")
    
    frappe.destroy()