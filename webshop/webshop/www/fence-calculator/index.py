import frappe
from frappe import _

def get_context(context):
    """Get context for the fence calculator page"""
    context.title = _("Fence Drawing Calculator")
    context.page_title = _("Draw My Fence - Free Estimate Calculator")
    
    # Get fence styles from the database if available
    context.fence_styles = get_fence_styles()
    
    # Get color options
    context.color_options = get_color_options()
    
    # Get pricing data
    context.pricing_data = get_pricing_data()
    
    return context

def get_fence_styles():
    """Get fence styles from the database or return defaults"""
    try:
        # Try to get fence styles from Item doctype with custom fields
        fence_items = frappe.get_all(
            'Item',
            filters={
                'is_sales_item': 1,
                'disabled': 0,
                'custom_material_type': ['in', ['Vinyl', 'Aluminum', 'Wood', 'Chain Link']]
            },
            fields=['item_code', 'item_name', 'custom_material_type', 'custom_material_class', 'custom_height'],
            limit=20
        )
        
        if fence_items:
            styles = []
            for item in fence_items:
                material = item.custom_material_type or 'Unknown'
                style_type = item.custom_material_class or 'Standard'
                height = item.custom_height or '6\''
                
                style_id = f"{material.lower()}-{style_type.lower().replace(' ', '-')}"
                
                styles.append({
                    'id': style_id,
                    'name': f"{material} {style_type}",
                    'icon': get_material_icon(material),
                    'height': height,
                    'material': material,
                    'type': style_type
                })
            
            return styles
    except Exception as e:
        frappe.log_error(f"Error getting fence styles: {e}")
    
    # Return default styles if database query fails
    return [
        {'id': 'vinyl-privacy', 'name': 'Vinyl Privacy', 'icon': '🏠', 'height': '6\'', 'material': 'Vinyl', 'type': 'Privacy'},
        {'id': 'vinyl-semi-privacy', 'name': 'Vinyl Semi-Privacy', 'icon': '🏠', 'height': '6\'', 'material': 'Vinyl', 'type': 'Semi-Privacy'},
        {'id': 'vinyl-picket', 'name': 'Vinyl Picket', 'icon': '🏠', 'height': '4\'', 'material': 'Vinyl', 'type': 'Picket'},
        {'id': 'aluminum-privacy', 'name': 'Aluminum Privacy', 'icon': '🏗️', 'height': '6\'', 'material': 'Aluminum', 'type': 'Privacy'},
        {'id': 'aluminum-picket', 'name': 'Aluminum Picket', 'icon': '🏗️', 'height': '4\'', 'material': 'Aluminum', 'type': 'Picket'},
        {'id': 'wood-privacy', 'name': 'Wood Privacy', 'icon': '🌲', 'height': '6\'', 'material': 'Wood', 'type': 'Privacy'},
        {'id': 'wood-picket', 'name': 'Wood Picket', 'icon': '🌲', 'height': '4\'', 'material': 'Wood', 'type': 'Picket'},
        {'id': 'chain-link', 'name': 'Chain Link', 'icon': '🔗', 'height': '4\'', 'material': 'Chain Link', 'type': 'Security'}
    ]

def get_material_icon(material):
    """Get emoji icon for material type"""
    icons = {
        'Vinyl': '🏠',
        'Aluminum': '🏗️',
        'Wood': '🌲',
        'Chain Link': '🔗'
    }
    return icons.get(material, '🏗️')

def get_color_options():
    """Get color options for fences"""
    return [
        {'name': 'White', 'value': '#ffffff', 'hex': 'white'},
        {'name': 'Sandstone', 'value': '#d2b48c', 'hex': 'sandstone'},
        {'name': 'Khaki', 'value': '#f4f4f4', 'hex': 'khaki'},
        {'name': 'Chestnut Brown', 'value': '#8b4513', 'hex': 'brown'},
        {'name': 'Weathered Cedar', 'value': '#a0522d', 'hex': 'cedar'},
        {'name': 'Black', 'value': '#000000', 'hex': 'black'},
        {'name': 'Gray', 'value': '#808080', 'hex': 'gray'},
        {'name': 'Green', 'value': '#228b22', 'hex': 'green'}
    ]

def get_pricing_data():
    """Get pricing data for fence styles"""
    try:
        # Try to get pricing from Item Price list
        pricing_items = frappe.get_all(
            'Item Price',
            filters={
                'price_list': 'Standard Selling',
                'item_code': ['like', '%fence%']
            },
            fields=['item_code', 'price_list_rate'],
            limit=50
        )
        
        if pricing_items:
            pricing = {}
            for item in pricing_items:
                # Extract material and type from item code
                item_code = item.item_code.lower()
                if 'vinyl' in item_code:
                    if 'privacy' in item_code:
                        pricing['vinyl-privacy'] = {'base': 25, 'perFoot': item.price_list_rate or 18}
                    elif 'picket' in item_code:
                        pricing['vinyl-picket'] = {'base': 20, 'perFoot': item.price_list_rate or 14}
                    else:
                        pricing['vinyl-semi-privacy'] = {'base': 22, 'perFoot': item.price_list_rate or 16}
                elif 'aluminum' in item_code:
                    if 'privacy' in item_code:
                        pricing['aluminum-privacy'] = {'base': 35, 'perFoot': item.price_list_rate or 25}
                    else:
                        pricing['aluminum-picket'] = {'base': 30, 'perFoot': item.price_list_rate or 22}
                elif 'wood' in item_code:
                    if 'privacy' in item_code:
                        pricing['wood-privacy'] = {'base': 18, 'perFoot': item.price_list_rate or 12}
                    else:
                        pricing['wood-picket'] = {'base': 15, 'perFoot': item.price_list_rate or 10}
                elif 'chain' in item_code:
                    pricing['chain-link'] = {'base': 12, 'perFoot': item.price_list_rate or 8}
            
            return pricing
    except Exception as e:
        frappe.log_error(f"Error getting pricing data: {e}")
    
    # Return default pricing if database query fails
    return {
        'vinyl-privacy': {'base': 25, 'perFoot': 18},
        'vinyl-semi-privacy': {'base': 22, 'perFoot': 16},
        'vinyl-picket': {'base': 20, 'perFoot': 14},
        'aluminum-privacy': {'base': 35, 'perFoot': 25},
        'aluminum-picket': {'base': 30, 'perFoot': 22},
        'wood-privacy': {'base': 18, 'perFoot': 12},
        'wood-picket': {'base': 15, 'perFoot': 10},
        'chain-link': {'base': 12, 'perFoot': 8}
    }

