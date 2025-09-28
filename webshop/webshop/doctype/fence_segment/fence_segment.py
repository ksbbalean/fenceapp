import frappe
from frappe.model.document import Document

class FenceSegment(Document):
    def validate(self):
        self.calculate_materials()
    
    def calculate_materials(self):
        """Calculate materials needed for this segment"""
        if not self.length:
            return
        
        # Calculate panels needed (assuming 8-foot panels)
        panel_width = 8
        self.panels_needed = int(self.length / panel_width)
        
        # Calculate posts needed (one post per panel plus one)
        self.posts_needed = self.panels_needed + 1
        
        # Calculate hardware needed (basic calculation)
        self.hardware_needed = self.panels_needed * 4  # 4 pieces per panel
        
        # Adjust for gates
        if self.is_gate and self.gate_width:
            # Gates typically need different hardware
            gate_panels = int(self.gate_width / panel_width)
            self.hardware_needed += gate_panels * 2  # Additional gate hardware
