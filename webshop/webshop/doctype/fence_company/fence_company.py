import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, get_datetime


class FenceCompany(Document):
    def before_insert(self):
        """Set default values before insert"""
        self.created_date = now_datetime().date()
        self.created_by = frappe.session.user
        self.status = "Pending"
        
        # Generate company code
        if not self.company_code:
            self.company_code = self.generate_company_code()
    
    def before_save(self):
        """Validate and set approval date"""
        if self.approved and not self.approval_date:
            self.approval_date = now_datetime().date()
            self.status = "Approved"
        elif not self.approved and self.approval_date:
            self.approval_date = None
            if self.status == "Approved":
                self.status = "Pending"
    
    def generate_company_code(self):
        """Generate unique company code"""
        # Take first 3 characters of company name and add sequence
        prefix = "".join([c for c in self.company_name[:3] if c.isalpha()]).upper()
        if len(prefix) < 3:
            prefix = prefix.ljust(3, 'X')
        
        # Get next sequence number
        last_code = frappe.db.sql("""
            SELECT company_code FROM `tabFence Company` 
            WHERE company_code LIKE %s 
            ORDER BY company_code DESC LIMIT 1
        """, f"{prefix}%")
        
        if last_code:
            try:
                last_num = int(last_code[0][0][3:])
                next_num = last_num + 1
            except (ValueError, IndexError):
                next_num = 1
        else:
            next_num = 1
        
        return f"{prefix}{next_num:04d}"
    
    def validate(self):
        """Validate company data"""
        if self.email:
            # Check for duplicate email
            existing = frappe.db.exists('Fence Company', {
                'email': self.email,
                'name': ('!=', self.name)
            })
            if existing:
                frappe.throw(f"A company with email {self.email} already exists")
        
        if self.tax_exempt and not self.tax_id:
            frappe.throw("Tax ID is required for tax exempt companies")
    
    def on_update(self):
        """Handle company status changes"""
        if self.has_value_changed('approved') or self.has_value_changed('status'):
            self.send_status_notification()
    
    def send_status_notification(self):
        """Send email notification on status change"""
        if self.status == "Approved":
            subject = "Company Account Approved"
            message = f"""
Dear {self.contact_person},

Your company account for {self.company_name} has been approved!

Company Code: {self.company_code}
Status: {self.status}
Approval Date: {self.approval_date}

You can now access all features of our fence calculator system.

Best regards,
H&J Fence Supply Team
            """
        elif self.status == "Rejected":
            subject = "Company Account Status Update"
            message = f"""
Dear {self.contact_person},

We regret to inform you that your company account application for {self.company_name} has been rejected.

Please contact our support team for more information.

Best regards,
H&J Fence Supply Team
            """
        else:
            return
        
        try:
            frappe.sendmail(
                recipients=[self.email],
                subject=subject,
                message=message,
                now=True
            )
        except Exception as e:
            frappe.log_error(f"Error sending company status notification: {e}")


@frappe.whitelist()
def get_company_list():
    """Get list of approved companies for dropdown"""
    companies = frappe.get_all(
        'Fence Company',
        filters={'status': 'Approved'},
        fields=['name', 'company_name', 'company_code'],
        order_by='company_name'
    )
    return companies


@frappe.whitelist()
def register_company(data):
    """Register a new company"""
    try:
        company = frappe.get_doc({
            'doctype': 'Fence Company',
            'company_name': data.get('company_name'),
            'contact_person': data.get('contact_person'),
            'email': data.get('email'),
            'phone': data.get('phone'),
            'address': data.get('address'),
            'city': data.get('city'),
            'state': data.get('state'),
            'zip_code': data.get('zip_code'),
            'business_type': data.get('business_type'),
            'tax_id': data.get('tax_id'),
            'license_number': data.get('license_number'),
            'tax_exempt': data.get('tax_exempt', 0),
            'notes': data.get('notes')
        })
        
        company.insert(ignore_permissions=True)
        
        # Send notification to admin
        send_new_company_notification(company)
        
        return {
            'success': True,
            'message': 'Company registration submitted successfully',
            'company_code': company.company_code
        }
        
    except Exception as e:
        frappe.log_error(f"Error registering company: {e}")
        return {
            'success': False,
            'message': str(e)
        }


def send_new_company_notification(company):
    """Send notification to admin about new company registration"""
    try:
        admin_email = frappe.get_value('System Settings', 'System Settings', 'support_email') or 'admin@example.com'
        
        subject = f"New Company Registration: {company.company_name}"
        message = f"""
A new company has registered for fence calculator access.

Company Details:
- Name: {company.company_name}
- Code: {company.company_code}
- Contact: {company.contact_person}
- Email: {company.email}
- Phone: {company.phone}
- Business Type: {company.business_type}
- Tax Exempt: {'Yes' if company.tax_exempt else 'No'}

Please review and approve the registration.

View Details: {frappe.utils.get_url(f'/app/fence-company/{company.name}')}
        """
        
        frappe.sendmail(
            recipients=[admin_email],
            subject=subject,
            message=message,
            now=True
        )
        
    except Exception as e:
        frappe.log_error(f"Error sending new company notification: {e}")
