"""
Multi-Role User Management System for Fence Calculator
Handles authentication, role-based permissions, and user workflows
"""

import frappe
from frappe import _
from frappe.utils import now_datetime, validate_email_address
import json


class FenceUserManager:
    """Main user management class for fence calculator system"""
    
    def __init__(self):
        self.roles = {
            'Admin': {
                'label': 'System Administrator',
                'permissions': ['all'],
                'description': 'Full system access and management'
            },
            'Employee': {
                'label': 'Company Employee',
                'permissions': ['manage_projects', 'view_all_quotes', 'manage_customers', 'access_pos'],
                'description': 'Company staff with extended access'
            },
            'Contractor': {
                'label': 'Contractor/Installer',
                'permissions': ['view_assigned_projects', 'update_project_status', 'manage_customers'],
                'description': 'External contractors and installers'
            },
            'Customer': {
                'label': 'Customer',
                'permissions': ['create_projects', 'view_own_projects', 'request_quotes'],
                'description': 'End customers using the calculator'
            }
        }
    
    def create_user_account(self, user_data, role='Customer'):
        """Create new user account with specified role"""
        try:
            # Validate required fields
            required_fields = ['email', 'first_name', 'last_name']
            for field in required_fields:
                if not user_data.get(field):
                    return {
                        'success': False,
                        'message': f'{field.replace("_", " ").title()} is required'
                    }
            
            # Validate email
            email = user_data['email'].lower().strip()
            if not validate_email_address(email):
                return {
                    'success': False,
                    'message': 'Invalid email address'
                }
            
            # Check if user already exists
            if frappe.db.exists('User', email):
                return {
                    'success': False,
                    'message': 'User with this email already exists'
                }
            
            # Create user
            user = frappe.get_doc({
                'doctype': 'User',
                'email': email,
                'first_name': user_data['first_name'],
                'last_name': user_data['last_name'],
                'enabled': 1,
                'new_password': user_data.get('password') or self._generate_password(),
                'send_welcome_email': user_data.get('send_welcome_email', 1),
                'language': 'en',
                'time_zone': 'America/New_York'
            })
            
            # Add basic roles
            user.add_roles('All')
            
            # Add fence-specific role
            fence_role = f'Fence {role}'
            user.add_roles(fence_role)
            
            user.insert(ignore_permissions=True)
            
            # Create fence user profile
            profile_result = self.create_user_profile(user.name, role, user_data)
            
            if not profile_result['success']:
                # Rollback user creation if profile creation fails
                frappe.delete_doc('User', user.name, ignore_permissions=True)
                return profile_result
            
            # Send welcome email if requested
            if user_data.get('send_welcome_email', 1):
                self._send_welcome_email(user, user_data.get('password'))
            
            return {
                'success': True,
                'message': 'User account created successfully',
                'user_name': user.name,
                'profile_name': profile_result['profile_name']
            }
            
        except Exception as e:
            frappe.log_error(f"Error creating user account: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def create_user_profile(self, user_email, role, profile_data):
        """Create fence user profile for user"""
        try:
            profile = frappe.get_doc({
                'doctype': 'Fence User Profile',
                'user': user_email,
                'user_role': role,
                'first_name': profile_data['first_name'],
                'last_name': profile_data['last_name'],
                'phone': profile_data.get('phone', ''),
                'mobile': profile_data.get('mobile', ''),
                'company': profile_data.get('company', ''),
                'employee_id': profile_data.get('employee_id', ''),
                'contractor_license': profile_data.get('contractor_license', ''),
                'customer_type': profile_data.get('customer_type', 'Residential'),
                'preferred_contact_method': profile_data.get('preferred_contact_method', 'Email'),
                'marketing_consent': profile_data.get('marketing_consent', 0),
                'notes': profile_data.get('notes', ''),
                'active': 1
            })
            
            profile.insert(ignore_permissions=True)
            
            return {
                'success': True,
                'profile_name': profile.name
            }
            
        except Exception as e:
            frappe.log_error(f"Error creating user profile: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def authenticate_user(self, email, password):
        """Authenticate user and return session info"""
        try:
            # Authenticate with Frappe
            login_result = frappe.auth.check_password(email, password)
            
            if login_result:
                # Get user profile
                profile = self.get_user_profile(email)
                
                # Update last login
                if profile:
                    profile_doc = frappe.get_doc('Fence User Profile', profile['name'])
                    profile_doc.update_last_login()
                
                return {
                    'success': True,
                    'user': email,
                    'profile': profile,
                    'session_id': frappe.session.sid
                }
            else:
                return {
                    'success': False,
                    'message': 'Invalid email or password'
                }
                
        except Exception as e:
            frappe.log_error(f"Error authenticating user: {e}")
            return {
                'success': False,
                'message': 'Authentication failed'
            }
    
    def get_user_profile(self, user_email=None):
        """Get user profile with role and permissions"""
        if not user_email:
            user_email = frappe.session.user
        
        if not user_email or user_email == 'Guest':
            return None
        
        try:
            profile = frappe.get_value(
                'Fence User Profile',
                {'user': user_email},
                [
                    'name', 'user_role', 'first_name', 'last_name', 'company',
                    'active', 'phone', 'mobile', 'customer_type', 'employee_id',
                    'contractor_license', 'verified_contractor', 'rating'
                ],
                as_dict=True
            )
            
            if profile:
                # Add role permissions
                profile['permissions'] = self.get_user_permissions(profile['user_role'])
                profile['role_label'] = self.roles.get(profile['user_role'], {}).get('label', profile['user_role'])
                
                # Add company information if applicable
                if profile.get('company'):
                    company_info = frappe.get_value(
                        'Fence Company',
                        profile['company'],
                        ['company_name', 'status', 'approved'],
                        as_dict=True
                    )
                    profile['company_info'] = company_info
            
            return profile
            
        except Exception as e:
            frappe.log_error(f"Error getting user profile: {e}")
            return None
    
    def get_user_permissions(self, role):
        """Get permissions for user role"""
        role_config = self.roles.get(role, {})
        permissions = role_config.get('permissions', [])
        
        if 'all' in permissions:
            return list(self._get_all_permissions())
        
        return permissions
    
    def _get_all_permissions(self):
        """Get all available permissions"""
        return [
            'manage_projects', 'view_all_quotes', 'manage_customers',
            'access_pos', 'view_assigned_projects', 'update_project_status',
            'create_projects', 'view_own_projects', 'request_quotes',
            'manage_users', 'manage_companies', 'system_settings'
        ]
    
    def check_permission(self, permission, user_email=None):
        """Check if user has specific permission"""
        profile = self.get_user_profile(user_email)
        
        if not profile:
            return False
        
        user_permissions = profile.get('permissions', [])
        return permission in user_permissions or 'all' in user_permissions
    
    def update_user_profile(self, profile_name, update_data):
        """Update user profile information"""
        try:
            profile = frappe.get_doc('Fence User Profile', profile_name)
            
            # Check if user can update this profile
            if profile.user != frappe.session.user and not self.check_permission('manage_users'):
                return {
                    'success': False,
                    'message': 'Access denied'
                }
            
            # Update allowed fields
            updateable_fields = [
                'first_name', 'last_name', 'phone', 'mobile',
                'customer_type', 'preferred_contact_method', 'marketing_consent',
                'notes'
            ]
            
            # Admin/Employee can update additional fields
            if self.check_permission('manage_users'):
                updateable_fields.extend([
                    'user_role', 'company', 'employee_id', 'contractor_license',
                    'verified_contractor', 'active'
                ])
            
            for field in updateable_fields:
                if field in update_data:
                    setattr(profile, field, update_data[field])
            
            profile.save(ignore_permissions=True)
            
            return {
                'success': True,
                'message': 'Profile updated successfully'
            }
            
        except Exception as e:
            frappe.log_error(f"Error updating user profile: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def register_contractor(self, contractor_data):
        """Register new contractor with approval workflow"""
        try:
            # Create user account
            user_result = self.create_user_account(contractor_data, 'Contractor')
            
            if not user_result['success']:
                return user_result
            
            # Send notification to admin for contractor approval
            self._send_contractor_approval_notification(contractor_data)
            
            return {
                'success': True,
                'message': 'Contractor registration submitted for approval',
                'user_name': user_result['user_name']
            }
            
        except Exception as e:
            frappe.log_error(f"Error registering contractor: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def approve_contractor(self, profile_name, approved=True):
        """Approve or reject contractor application"""
        try:
            if not self.check_permission('manage_users'):
                return {
                    'success': False,
                    'message': 'Access denied'
                }
            
            profile = frappe.get_doc('Fence User Profile', profile_name)
            
            if profile.user_role != 'Contractor':
                return {
                    'success': False,
                    'message': 'Profile is not a contractor'
                }
            
            profile.verified_contractor = approved
            profile.save(ignore_permissions=True)
            
            # Send notification to contractor
            self._send_contractor_status_notification(profile, approved)
            
            status = 'approved' if approved else 'rejected'
            return {
                'success': True,
                'message': f'Contractor {status} successfully'
            }
            
        except Exception as e:
            frappe.log_error(f"Error approving contractor: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def get_contractors(self, verified_only=True):
        """Get list of contractors"""
        try:
            filters = {'user_role': 'Contractor', 'active': 1}
            if verified_only:
                filters['verified_contractor'] = 1
            
            contractors = frappe.get_all(
                'Fence User Profile',
                filters=filters,
                fields=[
                    'name', 'first_name', 'last_name', 'company', 'rating',
                    'total_projects', 'specialization', 'service_area',
                    'phone', 'mobile', 'contractor_license'
                ],
                order_by='rating desc, total_projects desc'
            )
            
            return {
                'success': True,
                'contractors': contractors
            }
            
        except Exception as e:
            frappe.log_error(f"Error getting contractors: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def assign_project_to_contractor(self, project_name, contractor_profile):
        """Assign project to contractor"""
        try:
            if not self.check_permission('manage_projects'):
                return {
                    'success': False,
                    'message': 'Access denied'
                }
            
            # Verify contractor is active and verified
            contractor = frappe.get_doc('Fence User Profile', contractor_profile)
            if not contractor.active or not contractor.verified_contractor:
                return {
                    'success': False,
                    'message': 'Contractor is not active or verified'
                }
            
            # Assign project
            result = frappe.call(
                'webshop.doctype.fence_project.fence_project.assign_contractor',
                project_name=project_name,
                contractor_name=contractor_profile
            )
            
            return result
            
        except Exception as e:
            frappe.log_error(f"Error assigning project to contractor: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def _generate_password(self, length=12):
        """Generate secure random password"""
        import secrets
        import string
        
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        return password
    
    def _send_welcome_email(self, user, password=None):
        """Send welcome email to new user"""
        try:
            profile = self.get_user_profile(user.email)
            role_label = profile['role_label'] if profile else 'User'
            
            subject = f"Welcome to H&J Fence Supply Calculator - {role_label} Account"
            
            message = f"""
Dear {user.first_name},

Welcome to H&J Fence Supply's Professional Fence Calculator!

Your account has been created with the following details:
- Email: {user.email}
- Role: {role_label}
- Login URL: {frappe.utils.get_url()}/login

{f'Temporary Password: {password}' if password else 'Please use the password you provided during registration.'}

Please log in and complete your profile setup.

Features available to you:
"""
            
            if profile:
                permissions = profile.get('permissions', [])
                if 'create_projects' in permissions:
                    message += "- Create and design fence projects\n"
                if 'manage_projects' in permissions:
                    message += "- Manage all fence projects\n"
                if 'view_assigned_projects' in permissions:
                    message += "- View projects assigned to you\n"
                if 'request_quotes' in permissions:
                    message += "- Request professional quotes\n"
                if 'access_pos' in permissions:
                    message += "- Access POS interface\n"
            
            message += """

If you have any questions, please contact our support team.

Best regards,
H&J Fence Supply Team
            """
            
            frappe.sendmail(
                recipients=[user.email],
                subject=subject,
                message=message,
                now=True
            )
            
        except Exception as e:
            frappe.log_error(f"Error sending welcome email: {e}")
    
    def _send_contractor_approval_notification(self, contractor_data):
        """Send notification to admin about new contractor registration"""
        try:
            admin_email = frappe.get_value('System Settings', 'System Settings', 'support_email') or 'admin@example.com'
            
            subject = f"New Contractor Registration: {contractor_data['first_name']} {contractor_data['last_name']}"
            
            message = f"""
A new contractor has registered for system access:

Contractor Details:
- Name: {contractor_data['first_name']} {contractor_data['last_name']}
- Email: {contractor_data['email']}
- Phone: {contractor_data.get('phone', 'Not provided')}
- License: {contractor_data.get('contractor_license', 'Not provided')}
- Company: {contractor_data.get('company', 'Independent')}

Please review and approve the contractor registration in the system.

View Profile: {frappe.utils.get_url()}/app/fence-user-profile/{contractor_data['email']}
            """
            
            frappe.sendmail(
                recipients=[admin_email],
                subject=subject,
                message=message,
                now=True
            )
            
        except Exception as e:
            frappe.log_error(f"Error sending contractor approval notification: {e}")
    
    def _send_contractor_status_notification(self, profile, approved):
        """Send status notification to contractor"""
        try:
            user = frappe.get_doc('User', profile.user)
            
            if approved:
                subject = "Contractor Account Approved"
                message = f"""
Dear {profile.first_name},

Congratulations! Your contractor account has been approved.

You now have access to:
- View assigned projects
- Update project status
- Manage customer relationships
- Access contractor tools

Log in to start using your contractor account: {frappe.utils.get_url()}/login

Best regards,
H&J Fence Supply Team
                """
            else:
                subject = "Contractor Account Status Update"
                message = f"""
Dear {profile.first_name},

We regret to inform you that your contractor account application has not been approved at this time.

Please contact our support team for more information.

Best regards,
H&J Fence Supply Team
                """
            
            frappe.sendmail(
                recipients=[user.email],
                subject=subject,
                message=message,
                now=True
            )
            
        except Exception as e:
            frappe.log_error(f"Error sending contractor status notification: {e}")


# Global instance
user_manager = FenceUserManager()


# API endpoints
@frappe.whitelist(allow_guest=True)
def create_customer_account(user_data):
    """Create customer account (public registration)"""
    try:
        if isinstance(user_data, str):
            user_data = json.loads(user_data)
        
        return user_manager.create_user_account(user_data, 'Customer')
        
    except Exception as e:
        frappe.log_error(f"Error in create_customer_account: {e}")
        return {
            'success': False,
            'message': str(e)
        }


@frappe.whitelist(allow_guest=True)
def register_contractor_account(contractor_data):
    """Register contractor account (public registration with approval)"""
    try:
        if isinstance(contractor_data, str):
            contractor_data = json.loads(contractor_data)
        
        return user_manager.register_contractor(contractor_data)
        
    except Exception as e:
        frappe.log_error(f"Error in register_contractor_account: {e}")
        return {
            'success': False,
            'message': str(e)
        }


@frappe.whitelist()
def get_current_user_profile():
    """Get current user's profile and permissions"""
    try:
        profile = user_manager.get_user_profile()
        return {
            'success': True,
            'profile': profile
        }
        
    except Exception as e:
        frappe.log_error(f"Error getting current user profile: {e}")
        return {
            'success': False,
            'message': str(e)
        }


@frappe.whitelist()
def update_my_profile(profile_data):
    """Update current user's profile"""
    try:
        if isinstance(profile_data, str):
            profile_data = json.loads(profile_data)
        
        # Get current user's profile
        profile = user_manager.get_user_profile()
        if not profile:
            return {
                'success': False,
                'message': 'Profile not found'
            }
        
        return user_manager.update_user_profile(profile['name'], profile_data)
        
    except Exception as e:
        frappe.log_error(f"Error updating profile: {e}")
        return {
            'success': False,
            'message': str(e)
        }


@frappe.whitelist()
def get_available_contractors():
    """Get list of available contractors"""
    try:
        return user_manager.get_contractors(verified_only=True)
        
    except Exception as e:
        frappe.log_error(f"Error getting contractors: {e}")
        return {
            'success': False,
            'message': str(e)
        }


@frappe.whitelist()
def assign_contractor_to_project(project_name, contractor_profile):
    """Assign contractor to project"""
    try:
        return user_manager.assign_project_to_contractor(project_name, contractor_profile)
        
    except Exception as e:
        frappe.log_error(f"Error assigning contractor: {e}")
        return {
            'success': False,
            'message': str(e)
        }


@frappe.whitelist()
def check_user_permission(permission):
    """Check if current user has specific permission"""
    try:
        has_permission = user_manager.check_permission(permission)
        return {
            'success': True,
            'has_permission': has_permission
        }
        
    except Exception as e:
        frappe.log_error(f"Error checking permission: {e}")
        return {
            'success': False,
            'message': str(e)
        }
