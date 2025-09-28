import frappe
from frappe import _

def get_context(context):
    """
    Context for Guided Fence Wizard page
    Provides data for the step-by-step fence estimator
    """
    context.title = _("Fence Estimator")
    context.page_title = _("Get an instant estimate for your fence project - H&J Fence Supply")
    
    # Meta tags for SEO
    context.meta_description = _("Free fence estimator tool - Get instant pricing for vinyl, wood, aluminum, and chain link fences. Professional installation available.")
    context.meta_keywords = _("fence estimator, fence calculator, fence cost, vinyl fence, wood fence, aluminum fence, chain link fence")
    
    # Add structured data for better SEO
    context.structured_data = {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        "name": "H&J Fence Supply Estimator",
        "description": "Professional fence estimation tool",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web Browser",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD",
            "description": "Free fence estimation service"
        }
    }
    
    return context
