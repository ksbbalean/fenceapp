"""
Command line commands for webshop
"""

import click
import frappe
from frappe.commands import pass_context


@click.command('setup-purchasing')
@pass_context
def setup_purchasing(context):
    """Setup purchasing interface with all required fields and data"""
    site = context.obj['sites'][0]
    
    with frappe.init_site(site):
        frappe.connect()
        
        try:
            from webshop.webshop.setup_purchasing import setup_purchasing_interface
            
            click.echo("Setting up purchasing interface...")
            result = setup_purchasing_interface()
            
            if result.get("success"):
                click.echo(click.style("✅ Purchasing interface setup completed successfully!", fg='green'))
                
                # Optionally create sample data
                if click.confirm("Do you want to create sample purchasing data for testing?"):
                    from webshop.webshop.setup_purchasing import create_sample_purchasing_data
                    sample_result = create_sample_purchasing_data()
                    
                    if sample_result.get("success"):
                        click.echo(click.style("✅ Sample data created successfully!", fg='green'))
                        click.echo(f"Created suppliers: {', '.join(sample_result.get('suppliers', []))}")
                    else:
                        click.echo(click.style(f"❌ Failed to create sample data: {sample_result.get('message')}", fg='red'))
                
                click.echo("\n🎉 Purchasing interface is ready!")
                click.echo("Access it at: https://your-site.com/purchasing")
                
            else:
                click.echo(click.style(f"❌ Setup failed: {result.get('message')}", fg='red'))
                
        except Exception as e:
            click.echo(click.style(f"❌ Error during setup: {str(e)}", fg='red'))
        
        finally:
            frappe.destroy()


@click.command('reset-purchasing')
@pass_context  
def reset_purchasing(context):
    """Reset purchasing interface setup (for development/testing)"""
    site = context.obj['sites'][0]
    
    if not click.confirm("This will reset all purchasing interface customizations. Continue?"):
        return
    
    with frappe.init_site(site):
        frappe.connect()
        
        try:
            from webshop.webshop.setup_purchasing import reset_purchasing_setup
            
            click.echo("Resetting purchasing interface...")
            result = reset_purchasing_setup()
            
            if result.get("success"):
                click.echo(click.style("✅ Purchasing interface reset completed!", fg='green'))
            else:
                click.echo(click.style(f"❌ Reset failed: {result.get('message')}", fg='red'))
                
        except Exception as e:
            click.echo(click.style(f"❌ Error during reset: {str(e)}", fg='red'))
        
        finally:
            frappe.destroy()


# Register commands
commands = [
    setup_purchasing,
    reset_purchasing
]
