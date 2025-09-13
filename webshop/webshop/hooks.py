from . import __version__ as app_version

app_name = "webshop"
app_title = "Webshop"
app_publisher = "Frappe Technologies Pvt. Ltd."
app_description = "Frappe Webshop"
app_email = "developers@frappe.io"
app_license = "GNU General Public License (v3)"

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/webshop/css/webshop.css"
# app_include_js = "/assets/webshop/js/webshop.js"

# include js, css files in header of web template
# web_include_css = "/assets/webshop/css/webshop.css"
# web_include_js = "/assets/webshop/js/webshop.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "webshop/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
#	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
#	"methods": "webshop.utils.jinja_methods",
#	"filters": "webshop.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "webshop.install.before_install"
after_install = "webshop.webshop.setup_purchasing.setup_purchasing_interface"

# Uninstallation
# ------------

# before_uninstall = "webshop.uninstall.before_uninstall"
# after_uninstall = "webshop.uninstall.after_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "webshop.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
#	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
#	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
#	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
#	"*": {
#		"on_update": "method",
#		"on_cancel": "method",
#		"on_trash": "method"
#	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
#	"all": [
#		"webshop.tasks.all"
#	],
#	"daily": [
#		"webshop.tasks.daily"
#	],
#	"hourly": [
#		"webshop.tasks.hourly"
#	],
#	"weekly": [
#		"webshop.tasks.weekly"
#	],
#	"monthly": [
#		"webshop.tasks.monthly"
#	],
# }

# Testing
# -------

# before_tests = "webshop.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
#	"frappe.desk.doctype.event.event.get_events": "webshop.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
#	"Task": "webshop.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]


# User Data Protection
# --------------------

# user_data_fields = [
#	{
#		"doctype": "{doctype_1}",
#		"filter_by": "{filter_by}",
#		"redact_fields": ["{field_1}", "{field_2}"],
#		"partial": 1,
#	},
#	{
#		"doctype": "{doctype_2}",
#		"filter_by": "{filter_by}",
#		"strict": False,
#	},
#	{
#		"doctype": "{doctype_3}",
#		"partial": 1,
#	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
#	"webshop.auth.validate"
# ]

# Shopping Cart Settings (for WebShop)
shopping_cart_settings = {
	"enabled": 1,
	"company": "Wind Power LLC",
	"price_list": "Standard Selling",
	"default_customer_group": "Individual",
	"quotation_series": "QTN-",
}

website_generators = ["Item Group", "Website Item"]

# Webshop Settings
webshop_settings = {
	"enable_shopping_cart": 1,
	"currency": "USD",
}

# Website Settings
website_settings = {
	"shopping_cart_enabled": 1,
}

# Custom Website Routes
website_route_rules = [
	{"from_route": "/pos/<path:app_path>", "to_route": "pos"},
	{"from_route": "/purchasing/<path:app_path>", "to_route": "purchasing"},
]

# Purchase-related custom fields and settings
purchase_settings = {
	"auto_create_purchase_receipt": 0,
	"maintain_same_rate": 1,
	"allow_multiple_items": 1
}

# Automatic setup on installation
fixtures = [
	{
		"doctype": "Custom Field",
		"filters": [["dt", "in", ["Material Request", "Purchase Order", "Item", "Supplier"]]]
	}
]

# Console commands
from webshop.webshop.commands import commands