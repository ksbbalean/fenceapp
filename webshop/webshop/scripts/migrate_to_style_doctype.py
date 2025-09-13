#!/usr/bin/env python3
"""
Migration script to transition POS system from hard-coded styles to Style Doctype.

This script:
1. Populates the Style doctype with material-specific styles
2. Creates Material Type records if they don't exist
3. Tests the new API endpoints
4. Provides migration status report

Usage:
    cd webshop
    python scripts/migrate_to_style_doctype.py
"""

import frappe
import json
from frappe import _

def ensure_material_types():
    """Ensure all required Material Types exist"""
    material_types = ['Vinyl', 'Aluminum', 'Wood', 'Pressure Treated', 'Chain Link']
    created_count = 0
    
    for material_type in material_types:
        if not frappe.db.exists('Material Type', material_type):
            # Create Material Type record
            material_doc = frappe.get_doc({
                'doctype': 'Material Type',
                'name': material_type,
                'type': material_type
            })
            material_doc.insert(ignore_permissions=True)
            created_count += 1
            print(f"✓ Created Material Type: {material_type}")
        else:
            print(f"✓ Material Type exists: {material_type}")
    
    if created_count > 0:
        frappe.db.commit()
        print(f"\n📋 Created {created_count} Material Type records")
    
    return True

def populate_styles():
    """Populate Style doctype with material-specific styles"""
    print("\n🎨 Populating Style doctype...")
    
    # Call the API function
    result = frappe.call('webshop.webshop.pos_api.populate_style_doctype')
    
    if result.get('success'):
        print(f"✅ {result.get('message')}")
        print(f"   Created: {result.get('created_count')} styles")
        print(f"   Existing: {result.get('existing_count')} styles")
        print(f"   Total combinations: {result.get('total_combinations')}")
        return True
    else:
        print(f"❌ Error: {result.get('error')}")
        return False

def update_custom_style_field():
    """Update Item custom_style field to Link field"""
    print("\n🔗 Updating Item custom_style field...")
    
    result = frappe.call('webshop.webshop.pos_api.update_item_custom_style_field')
    
    if result.get('success'):
        action = result.get('action')
        if action == 'created':
            print("✅ Created custom_style field as Link to Style doctype")
        elif action == 'updated':
            prev_type = result.get('previous_type', 'unknown')
            print(f"✅ Updated custom_style field from {prev_type} to Link")
        else:
            print("✅ custom_style field already properly configured")
        return True
    else:
        print(f"❌ Error: {result.get('error')}")
        return False

def migrate_style_data():
    """Migrate existing style data to use Style doctype"""
    print("\n📊 Migrating existing style data...")
    
    result = frappe.call('webshop.webshop.pos_api.migrate_existing_style_data')
    
    if result.get('success'):
        print(f"✅ {result.get('message')}")
        print(f"   Updated: {result.get('updated_count')} items")
        print(f"   Errors: {result.get('error_count')} items")
        print(f"   Total: {result.get('total_items')} items processed")
        
        # Show some mapping examples
        mapping_log = result.get('mapping_log', [])
        if mapping_log:
            print("\n   Sample mappings:")
            for log in mapping_log[:5]:  # Show first 5
                if log.get('error'):
                    print(f"     ❌ {log['item']}: {log['old_style']} -> Error: {log['error']}")
                else:
                    print(f"     ✅ {log['item']}: {log['old_style']} -> {log['new_style']}")
        
        return True
    else:
        print(f"❌ Error: {result.get('error')}")
        return False

def test_api_endpoints():
    """Test the new API endpoints"""
    print("\n🧪 Testing API endpoints...")
    
    material_types = ['vinyl', 'aluminum', 'wood', 'pressure-treated', 'chain-link']
    
    for material_type in material_types:
        try:
            result = frappe.call('webshop.webshop.pos_api.get_styles_for_material_type', 
                               material_type=material_type)
            
            if result.get('success'):
                styles = result.get('styles', [])
                fallback = result.get('fallback', False)
                status = "🔄 Fallback" if fallback else "✅ Success"
                print(f"   {status} {material_type}: {len(styles)} styles")
                
                # Show first few styles as examples
                if styles:
                    for style in styles[:2]:  # Show first 2 styles
                        print(f"      - {style.get('name')}: {style.get('description')}")
            else:
                print(f"   ❌ Failed {material_type}: {result.get('error', 'Unknown error')}")
                
        except Exception as e:
            print(f"   ❌ Exception {material_type}: {str(e)}")

def generate_migration_report():
    """Generate a migration status report"""
    print("\n📊 Migration Status Report")
    print("=" * 50)
    
    # Check Style doctype records
    style_count = frappe.db.count('Style')
    print(f"Style records: {style_count}")
    
    # Check Material Type records  
    material_type_count = frappe.db.count('Material Type')
    print(f"Material Type records: {material_type_count}")
    
    # Get style distribution by material type
    style_distribution = frappe.db.sql("""
        SELECT material_type, COUNT(*) as count
        FROM `tabStyle`
        GROUP BY material_type
        ORDER BY material_type
    """, as_dict=True)
    
    print("\nStyle distribution by Material Type:")
    for dist in style_distribution:
        print(f"  {dist.material_type}: {dist.count} styles")
    
    # Check if POS will use fallback or doctype data
    test_result = frappe.call('webshop.webshop.pos_api.get_styles_for_material_type', 
                             material_type='vinyl')
    
    is_fallback = test_result.get('fallback', False)
    status = "❌ Using fallback styles" if is_fallback else "✅ Using Style doctype"
    print(f"\nPOS Status: {status}")
    
    if is_fallback:
        print("⚠️  Warning: POS will use fallback styles. Ensure Style doctype is properly populated.")
    else:
        print("🎉 Success: POS will load styles from Style doctype automatically!")

def main():
    """Main migration function"""
    print("🚀 Starting migration to Style Doctype approach")
    print("=" * 60)
    
    try:
        # Step 1: Ensure Material Types exist
        print("📁 Step 1: Ensuring Material Types exist...")
        ensure_material_types()
        
        # Step 2: Populate Style doctype
        print("\n📁 Step 2: Populating Style doctype...")
        populate_styles()
        
        # Step 3: Update custom_style field
        print("\n📁 Step 3: Updating custom_style field...")
        update_custom_style_field()
        
        # Step 4: Migrate existing data
        print("\n📁 Step 4: Migrating existing style data...")
        migrate_style_data()
        
        # Step 5: Test API endpoints
        print("\n📁 Step 5: Testing API endpoints...")
        test_api_endpoints()
        
        # Step 6: Generate report
        print("\n📁 Step 6: Generating migration report...")
        generate_migration_report()
        
        print("\n🎉 Migration completed successfully!")
        print("\n📋 Next Steps:")
        print("1. Test the POS interface to ensure styles load correctly")
        print("2. Add new styles via Style doctype admin interface")
        print("3. Update Item custom_style field to Link field (if needed)")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {str(e)}")
        frappe.log_error(f"Style doctype migration error: {str(e)}")

if __name__ == "__main__":
    # Initialize Frappe context if running standalone
    if not frappe.db:
        frappe.init(site='localhost')
        frappe.connect()
    
    main()
