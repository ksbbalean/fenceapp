import frappe
from frappe.model.document import Document

class FenceMaterial(Document):
    def validate(self):
        self.calculate_total_cost()
    
    def calculate_total_cost(self):
        """Calculate total cost based on quantity and unit price"""
        if self.quantity_needed and self.unit_price:
            self.total_cost = self.quantity_needed * self.unit_price
    
    def check_stock_availability(self):
        """Check if material is in stock"""
        if self.item_code:
            # This would integrate with inventory system
            # For now, just return the in_stock field value
            return self.in_stock
        return False
    
    def get_estimated_delivery(self):
        """Get estimated delivery date based on lead time"""
        if self.lead_time_days:
            import datetime
            return datetime.date.today() + datetime.timedelta(days=self.lead_time_days)
        return None
