import frappe
from frappe import _
from frappe.utils import now_datetime, get_url
import json

@frappe.whitelist(allow_guest=True)
def submit_fence_estimate(data):
    """Submit fence estimate request from the drawing calculator"""
    try:
        # Parse the data
        if isinstance(data, str):
            data = json.loads(data)
        
        # Create Customer Inquiry document
        inquiry_data = {
            'doctype': 'Customer Inquiry',
            'customer_name': data.get('name', 'Anonymous'),
            'email': data.get('email', ''),
            'phone': data.get('phone', ''),
            'address': data.get('address', ''),
            'inquiry_type': 'Fence Estimate',
            'subject': f"Fence Estimate Request - {data.get('style', 'Unknown Style')}",
            'description': format_estimate_description(data),
            'status': 'Open',
            'source': 'Fence Calculator',
            'custom_fence_data': json.dumps(data)
        }
        
        # Add custom fields if they exist
        if frappe.db.exists('Custom Field', {'dt': 'Customer Inquiry', 'fieldname': 'custom_fence_data'}):
            inquiry_data['custom_fence_data'] = json.dumps(data)
        
        # Create the inquiry
        inquiry = frappe.get_doc(inquiry_data)
        inquiry.insert(ignore_permissions=True)
        
        # Send notification email
        send_estimate_notification(inquiry, data)
        
        return {
            'success': True,
            'message': 'Estimate request submitted successfully',
            'inquiry_id': inquiry.name
        }
        
    except Exception as e:
        frappe.log_error(f"Error submitting fence estimate: {e}")
        return {
            'success': False,
            'message': 'Failed to submit estimate request. Please try again.'
        }

def format_estimate_description(data):
    """Format the estimate data into a readable description"""
    description = f"""
Fence Estimate Request

Project Details:
- Total Length: {data.get('totalLength', 0):.1f} ft
- Fence Style: {data.get('style', 'Unknown')}
- Color: {data.get('color', 'Unknown')}
- Estimated Cost: ${data.get('estimate', 0):.2f}

Customer Information:
- Name: {data.get('name', 'Anonymous')}
- Email: {data.get('email', 'Not provided')}
- Phone: {data.get('phone', 'Not provided')}
- Address: {data.get('address', 'Not provided')}

Additional Notes:
{data.get('notes', 'No additional notes provided')}

Submitted via Fence Drawing Calculator on {now_datetime().strftime('%Y-%m-%d %H:%M:%S')}
"""
    return description

def send_estimate_notification(inquiry, data):
    """Send notification email for new estimate request"""
    try:
        # Get admin email from system settings
        admin_email = frappe.get_value('System Settings', 'System Settings', 'support_email') or 'admin@example.com'
        
        # Email template for estimate notification
        subject = f"New Fence Estimate Request - {inquiry.name}"
        
        message = f"""
A new fence estimate request has been submitted through the online calculator.

Inquiry ID: {inquiry.name}
Customer: {data.get('name', 'Anonymous')}
Email: {data.get('email', 'Not provided')}
Phone: {data.get('phone', 'Not provided')}

Project Details:
- Total Length: {data.get('totalLength', 0):.1f} ft
- Fence Style: {data.get('style', 'Unknown')}
- Estimated Cost: ${data.get('estimate', 0):.2f}

View full details: {get_url(f'/app/customer-inquiry/{inquiry.name}')}

Please respond to the customer within 1-2 business days.
"""
        
        # Send email to admin
        frappe.sendmail(
            recipients=[admin_email],
            subject=subject,
            message=message,
            now=True
        )
        
        # Send confirmation email to customer if email provided
        if data.get('email'):
            customer_subject = "Fence Estimate Request Received"
            customer_message = f"""
Dear {data.get('name', 'Valued Customer')},

Thank you for your fence estimate request. We have received your inquiry and will review your project details.

Project Summary:
- Total Length: {data.get('totalLength', 0):.1f} ft
- Fence Style: {data.get('style', 'Unknown')}
- Estimated Cost: ${data.get('estimate', 0):.2f}

Our team will contact you within 1-2 business days with a detailed quote and to discuss your project requirements.

If you have any questions, please don't hesitate to contact us.

Best regards,
The Fence Supply Team
"""
            
            frappe.sendmail(
                recipients=[data.get('email')],
                subject=customer_subject,
                message=customer_message,
                now=True
            )
            
    except Exception as e:
        frappe.log_error(f"Error sending estimate notification: {e}")

@frappe.whitelist(allow_guest=True)
def get_fence_pricing():
    """Get current fence pricing data"""
    try:
        # Get pricing from database
        pricing_data = get_pricing_from_database()
        
        return {
            'success': True,
            'pricing': pricing_data
        }
        
    except Exception as e:
        frappe.log_error(f"Error getting fence pricing: {e}")
        return {
            'success': False,
            'message': 'Failed to get pricing data'
        }

def get_pricing_from_database():
    """Get fence pricing from database"""
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
        frappe.log_error(f"Error getting pricing from database: {e}")
    
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

@frappe.whitelist(allow_guest=True)
def save_fence_drawing(data):
    """Save fence drawing data for later retrieval"""
    try:
        # Parse the data
        if isinstance(data, str):
            data = json.loads(data)
        
        # Create a temporary document to store the drawing
        drawing_data = {
            'doctype': 'Fence Drawing',
            'customer_name': data.get('customerName', 'Anonymous'),
            'email': data.get('email', ''),
            'drawing_data': json.dumps(data),
            'total_length': data.get('totalLength', 0),
            'fence_style': data.get('style', ''),
            'estimated_cost': data.get('estimate', 0),
            'created_on': now_datetime()
        }
        
        # Check if Fence Drawing doctype exists, if not create a simple document
        if frappe.db.exists('DocType', 'Fence Drawing'):
            drawing = frappe.get_doc(drawing_data)
            drawing.insert(ignore_permissions=True)
        else:
            # Store in a simple table or use existing structure
            frappe.db.sql("""
                INSERT INTO `tabFence Drawing Data` 
                (name, customer_name, email, drawing_data, total_length, fence_style, estimated_cost, creation)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                frappe.generate_hash(),
                data.get('customerName', 'Anonymous'),
                data.get('email', ''),
                json.dumps(data),
                data.get('totalLength', 0),
                data.get('style', ''),
                data.get('estimate', 0),
                now_datetime()
            ))
            frappe.db.commit()
        
        return {
            'success': True,
            'message': 'Drawing saved successfully'
        }
        
    except Exception as e:
        frappe.log_error(f"Error saving fence drawing: {e}")
        return {
            'success': False,
            'message': 'Failed to save drawing'
        }

