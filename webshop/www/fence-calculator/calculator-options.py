import frappe
from frappe import _

def get_context(context):
    """
    Context for Calculator Options page
    Landing page for all fence calculator tools
    """
    context.title = _("Fence Calculator - H&J Fence Supply")
    context.page_title = _("Professional Fence Calculator Tools - Get Instant Estimates")
    
    # Meta tags for SEO
    context.meta_description = _("Choose from multiple professional fence calculator tools. Guided wizard, advanced drawing, simple calculator, and POS interface. Get instant fence estimates.")
    context.meta_keywords = _("fence calculator, fence estimator, fence cost, vinyl fence price, wood fence estimate, aluminum fence calculator")
    
    # Add structured data for better SEO
    context.structured_data = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "H&J Fence Supply Calculator Suite",
        "description": "Professional fence calculation tools",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web Browser",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD",
            "description": "Free fence estimation tools"
        },
        "features": [
            "Guided Fence Wizard",
            "Advanced Drawing Calculator", 
            "Simple Drawing Calculator",
            "Mobile POS Interface"
        ]
    }
    
    return context
