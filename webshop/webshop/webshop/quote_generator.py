"""
Professional PDF Quote Generator for Fence Calculator
Generates branded quotes with detailed breakdowns, diagrams, and terms
"""

import frappe
from frappe import _
from frappe.utils import now_datetime, flt, add_days, format_date, get_url
import json
import os
import base64
from io import BytesIO

try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib.colors import HexColor, black, white, grey
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
    from reportlab.platypus.frames import Frame
    from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
    from reportlab.graphics.shapes import Drawing, Rect, Line, Circle
    from reportlab.graphics import renderPDF
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False


class FenceQuoteGenerator:
    """Professional fence quote generator with PDF output"""
    
    def __init__(self):
        self.page_width = letter[0]
        self.page_height = letter[1]
        self.margin = 0.75 * inch
        self.content_width = self.page_width - 2 * self.margin
        
        # Company branding colors
        self.primary_color = HexColor('#2c3e50')
        self.secondary_color = HexColor('#3498db')
        self.accent_color = HexColor('#e74c3c')
        
        # Initialize styles
        self.styles = self._create_styles()
    
    def _create_styles(self):
        """Create custom paragraph styles for the quote"""
        styles = getSampleStyleSheet()
        
        # Custom styles
        styles.add(ParagraphStyle(
            name='CompanyHeader',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=self.primary_color,
            spaceAfter=6,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        ))
        
        styles.add(ParagraphStyle(
            name='QuoteTitle',
            parent=styles['Heading2'],
            fontSize=18,
            textColor=self.secondary_color,
            spaceAfter=12,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        ))
        
        styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=styles['Heading3'],
            fontSize=14,
            textColor=self.primary_color,
            spaceAfter=6,
            fontName='Helvetica-Bold'
        ))
        
        styles.add(ParagraphStyle(
            name='CustomerInfo',
            parent=styles['Normal'],
            fontSize=11,
            spaceAfter=4,
            fontName='Helvetica'
        ))
        
        styles.add(ParagraphStyle(
            name='Terms',
            parent=styles['Normal'],
            fontSize=9,
            textColor=grey,
            alignment=TA_JUSTIFY,
            fontName='Helvetica'
        ))
        
        styles.add(ParagraphStyle(
            name='Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=grey,
            alignment=TA_CENTER,
            fontName='Helvetica'
        ))
        
        return styles
    
    def generate_quote(self, project_data, quote_options=None):
        """Generate professional PDF quote from project data"""
        try:
            if not REPORTLAB_AVAILABLE:
                return self._generate_html_quote(project_data, quote_options)
            
            # Create PDF buffer
            buffer = BytesIO()
            
            # Create document
            doc = SimpleDocTemplate(
                buffer,
                pagesize=letter,
                rightMargin=self.margin,
                leftMargin=self.margin,
                topMargin=self.margin,
                bottomMargin=self.margin
            )
            
            # Build quote content
            story = []
            
            # Header
            story.extend(self._build_header(project_data))
            story.append(Spacer(1, 0.2 * inch))
            
            # Customer information
            story.extend(self._build_customer_info(project_data))
            story.append(Spacer(1, 0.2 * inch))
            
            # Project summary
            story.extend(self._build_project_summary(project_data))
            story.append(Spacer(1, 0.2 * inch))
            
            # Material breakdown
            story.extend(self._build_material_breakdown(project_data))
            story.append(Spacer(1, 0.2 * inch))
            
            # Cost breakdown
            story.extend(self._build_cost_breakdown(project_data))
            story.append(Spacer(1, 0.2 * inch))
            
            # Fence diagram if available
            if project_data.get('drawing_data'):
                story.extend(self._build_fence_diagram(project_data))
                story.append(Spacer(1, 0.2 * inch))
            
            # Terms and conditions
            story.extend(self._build_terms_and_conditions(quote_options))
            
            # Footer
            story.extend(self._build_footer())
            
            # Build PDF
            doc.build(story)
            
            # Get PDF data
            pdf_data = buffer.getvalue()
            buffer.close()
            
            # Save quote file
            quote_filename = self._save_quote_file(project_data, pdf_data)
            
            return {
                'success': True,
                'quote_file': quote_filename,
                'pdf_data': base64.b64encode(pdf_data).decode(),
                'message': 'Quote generated successfully'
            }
            
        except Exception as e:
            frappe.log_error(f"Error generating quote: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def _build_header(self, project_data):
        """Build quote header with company branding"""
        elements = []
        
        # Company name
        elements.append(Paragraph("H&J FENCE SUPPLY", self.styles['CompanyHeader']))
        
        # Tagline
        elements.append(Paragraph("Professional Fence Installation & Supply", self.styles['Normal']))
        
        # Contact info
        contact_info = """
        <para align="center">
        📍 123 Main Street, Dallas, TX 75201 | 📞 (555) 123-4567 | 📧 info@hjfencesupply.com<br/>
        🌐 www.hjfencesupply.com | License #TX123456
        </para>
        """
        elements.append(Paragraph(contact_info, self.styles['Normal']))
        
        # Quote title
        quote_number = project_data.get('project_code', 'QUOTE-001')
        elements.append(Paragraph(f"FENCE INSTALLATION QUOTE #{quote_number}", self.styles['QuoteTitle']))
        
        # Quote date and validity
        quote_date = format_date(now_datetime().date())
        valid_until = format_date(add_days(now_datetime().date(), 30))
        
        date_info = f"""
        <para align="center">
        Quote Date: {quote_date} | Valid Until: {valid_until}
        </para>
        """
        elements.append(Paragraph(date_info, self.styles['Normal']))
        
        return elements
    
    def _build_customer_info(self, project_data):
        """Build customer information section"""
        elements = []
        
        elements.append(Paragraph("CUSTOMER INFORMATION", self.styles['SectionHeader']))
        
        # Customer details table
        customer_data = [
            ['Customer Name:', project_data.get('customer_name', 'N/A')],
            ['Email:', project_data.get('customer_email', 'N/A')],
            ['Phone:', project_data.get('customer_phone', 'N/A')],
            ['Project Address:', project_data.get('installation_address', project_data.get('customer_address', 'N/A'))],
        ]
        
        customer_table = Table(customer_data, colWidths=[2*inch, 4*inch])
        customer_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        
        elements.append(customer_table)
        
        return elements
    
    def _build_project_summary(self, project_data):
        """Build project summary section"""
        elements = []
        
        elements.append(Paragraph("PROJECT SUMMARY", self.styles['SectionHeader']))
        
        # Project details
        fence_style = project_data.get('fence_style', 'N/A')
        fence_color = project_data.get('fence_color', 'N/A')
        total_length = project_data.get('total_length', 0)
        
        # Parse fence segments for detailed breakdown
        segments = project_data.get('fence_segments', [])
        gate_count = sum(1 for seg in segments if seg.get('is_gate', False))
        section_count = len(segments)
        
        summary_data = [
            ['Fence Style:', fence_style.replace('-', ' ').title()],
            ['Fence Color:', fence_color.title()],
            ['Total Length:', f"{total_length:.1f} feet"],
            ['Number of Sections:', str(section_count)],
            ['Number of Gates:', str(gate_count)],
            ['Estimated Installation Time:', self._calculate_installation_time(total_length, gate_count)]
        ]
        
        summary_table = Table(summary_data, colWidths=[2.5*inch, 3.5*inch])
        summary_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (1, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        
        elements.append(summary_table)
        
        return elements
    
    def _build_material_breakdown(self, project_data):
        """Build detailed material breakdown table"""
        elements = []
        
        elements.append(Paragraph("MATERIAL BREAKDOWN", self.styles['SectionHeader']))
        
        # Get material list from project data
        materials = project_data.get('material_list', [])
        
        if not materials:
            # Generate basic materials if not provided
            materials = self._generate_basic_materials(project_data)
        
        # Create material table
        table_data = [['Item', 'Description', 'Quantity', 'Unit', 'Unit Price', 'Total']]
        
        total_material_cost = 0
        
        for material in materials:
            item_name = material.get('item_name', material.get('category', 'Unknown'))
            description = self._get_material_description(material)
            quantity = material.get('quantity_needed', 0)
            unit = material.get('unit_of_measure', 'ea')
            unit_price = material.get('unit_price', 0)
            total_price = quantity * unit_price
            
            total_material_cost += total_price
            
            table_data.append([
                item_name,
                description,
                f"{quantity:.0f}",
                unit,
                f"${unit_price:.2f}",
                f"${total_price:.2f}"
            ])
        
        # Add subtotal row
        table_data.append(['', '', '', '', 'Subtotal:', f"${total_material_cost:.2f}"])
        
        material_table = Table(table_data, colWidths=[1.2*inch, 2*inch, 0.8*inch, 0.6*inch, 0.8*inch, 0.8*inch])
        material_table.setStyle(TableStyle([
            # Header row
            ('BACKGROUND', (0, 0), (-1, 0), self.primary_color),
            ('TEXTCOLOR', (0, 0), (-1, 0), white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            
            # Data rows
            ('FONTNAME', (0, 1), (-1, -2), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -2), 9),
            ('ALIGN', (2, 1), (-1, -2), 'CENTER'),
            ('ALIGN', (4, 1), (-1, -2), 'RIGHT'),
            ('ALIGN', (5, 1), (-1, -2), 'RIGHT'),
            
            # Subtotal row
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, -1), (-1, -1), 10),
            ('ALIGN', (4, -1), (-1, -1), 'RIGHT'),
            ('BACKGROUND', (4, -1), (-1, -1), HexColor('#f8f9fa')),
            
            # Grid
            ('GRID', (0, 0), (-1, -1), 0.5, black),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            
            # Padding
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        
        elements.append(material_table)
        
        return elements
    
    def _build_cost_breakdown(self, project_data):
        """Build comprehensive cost breakdown"""
        elements = []
        
        elements.append(Paragraph("COST BREAKDOWN", self.styles['SectionHeader']))
        
        # Get cost breakdown from project
        cost_breakdown = project_data.get('cost_breakdown', {})
        
        # Calculate costs if not provided
        if not cost_breakdown:
            cost_breakdown = self._calculate_basic_costs(project_data)
        
        # Build cost table
        cost_data = []
        
        # Material costs
        material_cost = cost_breakdown.get('material_cost', 0)
        labor_cost = cost_breakdown.get('labor_cost', 0)
        gate_cost = cost_breakdown.get('gate_cost', 0)
        concrete_cost = cost_breakdown.get('concrete_cost', 0)
        hardware_cost = cost_breakdown.get('hardware_cost', 0)
        
        cost_data.extend([
            ['Materials & Supplies', f"${material_cost:.2f}"],
            ['Labor & Installation', f"${labor_cost:.2f}"],
            ['Gates & Hardware', f"${gate_cost + hardware_cost:.2f}"],
            ['Concrete & Footings', f"${concrete_cost:.2f}"],
        ])
        
        subtotal = material_cost + labor_cost + gate_cost + concrete_cost + hardware_cost
        cost_data.append(['', ''])  # Spacer
        cost_data.append(['Subtotal', f"${subtotal:.2f}"])
        
        # Tax and markup
        markup = cost_breakdown.get('markup', subtotal * 0.15)
        tax = cost_breakdown.get('tax', (subtotal + markup) * 0.08)
        total = subtotal + markup + tax
        
        cost_data.extend([
            ['Profit Margin (15%)', f"${markup:.2f}"],
            ['Sales Tax (8%)', f"${tax:.2f}"],
            ['', ''],  # Spacer
            ['TOTAL PROJECT COST', f"${total:.2f}"]
        ])
        
        cost_table = Table(cost_data, colWidths=[4*inch, 2*inch])
        cost_table.setStyle(TableStyle([
            # Regular rows
            ('FONTNAME', (0, 0), (-1, -4), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -4), 11),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            
            # Subtotal row
            ('FONTNAME', (0, -4), (-1, -4), 'Helvetica-Bold'),
            ('LINEABOVE', (0, -4), (-1, -4), 1, black),
            
            # Total row
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, -1), (-1, -1), 14),
            ('BACKGROUND', (0, -1), (-1, -1), self.secondary_color),
            ('TEXTCOLOR', (0, -1), (-1, -1), white),
            ('LINEABOVE', (0, -1), (-1, -1), 2, black),
            
            # Padding
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        
        elements.append(cost_table)
        
        # Payment terms
        elements.append(Spacer(1, 0.1 * inch))
        payment_terms = """
        <b>Payment Terms:</b> 50% deposit required to begin work, remaining balance due upon completion.
        We accept cash, check, and major credit cards.
        """
        elements.append(Paragraph(payment_terms, self.styles['Normal']))
        
        return elements
    
    def _build_fence_diagram(self, project_data):
        """Build fence layout diagram"""
        elements = []
        
        elements.append(Paragraph("FENCE LAYOUT DIAGRAM", self.styles['SectionHeader']))
        
        try:
            # Parse drawing data
            drawing_data = project_data.get('drawing_data', {})
            if isinstance(drawing_data, str):
                drawing_data = json.loads(drawing_data)
            
            segments = drawing_data.get('segments', [])
            
            if segments:
                # Create simple diagram
                diagram = self._create_fence_diagram(segments)
                if diagram:
                    elements.append(diagram)
                else:
                    elements.append(Paragraph("Fence layout diagram will be provided separately.", self.styles['Normal']))
            else:
                elements.append(Paragraph("Custom fence layout as discussed.", self.styles['Normal']))
                
        except Exception as e:
            frappe.log_error(f"Error creating fence diagram: {e}")
            elements.append(Paragraph("Fence layout diagram will be provided separately.", self.styles['Normal']))
        
        return elements
    
    def _create_fence_diagram(self, segments):
        """Create a simple fence diagram from segments"""
        try:
            # Create drawing
            diagram_width = 6 * inch
            diagram_height = 4 * inch
            
            drawing = Drawing(diagram_width, diagram_height)
            
            # Find bounds of the fence
            min_x = min_y = float('inf')
            max_x = max_y = float('-inf')
            
            for segment in segments:
                path = segment.get('path', [])
                for point in path:
                    min_x = min(min_x, point.get('x', 0))
                    min_y = min(min_y, point.get('y', 0))
                    max_x = max(max_x, point.get('x', 0))
                    max_y = max(max_y, point.get('y', 0))
            
            # Calculate scale
            fence_width = max_x - min_x
            fence_height = max_y - min_y
            
            if fence_width == 0 or fence_height == 0:
                return None
            
            scale_x = (diagram_width - 40) / fence_width
            scale_y = (diagram_height - 40) / fence_height
            scale = min(scale_x, scale_y)
            
            # Draw segments
            for segment in segments:
                path = segment.get('path', [])
                is_gate = segment.get('is_gate', False)
                
                if len(path) >= 2:
                    for i in range(len(path) - 1):
                        x1 = 20 + (path[i]['x'] - min_x) * scale
                        y1 = 20 + (path[i]['y'] - min_y) * scale
                        x2 = 20 + (path[i+1]['x'] - min_x) * scale
                        y2 = 20 + (path[i+1]['y'] - min_y) * scale
                        
                        # Draw line
                        line = Line(x1, y1, x2, y2)
                        line.strokeColor = HexColor('#e74c3c') if is_gate else HexColor('#2c3e50')
                        line.strokeWidth = 3 if is_gate else 2
                        if is_gate:
                            line.strokeDashArray = [5, 5]
                        
                        drawing.add(line)
                        
                        # Draw posts
                        post1 = Circle(x1, y1, 2)
                        post1.fillColor = HexColor('#6c757d')
                        post1.strokeColor = HexColor('#495057')
                        drawing.add(post1)
                        
                        if i == len(path) - 2:  # Last point
                            post2 = Circle(x2, y2, 2)
                            post2.fillColor = HexColor('#6c757d')
                            post2.strokeColor = HexColor('#495057')
                            drawing.add(post2)
            
            return drawing
            
        except Exception as e:
            frappe.log_error(f"Error creating fence diagram: {e}")
            return None
    
    def _build_terms_and_conditions(self, quote_options):
        """Build terms and conditions section"""
        elements = []
        
        elements.append(Paragraph("TERMS & CONDITIONS", self.styles['SectionHeader']))
        
        terms = [
            "1. <b>Quote Validity:</b> This quote is valid for 30 days from the date above.",
            "2. <b>Payment Terms:</b> 50% deposit required before work begins, balance due upon completion.",
            "3. <b>Materials:</b> All materials are covered by manufacturer warranty. Labor warranty is 2 years.",
            "4. <b>Timeline:</b> Installation typically begins within 1-2 weeks of signed contract and deposit.",
            "5. <b>Permits:</b> Customer is responsible for obtaining any required permits unless otherwise specified.",
            "6. <b>Site Preparation:</b> Customer must mark all underground utilities before installation begins.",
            "7. <b>Weather:</b> Installation may be delayed due to weather conditions beyond our control.",
            "8. <b>Changes:</b> Any changes to the scope of work must be approved in writing and may affect pricing.",
            "9. <b>Access:</b> Customer must provide clear access to work area for equipment and materials.",
            "10. <b>Cleanup:</b> We will clean up all debris and leave the work area neat and tidy."
        ]
        
        for term in terms:
            elements.append(Paragraph(term, self.styles['Terms']))
            elements.append(Spacer(1, 0.05 * inch))
        
        # Acceptance
        elements.append(Spacer(1, 0.1 * inch))
        acceptance_text = """
        <b>Quote Acceptance:</b> To accept this quote and begin your project, please sign below and return with deposit.
        We look forward to working with you!
        """
        elements.append(Paragraph(acceptance_text, self.styles['Normal']))
        
        # Signature lines
        elements.append(Spacer(1, 0.3 * inch))
        signature_data = [
            ['Customer Signature:', '', 'Date:', ''],
            ['', '_' * 30, '', '_' * 15],
            ['', '', '', ''],
            ['H&J Fence Supply Representative:', '', 'Date:', ''],
            ['', '_' * 30, '', '_' * 15]
        ]
        
        signature_table = Table(signature_data, colWidths=[2*inch, 2.5*inch, 0.8*inch, 1*inch])
        signature_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        
        elements.append(signature_table)
        
        return elements
    
    def _build_footer(self):
        """Build quote footer"""
        elements = []
        
        elements.append(Spacer(1, 0.2 * inch))
        
        footer_text = """
        Thank you for considering H&J Fence Supply for your fencing needs.<br/>
        Licensed, Bonded, and Insured | Better Business Bureau A+ Rating<br/>
        Follow us on social media for tips and project galleries!
        """
        elements.append(Paragraph(footer_text, self.styles['Footer']))
        
        return elements
    
    def _generate_basic_materials(self, project_data):
        """Generate basic material list if not provided"""
        total_length = project_data.get('total_length', 0)
        fence_style = project_data.get('fence_style', 'vinyl-privacy')
        
        # Basic material calculations
        panels_needed = max(1, int(total_length / 8))  # 8ft panels
        posts_needed = panels_needed + 1
        gates = len([s for s in project_data.get('fence_segments', []) if s.get('is_gate', False)])
        
        materials = [
            {
                'item_name': f'{fence_style.replace("-", " ").title()} Panels',
                'category': 'Panels',
                'quantity_needed': panels_needed,
                'unit_of_measure': 'ea',
                'unit_price': 45.00
            },
            {
                'item_name': 'Fence Posts',
                'category': 'Posts', 
                'quantity_needed': posts_needed,
                'unit_of_measure': 'ea',
                'unit_price': 25.00
            },
            {
                'item_name': 'Hardware Kit',
                'category': 'Hardware',
                'quantity_needed': panels_needed,
                'unit_of_measure': 'set',
                'unit_price': 8.00
            }
        ]
        
        if gates > 0:
            materials.append({
                'item_name': 'Gate Assembly',
                'category': 'Gates',
                'quantity_needed': gates,
                'unit_of_measure': 'ea',
                'unit_price': 150.00
            })
        
        return materials
    
    def _get_material_description(self, material):
        """Get material description based on category"""
        category = material.get('category', '')
        item_name = material.get('item_name', '')
        
        descriptions = {
            'Panels': 'High-quality fence panels with UV protection',
            'Posts': 'Heavy-duty fence posts with concrete footings',
            'Hardware': 'Stainless steel brackets and fasteners',
            'Gates': 'Complete gate assembly with hinges and latch',
            'Concrete': 'Fast-setting concrete mix for post installation'
        }
        
        return descriptions.get(category, item_name)
    
    def _calculate_basic_costs(self, project_data):
        """Calculate basic costs if not provided"""
        total_length = project_data.get('total_length', 0)
        
        # Basic pricing per linear foot
        material_cost = total_length * 12.00
        labor_cost = total_length * 8.00
        gate_cost = len([s for s in project_data.get('fence_segments', []) if s.get('is_gate', False)]) * 150
        
        return {
            'material_cost': material_cost,
            'labor_cost': labor_cost,
            'gate_cost': gate_cost,
            'concrete_cost': total_length * 2.00,
            'hardware_cost': total_length * 1.50
        }
    
    def _calculate_installation_time(self, total_length, gate_count):
        """Calculate estimated installation time"""
        # Base time calculation
        base_hours = total_length / 50  # 50 feet per day average
        gate_hours = gate_count * 0.5  # 0.5 day per gate
        
        total_days = max(1, base_hours + gate_hours)
        
        if total_days < 1:
            return "1 day"
        elif total_days < 2:
            return "1-2 days"
        else:
            return f"{int(total_days)}-{int(total_days) + 1} days"
    
    def _save_quote_file(self, project_data, pdf_data):
        """Save quote PDF file and return file path"""
        try:
            # Generate filename
            project_code = project_data.get('project_code', 'QUOTE')
            customer_name = project_data.get('customer_name', 'Customer').replace(' ', '_')
            timestamp = now_datetime().strftime('%Y%m%d_%H%M%S')
            filename = f"Quote_{project_code}_{customer_name}_{timestamp}.pdf"
            
            # Save file using Frappe's file manager
            file_doc = frappe.get_doc({
                'doctype': 'File',
                'file_name': filename,
                'content': pdf_data,
                'is_private': 1,
                'folder': 'Home/Fence Quotes'
            })
            file_doc.insert(ignore_permissions=True)
            
            return file_doc.file_url
            
        except Exception as e:
            frappe.log_error(f"Error saving quote file: {e}")
            return None
    
    def _generate_html_quote(self, project_data, quote_options):
        """Fallback HTML quote generation if ReportLab is not available"""
        try:
            # Generate HTML quote
            html_content = self._build_html_quote(project_data, quote_options)
            
            # Save as HTML file
            project_code = project_data.get('project_code', 'QUOTE')
            customer_name = project_data.get('customer_name', 'Customer').replace(' ', '_')
            timestamp = now_datetime().strftime('%Y%m%d_%H%M%S')
            filename = f"Quote_{project_code}_{customer_name}_{timestamp}.html"
            
            file_doc = frappe.get_doc({
                'doctype': 'File',
                'file_name': filename,
                'content': html_content.encode(),
                'is_private': 1,
                'folder': 'Home/Fence Quotes'
            })
            file_doc.insert(ignore_permissions=True)
            
            return {
                'success': True,
                'quote_file': file_doc.file_url,
                'html_content': html_content,
                'message': 'HTML quote generated successfully'
            }
            
        except Exception as e:
            frappe.log_error(f"Error generating HTML quote: {e}")
            return {
                'success': False,
                'message': str(e)
            }
    
    def _build_html_quote(self, project_data, quote_options):
        """Build HTML version of quote"""
        # This would contain HTML template for quote
        # Implementation would mirror the PDF structure but in HTML format
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Fence Quote - {project_data.get('project_code', 'QUOTE')}</title>
            <style>
                /* CSS styles for professional quote */
                body {{ font-family: Arial, sans-serif; margin: 40px; }}
                .header {{ text-align: center; color: #2c3e50; }}
                .section {{ margin: 20px 0; }}
                table {{ width: 100%; border-collapse: collapse; }}
                th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
                th {{ background-color: #2c3e50; color: white; }}
                .total {{ font-weight: bold; background-color: #3498db; color: white; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>H&J FENCE SUPPLY</h1>
                <p>Professional Fence Installation & Supply</p>
                <h2>FENCE INSTALLATION QUOTE #{project_data.get('project_code', 'QUOTE')}</h2>
            </div>
            
            <div class="section">
                <h3>Customer Information</h3>
                <p><strong>Name:</strong> {project_data.get('customer_name', 'N/A')}</p>
                <p><strong>Email:</strong> {project_data.get('customer_email', 'N/A')}</p>
                <p><strong>Phone:</strong> {project_data.get('customer_phone', 'N/A')}</p>
            </div>
            
            <div class="section">
                <h3>Project Summary</h3>
                <p><strong>Fence Style:</strong> {project_data.get('fence_style', 'N/A')}</p>
                <p><strong>Total Length:</strong> {project_data.get('total_length', 0):.1f} feet</p>
            </div>
            
            <!-- Additional sections would be added here -->
            
        </body>
        </html>
        """


# Global instance
quote_generator = FenceQuoteGenerator()


# API endpoints
@frappe.whitelist()
def generate_project_quote(project_name, quote_options=None):
    """Generate quote for fence project"""
    try:
        # Get project data
        project = frappe.get_doc('Fence Project', project_name)
        
        # Check permissions
        if not frappe.has_permission('Fence Project', 'read', project_name):
            return {
                'success': False,
                'message': 'Access denied'
            }
        
        # Prepare project data for quote generation
        project_data = {
            'project_code': project.project_code,
            'project_name': project.project_name,
            'customer_name': project.customer_name,
            'customer_email': project.customer_email,
            'customer_phone': project.customer_phone,
            'customer_address': project.customer_address,
            'installation_address': project.installation_address,
            'fence_style': project.fence_style,
            'fence_color': project.fence_color,
            'total_length': project.total_length,
            'estimated_cost': project.estimated_cost,
            'drawing_data': project.drawing_data,
            'fence_segments': [
                {
                    'segment_id': seg.segment_id,
                    'length': seg.length,
                    'is_gate': seg.is_gate,
                    'fence_style': seg.fence_style
                }
                for seg in project.fence_segments
            ],
            'material_list': [
                {
                    'item_name': mat.item_name,
                    'category': mat.category,
                    'quantity_needed': mat.quantity_needed,
                    'unit_of_measure': mat.unit_of_measure,
                    'unit_price': mat.unit_price,
                    'total_cost': mat.total_cost
                }
                for mat in project.material_list
            ]
        }
        
        # Parse quote options
        if isinstance(quote_options, str):
            quote_options = json.loads(quote_options)
        
        # Generate quote
        result = quote_generator.generate_quote(project_data, quote_options)
        
        if result['success']:
            # Update project with quote information
            project.quote_generated = 1
            project.quote_version = (project.quote_version or 0) + 1
            project.quote_file = result.get('quote_file')
            project.save(ignore_permissions=True)
        
        return result
        
    except Exception as e:
        frappe.log_error(f"Error generating project quote: {e}")
        return {
            'success': False,
            'message': str(e)
        }


@frappe.whitelist()
def generate_calculator_quote(calculation_data, customer_info=None):
    """Generate quote directly from calculator data"""
    try:
        if isinstance(calculation_data, str):
            calculation_data = json.loads(calculation_data)
        
        if isinstance(customer_info, str):
            customer_info = json.loads(customer_info)
        
        # Prepare project data
        project_data = {
            'project_code': f"CALC-{now_datetime().strftime('%Y%m%d%H%M%S')}",
            'project_name': 'Calculator Quote',
            'customer_name': customer_info.get('name', 'Valued Customer'),
            'customer_email': customer_info.get('email', ''),
            'customer_phone': customer_info.get('phone', ''),
            'customer_address': customer_info.get('address', ''),
            'installation_address': customer_info.get('installation_address', customer_info.get('address', '')),
            'fence_style': calculation_data.get('fence_style', ''),
            'fence_color': calculation_data.get('fence_color', ''),
            'total_length': calculation_data.get('total_length', 0),
            'estimated_cost': calculation_data.get('total_cost', 0),
            'drawing_data': json.dumps(calculation_data.get('segments', [])),
            'cost_breakdown': calculation_data.get('cost_breakdown', {}),
            'material_list': calculation_data.get('materials', {})
        }
        
        # Generate quote
        result = quote_generator.generate_quote(project_data)
        
        return result
        
    except Exception as e:
        frappe.log_error(f"Error generating calculator quote: {e}")
        return {
            'success': False,
            'message': str(e)
        }


@frappe.whitelist()
def email_quote(quote_file, recipient_email, message=None):
    """Email quote to customer"""
    try:
        if not quote_file or not recipient_email:
            return {
                'success': False,
                'message': 'Quote file and recipient email are required'
            }
        
        # Get file
        file_doc = frappe.get_doc('File', {'file_url': quote_file})
        
        # Prepare email
        subject = "Your Fence Installation Quote from H&J Fence Supply"
        
        if not message:
            message = """
Dear Valued Customer,

Thank you for your interest in H&J Fence Supply! Please find your detailed fence installation quote attached.

Our quote includes:
- Complete material breakdown
- Detailed cost analysis
- Professional installation
- 2-year labor warranty

This quote is valid for 30 days. To accept this quote and schedule your installation, please:
1. Sign and return the quote
2. Provide the required 50% deposit

If you have any questions about your quote or would like to discuss modifications, please don't hesitate to contact us.

We look forward to working with you!

Best regards,
The H&J Fence Supply Team

📞 (555) 123-4567
📧 info@hjfencesupply.com
🌐 www.hjfencesupply.com
            """
        
        # Send email with attachment
        frappe.sendmail(
            recipients=[recipient_email],
            subject=subject,
            message=message,
            attachments=[{
                'fname': file_doc.file_name,
                'fcontent': file_doc.get_content()
            }],
            now=True
        )
        
        return {
            'success': True,
            'message': 'Quote emailed successfully'
        }
        
    except Exception as e:
        frappe.log_error(f"Error emailing quote: {e}")
        return {
            'success': False,
            'message': str(e)
        }
