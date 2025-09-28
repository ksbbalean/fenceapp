import frappe
from frappe import _


def get_context(context):
    """Get context for the Fence POS page"""
    context.title = _("Fence POS System")
    context.page_title = _("Point of Sale - Fence Calculator")
    
    # Check user permissions for POS access
    user_profile = get_user_profile()
    
    # Only allow Employees and Admins to access POS
    if not user_profile or user_profile.get('user_role') not in ['Admin', 'Employee']:
        frappe.local.flags.redirect_location = "/fence-calculator?error=access_denied"
        raise frappe.Redirect
    
    context.user_profile = user_profile
    context.has_pos_access = True
    
    # Get company information if user has one
    if user_profile.get('company'):
        context.company_info = get_company_info(user_profile['company'])
    
    return context


def get_user_profile():
    """Get current user's fence profile"""
    if not frappe.session.user or frappe.session.user == "Guest":
        return None
    
    try:
        profile = frappe.get_value(
            'Fence User Profile',
            {'user': frappe.session.user},
            ['name', 'user_role', 'first_name', 'last_name', 'company', 'active'],
            as_dict=True
        )
        return profile
    except:
        return None


def get_company_info(company_name):
    """Get company information"""
    try:
        company = frappe.get_value(
            'Fence Company',
            company_name,
            ['company_name', 'status', 'approved', 'tax_exempt'],
            as_dict=True
        )
        return company
    except:
        return None
