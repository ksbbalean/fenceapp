#!/usr/bin/env python3

# Simple test for delivery schedule creation
import frappe
from webshop.webshop.shopping_cart.cart import create_delivery_schedule_from_pos

# Use your actual sales order
sales_order = frappe.get_doc("Sales Order", "SAL-ORD-2025-00021")

# Test config (exactly like from POS)
test_config = {
    "fulfillmentMethod": "delivery",
    "selectedDate": "2025-07-31",
    "selectedTime": "09:00:00",
    "selectedCategory": "Vinyl",
    "selectedStyle": "privacy",
    "selectedHeight": "6'",
    "selectedColor": "White"
}

print("Testing delivery schedule creation...")
print(f"Sales Order: {sales_order.name}")
print(f"Customer: {sales_order.customer}")

# Test creation
result = create_delivery_schedule_from_pos(sales_order, test_config)
print(f"Result: {result}")

if result:
    print("✅ SUCCESS! Delivery schedule created")
    print(f"Delivery Schedule ID: {result}")
    
    # Check if it exists
    if frappe.db.exists("Delivery Schedule", result):
        ds = frappe.get_doc("Delivery Schedule", result)
        print(f"Customer: {ds.customer}")
        print(f"Date: {ds.delivery_date}")
        print(f"Time: {ds.delivery_time}")
        print(f"Status: {ds.status}")
        print(f"Items: {len(ds.items)}")
    else:
        print("❌ Record not found in database!")
else:
    print("❌ FAILED! No delivery schedule created")

print("\nDone!") 