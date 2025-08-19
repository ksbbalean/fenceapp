import frappe
from frappe import _


def get_context(context):
    """Get context for the registration page"""
    context.title = _("Register - H&J Fence Supply")
    context.page_title = _("Create Your Account")
    
    # Check if user is already logged in
    if frappe.session.user and frappe.session.user != "Guest":
        frappe.local.flags.redirect_location = "/fence-calculator"
        raise frappe.Redirect
    
    # Get registration success message if redirected from login
    context.show_success = frappe.form_dict.get('success') == '1'
    
    return context
