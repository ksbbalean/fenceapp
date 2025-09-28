import frappe
import json
import math
from frappe.model.document import Document
from frappe.utils import now_datetime, flt, add_days
from frappe.utils.file_manager import save_file
import os


class FenceProject(Document):
    def before_insert(self):
        """Set default values before insert"""
        self.created_date = now_datetime().date()
        self.created_by = frappe.session.user
        self.last_modified_by = frappe.session.user
        self.status = "Draft"
        
        # Generate project code
        if not self.project_code:
            self.project_code = self.generate_project_code()
    
    def before_save(self):
        """Calculate materials and costs before saving"""
        self.last_modified_by = frappe.session.user
        
        # Parse drawing data and calculate materials
        if self.drawing_data:
            self.calculate_materials_from_drawing()
        
        # Calculate totals
        self.calculate_totals()
        
        # Update status based on changes
        self.update_status()
    
    def generate_project_code(self):
        """Generate unique project code"""
        # Get year and month
        now = now_datetime()
        year_month = now.strftime("%Y%m")
        
        # Get next sequence number for this month
        last_code = frappe.db.sql("""
            SELECT project_code FROM `tabFence Project` 
            WHERE project_code LIKE %s 
            ORDER BY project_code DESC LIMIT 1
        """, f"FP{year_month}%")
        
        if last_code:
            try:
                last_num = int(last_code[0][0][-4:])
                next_num = last_num + 1
            except (ValueError, IndexError):
                next_num = 1
        else:
            next_num = 1
        
        return f"FP{year_month}{next_num:04d}"
    
    def calculate_materials_from_drawing(self):
        """Calculate materials needed from drawing data"""
        try:
            drawing = json.loads(self.drawing_data)
            segments = drawing.get('segments', [])
            
            # Clear existing segments and materials
            self.fence_segments = []
            self.material_list = []
            
            total_length = 0
            total_panels = 0
            total_posts = 0
            total_gates = 0
            corner_posts = 0
            end_posts = 0
            line_posts = 0
            
            for idx, segment in enumerate(segments):
                # Add fence segment
                fence_segment = self.append('fence_segments', {})
                fence_segment.segment_id = f"SEG-{idx+1}"
                fence_segment.start_x = segment.get('path', [{}])[0].get('x', 0) if segment.get('path') else 0
                fence_segment.start_y = segment.get('path', [{}])[0].get('y', 0) if segment.get('path') else 0
                fence_segment.end_x = segment.get('path', [{}])[-1].get('x', 0) if segment.get('path') else 0
                fence_segment.end_y = segment.get('path', [{}])[-1].get('y', 0) if segment.get('path') else 0
                fence_segment.length = segment.get('length', 0)
                fence_segment.fence_style = segment.get('style', self.fence_style)
                fence_segment.fence_color = segment.get('color', self.fence_color)
                
                # Determine if it's a gate (segments shorter than 10 feet)
                is_gate = segment.get('length', 0) < 10
                fence_segment.is_gate = is_gate
                if is_gate:
                    fence_segment.gate_width = segment.get('length', 0)
                    total_gates += 1
                
                # Calculate materials for this segment
                segment_length = segment.get('length', 0)
                total_length += segment_length
                
                # Panel calculation (assuming 8ft panels)
                panel_length = 8  # Standard panel length
                panels_for_segment = math.ceil(segment_length / panel_length)
                fence_segment.panels_needed = panels_for_segment
                total_panels += panels_for_segment
                
                # Post calculation (posts at panel joints + corner/end posts)
                posts_for_segment = panels_for_segment + 1
                fence_segment.posts_needed = posts_for_segment
                total_posts += posts_for_segment
                
                # Hardware calculation (brackets, screws, etc.)
                hardware_pieces = panels_for_segment * 4  # 4 brackets per panel
                fence_segment.hardware_needed = hardware_pieces
            
            # Update project totals
            self.total_length = total_length
            self.total_panels = total_panels
            self.total_posts = total_posts
            self.total_gates = total_gates
            
            # Calculate post types (simplified logic)
            self.corner_posts = max(4, len(segments))  # Minimum 4 corners
            self.end_posts = len(segments) * 2  # 2 end posts per segment
            self.line_posts = max(0, total_posts - self.corner_posts - self.end_posts)
            
            # Generate material list
            self.generate_material_list()
            
        except Exception as e:
            frappe.log_error(f"Error calculating materials from drawing: {e}")
    
    def generate_material_list(self):
        """Generate detailed material list from calculations"""
        try:
            # Get fence style specifications
            style_specs = self.get_fence_style_specs()
            
            # Add panels
            if self.total_panels > 0:
                panel_item = self.get_or_create_fence_item('Panel', style_specs)
                if panel_item:
                    material = self.append('material_list', {})
                    material.item_code = panel_item
                    material.category = 'Panels'
                    material.quantity_needed = self.total_panels
                    material.unit_of_measure = 'Nos'
                    material.unit_price = self.get_item_price(panel_item)
                    material.total_cost = material.quantity_needed * (material.unit_price or 0)
            
            # Add posts
            if self.total_posts > 0:
                post_item = self.get_or_create_fence_item('Post', style_specs)
                if post_item:
                    material = self.append('material_list', {})
                    material.item_code = post_item
                    material.category = 'Posts'
                    material.quantity_needed = self.total_posts
                    material.unit_of_measure = 'Nos'
                    material.unit_price = self.get_item_price(post_item)
                    material.total_cost = material.quantity_needed * (material.unit_price or 0)
            
            # Add gates
            if self.total_gates > 0:
                gate_item = self.get_or_create_fence_item('Gate', style_specs)
                if gate_item:
                    material = self.append('material_list', {})
                    material.item_code = gate_item
                    material.category = 'Gates'
                    material.quantity_needed = self.total_gates
                    material.unit_of_measure = 'Nos'
                    material.unit_price = self.get_item_price(gate_item)
                    material.total_cost = material.quantity_needed * (material.unit_price or 0)
            
            # Add hardware
            hardware_quantity = sum([segment.hardware_needed or 0 for segment in self.fence_segments])
            if hardware_quantity > 0:
                hardware_item = self.get_or_create_fence_item('Hardware', style_specs)
                if hardware_item:
                    material = self.append('material_list', {})
                    material.item_code = hardware_item
                    material.category = 'Hardware'
                    material.quantity_needed = hardware_quantity
                    material.unit_of_measure = 'Nos'
                    material.unit_price = self.get_item_price(hardware_item)
                    material.total_cost = material.quantity_needed * (material.unit_price or 0)
            
        except Exception as e:
            frappe.log_error(f"Error generating material list: {e}")
    
    def get_fence_style_specs(self):
        """Get specifications for the fence style"""
        # Parse fence style to extract material type and style
        style_parts = self.fence_style.lower().split('-')
        material_type = style_parts[0] if style_parts else 'vinyl'
        style_type = style_parts[1] if len(style_parts) > 1 else 'privacy'
        
        return {
            'material_type': material_type.title(),
            'style_type': style_type.title(),
            'height': '6ft',  # Default height
            'color': self.fence_color or 'White'
        }
    
    def get_or_create_fence_item(self, component_type, specs):
        """Get or create fence item for the given specifications"""
        try:
            # Build item name
            item_name = f"{specs['material_type']} {specs['style_type']} {component_type} {specs['height']}"
            
            # Check if item exists
            existing_item = frappe.db.get_value('Item', {'item_name': item_name}, 'name')
            if existing_item:
                return existing_item
            
            # Create new item if it doesn't exist
            item_code = f"{specs['material_type'][:3].upper()}-{component_type[:3].upper()}-{specs['style_type'][:3].upper()}"
            
            # Check if item code exists and make it unique
            counter = 1
            original_code = item_code
            while frappe.db.exists('Item', item_code):
                item_code = f"{original_code}-{counter}"
                counter += 1
            
            item = frappe.get_doc({
                'doctype': 'Item',
                'item_code': item_code,
                'item_name': item_name,
                'item_group': 'Fence Components',
                'is_sales_item': 1,
                'is_purchase_item': 1,
                'is_stock_item': 1,
                'stock_uom': 'Nos',
                'custom_material_type': specs['material_type'],
                'custom_component_type': component_type,
                'custom_style_type': specs['style_type'],
                'custom_height': specs['height'],
                'custom_color': specs['color']
            })
            
            item.insert(ignore_permissions=True)
            return item.name
            
        except Exception as e:
            frappe.log_error(f"Error creating fence item: {e}")
            return None
    
    def get_item_price(self, item_code):
        """Get current selling price for item"""
        try:
            price = frappe.db.get_value(
                'Item Price',
                {
                    'item_code': item_code,
                    'price_list': 'Standard Selling'
                },
                'price_list_rate'
            )
            return price or 0
        except:
            return 0
    
    def calculate_totals(self):
        """Calculate total costs and profit margins"""
        # Calculate estimated cost from materials
        material_cost = sum([mat.total_cost or 0 for mat in self.material_list])
        
        # Add labor and overhead (configurable percentages)
        labor_percentage = frappe.db.get_single_value('Webshop Settings', 'fence_labor_percentage') or 40
        overhead_percentage = frappe.db.get_single_value('Webshop Settings', 'fence_overhead_percentage') or 20
        
        labor_cost = material_cost * (labor_percentage / 100)
        overhead_cost = material_cost * (overhead_percentage / 100)
        
        self.estimated_cost = material_cost + labor_cost + overhead_cost
        
        # Calculate profit margin if final cost is set
        if self.final_cost and self.estimated_cost:
            profit = self.final_cost - self.estimated_cost
            self.profit_margin = (profit / self.final_cost) * 100 if self.final_cost > 0 else 0
    
    def update_status(self):
        """Update project status based on current state"""
        if self.quote_accepted:
            if self.actual_completion_date:
                self.status = "Completed"
            elif self.actual_start_date:
                self.status = "In Progress"
            else:
                self.status = "Quote Accepted"
        elif self.quote_sent:
            self.status = "Quote Sent"
        elif self.quote_generated:
            self.status = "Quote Requested"
    
    def validate(self):
        """Validate project data"""
        if self.assigned_contractor:
            # Validate contractor is active and verified
            contractor = frappe.get_doc('Fence User Profile', self.assigned_contractor)
            if not contractor.active:
                frappe.throw("Assigned contractor is not active")
            if contractor.user_role != 'Contractor':
                frappe.throw("Assigned user is not a contractor")
    
    def on_update(self):
        """Handle project updates"""
        if self.has_value_changed('assigned_contractor'):
            self.assignment_date = now_datetime().date()
            self.send_contractor_assignment_notification()
        
        if self.has_value_changed('status') and self.status in ['Quote Sent', 'Quote Accepted', 'Completed']:
            self.send_status_notification()
    
    def send_contractor_assignment_notification(self):
        """Send notification to contractor about assignment"""
        if not self.assigned_contractor:
            return
        
        try:
            contractor = frappe.get_doc('Fence User Profile', self.assigned_contractor)
            user = frappe.get_doc('User', contractor.user)
            
            subject = f"New Project Assignment: {self.project_name}"
            message = f"""
Dear {contractor.first_name},

You have been assigned to a new fence project:

Project: {self.project_name} ({self.project_code})
Customer: {self.customer_name}
Total Length: {self.total_length} ft
Fence Style: {self.fence_style}
Estimated Cost: ${self.estimated_cost:,.2f}

Installation Address:
{self.installation_address or 'Address to be provided'}

Please review the project details and contact the customer to schedule the installation.

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
            frappe.log_error(f"Error sending contractor assignment notification: {e}")
    
    def send_status_notification(self):
        """Send notification to customer about status change"""
        if not self.customer_email:
            return
        
        try:
            if self.status == "Quote Sent":
                subject = f"Your Fence Quote is Ready - {self.project_code}"
                message = f"""
Dear {self.customer_name},

Your fence quote is ready for review:

Project: {self.project_name}
Total Length: {self.total_length} ft
Fence Style: {self.fence_style}
Total Cost: ${self.final_cost or self.estimated_cost:,.2f}

Please review the attached quote and let us know if you have any questions.

Best regards,
H&J Fence Supply Team
                """
            
            elif self.status == "Quote Accepted":
                subject = f"Thank you for accepting our quote - {self.project_code}"
                message = f"""
Dear {self.customer_name},

Thank you for accepting our fence quote! We're excited to work on your project.

Project: {self.project_name}
Estimated Start Date: {self.estimated_start_date or 'To be scheduled'}
Estimated Completion: {self.estimated_completion_date or 'To be determined'}

Our team will contact you within 1-2 business days to schedule the installation.

Best regards,
H&J Fence Supply Team
                """
            
            elif self.status == "Completed":
                subject = f"Project Completed - {self.project_code}"
                message = f"""
Dear {self.customer_name},

Your fence project has been completed!

Project: {self.project_name}
Completion Date: {self.actual_completion_date}

Thank you for choosing H&J Fence Supply. We hope you're satisfied with your new fence!

If you have any questions or concerns, please don't hesitate to contact us.

Best regards,
H&J Fence Supply Team
                """
            else:
                return
            
            frappe.sendmail(
                recipients=[self.customer_email],
                subject=subject,
                message=message,
                now=True
            )
            
        except Exception as e:
            frappe.log_error(f"Error sending status notification: {e}")


@frappe.whitelist()
def create_project_from_calculator(data):
    """Create fence project from calculator data"""
    try:
        if isinstance(data, str):
            data = json.loads(data)
        
        # Create project
        project = frappe.get_doc({
            'doctype': 'Fence Project',
            'project_name': data.get('project_name') or f"Fence Project - {data.get('customer_name', 'Unknown')}",
            'customer_name': data.get('customer_name') or data.get('name'),
            'customer_email': data.get('customer_email') or data.get('email'),
            'customer_phone': data.get('customer_phone') or data.get('phone'),
            'customer_address': data.get('customer_address') or data.get('address'),
            'installation_address': data.get('installation_address') or data.get('address'),
            'fence_style': data.get('fence_style') or data.get('style'),
            'fence_color': data.get('fence_color') or data.get('color'),
            'total_length': data.get('total_length') or data.get('totalLength'),
            'estimated_cost': data.get('estimated_cost') or data.get('estimate'),
            'drawing_data': json.dumps(data.get('drawing_data', {})),
            'source': 'Web Calculator',
            'notes': data.get('notes', '')
        })
        
        project.insert(ignore_permissions=True)
        
        return {
            'success': True,
            'message': 'Project created successfully',
            'project_name': project.name,
            'project_code': project.project_code
        }
        
    except Exception as e:
        frappe.log_error(f"Error creating project from calculator: {e}")
        return {
            'success': False,
            'message': str(e)
        }


@frappe.whitelist()
def get_project_list(user_role=None, assigned_contractor=None):
    """Get project list based on user role and filters"""
    try:
        filters = {}
        
        if user_role == 'Contractor' and assigned_contractor:
            filters['assigned_contractor'] = assigned_contractor
        elif user_role == 'Customer':
            # Show only projects created by this user
            filters['created_by'] = frappe.session.user
        
        projects = frappe.get_all(
            'Fence Project',
            filters=filters,
            fields=[
                'name', 'project_name', 'project_code', 'status', 'customer_name',
                'total_length', 'fence_style', 'estimated_cost', 'final_cost',
                'created_date', 'estimated_start_date', 'assigned_contractor'
            ],
            order_by='created_date desc',
            limit=50
        )
        
        return {
            'success': True,
            'projects': projects
        }
        
    except Exception as e:
        frappe.log_error(f"Error getting project list: {e}")
        return {
            'success': False,
            'message': str(e)
        }


@frappe.whitelist()
def assign_contractor(project_name, contractor_name):
    """Assign contractor to project"""
    try:
        project = frappe.get_doc('Fence Project', project_name)
        project.assigned_contractor = contractor_name
        
        # Get contractor's company
        contractor = frappe.get_doc('Fence User Profile', contractor_name)
        project.contractor_company = contractor.company
        
        project.save(ignore_permissions=True)
        
        return {
            'success': True,
            'message': 'Contractor assigned successfully'
        }
        
    except Exception as e:
        frappe.log_error(f"Error assigning contractor: {e}")
        return {
            'success': False,
            'message': str(e)
        }
