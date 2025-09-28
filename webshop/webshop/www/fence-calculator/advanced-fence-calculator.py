import frappe
from frappe import _


def get_context(context):
    """Get context for the advanced fence calculator page"""
    context.title = _("Advanced Fence Calculator")
    context.page_title = _("Professional Fence Design & Calculator")
    
    # Check user authentication and role
    user_profile = get_user_profile()
    context.user_profile = user_profile
    context.is_authenticated = bool(frappe.session.user and frappe.session.user != "Guest")
    
    # Get fence styles and specifications
    context.fence_styles = get_fence_styles()
    context.color_options = get_color_options()
    context.pricing_data = get_pricing_data()
    
    # Get user's saved projects if authenticated
    if context.is_authenticated:
        context.saved_projects = get_user_projects()
    
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


def get_fence_styles():
    """Get comprehensive fence styles with detailed specifications"""
    styles = [
        {
            'id': 'vinyl-privacy',
            'name': 'Vinyl Privacy',
            'icon': '🏠',
            'height': '6\'',
            'material': 'Vinyl',
            'type': 'Privacy',
            'description': 'Solid vinyl panels for maximum privacy',
            'panel_width': 8,
            'durability': 'High',
            'maintenance': 'Low'
        },
        {
            'id': 'vinyl-semi-privacy',
            'name': 'Vinyl Semi-Privacy',
            'icon': '🏠',
            'height': '6\'',
            'material': 'Vinyl',
            'type': 'Semi-Privacy',
            'description': 'Partially open vinyl panels with gaps',
            'panel_width': 8,
            'durability': 'High',
            'maintenance': 'Low'
        },
        {
            'id': 'vinyl-picket',
            'name': 'Vinyl Picket',
            'icon': '🏠',
            'height': '4\'',
            'material': 'Vinyl',
            'type': 'Picket',
            'description': 'Classic picket fence design in vinyl',
            'panel_width': 8,
            'durability': 'High',
            'maintenance': 'Low'
        },
        {
            'id': 'aluminum-privacy',
            'name': 'Aluminum Privacy',
            'icon': '🏗️',
            'height': '6\'',
            'material': 'Aluminum',
            'type': 'Privacy',
            'description': 'Durable aluminum with privacy slats',
            'panel_width': 6,
            'durability': 'Very High',
            'maintenance': 'Very Low'
        },
        {
            'id': 'aluminum-picket',
            'name': 'Aluminum Picket',
            'icon': '🏗️',
            'height': '4\'',
            'material': 'Aluminum',
            'type': 'Picket',
            'description': 'Elegant aluminum picket design',
            'panel_width': 6,
            'durability': 'Very High',
            'maintenance': 'Very Low'
        },
        {
            'id': 'wood-privacy',
            'name': 'Wood Privacy',
            'icon': '🌲',
            'height': '6\'',
            'material': 'Wood',
            'type': 'Privacy',
            'description': 'Traditional wooden privacy fence',
            'panel_width': 8,
            'durability': 'Medium',
            'maintenance': 'High'
        },
        {
            'id': 'wood-picket',
            'name': 'Wood Picket',
            'icon': '🌲',
            'height': '4\'',
            'material': 'Wood',
            'type': 'Picket',
            'description': 'Classic wooden picket fence',
            'panel_width': 8,
            'durability': 'Medium',
            'maintenance': 'High'
        },
        {
            'id': 'chain-link',
            'name': 'Chain Link',
            'icon': '🔗',
            'height': '4\'',
            'material': 'Chain Link',
            'type': 'Security',
            'description': 'Galvanized chain link for security',
            'panel_width': 10,
            'durability': 'High',
            'maintenance': 'Very Low'
        }
    ]
    
    # Try to enhance with database information
    try:
        db_styles = frappe.get_all(
            'Item',
            filters={
                'is_sales_item': 1,
                'disabled': 0,
                'custom_material_type': ['in', ['Vinyl', 'Aluminum', 'Wood', 'Chain Link']]
            },
            fields=['item_code', 'item_name', 'custom_material_type', 'custom_material_class', 'custom_height'],
            limit=50
        )
        
        # Merge database information with default styles
        for style in styles:
            matching_items = [item for item in db_styles 
                            if item.custom_material_type and 
                            item.custom_material_type.lower() in style['material'].lower()]
            if matching_items:
                style['available_items'] = len(matching_items)
                style['item_codes'] = [item.item_code for item in matching_items[:5]]
        
    except Exception as e:
        frappe.log_error(f"Error enhancing fence styles: {e}")
    
    return styles


def get_color_options():
    """Get comprehensive color options"""
    return [
        {'name': 'White', 'value': '#ffffff', 'hex': 'white', 'category': 'Classic'},
        {'name': 'Almond', 'value': '#f5f5dc', 'hex': 'almond', 'category': 'Classic'},
        {'name': 'Sandstone', 'value': '#d2b48c', 'hex': 'sandstone', 'category': 'Neutral'},
        {'name': 'Khaki', 'value': '#f0e68c', 'hex': 'khaki', 'category': 'Neutral'},
        {'name': 'Clay', 'value': '#cd853f', 'hex': 'clay', 'category': 'Earth'},
        {'name': 'Chestnut Brown', 'value': '#8b4513', 'hex': 'brown', 'category': 'Earth'},
        {'name': 'Weathered Cedar', 'value': '#a0522d', 'hex': 'cedar', 'category': 'Wood'},
        {'name': 'Driftwood Gray', 'value': '#696969', 'hex': 'driftwood', 'category': 'Modern'},
        {'name': 'Charcoal', 'value': '#36454f', 'hex': 'charcoal', 'category': 'Modern'},
        {'name': 'Black', 'value': '#000000', 'hex': 'black', 'category': 'Modern'},
        {'name': 'Forest Green', 'value': '#228b22', 'hex': 'green', 'category': 'Nature'},
        {'name': 'Bronze', 'value': '#cd7f32', 'hex': 'bronze', 'category': 'Premium'}
    ]


def get_pricing_data():
    """Get comprehensive pricing data"""
    try:
        # Get pricing from database
        pricing_items = frappe.get_all(
            'Item Price',
            filters={
                'price_list': 'Standard Selling'
            },
            fields=['item_code', 'price_list_rate'],
            limit=100
        )
        
        # Organize pricing by fence type
        pricing = {}
        for item in pricing_items:
            item_code = item.item_code.lower()
            
            # Map item codes to fence types
            fence_type = None
            if 'vinyl' in item_code and 'privacy' in item_code:
                fence_type = 'vinyl-privacy'
            elif 'vinyl' in item_code and 'picket' in item_code:
                fence_type = 'vinyl-picket'
            elif 'vinyl' in item_code:
                fence_type = 'vinyl-semi-privacy'
            elif 'aluminum' in item_code and 'privacy' in item_code:
                fence_type = 'aluminum-privacy'
            elif 'aluminum' in item_code:
                fence_type = 'aluminum-picket'
            elif 'wood' in item_code and 'privacy' in item_code:
                fence_type = 'wood-privacy'
            elif 'wood' in item_code:
                fence_type = 'wood-picket'
            elif 'chain' in item_code:
                fence_type = 'chain-link'
            
            if fence_type and fence_type not in pricing:
                pricing[fence_type] = {
                    'material_cost': item.price_list_rate or 0,
                    'base_cost': 25,
                    'labor_cost': 8,
                    'updated': True
                }
        
        # Fill in missing types with defaults
        default_pricing = {
            'vinyl-privacy': {'material_cost': 18, 'base_cost': 25, 'labor_cost': 8},
            'vinyl-semi-privacy': {'material_cost': 16, 'base_cost': 22, 'labor_cost': 7},
            'vinyl-picket': {'material_cost': 14, 'base_cost': 20, 'labor_cost': 6},
            'aluminum-privacy': {'material_cost': 25, 'base_cost': 35, 'labor_cost': 10},
            'aluminum-picket': {'material_cost': 22, 'base_cost': 30, 'labor_cost': 9},
            'wood-privacy': {'material_cost': 12, 'base_cost': 18, 'labor_cost': 6},
            'wood-picket': {'material_cost': 10, 'base_cost': 15, 'labor_cost': 5},
            'chain-link': {'material_cost': 8, 'base_cost': 12, 'labor_cost': 4}
        }
        
        for fence_type, default_data in default_pricing.items():
            if fence_type not in pricing:
                pricing[fence_type] = default_data
        
        return pricing
        
    except Exception as e:
        frappe.log_error(f"Error getting pricing data: {e}")
        # Return default pricing on error
        return {
            'vinyl-privacy': {'material_cost': 18, 'base_cost': 25, 'labor_cost': 8},
            'vinyl-semi-privacy': {'material_cost': 16, 'base_cost': 22, 'labor_cost': 7},
            'vinyl-picket': {'material_cost': 14, 'base_cost': 20, 'labor_cost': 6},
            'aluminum-privacy': {'material_cost': 25, 'base_cost': 35, 'labor_cost': 10},
            'aluminum-picket': {'material_cost': 22, 'base_cost': 30, 'labor_cost': 9},
            'wood-privacy': {'material_cost': 12, 'base_cost': 18, 'labor_cost': 6},
            'wood-picket': {'material_cost': 10, 'base_cost': 15, 'labor_cost': 5},
            'chain-link': {'material_cost': 8, 'base_cost': 12, 'labor_cost': 4}
        }


def get_user_projects():
    """Get user's saved fence projects"""
    try:
        if not frappe.session.user or frappe.session.user == "Guest":
            return []
        
        projects = frappe.get_all(
            'Fence Project',
            filters={'created_by': frappe.session.user},
            fields=[
                'name', 'project_name', 'project_code', 'status',
                'total_length', 'fence_style', 'estimated_cost',
                'created_date', 'customer_name'
            ],
            order_by='created_date desc',
            limit=10
        )
        
        return projects
        
    except Exception as e:
        frappe.log_error(f"Error getting user projects: {e}")
        return []


@frappe.whitelist()
def save_advanced_project(project_data):
    """Save advanced fence project with full data"""
    try:
        if isinstance(project_data, str):
            import json
            project_data = json.loads(project_data)
        
        # Create project using the fence project creation API
        result = frappe.call(
            'webshop.doctype.fence_project.fence_project.create_project_from_calculator',
            data=project_data
        )
        
        return result
        
    except Exception as e:
        frappe.log_error(f"Error saving advanced project: {e}")
        return {
            'success': False,
            'message': str(e)
        }


@frappe.whitelist()
def load_project(project_name):
    """Load fence project data for editing"""
    try:
        project = frappe.get_doc('Fence Project', project_name)
        
        # Check permissions
        if project.created_by != frappe.session.user and not frappe.has_permission('Fence Project', 'read', project_name):
            frappe.throw("Access denied")
        
        # Return project data in format expected by frontend
        project_data = {
            'project_name': project.project_name,
            'customer_name': project.customer_name,
            'fence_style': project.fence_style,
            'fence_color': project.fence_color,
            'total_length': project.total_length,
            'estimated_cost': project.estimated_cost,
            'segments': []
        }
        
        # Parse drawing data if available
        if project.drawing_data:
            try:
                import json
                drawing_data = json.loads(project.drawing_data)
                project_data['segments'] = drawing_data.get('segments', [])
            except:
                pass
        
        return {
            'success': True,
            'project_data': project_data
        }
        
    except Exception as e:
        frappe.log_error(f"Error loading project: {e}")
        return {
            'success': False,
            'message': str(e)
        }


@frappe.whitelist()
def get_project_share_link(project_name):
    """Generate shareable link for fence project"""
    try:
        project = frappe.get_doc('Fence Project', project_name)
        
        # Check permissions
        if project.created_by != frappe.session.user and not frappe.has_permission('Fence Project', 'read', project_name):
            frappe.throw("Access denied")
        
        # Create shareable data (limited for public access)
        share_data = {
            'project_name': project.project_name,
            'fence_style': project.fence_style,
            'fence_color': project.fence_color,
            'total_length': project.total_length,
            'segments': []
        }
        
        # Parse drawing data
        if project.drawing_data:
            try:
                import json
                drawing_data = json.loads(project.drawing_data)
                share_data['segments'] = drawing_data.get('segments', [])
            except:
                pass
        
        # Generate share token
        import base64
        share_token = base64.b64encode(json.dumps(share_data).encode()).decode()
        
        # Create share URL
        share_url = f"{frappe.utils.get_url()}/fence-calculator/advanced-fence-calculator?share={share_token}"
        
        return {
            'success': True,
            'share_url': share_url,
            'share_token': share_token
        }
        
    except Exception as e:
        frappe.log_error(f"Error generating share link: {e}")
        return {
            'success': False,
            'message': str(e)
        }
