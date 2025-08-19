import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class FenceUserProfile(Document):
    def before_insert(self):
        """Set default values before insert"""
        self.created_date = now_datetime().date()
        
        # Get email from linked user
        if self.user:
            user = frappe.get_doc('User', self.user)
            self.email = user.email
            if not self.first_name:
                self.first_name = user.first_name or ""
            if not self.last_name:
                self.last_name = user.last_name or ""
    
    def validate(self):
        """Validate profile data"""
        # Validate role-specific fields
        if self.user_role == "Employee":
            if not self.company:
                frappe.throw("Company is required for Employee role")
            if not self.employee_id:
                frappe.throw("Employee ID is required for Employee role")
        
        elif self.user_role == "Contractor":
            if not self.contractor_license:
                frappe.msgprint("Contractor License is recommended for verification")
        
        # Validate company approval status
        if self.company:
            company_doc = frappe.get_doc('Fence Company', self.company)
            if company_doc.status != "Approved":
                frappe.throw(f"Company {self.company} is not approved yet")
    
    def on_update(self):
        """Update related user document"""
        if self.user:
            user = frappe.get_doc('User', self.user)
            
            # Update basic info
            if self.first_name:
                user.first_name = self.first_name
            if self.last_name:
                user.last_name = self.last_name
            
            # Update role permissions
            self.update_user_roles(user)
            
            user.save(ignore_permissions=True)
    
    def update_user_roles(self, user):
        """Update user roles based on profile role"""
        role_mapping = {
            'Admin': ['System Manager', 'Fence Admin'],
            'Employee': ['Fence Employee', 'Website Manager'],
            'Contractor': ['Fence Contractor'],
            'Customer': ['Fence Customer', 'Customer']
        }
        
        # Remove existing fence-related roles
        existing_roles = [r.role for r in user.roles]
        fence_roles = ['Fence Admin', 'Fence Employee', 'Fence Contractor', 'Fence Customer']
        
        for role in fence_roles:
            if role in existing_roles:
                user.remove_roles(role)
        
        # Add new roles
        if self.user_role in role_mapping:
            for role in role_mapping[self.user_role]:
                if not user.has_role(role):
                    user.add_roles(role)
    
    def update_last_login(self):
        """Update last login timestamp"""
        self.last_login = now_datetime()
        self.save(ignore_permissions=True)


@frappe.whitelist()
def get_user_profile(user=None):
    """Get user profile for current or specified user"""
    if not user:
        user = frappe.session.user
    
    profile = frappe.db.get_value(
        'Fence User Profile',
        {'user': user},
        ['name', 'user_role', 'first_name', 'last_name', 'company', 'active'],
        as_dict=True
    )
    
    if not profile:
        # Create default profile for new users
        profile = create_default_profile(user)
    
    return profile


@frappe.whitelist()
def create_user_profile(data):
    """Create new user profile"""
    try:
        # Validate required fields
        required_fields = ['user', 'user_role', 'first_name', 'last_name']
        for field in required_fields:
            if not data.get(field):
                frappe.throw(f"{field.replace('_', ' ').title()} is required")
        
        # Check if profile already exists
        existing = frappe.db.exists('Fence User Profile', {'user': data.get('user')})
        if existing:
            frappe.throw("Profile already exists for this user")
        
        profile = frappe.get_doc({
            'doctype': 'Fence User Profile',
            'user': data.get('user'),
            'user_role': data.get('user_role'),
            'first_name': data.get('first_name'),
            'last_name': data.get('last_name'),
            'phone': data.get('phone'),
            'mobile': data.get('mobile'),
            'company': data.get('company'),
            'employee_id': data.get('employee_id'),
            'contractor_license': data.get('contractor_license'),
            'customer_type': data.get('customer_type'),
            'notes': data.get('notes')
        })
        
        profile.insert(ignore_permissions=True)
        
        return {
            'success': True,
            'message': 'Profile created successfully',
            'profile_name': profile.name
        }
        
    except Exception as e:
        frappe.log_error(f"Error creating user profile: {e}")
        return {
            'success': False,
            'message': str(e)
        }


def create_default_profile(user):
    """Create default profile for new user"""
    try:
        user_doc = frappe.get_doc('User', user)
        
        profile = frappe.get_doc({
            'doctype': 'Fence User Profile',
            'user': user,
            'user_role': 'Customer',  # Default role
            'first_name': user_doc.first_name or "",
            'last_name': user_doc.last_name or "",
            'email': user_doc.email,
            'active': 1
        })
        
        profile.insert(ignore_permissions=True)
        
        return {
            'name': profile.name,
            'user_role': profile.user_role,
            'first_name': profile.first_name,
            'last_name': profile.last_name,
            'company': profile.company,
            'active': profile.active
        }
        
    except Exception as e:
        frappe.log_error(f"Error creating default profile: {e}")
        return None


@frappe.whitelist()
def update_profile(profile_name, data):
    """Update user profile"""
    try:
        profile = frappe.get_doc('Fence User Profile', profile_name)
        
        # Update allowed fields
        updateable_fields = [
            'first_name', 'last_name', 'phone', 'mobile', 'date_of_birth',
            'company', 'employee_id', 'department', 'position',
            'contractor_license', 'specialization', 'service_area',
            'customer_type', 'preferred_contact_method', 'marketing_consent',
            'notes'
        ]
        
        for field in updateable_fields:
            if field in data:
                setattr(profile, field, data[field])
        
        profile.save(ignore_permissions=True)
        
        return {
            'success': True,
            'message': 'Profile updated successfully'
        }
        
    except Exception as e:
        frappe.log_error(f"Error updating profile: {e}")
        return {
            'success': False,
            'message': str(e)
        }


@frappe.whitelist()
def get_contractors():
    """Get list of verified contractors"""
    contractors = frappe.get_all(
        'Fence User Profile',
        filters={
            'user_role': 'Contractor',
            'verified_contractor': 1,
            'active': 1
        },
        fields=[
            'name', 'first_name', 'last_name', 'company', 'rating',
            'total_projects', 'specialization', 'service_area'
        ],
        order_by='rating desc, total_projects desc'
    )
    
    return contractors


@frappe.whitelist()
def update_contractor_rating(contractor, rating, project_count=None):
    """Update contractor rating and project count"""
    try:
        profile = frappe.get_doc('Fence User Profile', contractor)
        
        if profile.user_role != 'Contractor':
            frappe.throw("Profile is not a contractor")
        
        # Update rating (weighted average)
        if profile.total_projects and profile.rating:
            total_rating = profile.rating * profile.total_projects
            new_total_projects = profile.total_projects + (project_count or 1)
            new_rating = (total_rating + rating) / new_total_projects
        else:
            new_rating = rating
            new_total_projects = project_count or 1
        
        profile.rating = new_rating
        profile.total_projects = new_total_projects
        profile.save(ignore_permissions=True)
        
        return {
            'success': True,
            'message': 'Contractor rating updated',
            'new_rating': new_rating
        }
        
    except Exception as e:
        frappe.log_error(f"Error updating contractor rating: {e}")
        return {
            'success': False,
            'message': str(e)
        }
