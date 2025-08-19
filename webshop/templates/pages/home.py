import frappe
from frappe import _

def get_context(context):
    """Get context for the homepage"""
    context.title = _("H&J Fence Supply - Quality Fencing Solutions")
    context.page_title = _("Home")
    
    # Get featured products if available
    context.featured_products = get_featured_products()
    
    # Get company information
    context.company_info = get_company_info()
    
    return context

def get_featured_products():
    """Get featured products for the homepage"""
    try:
        # Try to get featured products from Website Item
        featured_items = frappe.get_all(
            'Website Item',
            filters={
                'published': 1,
                'show_in_website': 1
            },
            fields=['name', 'item_code', 'web_item_name', 'website_image', 'route'],
            limit=6
        )
        
        if featured_items:
            return featured_items
    except Exception as e:
        frappe.log_error(f"Error getting featured products: {e}")
    
    return []

def get_company_info():
    """Get company information"""
    try:
        company = frappe.get_doc('Company', frappe.defaults.get_global_default('company'))
        return {
            'name': company.company_name,
            'address': company.company_address,
            'phone': company.phone_no,
            'email': company.company_email
        }
    except Exception as e:
        frappe.log_error(f"Error getting company info: {e}")
        return {
            'name': 'H&J Fence Supply',
            'address': 'Your Address Here',
            'phone': '(555) 123-4567',
            'email': 'info@hjfencesupply.com'
        }

