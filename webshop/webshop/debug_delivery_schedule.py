#!/usr/bin/env python3

"""
Debug script to test Delivery Schedule creation
Run this in ERPNext bench console to test manually
"""

import frappe
import json

def test_delivery_schedule_creation():
    """Test delivery schedule creation with sample data"""
    
    # Sample POS config similar to what comes from frontend
    sample_pos_config = {
        "fulfillmentMethod": "delivery",
        "selectedDate": "2025-07-31",
        "selectedTime": "08:00:00",
        "selectedCategory": "Vinyl",
        "selectedStyle": "privacy",
        "selectedHeight": "6'",
        "selectedColor": "White",
        "selectedCustomer": {
            "id": "Administrator",
            "name": "Administrator"
        }
    }
    
    print("=== Testing Delivery Schedule Creation ===")
    print(f"Sample POS Config: {sample_pos_config}")
    
    # Check if Delivery Schedule doctype exists
    if not frappe.db.exists("DocType", "Delivery Schedule"):
        print("❌ ERROR: Delivery Schedule doctype not found!")
        print("Make sure fence_supply app is installed")
        return
    else:
        print("✅ Delivery Schedule doctype found")
    
    # Create a sample sales order for testing
    try:
        # Check if test customer exists
        if not frappe.db.exists("Customer", "Test Customer"):
            customer_doc = frappe.new_doc("Customer")
            customer_doc.customer_name = "Test Customer"
            customer_doc.customer_type = "Individual"
            customer_doc.flags.ignore_permissions = True
            customer_doc.insert()
            print("✅ Created test customer")
        
        # Create a minimal sales order
        sales_order = frappe.new_doc("Sales Order")
        sales_order.customer = "Test Customer"
        sales_order.delivery_date = "2025-07-31"
        sales_order.append("items", {
            "item_code": "Test Item",
            "item_name": "Test Fence Item",
            "qty": 1,
            "rate": 100,
            "amount": 100
        })
        sales_order.flags.ignore_permissions = True
        sales_order.insert()
        print(f"✅ Created test sales order: {sales_order.name}")
        
        # Now test the delivery schedule creation function
        from webshop.webshop.shopping_cart.cart import create_delivery_schedule_from_pos
        
        result = create_delivery_schedule_from_pos(sales_order, sample_pos_config)
        
        if result:
            print(f"✅ SUCCESS: Delivery Schedule created: {result}")
            
            # Verify the record exists
            delivery_schedule = frappe.get_doc("Delivery Schedule", result)
            print(f"📋 Delivery Schedule Details:")
            print(f"   - Customer: {delivery_schedule.customer}")
            print(f"   - Date: {delivery_schedule.delivery_date}")
            print(f"   - Time: {delivery_schedule.delivery_time}")
            print(f"   - Status: {delivery_schedule.status}")
            print(f"   - Notes: {delivery_schedule.notes}")
            print(f"   - Items count: {len(delivery_schedule.items)}")
            
        else:
            print("❌ FAILED: Delivery Schedule creation returned None")
            
    except Exception as e:
        print(f"❌ ERROR during testing: {str(e)}")
        import traceback
        print(f"Full traceback: {traceback.format_exc()}")

def test_pos_config_parsing():
    """Test how POS config is parsed from string"""
    
    sample_config_str = '{"fulfillmentMethod":"delivery","selectedDate":"2025-07-31","selectedTime":"08:00:00","selectedCategory":"Vinyl"}'
    
    print("\n=== Testing POS Config Parsing ===")
    print(f"Sample config string: {sample_config_str}")
    
    try:
        parsed_config = json.loads(sample_config_str)
        print(f"✅ Parsed successfully: {parsed_config}")
        print(f"Fulfillment method: {parsed_config.get('fulfillmentMethod')}")
        print(f"Is delivery?: {parsed_config.get('fulfillmentMethod') == 'delivery'}")
    except Exception as e:
        print(f"❌ Parsing failed: {str(e)}")

if __name__ == "__main__":
    # Run tests
    test_pos_config_parsing()
    test_delivery_schedule_creation()
    
    print("\n=== Check Error Logs ===")
    print("Run this in ERPNext to check recent error logs:")
    print("frappe.db.sql(\"SELECT * FROM `tabError Log` ORDER BY creation DESC LIMIT 10\")") 