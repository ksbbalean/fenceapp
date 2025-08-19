"""
Comprehensive RESTful API for Fence Calculator System
Provides endpoints for all fence calculator functionality with proper authentication,
validation, and error handling.
"""

import frappe
from frappe import _
from frappe.utils import now_datetime, validate_email_address, flt, cint
import json
from typing import Dict, List, Optional, Any


class FenceAPIResponse:
    """Standardized API response format"""
    
    @staticmethod
    def success(data: Any = None, message: str = "Success", meta: Dict = None) -> Dict:
        """Return success response"""
        response = {
            'success': True,
            'message': message,
            'timestamp': now_datetime().isoformat()
        }
        
        if data is not None:
            response['data'] = data
        
        if meta:
            response['meta'] = meta
        
        return response
    
    @staticmethod
    def error(message: str, code: int = 400, details: Dict = None) -> Dict:
        """Return error response"""
        response = {
            'success': False,
            'error': {
                'message': message,
                'code': code
            },
            'timestamp': now_datetime().isoformat()
        }
        
        if details:
            response['error']['details'] = details
        
        return response
    
    @staticmethod
    def validation_error(errors: Dict) -> Dict:
        """Return validation error response"""
        return FenceAPIResponse.error(
            message="Validation failed",
            code=422,
            details={'validation_errors': errors}
        )


class FenceAPIValidator:
    """API request validation utilities"""
    
    @staticmethod
    def validate_required_fields(data: Dict, required_fields: List[str]) -> Dict:
        """Validate required fields in request data"""
        errors = {}
        
        for field in required_fields:
            if field not in data or not data[field]:
                errors[field] = f"{field} is required"
        
        return errors
    
    @staticmethod
    def validate_email(email: str) -> bool:
        """Validate email format"""
        try:
            return validate_email_address(email)
        except:
            return False
    
    @staticmethod
    def validate_fence_segments(segments: List[Dict]) -> Dict:
        """Validate fence segments data"""
        errors = {}
        
        if not segments:
            errors['segments'] = "At least one fence segment is required"
            return errors
        
        for i, segment in enumerate(segments):
            segment_errors = {}
            
            # Validate path
            path = segment.get('path', [])
            if not path or len(path) < 2:
                segment_errors['path'] = "Segment must have at least 2 points"
            
            # Validate length
            length = segment.get('length')
            if not length or length <= 0:
                segment_errors['length'] = "Segment length must be greater than 0"
            
            if segment_errors:
                errors[f'segment_{i}'] = segment_errors
        
        return errors


class FenceCalculatorAPI:
    """Main API class for fence calculator functionality"""
    
    def __init__(self):
        self.response = FenceAPIResponse()
        self.validator = FenceAPIValidator()
    
    # Project Management APIs
    
    @frappe.whitelist(allow_guest=True)
    def create_project(self, project_data: str) -> Dict:
        """Create new fence project"""
        try:
            data = json.loads(project_data) if isinstance(project_data, str) else project_data
            
            # Validate required fields
            required_fields = ['customer_name', 'fence_style', 'total_length']
            validation_errors = self.validator.validate_required_fields(data, required_fields)
            
            if validation_errors:
                return self.response.validation_error(validation_errors)
            
            # Validate email if provided
            if data.get('customer_email') and not self.validator.validate_email(data['customer_email']):
                return self.response.validation_error({'customer_email': 'Invalid email format'})
            
            # Create project
            result = frappe.call(
                'webshop.doctype.fence_project.fence_project.create_project_from_calculator',
                data=data
            )
            
            if result and result.get('success'):
                return self.response.success(
                    data={
                        'project_name': result['project_name'],
                        'project_code': result['project_code']
                    },
                    message="Project created successfully"
                )
            else:
                return self.response.error(result.get('message', 'Failed to create project'))
        
        except Exception as e:
            frappe.log_error(f"API Error - create_project: {e}")
            return self.response.error("Internal server error", 500)
    
    @frappe.whitelist()
    def get_project(self, project_name: str) -> Dict:
        """Get project details"""
        try:
            if not frappe.has_permission('Fence Project', 'read', project_name):
                return self.response.error("Access denied", 403)
            
            project = frappe.get_doc('Fence Project', project_name)
            
            project_data = {
                'project_name': project.name,
                'project_code': project.project_code,
                'status': project.status,
                'customer_name': project.customer_name,
                'customer_email': project.customer_email,
                'customer_phone': project.customer_phone,
                'fence_style': project.fence_style,
                'fence_color': project.fence_color,
                'total_length': project.total_length,
                'estimated_cost': project.estimated_cost,
                'final_cost': project.final_cost,
                'created_date': project.created_date,
                'segments': [
                    {
                        'segment_id': seg.segment_id,
                        'length': seg.length,
                        'fence_style': seg.fence_style,
                        'is_gate': seg.is_gate
                    }
                    for seg in project.fence_segments
                ],
                'materials': [
                    {
                        'item_name': mat.item_name,
                        'category': mat.category,
                        'quantity_needed': mat.quantity_needed,
                        'unit_price': mat.unit_price,
                        'total_cost': mat.total_cost
                    }
                    for mat in project.material_list
                ]
            }
            
            return self.response.success(data=project_data)
        
        except frappe.DoesNotExistError:
            return self.response.error("Project not found", 404)
        except Exception as e:
            frappe.log_error(f"API Error - get_project: {e}")
            return self.response.error("Internal server error", 500)
    
    @frappe.whitelist()
    def list_projects(self, limit: int = 20, offset: int = 0, status: str = None) -> Dict:
        """List user's projects with pagination"""
        try:
            limit = min(cint(limit), 100)  # Cap at 100
            offset = cint(offset)
            
            filters = {}
            
            # Check user role and apply filters
            user_profile = frappe.call('webshop.user_management.get_current_user_profile')
            if user_profile and user_profile.get('success'):
                profile = user_profile['profile']
                user_role = profile.get('user_role')
                
                if user_role == 'Customer':
                    filters['created_by'] = frappe.session.user
                elif user_role == 'Contractor':
                    filters['assigned_contractor'] = profile['name']
                # Admin/Employee can see all projects
            else:
                filters['created_by'] = frappe.session.user
            
            if status:
                filters['status'] = status
            
            projects = frappe.get_all(
                'Fence Project',
                filters=filters,
                fields=[
                    'name', 'project_name', 'project_code', 'status',
                    'customer_name', 'total_length', 'fence_style',
                    'estimated_cost', 'created_date'
                ],
                order_by='created_date desc',
                limit=limit,
                start=offset
            )
            
            # Get total count
            total_count = frappe.db.count('Fence Project', filters)
            
            return self.response.success(
                data=projects,
                meta={
                    'total_count': total_count,
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < total_count
                }
            )
        
        except Exception as e:
            frappe.log_error(f"API Error - list_projects: {e}")
            return self.response.error("Internal server error", 500)
    
    # Calculation APIs
    
    @frappe.whitelist(allow_guest=True)
    def calculate_materials(self, segments_data: str, fence_type: str, color: str = "white") -> Dict:
        """Calculate materials for fence segments"""
        try:
            segments = json.loads(segments_data) if isinstance(segments_data, str) else segments_data
            
            # Validate segments
            validation_errors = self.validator.validate_fence_segments(segments)
            if validation_errors:
                return self.response.validation_error(validation_errors)
            
            # Call calculation engine
            result = frappe.call(
                'webshop.fence_calculation_engine.calculate_fence_materials',
                segments_data=segments,
                fence_type=fence_type,
                color=color
            )
            
            if result and result.get('success'):
                return self.response.success(data=result)
            else:
                return self.response.error(result.get('error', 'Calculation failed'))
        
        except Exception as e:
            frappe.log_error(f"API Error - calculate_materials: {e}")
            return self.response.error("Internal server error", 500)
    
    @frappe.whitelist(allow_guest=True)
    def optimize_layout(self, segments_data: str, fence_type: str) -> Dict:
        """Optimize fence layout for cost and efficiency"""
        try:
            segments = json.loads(segments_data) if isinstance(segments_data, str) else segments_data
            
            # Validate segments
            validation_errors = self.validator.validate_fence_segments(segments)
            if validation_errors:
                return self.response.validation_error(validation_errors)
            
            # Call optimization engine
            result = frappe.call(
                'webshop.fence_calculation_engine.optimize_fence_layout',
                segments_data=segments,
                fence_type=fence_type
            )
            
            if result and result.get('success'):
                return self.response.success(data=result)
            else:
                return self.response.error(result.get('error', 'Optimization failed'))
        
        except Exception as e:
            frappe.log_error(f"API Error - optimize_layout: {e}")
            return self.response.error("Internal server error", 500)
    
    @frappe.whitelist(allow_guest=True)
    def get_fence_specifications(self, fence_type: str) -> Dict:
        """Get specifications for fence type"""
        try:
            result = frappe.call(
                'webshop.fence_calculation_engine.get_fence_specifications',
                fence_type=fence_type
            )
            
            if result and result.get('success'):
                return self.response.success(data=result['specifications'])
            else:
                return self.response.error(result.get('error', 'Failed to get specifications'))
        
        except Exception as e:
            frappe.log_error(f"API Error - get_fence_specifications: {e}")
            return self.response.error("Internal server error", 500)
    
    # Quote APIs
    
    @frappe.whitelist()
    def generate_quote(self, project_name: str, quote_options: str = None) -> Dict:
        """Generate PDF quote for project"""
        try:
            options = json.loads(quote_options) if quote_options else {}
            
            result = frappe.call(
                'webshop.quote_generator.generate_project_quote',
                project_name=project_name,
                quote_options=options
            )
            
            if result and result.get('success'):
                return self.response.success(
                    data={
                        'quote_file': result.get('quote_file'),
                        'download_url': result.get('quote_file')
                    },
                    message="Quote generated successfully"
                )
            else:
                return self.response.error(result.get('message', 'Quote generation failed'))
        
        except Exception as e:
            frappe.log_error(f"API Error - generate_quote: {e}")
            return self.response.error("Internal server error", 500)
    
    @frappe.whitelist(allow_guest=True)
    def generate_calculator_quote(self, calculation_data: str, customer_info: str) -> Dict:
        """Generate quote directly from calculator data"""
        try:
            calc_data = json.loads(calculation_data) if isinstance(calculation_data, str) else calculation_data
            customer_data = json.loads(customer_info) if isinstance(customer_info, str) else customer_info
            
            # Validate customer info
            required_fields = ['name', 'email']
            validation_errors = self.validator.validate_required_fields(customer_data, required_fields)
            
            if validation_errors:
                return self.response.validation_error(validation_errors)
            
            if not self.validator.validate_email(customer_data['email']):
                return self.response.validation_error({'email': 'Invalid email format'})
            
            result = frappe.call(
                'webshop.quote_generator.generate_calculator_quote',
                calculation_data=calc_data,
                customer_info=customer_data
            )
            
            if result and result.get('success'):
                return self.response.success(
                    data={
                        'quote_file': result.get('quote_file'),
                        'download_url': result.get('quote_file')
                    },
                    message="Quote generated successfully"
                )
            else:
                return self.response.error(result.get('message', 'Quote generation failed'))
        
        except Exception as e:
            frappe.log_error(f"API Error - generate_calculator_quote: {e}")
            return self.response.error("Internal server error", 500)
    
    @frappe.whitelist()
    def email_quote(self, quote_file: str, recipient_email: str, message: str = None) -> Dict:
        """Email quote to customer"""
        try:
            if not self.validator.validate_email(recipient_email):
                return self.response.validation_error({'recipient_email': 'Invalid email format'})
            
            result = frappe.call(
                'webshop.quote_generator.email_quote',
                quote_file=quote_file,
                recipient_email=recipient_email,
                message=message
            )
            
            if result and result.get('success'):
                return self.response.success(message="Quote emailed successfully")
            else:
                return self.response.error(result.get('message', 'Failed to email quote'))
        
        except Exception as e:
            frappe.log_error(f"API Error - email_quote: {e}")
            return self.response.error("Internal server error", 500)
    
    # User Management APIs
    
    @frappe.whitelist(allow_guest=True)
    def register_customer(self, user_data: str) -> Dict:
        """Register new customer account"""
        try:
            data = json.loads(user_data) if isinstance(user_data, str) else user_data
            
            # Validate required fields
            required_fields = ['first_name', 'last_name', 'email', 'password']
            validation_errors = self.validator.validate_required_fields(data, required_fields)
            
            if validation_errors:
                return self.response.validation_error(validation_errors)
            
            if not self.validator.validate_email(data['email']):
                return self.response.validation_error({'email': 'Invalid email format'})
            
            result = frappe.call(
                'webshop.user_management.create_customer_account',
                user_data=data
            )
            
            if result and result.get('success'):
                return self.response.success(message="Account created successfully")
            else:
                return self.response.error(result.get('message', 'Registration failed'))
        
        except Exception as e:
            frappe.log_error(f"API Error - register_customer: {e}")
            return self.response.error("Internal server error", 500)
    
    @frappe.whitelist(allow_guest=True)
    def register_contractor(self, contractor_data: str) -> Dict:
        """Register new contractor account"""
        try:
            data = json.loads(contractor_data) if isinstance(contractor_data, str) else contractor_data
            
            # Validate required fields
            required_fields = ['first_name', 'last_name', 'email', 'password']
            validation_errors = self.validator.validate_required_fields(data, required_fields)
            
            if validation_errors:
                return self.response.validation_error(validation_errors)
            
            if not self.validator.validate_email(data['email']):
                return self.response.validation_error({'email': 'Invalid email format'})
            
            result = frappe.call(
                'webshop.user_management.register_contractor_account',
                contractor_data=data
            )
            
            if result and result.get('success'):
                return self.response.success(message="Contractor registration submitted for approval")
            else:
                return self.response.error(result.get('message', 'Registration failed'))
        
        except Exception as e:
            frappe.log_error(f"API Error - register_contractor: {e}")
            return self.response.error("Internal server error", 500)
    
    @frappe.whitelist()
    def get_profile(self) -> Dict:
        """Get current user profile"""
        try:
            result = frappe.call('webshop.user_management.get_current_user_profile')
            
            if result and result.get('success'):
                return self.response.success(data=result['profile'])
            else:
                return self.response.error("Profile not found", 404)
        
        except Exception as e:
            frappe.log_error(f"API Error - get_profile: {e}")
            return self.response.error("Internal server error", 500)
    
    @frappe.whitelist()
    def update_profile(self, profile_data: str) -> Dict:
        """Update user profile"""
        try:
            data = json.loads(profile_data) if isinstance(profile_data, str) else profile_data
            
            result = frappe.call(
                'webshop.user_management.update_my_profile',
                profile_data=data
            )
            
            if result and result.get('success'):
                return self.response.success(message="Profile updated successfully")
            else:
                return self.response.error(result.get('message', 'Profile update failed'))
        
        except Exception as e:
            frappe.log_error(f"API Error - update_profile: {e}")
            return self.response.error("Internal server error", 500)
    
    # Contractor Management APIs
    
    @frappe.whitelist()
    def list_contractors(self, verified_only: bool = True) -> Dict:
        """List available contractors"""
        try:
            result = frappe.call('webshop.user_management.get_available_contractors')
            
            if result and result.get('success'):
                contractors = result['contractors']
                if verified_only:
                    contractors = [c for c in contractors if c.get('verified_contractor')]
                
                return self.response.success(data=contractors)
            else:
                return self.response.error(result.get('message', 'Failed to get contractors'))
        
        except Exception as e:
            frappe.log_error(f"API Error - list_contractors: {e}")
            return self.response.error("Internal server error", 500)
    
    @frappe.whitelist()
    def assign_contractor(self, project_name: str, contractor_profile: str) -> Dict:
        """Assign contractor to project"""
        try:
            result = frappe.call(
                'webshop.user_management.assign_contractor_to_project',
                project_name=project_name,
                contractor_profile=contractor_profile
            )
            
            if result and result.get('success'):
                return self.response.success(message="Contractor assigned successfully")
            else:
                return self.response.error(result.get('message', 'Assignment failed'))
        
        except Exception as e:
            frappe.log_error(f"API Error - assign_contractor: {e}")
            return self.response.error("Internal server error", 500)
    
    # Configuration APIs
    
    @frappe.whitelist(allow_guest=True)
    def get_fence_styles(self) -> Dict:
        """Get available fence styles"""
        try:
            # Get styles from context function
            styles = frappe.call('www.fence-calculator.advanced-fence-calculator.get_fence_styles')
            
            return self.response.success(data=styles)
        
        except Exception as e:
            frappe.log_error(f"API Error - get_fence_styles: {e}")
            return self.response.error("Internal server error", 500)
    
    @frappe.whitelist(allow_guest=True)
    def get_color_options(self) -> Dict:
        """Get available color options"""
        try:
            # Get colors from context function
            colors = frappe.call('www.fence-calculator.advanced-fence-calculator.get_color_options')
            
            return self.response.success(data=colors)
        
        except Exception as e:
            frappe.log_error(f"API Error - get_color_options: {e}")
            return self.response.error("Internal server error", 500)
    
    @frappe.whitelist(allow_guest=True)
    def get_pricing_data(self) -> Dict:
        """Get current pricing data"""
        try:
            # Get pricing from context function
            pricing = frappe.call('www.fence-calculator.advanced-fence-calculator.get_pricing_data')
            
            return self.response.success(data=pricing)
        
        except Exception as e:
            frappe.log_error(f"API Error - get_pricing_data: {e}")
            return self.response.error("Internal server error", 500)
    
    # Estimate Request APIs
    
    @frappe.whitelist(allow_guest=True)
    def submit_estimate_request(self, estimate_data: str) -> Dict:
        """Submit estimate request"""
        try:
            data = json.loads(estimate_data) if isinstance(estimate_data, str) else estimate_data
            
            # Validate required fields
            required_fields = ['name', 'email', 'phone']
            validation_errors = self.validator.validate_required_fields(data, required_fields)
            
            if validation_errors:
                return self.response.validation_error(validation_errors)
            
            if not self.validator.validate_email(data['email']):
                return self.response.validation_error({'email': 'Invalid email format'})
            
            result = frappe.call(
                'webshop.webshop.api.fence_calculator.submit_fence_estimate',
                data=data
            )
            
            if result and result.get('success'):
                return self.response.success(
                    message="Estimate request submitted successfully",
                    data={'inquiry_id': result.get('inquiry_id')}
                )
            else:
                return self.response.error(result.get('message', 'Estimate request failed'))
        
        except Exception as e:
            frappe.log_error(f"API Error - submit_estimate_request: {e}")
            return self.response.error("Internal server error", 500)


# Initialize API instance
fence_api = FenceCalculatorAPI()


# API Endpoint Registration
# All endpoints are prefixed with /api/method/webshop.api.fence_api.

@frappe.whitelist(allow_guest=True)
def calculate_fence_materials(segments_data, fence_type, color="white"):
    """Calculate materials for fence segments"""
    return fence_api.calculate_materials(segments_data, fence_type, color)


@frappe.whitelist(allow_guest=True)
def optimize_fence_layout(segments_data, fence_type):
    """Optimize fence layout for cost efficiency"""
    return fence_api.optimize_layout(segments_data, fence_type)


@frappe.whitelist(allow_guest=True)
def get_fence_specifications(fence_type):
    """Get specifications for fence type"""
    return fence_api.get_fence_specifications(fence_type)


@frappe.whitelist()
def create_fence_project(project_data):
    """Create new fence project"""
    return fence_api.create_project(project_data)


@frappe.whitelist()
def get_fence_project(project_name):
    """Get fence project details"""
    return fence_api.get_project(project_name)


@frappe.whitelist()
def list_fence_projects(limit=20, offset=0, status=None):
    """List fence projects with pagination"""
    return fence_api.list_projects(limit, offset, status)


@frappe.whitelist()
def generate_fence_quote(project_name, quote_options=None):
    """Generate PDF quote for project"""
    return fence_api.generate_quote(project_name, quote_options)


@frappe.whitelist(allow_guest=True)
def generate_fence_calculator_quote(calculation_data, customer_info):
    """Generate quote from calculator data"""
    return fence_api.generate_calculator_quote(calculation_data, customer_info)


@frappe.whitelist()
def email_fence_quote(quote_file, recipient_email, message=None):
    """Email quote to customer"""
    return fence_api.email_quote(quote_file, recipient_email, message)


@frappe.whitelist(allow_guest=True)
def register_fence_customer(user_data):
    """Register new customer account"""
    return fence_api.register_customer(user_data)


@frappe.whitelist(allow_guest=True)
def register_fence_contractor(contractor_data):
    """Register new contractor account"""
    return fence_api.register_contractor(contractor_data)


@frappe.whitelist()
def get_fence_user_profile():
    """Get current user profile"""
    return fence_api.get_profile()


@frappe.whitelist()
def update_fence_user_profile(profile_data):
    """Update user profile"""
    return fence_api.update_profile(profile_data)


@frappe.whitelist()
def list_fence_contractors(verified_only=True):
    """List available contractors"""
    return fence_api.list_contractors(verified_only)


@frappe.whitelist()
def assign_fence_contractor(project_name, contractor_profile):
    """Assign contractor to project"""
    return fence_api.assign_contractor(project_name, contractor_profile)


@frappe.whitelist(allow_guest=True)
def get_fence_calculator_styles():
    """Get available fence styles"""
    return fence_api.get_fence_styles()


@frappe.whitelist(allow_guest=True)
def get_fence_calculator_colors():
    """Get available color options"""
    return fence_api.get_color_options()


@frappe.whitelist(allow_guest=True)
def get_fence_calculator_pricing():
    """Get current pricing data"""
    return fence_api.get_pricing_data()


@frappe.whitelist(allow_guest=True)
def submit_fence_estimate_request(estimate_data):
    """Submit estimate request"""
    return fence_api.submit_estimate_request(estimate_data)


# Utility endpoints for API documentation and health checks

@frappe.whitelist(allow_guest=True)
def api_health():
    """API health check endpoint"""
    return FenceAPIResponse.success(
        data={
            'status': 'healthy',
            'version': '1.0.0',
            'timestamp': now_datetime().isoformat()
        },
        message="Fence Calculator API is running"
    )


@frappe.whitelist(allow_guest=True)
def api_endpoints():
    """List all available API endpoints"""
    endpoints = {
        'calculation': {
            'calculate_fence_materials': {
                'method': 'POST',
                'description': 'Calculate materials for fence segments',
                'auth_required': False
            },
            'optimize_fence_layout': {
                'method': 'POST',
                'description': 'Optimize fence layout for efficiency',
                'auth_required': False
            },
            'get_fence_specifications': {
                'method': 'GET',
                'description': 'Get specifications for fence type',
                'auth_required': False
            }
        },
        'projects': {
            'create_fence_project': {
                'method': 'POST',
                'description': 'Create new fence project',
                'auth_required': True
            },
            'get_fence_project': {
                'method': 'GET',
                'description': 'Get project details',
                'auth_required': True
            },
            'list_fence_projects': {
                'method': 'GET',
                'description': 'List user projects with pagination',
                'auth_required': True
            }
        },
        'quotes': {
            'generate_fence_quote': {
                'method': 'POST',
                'description': 'Generate PDF quote for project',
                'auth_required': True
            },
            'generate_fence_calculator_quote': {
                'method': 'POST',
                'description': 'Generate quote from calculator data',
                'auth_required': False
            },
            'email_fence_quote': {
                'method': 'POST',
                'description': 'Email quote to customer',
                'auth_required': True
            }
        },
        'users': {
            'register_fence_customer': {
                'method': 'POST',
                'description': 'Register customer account',
                'auth_required': False
            },
            'register_fence_contractor': {
                'method': 'POST',
                'description': 'Register contractor account',
                'auth_required': False
            },
            'get_fence_user_profile': {
                'method': 'GET',
                'description': 'Get current user profile',
                'auth_required': True
            },
            'update_fence_user_profile': {
                'method': 'POST',
                'description': 'Update user profile',
                'auth_required': True
            }
        },
        'contractors': {
            'list_fence_contractors': {
                'method': 'GET',
                'description': 'List available contractors',
                'auth_required': True
            },
            'assign_fence_contractor': {
                'method': 'POST',
                'description': 'Assign contractor to project',
                'auth_required': True
            }
        },
        'configuration': {
            'get_fence_calculator_styles': {
                'method': 'GET',
                'description': 'Get available fence styles',
                'auth_required': False
            },
            'get_fence_calculator_colors': {
                'method': 'GET',
                'description': 'Get available colors',
                'auth_required': False
            },
            'get_fence_calculator_pricing': {
                'method': 'GET',
                'description': 'Get current pricing data',
                'auth_required': False
            }
        },
        'estimates': {
            'submit_fence_estimate_request': {
                'method': 'POST',
                'description': 'Submit estimate request',
                'auth_required': False
            }
        },
        'utility': {
            'api_health': {
                'method': 'GET',
                'description': 'API health check',
                'auth_required': False
            },
            'api_endpoints': {
                'method': 'GET',
                'description': 'List all endpoints',
                'auth_required': False
            }
        }
    }
    
    return FenceAPIResponse.success(
        data=endpoints,
        message="Fence Calculator API endpoints"
    )
