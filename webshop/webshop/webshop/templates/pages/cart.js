// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

// JS exclusive to /cart page
frappe.provide("webshop.webshop.shopping_cart");
var shopping_cart = webshop.webshop.shopping_cart;

// Suppress bundling warnings
if (typeof window.bundled_asset === 'undefined') {
	window.bundled_asset = function() { return ''; };
}

// Display POS delivery details if available
$(document).ready(function() {
	// Prevent JS bundling errors
	try {
		shopping_cart.display_pos_delivery_details();
	} catch(e) {
		console.log('Error displaying POS delivery details:', e);
	}
});

$.extend(shopping_cart, {
	show_error: function(title, text) {
		$("#cart-container").html('<div class="msg-box"><h4>' +
			title + '</h4><p class="text-muted">' + text + '</p></div>');
	},

	bind_events: function() {
		shopping_cart.bind_place_order();
		shopping_cart.bind_request_quotation();
		shopping_cart.bind_change_qty();
		shopping_cart.bind_remove_cart_item();
		shopping_cart.bind_change_notes();
		shopping_cart.bind_coupon_code();
		shopping_cart.bind_remove_coupon_code();
	},

	bind_place_order: function() {
		$(".btn-place-order").on("click", function() {
			shopping_cart.place_order(this);
		});
	},

	bind_request_quotation: function() {
		$('.btn-request-for-quotation').on('click', function() {
			shopping_cart.request_quotation(this);
		});
	},

	bind_change_qty: function() {
		// bind update button
		$(".cart-items").on("change", ".cart-qty", function() {
			var item_code = $(this).attr("data-item-code");
			var newVal = $(this).val();
			shopping_cart.shopping_cart_update({item_code, qty: newVal});
		});

		$(".cart-items").on('click', '.number-spinner button', function () {
			var btn = $(this),
				input = btn.closest('.number-spinner').find('input'),
				oldValue = input.val().trim(),
				newVal = 0;

			if (btn.attr('data-dir') == 'up') {
				newVal = parseInt(oldValue) + 1;
			} else {
				if (oldValue > 1) {
					newVal = parseInt(oldValue) - 1;
				}
			}
			input.val(newVal);

			let notes = input.closest("td").siblings().find(".notes").text().trim();
			var item_code = input.attr("data-item-code");
			shopping_cart.shopping_cart_update({
				item_code,
				qty: newVal,
				additional_notes: notes
			});
		});
	},

	bind_change_notes: function() {
		$('.cart-items').on('change', 'textarea', function() {
			const $textarea = $(this);
			const item_code = $textarea.attr('data-item-code');
			const qty = $textarea.closest('tr').find('.cart-qty').val();
			const notes = $textarea.val();
			shopping_cart.shopping_cart_update({
				item_code,
				qty,
				additional_notes: notes
			});
		});
	},

	bind_remove_cart_item: function() {
		$(".cart-items").on("click", ".remove-cart-item", (e) => {
			const $remove_cart_item_btn = $(e.currentTarget);
			var item_code = $remove_cart_item_btn.data("item-code");

			shopping_cart.shopping_cart_update({
				item_code: item_code,
				qty: 0
			});
		});
	},

	render_tax_row: function($cart_taxes, doc, shipping_rules) {
		var shipping_selector;
		if(shipping_rules) {
			shipping_selector = '<select class="form-control">' + $.map(shipping_rules, function(rule) {
				return '<option value="' + rule[0] + '">' + rule[1] + '</option>' }).join("\n") +
			'</select>';
		}

		var $tax_row = $(repl('<div class="row">\
			<div class="col-md-9 col-sm-9">\
				<div class="row">\
					<div class="col-md-9 col-md-offset-3">' +
					(shipping_selector || '<p>%(description)s</p>') +
					'</div>\
				</div>\
			</div>\
			<div class="col-md-3 col-sm-3 text-right">\
				<p' + (shipping_selector ? ' style="margin-top: 5px;"' : "") + '>%(formatted_tax_amount)s</p>\
			</div>\
		</div>', doc)).appendTo($cart_taxes);

		if(shipping_selector) {
			$tax_row.find('select option').each(function(i, opt) {
				if($(opt).html() == doc.description) {
					$(opt).attr("selected", "selected");
				}
			});
			$tax_row.find('select').on("change", function() {
				shopping_cart.apply_shipping_rule($(this).val(), this);
			});
		}
	},

	apply_shipping_rule: function(rule, btn) {
		return frappe.call({
			btn: btn,
			type: "POST",
			method: "webshop.webshop.shopping_cart.cart.apply_shipping_rule",
			args: { shipping_rule: rule },
			callback: function(r) {
				if(!r.exc) {
					shopping_cart.render(r.message);
				}
			}
		});
	},

	place_order: function(btn) {
		shopping_cart.freeze();

		// Get POS configuration from sessionStorage
		var posConfig = null;
		try {
			var posConfigStr = sessionStorage.getItem('fencePOSConfig');
			if (posConfigStr) {
				posConfig = JSON.parse(posConfigStr);
				console.log('Found POS configuration for delivery:', posConfig);
				console.log('POS Config details:', {
					fulfillmentMethod: posConfig.fulfillmentMethod,
					selectedDate: posConfig.selectedDate,
					selectedTime: posConfig.selectedTime,
					selectedCategory: posConfig.selectedCategory
				});
			}
		} catch(e) {
			console.log('No POS configuration found or error parsing:', e);
		}

		// Enhanced debugging - log exactly what we're sending
		var posConfigToSend = JSON.stringify(posConfig);
		console.log('🚀 SENDING TO BACKEND:');
		console.log('  - posConfig object:', posConfig);
		console.log('  - posConfig stringified:', posConfigToSend);
		console.log('  - posConfig length:', posConfigToSend ? posConfigToSend.length : 0);
		console.log('  - fulfillmentMethod check:', posConfig ? posConfig.fulfillmentMethod : 'NO CONFIG');

		return frappe.call({
			type: "POST",
			method: "webshop.webshop.shopping_cart.cart.place_order",
			btn: btn,
			args: {
				pos_config: posConfigToSend // Ensure it's passed as string
			},
			callback: function(r) {
				if(r.exc) {
					shopping_cart.unfreeze();
					var msg = "";
					if(r._server_messages) {
						msg = JSON.parse(r._server_messages || []).join("<br>");
					}

					$("#cart-error")
						.empty()
						.html(msg || frappe._("Something went wrong!"))
						.toggle(true);
				} else {
					$(btn).hide();
					console.log('Order placed successfully:', r.message);
					
					// Feature flag for delivery schedule (set to false to disable)
					var enableDeliverySchedule = true;
					
					// Create delivery schedule if POS config exists
					if (enableDeliverySchedule && posConfig && posConfig.fulfillmentMethod === 'delivery') {
						console.log('🚚 Creating delivery schedule for order:', r.message);
						try {
							shopping_cart.create_delivery_schedule(r.message, posConfigToSend);
						} catch(e) {
							console.log('❌ Error creating delivery schedule, redirecting anyway:', e);
							window.location.href = '/orders/' + encodeURIComponent(r.message);
						}
					} else {
						console.log('📦 No delivery schedule needed - redirecting to order page');
						window.location.href = '/orders/' + encodeURIComponent(r.message);
					}
				}
			}
		});
	},

	request_quotation: function(btn) {
		shopping_cart.freeze();

		return frappe.call({
			type: "POST",
			method: "webshop.webshop.shopping_cart.cart.request_for_quotation",
			btn: btn,
			callback: function(r) {
				if(r.exc) {
					shopping_cart.unfreeze();
					var msg = "";
					if(r._server_messages) {
						msg = JSON.parse(r._server_messages || []).join("<br>");
					}

					$("#cart-error")
						.empty()
						.html(msg || frappe._("Something went wrong!"))
						.toggle(true);
				} else {
					$(btn).hide();
					window.location.href = '/quotations/' + encodeURIComponent(r.message);
				}
			}
		});
	},

	bind_coupon_code: function() {
		$(".bt-coupon").on("click", function() {
			shopping_cart.apply_coupon_code(this);
		});
	},

	apply_coupon_code: function(btn) {
		return frappe.call({
			type: "POST",
			method: "webshop.webshop.shopping_cart.cart.apply_coupon_code",
			btn: btn,
			args : {
				applied_code : $('.txtcoupon').val(),
				applied_referral_sales_partner: $('.txtreferral_sales_partner').val()
			},
			callback: function(r) {
				if (r && r.message){
					location.reload();
				}
			}
		});
	},

	bind_remove_coupon_code: function() {
		$(".bt-remove-coupon-code").on("click", function() {
			shopping_cart.remove_coupon_code(this);
		});
	},
	remove_coupon_code: function(btn) {
		return frappe.call({
			type: "POST",
			method: "webshop.webshop.shopping_cart.cart.remove_coupon_code",
			btn: btn,
			callback: function(r) {
				if (r && r.message){
					location.reload();
				}
			}
		});
	},

	create_delivery_schedule: function(sales_order_name, pos_config) {
		console.log('🚚 Creating delivery schedule via API...');
		console.log('  - Sales Order:', sales_order_name);
		console.log('  - POS Config:', pos_config);
		
		frappe.call({
			method: "webshop.webshop.shopping_cart.cart.create_delivery_schedule",
			args: {
				sales_order_name: sales_order_name,
				pos_config: pos_config
			},
			callback: function(r) {
				if (r.message && r.message.success) {
					console.log('✅ Delivery schedule created:', r.message.delivery_schedule);
					console.log('📋 Message:', r.message.message);
				} else {
					console.log('❌ Failed to create delivery schedule:', r.message ? r.message.error : 'Unknown error');
				}
				
				// Always redirect to order page regardless of delivery schedule result
				window.location.href = '/orders/' + encodeURIComponent(sales_order_name);
			},
			error: function(r) {
				console.log('❌ Error calling delivery schedule API:', r);
				// Still redirect to order page
				window.location.href = '/orders/' + encodeURIComponent(sales_order_name);
			}
		});
	},

	display_pos_delivery_details: function() {
		try {
			var posConfigStr = sessionStorage.getItem('fencePOSConfig');
			if (posConfigStr) {
				var posConfig = JSON.parse(posConfigStr);
				
				// Only show if it's a delivery order
				if (posConfig.fulfillmentMethod === 'delivery' && posConfig.selectedDate) {
					var deliveryDetailsHtml = '';
					
					// Fulfillment method
					deliveryDetailsHtml += '<div class="mb-2"><strong>Method:</strong> ' + 
						(posConfig.fulfillmentMethod === 'delivery' ? 'Delivery' : 'Pickup') + '</div>';
					
					// Delivery date
					if (posConfig.selectedDate) {
						var formattedDate = new Date(posConfig.selectedDate).toLocaleDateString();
						deliveryDetailsHtml += '<div class="mb-2"><strong>Date:</strong> ' + formattedDate + '</div>';
					}
					
					// Delivery time
					if (posConfig.selectedTime) {
						deliveryDetailsHtml += '<div class="mb-2"><strong>Time:</strong> ' + posConfig.selectedTime + '</div>';
					}
					
					// Fence specifications
					if (posConfig.selectedCategory || posConfig.selectedStyle || posConfig.selectedHeight || posConfig.selectedColor) {
						deliveryDetailsHtml += '<hr><div class="mt-3"><strong>Fence Specifications:</strong></div>';
						
						if (posConfig.selectedCategory) {
							deliveryDetailsHtml += '<div><small>Material: ' + posConfig.selectedCategory + '</small></div>';
						}
						if (posConfig.selectedStyle) {
							deliveryDetailsHtml += '<div><small>Style: ' + posConfig.selectedStyle + '</small></div>';
						}
						if (posConfig.selectedHeight) {
							deliveryDetailsHtml += '<div><small>Height: ' + posConfig.selectedHeight + '</small></div>';
						}
						if (posConfig.selectedColor) {
							deliveryDetailsHtml += '<div><small>Color: ' + posConfig.selectedColor + '</small></div>';
						}
					}
					
					// Customer info
					if (posConfig.selectedCustomer && posConfig.selectedCustomer.name) {
						deliveryDetailsHtml += '<hr><div class="mt-3"><strong>Customer:</strong> ' + posConfig.selectedCustomer.name + '</div>';
					}
					
					$('#pos-delivery-content').html(deliveryDetailsHtml);
					$('#pos-delivery-details').show();
				}
			}
		} catch(e) {
			console.log('Error displaying POS delivery details:', e);
		}
	}
});

frappe.ready(function() {
	if (window.location.pathname === "/cart") {
		$(".cart-icon").hide();
	}
	shopping_cart.parent = $(".cart-container");
	shopping_cart.bind_events();
});

function show_terms() {
	var html = $(".cart-terms").html();
	frappe.msgprint(html);
}
