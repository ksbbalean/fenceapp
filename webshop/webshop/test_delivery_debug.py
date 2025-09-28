#!/usr/bin/env python3

"""
Debug script to test delivery schedule creation step by step
Run this in ERPNext bench console to test manually
"""

import frappe
import json

def debug_delivery_schedule():
    """Debug delivery schedule creation step by step"""
    
    print("=== DELIVERY SCHEDULE DEBUG TEST ===")
    
    # Step 1: Check if Delivery Schedule doctype exists
    print("\n1. Checking if Delivery Schedule doctype exists...")
    if frappe.db.exists("DocType", "Delivery Schedule"):
        print("✅ Delivery Schedule doctype found")
    else:
        print("❌ Delivery Schedule doctype NOT found - fence_supply app not installed")
        return
    
    # Step 2: Check recent sales orders
    print("\n2. Checking recent sales orders...")
    recent_orders = frappe.db.sql("""
        SELECT name, customer, creation, modified 
        FROM `tabSales Order` 
        WHERE creation >= CURDATE() 
        ORDER BY creation DESC 
        LIMIT 5
    """, as_dict=True)
    
    for order in recent_orders:
        print(f"   Order: {order.name} | Customer: {order.customer} | Created: {order.creation}")
    
    if not recent_orders:
        print("❌ No recent sales orders found")
        return
    
    latest_order_name = recent_orders[0].name
    print(f"\n3. Using latest sales order: {latest_order_name}")
    
    # Step 3: Get the sales order
    try:
        sales_order = frappe.get_doc("Sales Order", latest_order_name)
        print(f"✅ Sales order loaded: {sales_order.name}")
        print(f"   Customer: {sales_order.customer}")
        print(f"   Items count: {len(sales_order.items)}")
    except Exception as e:
        print(f"❌ Error loading sales order: {e}")
        return
    
    # Step 4: Test POS config parsing
    print("\n4. Testing POS config parsing...")
    test_config_str = '{"fulfillmentMethod":"delivery","selectedDate":"2025-07-31","selectedTime":"09:00:00","selectedCategory":"Vinyl","selectedStyle":"privacy","selectedHeight":"6\'","selectedColor":"White"}'
    
    try:
        parsed_config = json.loads(test_config_str)
        print("✅ POS config parsed successfully")
        print(f"   Fulfillment method: {parsed_config.get('fulfillmentMethod')}")
        print(f"   Date: {parsed_config.get('selectedDate')}")
        print(f"   Time: {parsed_config.get('selectedTime')}")
        print(f"   Is delivery?: {parsed_config.get('fulfillmentMethod') == 'delivery'}")
    except Exception as e:
        print(f"❌ Error parsing POS config: {e}")
        return
    
    # Step 5: Test delivery schedule creation function directly
    print("\n5. Testing delivery schedule creation...")
    try:
        from webshop.webshop.shopping_cart.cart import create_delivery_schedule_from_pos
        
        result = create_delivery_schedule_from_pos(sales_order, parsed_config)
        
        if result:
            print(f"✅ Delivery schedule created: {result}")
            
            # Verify it exists
            if frappe.db.exists("Delivery Schedule", result):
                print("✅ Delivery schedule record confirmed in database")
                
                # Get details
                ds = frappe.get_doc("Delivery Schedule", result)
                print(f"   Customer: {ds.customer}")
                print(f"   Date: {ds.delivery_date}")
                print(f"   Time: {ds.delivery_time}")
                print(f"   Status: {ds.status}")
                print(f"   Items: {len(ds.items)}")
            else:
                print("❌ Delivery schedule not found in database after creation")
        else:
            print("❌ Delivery schedule creation returned None")
            
    except Exception as e:
        print(f"❌ Error in delivery schedule creation: {e}")
        import traceback
        print(f"Full traceback: {traceback.format_exc()}")
    
    # Step 6: Check existing delivery schedules
    print("\n6. Checking existing delivery schedules...")
    existing_ds = frappe.db.sql("""
        SELECT name, customer, delivery_date, status, creation
        FROM `tabDelivery Schedule`
        ORDER BY creation DESC
        LIMIT 5
    """, as_dict=True)
    
    if existing_ds:
        print(f"Found {len(existing_ds)} delivery schedules:")
        for ds in existing_ds:
            print(f"   {ds.name} | {ds.customer} | {ds.delivery_date} | {ds.status}")
    else:
        print("❌ No delivery schedules found in database")
    
    # Step 7: Test place_order function simulation
    print("\n7. Testing place_order logic simulation...")
    try:
        # Simulate what happens in place_order
        pos_config = test_config_str  # As string (how it comes from frontend)
        
        if pos_config:
            if isinstance(pos_config, str):
                try:
                    pos_config = json.loads(pos_config)
                    print("✅ POS config parsed in place_order simulation")
                except:
                    print("❌ Failed to parse pos_config in place_order simulation")
                    pos_config = None
            
            if pos_config and pos_config.get('fulfillmentMethod') == 'delivery':
                print("✅ Delivery condition met in place_order simulation")
                
                result = create_delivery_schedule_from_pos(sales_order, pos_config)
                print(f"Delivery schedule creation result: {result}")
            else:
                print("❌ Delivery condition not met")
                print(f"pos_config: {pos_config}")
                if pos_config:
                    print(f"fulfillmentMethod: {pos_config.get('fulfillmentMethod')}")
        else:
            print("❌ No pos_config provided")
    
    except Exception as e:
        print(f"❌ Error in place_order simulation: {e}")
    
    print("\n=== DEBUG TEST COMPLETE ===")

def check_recent_error_logs():
    """Check recent error logs for delivery schedule related errors"""
    print("\n=== CHECKING ERROR LOGS ===")
    
    try:
        error_logs = frappe.db.sql("""
            SELECT creation, error
            FROM `tabError Log`
            WHERE creation >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
            AND (error LIKE '%delivery%' OR error LIKE '%DEBUG%' OR error LIKE '%pos_config%')
            ORDER BY creation DESC
            LIMIT 10
        """, as_dict=True)
        
        if error_logs:
            print(f"Found {len(error_logs)} relevant error logs:")
            for log in error_logs:
                print(f"\n--- {log.creation} ---")
                print(log.error[:500] + "..." if len(log.error) > 500 else log.error)
        else:
            print("No relevant error logs found in the last hour")
            
    except Exception as e:
        print(f"Error checking logs: {e}")

if __name__ == "__main__":
    debug_delivery_schedule()
    check_recent_error_logs() 