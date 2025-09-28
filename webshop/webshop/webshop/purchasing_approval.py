"""
Purchasing Approval System
Handles approval workflows and budget controls for purchasing interface
"""

import frappe
from frappe import _
from frappe.utils import flt, today

@frappe.whitelist()
def check_purchase_approval_required(requisition_name):
    """
    Check if purchase requisition requires approval based on amount and rules
    """
    try:
        requisition = frappe.get_doc("Purchase Requisition", requisition_name)
        
        # Get approval rules
        approval_rules = get_purchase_approval_rules(requisition.company)
        
        # Check if approval is required
        approval_required = False
        approval_level = None
        approver = None
        
        for rule in approval_rules:
            if (requisition.total_amount >= rule.min_amount and 
                (not rule.max_amount or requisition.total_amount <= rule.max_amount)):
                approval_required = True
                approval_level = rule.approval_level
                approver = rule.approver
                break
        
        return {
            "approval_required": approval_required,
            "approval_level": approval_level,
            "approver": approver,
            "total_amount": requisition.total_amount
        }
        
    except Exception as e:
        frappe.log_error(f"Error checking approval requirements: {str(e)}")
        return {"approval_required": False}

def get_purchase_approval_rules(company):
    """Get purchase approval rules for company"""
    
    # Check if custom approval rules exist
    custom_rules = frappe.get_all("Purchase Approval Rule",
        filters={"company": company, "disabled": 0},
        fields=["min_amount", "max_amount", "approval_level", "approver"],
        order_by="min_amount"
    )
    
    if custom_rules:
        return custom_rules
    
    # Default approval rules
    default_rules = [
        {
            "min_amount": 0,
            "max_amount": 1000,
            "approval_level": "Supervisor",
            "approver": get_user_supervisor()
        },
        {
            "min_amount": 1001,
            "max_amount": 5000,
            "approval_level": "Manager",
            "approver": get_purchasing_manager()
        },
        {
            "min_amount": 5001,
            "max_amount": None,
            "approval_level": "Director",
            "approver": get_finance_director()
        }
    ]
    
    return default_rules

def get_user_supervisor():
    """Get supervisor for current user"""
    try:
        employee = frappe.db.get_value("Employee", {"user_id": frappe.session.user}, "reports_to")
        if employee:
            supervisor_user = frappe.db.get_value("Employee", employee, "user_id")
            return supervisor_user
    except:
        pass
    return None

def get_purchasing_manager():
    """Get purchasing manager"""
    try:
        # Look for users with Purchasing Manager role
        managers = frappe.get_all("Has Role",
            filters={"role": "Purchasing Manager"},
            fields=["parent"],
            limit=1
        )
        if managers:
            return managers[0].parent
    except:
        pass
    return None

def get_finance_director():
    """Get finance director"""
    try:
        # Look for users with Finance Director or similar role
        directors = frappe.get_all("Has Role",
            filters={"role": ["in", ["Finance Director", "Finance Manager", "Accounts Manager"]]},
            fields=["parent"],
            limit=1
        )
        if directors:
            return directors[0].parent
    except:
        pass
    return None

@frappe.whitelist()
def submit_for_approval(requisition_name, approver=None):
    """
    Submit purchase requisition for approval
    """
    try:
        requisition = frappe.get_doc("Purchase Requisition", requisition_name)
        
        # Check if user has permission to submit
        if not frappe.has_permission("Purchase Requisition", "submit", requisition):
            return {
                "success": False,
                "message": "You don't have permission to submit this requisition"
            }
        
        # Check approval requirements
        approval_info = check_purchase_approval_required(requisition_name)
        
        if approval_info["approval_required"]:
            # Set approval status
            requisition.custom_approval_status = "Pending"
            
            # Create approval request
            create_approval_request(requisition, approver or approval_info["approver"])
            
            # Save without submitting
            requisition.save()
            
            return {
                "success": True,
                "message": f"Requisition submitted for approval to {approver or approval_info['approver']}",
                "status": "pending_approval"
            }
        else:
            # Auto-approve and submit
            requisition.custom_approval_status = "Approved"
            requisition.submit()
            
            return {
                "success": True,
                "message": "Requisition approved and submitted automatically",
                "status": "approved"
            }
        
    except Exception as e:
        frappe.log_error(f"Error submitting for approval: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to submit for approval: {str(e)}"
        }

def create_approval_request(requisition, approver):
    """Create approval request record"""
    try:
        if not approver:
            return
        
        # Create ToDo for approver
        todo = frappe.get_doc({
            "doctype": "ToDo",
            "allocated_to": approver,
            "description": f"Purchase Requisition {requisition.name} requires your approval. Amount: {frappe.utils.fmt_money(requisition.total_amount)}",
            "priority": "Medium" if requisition.total_amount < 5000 else "High",
            "status": "Open",
            "reference_type": "Purchase Requisition",
            "reference_name": requisition.name
        })
        todo.insert(ignore_permissions=True)
        
        # Send email notification
        send_approval_notification(requisition, approver)
        
        # Log approval request
        requisition.add_comment("Info", f"Approval requested from {approver}")
        
    except Exception as e:
        frappe.log_error(f"Error creating approval request: {str(e)}")

def send_approval_notification(requisition, approver):
    """Send email notification for approval request"""
    try:
        approver_email = frappe.db.get_value("User", approver, "email")
        if not approver_email:
            return
        
        subject = f"Purchase Requisition Approval Required: {requisition.name}"
        
        # Build items list
        items_html = ""
        for item in requisition.items:
            items_html += f"""
            <tr>
                <td>{item.item_code}</td>
                <td>{item.item_name}</td>
                <td>{item.qty} {item.uom}</td>
                <td>{frappe.utils.fmt_money(item.amount)}</td>
            </tr>
            """
        
        message = f"""
        <h3>Purchase Requisition Approval Request</h3>
        
        <p>A purchase requisition requires your approval:</p>
        
        <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
            <tr style="background: #f8f9fa;">
                <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>Requisition</strong></td>
                <td style="padding: 8px; border: 1px solid #dee2e6;">{requisition.name}</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>Requested By</strong></td>
                <td style="padding: 8px; border: 1px solid #dee2e6;">{requisition.requested_by}</td>
            </tr>
            <tr style="background: #f8f9fa;">
                <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>Department</strong></td>
                <td style="padding: 8px; border: 1px solid #dee2e6;">{requisition.department or 'N/A'}</td>
            </tr>
            <tr>
                <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>Total Amount</strong></td>
                <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>{frappe.utils.fmt_money(requisition.total_amount)}</strong></td>
            </tr>
            <tr style="background: #f8f9fa;">
                <td style="padding: 8px; border: 1px solid #dee2e6;"><strong>Priority</strong></td>
                <td style="padding: 8px; border: 1px solid #dee2e6;">{getattr(requisition, 'custom_priority', 'Medium')}</td>
            </tr>
        </table>
        
        <h4>Items:</h4>
        <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
            <thead>
                <tr style="background: #007bff; color: white;">
                    <th style="padding: 8px; border: 1px solid #dee2e6;">Item Code</th>
                    <th style="padding: 8px; border: 1px solid #dee2e6;">Description</th>
                    <th style="padding: 8px; border: 1px solid #dee2e6;">Quantity</th>
                    <th style="padding: 8px; border: 1px solid #dee2e6;">Amount</th>
                </tr>
            </thead>
            <tbody>
                {items_html}
            </tbody>
        </table>
        
        <div style="margin: 30px 0;">
            <a href="{frappe.utils.get_url()}/app/purchase-requisition/{requisition.name}" 
               style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-right: 10px;">
               Review & Approve
            </a>
            <a href="{frappe.utils.get_url()}/app/purchase-requisition" 
               style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
               View All Requisitions
            </a>
        </div>
        
        <p><em>This is an automated notification from the Purchasing System.</em></p>
        """
        
        frappe.sendmail(
            recipients=[approver_email],
            subject=subject,
            message=message,
            header="Purchase Approval Required"
        )
        
    except Exception as e:
        frappe.log_error(f"Error sending approval notification: {str(e)}")

@frappe.whitelist()
def approve_purchase_requisition(requisition_name, approval_note=""):
    """
    Approve purchase requisition
    """
    try:
        requisition = frappe.get_doc("Purchase Requisition", requisition_name)
        
        # Check if user can approve
        if not can_approve_requisition(requisition):
            return {
                "success": False,
                "message": "You don't have permission to approve this requisition"
            }
        
        # Update approval status
        requisition.custom_approval_status = "Approved"
        
        # Add approval comment
        approval_comment = f"Approved by {frappe.session.user}"
        if approval_note:
            approval_comment += f": {approval_note}"
        requisition.add_comment("Info", approval_comment)
        
        # Submit the requisition
        requisition.submit()
        
        # Close approval ToDo
        close_approval_todo(requisition_name)
        
        # Send approval confirmation
        send_approval_confirmation(requisition)
        
        return {
            "success": True,
            "message": f"Purchase Requisition {requisition_name} approved and submitted"
        }
        
    except Exception as e:
        frappe.log_error(f"Error approving requisition: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to approve requisition: {str(e)}"
        }

@frappe.whitelist()
def reject_purchase_requisition(requisition_name, rejection_reason=""):
    """
    Reject purchase requisition
    """
    try:
        requisition = frappe.get_doc("Purchase Requisition", requisition_name)
        
        # Check if user can approve/reject
        if not can_approve_requisition(requisition):
            return {
                "success": False,
                "message": "You don't have permission to reject this requisition"
            }
        
        # Update approval status
        requisition.custom_approval_status = "Rejected"
        
        # Add rejection comment
        rejection_comment = f"Rejected by {frappe.session.user}"
        if rejection_reason:
            rejection_comment += f": {rejection_reason}"
        requisition.add_comment("Info", rejection_comment)
        
        # Save (don't submit)
        requisition.save()
        
        # Close approval ToDo
        close_approval_todo(requisition_name)
        
        # Send rejection notification
        send_rejection_notification(requisition, rejection_reason)
        
        return {
            "success": True,
            "message": f"Purchase Requisition {requisition_name} rejected"
        }
        
    except Exception as e:
        frappe.log_error(f"Error rejecting requisition: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to reject requisition: {str(e)}"
        }

def can_approve_requisition(requisition):
    """Check if current user can approve the requisition"""
    
    # System Manager can always approve
    if "System Manager" in frappe.get_roles():
        return True
    
    # Check if user is in approval chain
    approval_info = check_purchase_approval_required(requisition.name)
    if approval_info.get("approver") == frappe.session.user:
        return True
    
    # Check if user has Purchasing Manager role
    if "Purchasing Manager" in frappe.get_roles():
        return True
    
    return False

def close_approval_todo(requisition_name):
    """Close approval ToDo item"""
    try:
        todos = frappe.get_all("ToDo",
            filters={
                "reference_type": "Purchase Requisition",
                "reference_name": requisition_name,
                "status": "Open",
                "allocated_to": frappe.session.user
            },
            fields=["name"]
        )
        
        for todo in todos:
            todo_doc = frappe.get_doc("ToDo", todo.name)
            todo_doc.status = "Closed"
            todo_doc.save(ignore_permissions=True)
            
    except Exception as e:
        frappe.log_error(f"Error closing approval todo: {str(e)}")

def send_approval_confirmation(requisition):
    """Send approval confirmation to requester"""
    try:
        requester_email = frappe.db.get_value("User", requisition.requested_by, "email")
        if not requester_email:
            return
        
        subject = f"Purchase Requisition Approved: {requisition.name}"
        message = f"""
        <h3>Purchase Requisition Approved</h3>
        
        <p>Your purchase requisition has been approved:</p>
        
        <ul>
            <li><strong>Requisition:</strong> {requisition.name}</li>
            <li><strong>Total Amount:</strong> {frappe.utils.fmt_money(requisition.total_amount)}</li>
            <li><strong>Approved By:</strong> {frappe.session.user}</li>
            <li><strong>Status:</strong> Approved & Submitted</li>
        </ul>
        
        <p>You can now proceed to create Purchase Orders from this requisition.</p>
        
        <p><a href="{frappe.utils.get_url()}/app/purchase-requisition/{requisition.name}">View Requisition</a></p>
        """
        
        frappe.sendmail(
            recipients=[requester_email],
            subject=subject,
            message=message,
            header="Requisition Approved"
        )
        
    except Exception as e:
        frappe.log_error(f"Error sending approval confirmation: {str(e)}")

def send_rejection_notification(requisition, rejection_reason):
    """Send rejection notification to requester"""
    try:
        requester_email = frappe.db.get_value("User", requisition.requested_by, "email")
        if not requester_email:
            return
        
        subject = f"Purchase Requisition Rejected: {requisition.name}"
        message = f"""
        <h3>Purchase Requisition Rejected</h3>
        
        <p>Your purchase requisition has been rejected:</p>
        
        <ul>
            <li><strong>Requisition:</strong> {requisition.name}</li>
            <li><strong>Total Amount:</strong> {frappe.utils.fmt_money(requisition.total_amount)}</li>
            <li><strong>Rejected By:</strong> {frappe.session.user}</li>
            <li><strong>Reason:</strong> {rejection_reason or 'No reason provided'}</li>
        </ul>
        
        <p>Please review the rejection reason and make necessary changes before resubmitting.</p>
        
        <p><a href="{frappe.utils.get_url()}/app/purchase-requisition/{requisition.name}">View Requisition</a></p>
        """
        
        frappe.sendmail(
            recipients=[requester_email],
            subject=subject,
            message=message,
            header="Requisition Rejected"
        )
        
    except Exception as e:
        frappe.log_error(f"Error sending rejection notification: {str(e)}")

@frappe.whitelist()
def check_budget_availability(requisition_name):
    """
    Check budget availability for purchase requisition
    """
    try:
        requisition = frappe.get_doc("Purchase Requisition", requisition_name)
        
        if not hasattr(requisition, 'custom_budget_account') or not requisition.custom_budget_account:
            return {
                "budget_check_required": False,
                "message": "No budget account specified"
            }
        
        # Get budget for the account
        budget_info = get_budget_info(requisition.custom_budget_account, requisition.company)
        
        if not budget_info:
            return {
                "budget_check_required": False,
                "message": "No budget found for specified account"
            }
        
        # Check if requisition amount exceeds available budget
        available_budget = budget_info["available_amount"]
        requisition_amount = requisition.total_amount
        
        budget_exceeded = requisition_amount > available_budget
        
        return {
            "budget_check_required": True,
            "budget_account": requisition.custom_budget_account,
            "total_budget": budget_info["total_budget"],
            "used_budget": budget_info["used_amount"],
            "available_budget": available_budget,
            "requisition_amount": requisition_amount,
            "budget_exceeded": budget_exceeded,
            "budget_utilization_percent": (budget_info["used_amount"] / budget_info["total_budget"]) * 100 if budget_info["total_budget"] > 0 else 0
        }
        
    except Exception as e:
        frappe.log_error(f"Error checking budget availability: {str(e)}")
        return {
            "budget_check_required": False,
            "message": f"Error checking budget: {str(e)}"
        }

def get_budget_info(budget_account, company):
    """Get budget information for account"""
    try:
        # This is a simplified budget check
        # In a real implementation, you would integrate with ERPNext's Budget doctype
        
        # Get current fiscal year
        from frappe.utils import get_fiscal_year
        fiscal_year = get_fiscal_year(today(), company=company)[0]
        
        # Check if budget exists for this account
        budget = frappe.db.get_value("Budget", {
            "company": company,
            "fiscal_year": fiscal_year,
            "budget_against": "Account"
        }, "name")
        
        if not budget:
            return None
        
        # Get budget amount for the account
        budget_detail = frappe.db.get_value("Budget Account", {
            "parent": budget,
            "account": budget_account
        }, "budget_amount")
        
        if not budget_detail:
            return None
        
        # Calculate used amount (simplified - sum of submitted PO amounts)
        used_amount = frappe.db.sql("""
            SELECT IFNULL(SUM(grand_total), 0)
            FROM `tabPurchase Order`
            WHERE company = %s
            AND docstatus = 1
            AND custom_budget_account = %s
            AND YEAR(transaction_date) = YEAR(%s)
        """, [company, budget_account, today()])[0][0]
        
        return {
            "total_budget": float(budget_detail),
            "used_amount": float(used_amount or 0),
            "available_amount": float(budget_detail) - float(used_amount or 0)
        }
        
    except Exception as e:
        frappe.log_error(f"Error getting budget info: {str(e)}")
        return None

@frappe.whitelist()
def get_pending_approvals():
    """Get pending approvals for current user"""
    try:
        # Get ToDo items for approval
        todos = frappe.get_all("ToDo",
            filters={
                "allocated_to": frappe.session.user,
                "status": "Open",
                "reference_type": "Purchase Requisition"
            },
            fields=["name", "description", "reference_name", "creation", "priority"],
            order_by="creation desc"
        )
        
        pending_approvals = []
        
        for todo in todos:
            if todo.reference_name:
                # Get requisition details
                requisition = frappe.db.get_value("Purchase Requisition", todo.reference_name, [
                    "name", "requested_by", "total_amount", "custom_priority", "custom_approval_status"
                ], as_dict=True)
                
                if requisition:
                    pending_approvals.append({
                        "todo_name": todo.name,
                        "requisition_name": requisition.name,
                        "requested_by": requisition.requested_by,
                        "total_amount": requisition.total_amount,
                        "priority": requisition.custom_priority or "Medium",
                        "approval_status": requisition.custom_approval_status,
                        "creation": todo.creation,
                        "description": todo.description
                    })
        
        return pending_approvals
        
    except Exception as e:
        frappe.log_error(f"Error getting pending approvals: {str(e)}")
        return []

