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

		// Apply shipping charges if delivery is selected and shipping option is chosen
		if (posConfig && posConfig.fulfillmentMethod === 'delivery' && posConfig.selectedShipping) {
			console.log('🚚 Applying shipping charges:', posConfig.selectedShipping);
			// Apply shipping charges to cart before placing order
			shopping_cart.apply_shipping_charges(posConfig.selectedShipping);
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
	},

	apply_shipping_charges: function(shippingOption) {
		/**
		 * Apply shipping charges to the cart
		 */
		try {
			console.log('🚚 Applying shipping charges to cart:', shippingOption);
			
			// Get current quotation name from cart
			return frappe.call({
				method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation',
				callback: function(cart_response) {
					if (cart_response.message && cart_response.message.doc && cart_response.message.doc.name) {
						var quotation_name = cart_response.message.doc.name;
						console.log('📋 Found quotation for shipping:', quotation_name);
						
						// Apply shipping charges to the quotation
						frappe.call({
							method: 'fence_supply.api.shipping_calculator.apply_shipping_to_quotation',
							args: {
								quotation_name: quotation_name,
								selected_courier: shippingOption.courier,
								selected_service_type: shippingOption.service_type,
								shipping_rate: shippingOption.rate
							},
							callback: function(r) {
								// Reset button state
								$('#cart-shipping-content button').prop('disabled', false).text('Apply Selected Shipping');
								
								if (r.message && r.message.success) {
									console.log('✅ Shipping charges applied:', r.message);
									
									// Apply cart settings to recalculate taxes including shipping
									frappe.call({
										method: 'webshop.webshop.shopping_cart.cart.recalculate_cart_taxes',
										callback: function(cart_response) {
											console.log('✅ Cart taxes recalculated after shipping:', cart_response.message);
											
											// Show success message
											frappe.msgprint({
												title: 'Shipping Applied',
												message: 'Shipping charges and taxes have been updated in your cart.',
												indicator: 'green'
											});
											
											// Refresh the cart to show updated totals after a short delay
											setTimeout(function() {
												window.location.reload();
											}, 1500);
										}
									});
								} else {
									console.error('❌ Failed to apply shipping charges:', r.message);
									frappe.msgprint({
										title: 'Error',
										message: r.message.error || 'Failed to apply shipping charges',
										indicator: 'red'
									});
								}
							}
						});
					} else {
						console.error('❌ No quotation found for shipping charges');
					}
				}
			});
			
		} catch (error) {
			console.error('Error applying shipping charges:', error);
		}
	},

	check_and_show_shipping_options: function() {
		/**
		 * Check if this is a delivery order and show shipping options
		 */
		try {
			// Ensure cart has taxes calculated first
			shopping_cart.ensure_cart_taxes_calculated();
			
			// Get POS configuration from sessionStorage
			var posConfigStr = sessionStorage.getItem('fencePOSConfig');
			if (posConfigStr) {
				var posConfig = JSON.parse(posConfigStr);
				
				if (posConfig.fulfillmentMethod === 'delivery') {
					console.log('🚚 Delivery order detected, showing shipping options');
					$('#cart-shipping-section').show();
					
					// Load shipping options for the cart
					shopping_cart.load_cart_shipping_options();
				}
			}
		} catch (e) {
			console.log('No POS delivery configuration found:', e);
		}
	},

	ensure_cart_taxes_calculated: function() {
		/**
		 * Ensure the cart quotation has taxes calculated
		 */
		frappe.call({
			method: 'webshop.webshop.shopping_cart.cart.recalculate_cart_taxes',
			callback: function(r) {
				if (r.message && r.message.success) {
					console.log('✅ Cart taxes ensured to be calculated:', r.message);
				} else {
					console.log('❌ Failed to calculate cart taxes:', r.message);
				}
			}
		});
	},

	load_cart_shipping_options: function() {
		/**
		 * Load shipping options for the current cart
		 */
		try {
			// Get cart contents
			frappe.call({
				method: 'webshop.webshop.shopping_cart.cart.get_cart_quotation',
				callback: function(r) {
					if (r.message && r.message.doc && r.message.doc.items) {
						var cartItems = r.message.doc.items;
						var materialValue = 0;
						
						// Calculate material value
						cartItems.forEach(function(item) {
							materialValue += parseFloat(item.amount || 0);
						});
						
						console.log('🛒 Cart material value for shipping:', materialValue);
						
						// Get shipping options
						frappe.call({
							method: 'fence_supply.api.shipping_api.get_available_couriers',
							args: {
								material_value: materialValue,
								distance: 25, // Default distance for your service area
								zip_code: '08071' // Default to NJ ZIP in your service area
							},
							callback: function(shipping_response) {
								if (shipping_response.message && shipping_response.message.success) {
									shopping_cart.display_cart_shipping_options(shipping_response.message.courier_options, materialValue);
								} else {
									$('#cart-shipping-content').html('<div class="alert alert-warning">No shipping options available</div>');
								}
							}
						});
					}
				}
			});
		} catch (error) {
			console.error('Error loading cart shipping options:', error);
		}
	},

	display_cart_shipping_options: function(courierOptions, materialValue) {
		/**
		 * Display shipping options in the cart
		 */
		if (!courierOptions || courierOptions.length === 0) {
			$('#cart-shipping-content').html('<div class="alert alert-warning">No shipping options available</div>');
			return;
		}

		var html = '<div class="shipping-info mb-3"><small class="text-muted">Material Value: $' + materialValue.toFixed(2) + ' | Distance: 25 miles | Service Area: NJ, PA, DE, MD</small></div>';
		html += '<div class="shipping-options-list">';
		
		courierOptions.forEach(function(option, index) {
			var isFirst = index === 0;
			var breakdown = option.breakdown || {};
			
			html += '<div class="shipping-option-card card mb-2 cursor-pointer ' + (isFirst ? 'border-primary selected-shipping' : 'border-light') + '" ';
			html += '     data-courier="' + option.courier + '" ';
			html += '     data-service="' + option.service_type + '" ';
			html += '     data-rate="' + option.rate + '" ';
			html += '     style="cursor: pointer; transition: all 0.2s;">';
			html += '  <div class="card-body p-3">';
			html += '    <div class="d-flex justify-content-between align-items-center">';
			html += '      <div>';
			html += '        <strong class="text-dark">' + option.courier + '</strong>';
			html += '        <span class="badge badge-secondary ml-2">' + option.service_type + '</span>';
			if (isFirst) {
				html += '        <span class="badge badge-primary ml-1">Selected</span>';
			}
			// Show special badges for discounts/free shipping
			if (breakdown.free_shipping_applied) {
				html += '        <span class="badge badge-success ml-1">FREE</span>';
			} else if (breakdown.discount_applied) {
				html += '        <span class="badge badge-info ml-1">$' + breakdown.discount_amount.toFixed(0) + ' OFF</span>';
			}
			html += '      </div>';
			html += '      <div class="text-right">';
			if (breakdown.free_shipping_applied) {
				html += '        <strong class="text-success">FREE</strong>';
			} else {
				html += '        <strong class="text-success">$' + option.rate.toFixed(2) + '</strong>';
			}
			html += '      </div>';
			html += '    </div>';
			
			// Enhanced breakdown display
			var breakdownText = 'Base: $' + (breakdown.base_rate || 0).toFixed(2);
			if (breakdown.state_surcharge > 0) {
				breakdownText += ' + ' + breakdown.state + ' Tolls: $' + breakdown.state_surcharge.toFixed(2);
			}
			if (breakdown.discount_amount > 0) {
				breakdownText += ' - Discount: $' + breakdown.discount_amount.toFixed(2);
			}
			if (breakdown.state) {
				breakdownText += ' (' + breakdown.state + ')';
			}
			
			html += '    <small class="text-muted">' + breakdownText + '</small>';
			html += '  </div>';
			html += '</div>';
		});
		
		html += '</div>';
		html += '<button class="btn btn-primary btn-sm mt-2 w-100" onclick="shopping_cart.apply_selected_shipping()">Apply Selected Shipping</button>';
		
		$('#cart-shipping-content').html(html);
		
		// Make shipping options clickable with better visual feedback
		$(document).off('click', '.shipping-option-card').on('click', '.shipping-option-card', function() {
			// Remove selection from all cards
			$('.shipping-option-card').removeClass('border-primary selected-shipping').addClass('border-light');
			$('.shipping-option-card .badge-primary').remove();
			
			// Add selection to clicked card
			$(this).removeClass('border-light').addClass('border-primary selected-shipping');
			$(this).find('.badge-secondary').after('<span class="badge badge-primary ml-1">Selected</span>');
			
			console.log('🚚 Selected shipping option:', {
				courier: $(this).data('courier'),
				service: $(this).data('service'),
				rate: $(this).data('rate')
			});
		});
		
		// Auto-select first option
		console.log('✅ Shipping options displayed, first option auto-selected');
	},

	apply_selected_shipping: function() {
		/**
		 * Apply the selected shipping option to the cart
		 */
		var selectedCard = $('.shipping-option-card.selected-shipping');
		if (selectedCard.length === 0) {
			frappe.msgprint('Please select a shipping option');
			return;
		}
		
		var shippingOption = {
			courier: selectedCard.data('courier'),
			service_type: selectedCard.data('service'),
			rate: selectedCard.data('rate')
		};
		
		console.log('🚚 Applying selected shipping option:', shippingOption);
		
		// Show loading state
		$('#cart-shipping-content button').prop('disabled', true).text('Applying...');
		
		// Apply shipping charges
		shopping_cart.apply_shipping_charges(shippingOption);
	}
});

frappe.ready(function() {
	if (window.location.pathname === "/cart") {
		$(".cart-icon").hide();
		
		// Check for POS delivery configuration and show shipping options
		shopping_cart.check_and_show_shipping_options();
	}
	shopping_cart.parent = $(".cart-container");
	shopping_cart.bind_events();
});

function show_terms() {
	var html = $(".cart-terms").html();
	frappe.msgprint(html);
}
