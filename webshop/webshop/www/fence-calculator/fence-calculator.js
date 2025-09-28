// Fence Drawing Calculator JavaScript
// Similar to American Fence Company's "Draw My Fence" tool

class FenceCalculator {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.isDrawing = false;
        this.currentPath = [];
        this.fenceSegments = [];
        this.selectedStyle = null;
        this.selectedColor = 'white';
        this.scale = 1; // 1 inch = 1 foot
        this.gridEnabled = true;
        this.snapToGrid = true;
        this.gridSize = 20; // pixels per grid unit
        
        // Pricing data (similar to American Fence Company)
        this.pricing = {
            'vinyl-privacy': { base: 25, perFoot: 18 },
            'vinyl-semi-privacy': { base: 22, perFoot: 16 },
            'vinyl-picket': { base: 20, perFoot: 14 },
            'aluminum-privacy': { base: 35, perFoot: 25 },
            'aluminum-picket': { base: 30, perFoot: 22 },
            'wood-privacy': { base: 18, perFoot: 12 },
            'wood-picket': { base: 15, perFoot: 10 },
            'chain-link': { base: 12, perFoot: 8 }
        };
        
        // Fence styles data
        this.fenceStyles = [
            { id: 'vinyl-privacy', name: 'Vinyl Privacy', icon: '🏠', height: '6\'', material: 'Vinyl', type: 'Privacy' },
            { id: 'vinyl-semi-privacy', name: 'Vinyl Semi-Privacy', icon: '🏠', height: '6\'', material: 'Vinyl', type: 'Semi-Privacy' },
            { id: 'vinyl-picket', name: 'Vinyl Picket', icon: '🏠', height: '4\'', material: 'Vinyl', type: 'Picket' },
            { id: 'aluminum-privacy', name: 'Aluminum Privacy', icon: '🏗️', height: '6\'', material: 'Aluminum', type: 'Privacy' },
            { id: 'aluminum-picket', name: 'Aluminum Picket', icon: '🏗️', height: '4\'', material: 'Aluminum', type: 'Picket' },
            { id: 'wood-privacy', name: 'Wood Privacy', icon: '🌲', height: '6\'', material: 'Wood', type: 'Privacy' },
            { id: 'wood-picket', name: 'Wood Picket', icon: '🌲', height: '4\'', material: 'Wood', type: 'Picket' },
            { id: 'chain-link', name: 'Chain Link', icon: '🔗', height: '4\'', material: 'Chain Link', type: 'Security' }
        ];
        
        // Color options
        this.colors = [
            { name: 'White', value: '#ffffff', hex: 'white' },
            { name: 'Sandstone', value: '#d2b48c', hex: 'sandstone' },
            { name: 'Khaki', value: '#f4f4f4', hex: 'khaki' },
            { name: 'Chestnut Brown', value: '#8b4513', hex: 'brown' },
            { name: 'Weathered Cedar', value: '#a0522d', hex: 'cedar' },
            { name: 'Black', value: '#000000', hex: 'black' },
            { name: 'Gray', value: '#808080', hex: 'gray' },
            { name: 'Green', value: '#228b22', hex: 'green' }
        ];
        
        this.init();
    }
    
    init() {
        console.log('Initializing Fence Calculator...');
        
        // Initialize canvas
        this.canvas = document.getElementById('fenceCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Set canvas size
        this.resizeCanvas();
        
        // Initialize UI
        this.initializeFenceStyles();
        this.initializeColorOptions();
        this.initializeEventListeners();
        
        // Draw initial grid
        this.drawGrid();
        
        console.log('Fence Calculator initialized successfully');
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        
        this.canvas.width = rect.width - 60; // Account for padding
        this.canvas.height = 500;
        
        // Redraw everything
        this.redrawCanvas();
    }
    
    initializeFenceStyles() {
        const grid = document.getElementById('fenceStylesGrid');
        if (!grid) return;
        
        grid.innerHTML = this.fenceStyles.map(style => `
            <div class="fence-style-card" data-style="${style.id}" onclick="fenceCalculator.selectFenceStyle('${style.id}')">
                <div class="fence-style-icon">${style.icon}</div>
                <div class="fence-style-name">${style.name}</div>
                <div class="fence-style-height">${style.height}</div>
            </div>
        `).join('');
        
        // Select first style by default
        if (this.fenceStyles.length > 0) {
            this.selectFenceStyle(this.fenceStyles[0].id);
        }
    }
    
    initializeColorOptions() {
        const container = document.getElementById('colorOptions');
        if (!container) return;
        
        container.innerHTML = this.colors.map(color => `
            <div class="color-option" 
                 data-color="${color.hex}" 
                 onclick="fenceCalculator.selectColor('${color.hex}')"
                 style="background-color: ${color.value};"
                 title="${color.name}">
            </div>
        `).join('');
        
        // Select first color by default
        if (this.colors.length > 0) {
            this.selectColor(this.colors[0].hex);
        }
    }
    
    initializeEventListeners() {
        // Canvas events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseleave', () => this.stopDrawing());
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startDrawing(e.touches[0]);
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.draw(e.touches[0]);
        });
        this.canvas.addEventListener('touchend', () => this.stopDrawing());
        
        // Scale change
        document.getElementById('scaleSelect').addEventListener('change', (e) => {
            this.scale = parseFloat(e.target.value);
            this.updateMeasurements();
        });
        
        // Window resize
        window.addEventListener('resize', () => {
            setTimeout(() => this.resizeCanvas(), 100);
        });
    }
    
    selectFenceStyle(styleId) {
        this.selectedStyle = styleId;
        
        // Update UI
        document.querySelectorAll('.fence-style-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        const selectedCard = document.querySelector(`[data-style="${styleId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }
        
        // Update estimate
        this.updateEstimate();
    }
    
    selectColor(colorHex) {
        this.selectedColor = colorHex;
        
        // Update UI
        document.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('selected');
        });
        
        const selectedOption = document.querySelector(`[data-color="${colorHex}"]`);
        if (selectedOption) {
            selectedOption.classList.add('selected');
        }
        
        // Redraw canvas with new color
        this.redrawCanvas();
    }
    
    startDrawing(e) {
        this.isDrawing = true;
        this.currentPath = [];
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Snap to grid if enabled
        const snappedPoint = this.snapToGridEnabled ? this.snapToGrid(x, y) : { x, y };
        
        this.currentPath.push(snappedPoint);
        this.ctx.beginPath();
        this.ctx.moveTo(snappedPoint.x, snappedPoint.y);
    }
    
    draw(e) {
        if (!this.isDrawing) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Snap to grid if enabled
        const snappedPoint = this.snapToGridEnabled ? this.snapToGrid(x, y) : { x, y };
        
        // Draw line
        this.ctx.lineTo(snappedPoint.x, snappedPoint.y);
        this.ctx.stroke();
        
        this.currentPath.push(snappedPoint);
        
        // Show measurement tooltip
        this.showMeasurementTooltip(snappedPoint);
    }
    
    stopDrawing() {
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        
        // Add segment if path has points
        if (this.currentPath.length > 1) {
            this.addFenceSegment(this.currentPath);
        }
        
        // Hide tooltip
        this.hideTooltip();
        
        // Update measurements and estimate
        this.updateMeasurements();
        this.updateEstimate();
    }
    
    snapToGrid(x, y) {
        const snappedX = Math.round(x / this.gridSize) * this.gridSize;
        const snappedY = Math.round(y / this.gridSize) * this.gridSize;
        return { x: snappedX, y: snappedY };
    }
    
    addFenceSegment(path) {
        const segment = {
            id: Date.now() + Math.random(),
            path: [...path],
            style: this.selectedStyle,
            color: this.selectedColor,
            length: this.calculatePathLength(path)
        };
        
        this.fenceSegments.push(segment);
        console.log('Added fence segment:', segment);
    }
    
    calculatePathLength(path) {
        let totalLength = 0;
        for (let i = 1; i < path.length; i++) {
            const dx = path[i].x - path[i-1].x;
            const dy = path[i].y - path[i-1].y;
            totalLength += Math.sqrt(dx * dx + dy * dy);
        }
        
        // Convert pixels to feet based on scale
        return (totalLength / this.gridSize) * this.scale;
    }
    
    showMeasurementTooltip(point) {
        const tooltip = document.getElementById('tooltip');
        if (!tooltip) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = rect.left + point.x + 10;
        const y = rect.top + point.y - 10;
        
        // Calculate current path length
        let currentLength = 0;
        if (this.currentPath.length > 1) {
            currentLength = this.calculatePathLength(this.currentPath);
        }
        
        tooltip.textContent = `${currentLength.toFixed(1)} ft`;
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
        tooltip.style.display = 'block';
    }
    
    hideTooltip() {
        const tooltip = document.getElementById('tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }
    
    drawGrid() {
        if (!this.gridEnabled) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.ctx.strokeStyle = '#e9ecef';
        this.ctx.lineWidth = 1;
        this.ctx.globalAlpha = 0.5;
        
        // Vertical lines
        for (let x = 0; x <= width; x += this.gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y <= height; y += this.gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }
        
        this.ctx.globalAlpha = 1;
    }
    
    redrawCanvas() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid
        this.drawGrid();
        
        // Draw fence segments
        this.fenceSegments.forEach(segment => {
            this.drawFenceSegment(segment);
        });
        
        // Draw current path
        if (this.currentPath.length > 1) {
            this.drawCurrentPath();
        }
    }
    
    drawFenceSegment(segment) {
        const style = this.fenceStyles.find(s => s.id === segment.style);
        const color = this.colors.find(c => c.hex === segment.color);
        
        if (!style || !color) return;
        
        // Set line style based on fence type
        this.ctx.strokeStyle = color.value;
        this.ctx.lineWidth = 4;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Draw path
        this.ctx.beginPath();
        this.ctx.moveTo(segment.path[0].x, segment.path[0].y);
        
        for (let i = 1; i < segment.path.length; i++) {
            this.ctx.lineTo(segment.path[i].x, segment.path[i].y);
        }
        
        this.ctx.stroke();
        
        // Add fence posts at corners
        this.drawFencePosts(segment.path);
    }
    
    drawCurrentPath() {
        if (this.currentPath.length < 2) return;
        
        const color = this.colors.find(c => c.hex === this.selectedColor);
        if (!color) return;
        
        this.ctx.strokeStyle = color.value;
        this.ctx.lineWidth = 4;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.setLineDash([5, 5]); // Dashed line for current path
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.currentPath[0].x, this.currentPath[0].y);
        
        for (let i = 1; i < this.currentPath.length; i++) {
            this.ctx.lineTo(this.currentPath[i].x, this.currentPath[i].y);
        }
        
        this.ctx.stroke();
        this.ctx.setLineDash([]); // Reset to solid line
    }
    
    drawFencePosts(path) {
        this.ctx.fillStyle = '#6c757d';
        this.ctx.strokeStyle = '#495057';
        this.ctx.lineWidth = 1;
        
        path.forEach(point => {
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, 3, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.stroke();
        });
    }
    
    updateMeasurements() {
        const totalLength = this.fenceSegments.reduce((sum, segment) => sum + segment.length, 0);
        const sectionCount = this.fenceSegments.length;
        const cornerCount = this.countCorners();
        const gateCount = this.countGates();
        
        document.getElementById('totalLength').textContent = `${totalLength.toFixed(1)} ft`;
        document.getElementById('sectionCount').textContent = sectionCount;
        document.getElementById('cornerCount').textContent = cornerCount;
        document.getElementById('gateCount').textContent = gateCount;
    }
    
    countCorners() {
        let corners = 0;
        this.fenceSegments.forEach(segment => {
            if (segment.path.length > 2) {
                corners += segment.path.length - 2;
            }
        });
        return corners;
    }
    
    countGates() {
        // Simple gate detection - segments shorter than 10 feet might be gates
        return this.fenceSegments.filter(segment => segment.length < 10).length;
    }
    
    updateEstimate() {
        if (!this.selectedStyle || this.fenceSegments.length === 0) {
            document.getElementById('estimateTotal').textContent = '$0.00';
            document.getElementById('estimateDetails').textContent = 'Add fence sections to see estimate';
            return;
        }
        
        const totalLength = this.fenceSegments.reduce((sum, segment) => sum + segment.length, 0);
        const pricing = this.pricing[this.selectedStyle];
        
        if (!pricing) {
            document.getElementById('estimateTotal').textContent = '$0.00';
            document.getElementById('estimateDetails').textContent = 'Pricing not available for selected style';
            return;
        }
        
        const baseCost = pricing.base;
        const perFootCost = pricing.perFoot;
        const totalCost = baseCost + (totalLength * perFootCost);
        
        document.getElementById('estimateTotal').textContent = `$${totalCost.toFixed(2)}`;
        document.getElementById('estimateDetails').textContent = 
            `${totalLength.toFixed(1)} ft of ${this.getSelectedStyleName()} fence`;
    }
    
    getSelectedStyleName() {
        const style = this.fenceStyles.find(s => s.id === this.selectedStyle);
        return style ? style.name : 'Unknown';
    }
    
    // Control functions
    clearCanvas() {
        this.fenceSegments = [];
        this.currentPath = [];
        this.redrawCanvas();
        this.updateMeasurements();
        this.updateEstimate();
    }
    
    undoLastSegment() {
        if (this.fenceSegments.length > 0) {
            this.fenceSegments.pop();
            this.redrawCanvas();
            this.updateMeasurements();
            this.updateEstimate();
        }
    }
    
    toggleGrid() {
        this.gridEnabled = !this.gridEnabled;
        this.redrawCanvas();
    }
    
    autoCalculate() {
        // Auto-detect fence layout and suggest improvements
        const suggestions = [];
        
        if (this.fenceSegments.length === 0) {
            suggestions.push('Draw your fence layout to get started');
        } else {
            const totalLength = this.fenceSegments.reduce((sum, segment) => sum + segment.length, 0);
            
            if (totalLength < 20) {
                suggestions.push('Consider adding more sections for better privacy');
            }
            
            if (this.countGates() === 0) {
                suggestions.push('Add gates for easy access');
            }
            
            if (this.countCorners() < 2) {
                suggestions.push('Add corners to create a complete enclosure');
            }
        }
        
        alert('Auto Calculate Suggestions:\n\n' + suggestions.join('\n'));
    }
    
    exportDrawing() {
        // Create a temporary canvas for export
        const exportCanvas = document.createElement('canvas');
        const exportCtx = exportCanvas.getContext('2d');
        
        exportCanvas.width = this.canvas.width;
        exportCanvas.height = this.canvas.height;
        
        // Draw white background
        exportCtx.fillStyle = 'white';
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        
        // Draw grid
        this.drawGridOnCanvas(exportCtx);
        
        // Draw fence segments
        this.fenceSegments.forEach(segment => {
            this.drawFenceSegmentOnCanvas(exportCtx, segment);
        });
        
        // Add title
        exportCtx.fillStyle = 'black';
        exportCtx.font = 'bold 24px Arial';
        exportCtx.fillText('Fence Layout', 20, 30);
        
        // Add measurements
        exportCtx.font = '16px Arial';
        const totalLength = this.fenceSegments.reduce((sum, segment) => sum + segment.length, 0);
        exportCtx.fillText(`Total Length: ${totalLength.toFixed(1)} ft`, 20, 60);
        exportCtx.fillText(`Style: ${this.getSelectedStyleName()}`, 20, 80);
        
        // Convert to image and download
        const link = document.createElement('a');
        link.download = 'fence-layout.png';
        link.href = exportCanvas.toDataURL();
        link.click();
    }
    
    drawGridOnCanvas(ctx) {
        if (!this.gridEnabled) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        ctx.strokeStyle = '#e9ecef';
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5;
        
        for (let x = 0; x <= width; x += this.gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        for (let y = 0; y <= height; y += this.gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        ctx.globalAlpha = 1;
    }
    
    drawFenceSegmentOnCanvas(ctx, segment) {
        const style = this.fenceStyles.find(s => s.id === segment.style);
        const color = this.colors.find(c => c.hex === segment.color);
        
        if (!style || !color) return;
        
        ctx.strokeStyle = color.value;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(segment.path[0].x, segment.path[0].y);
        
        for (let i = 1; i < segment.path.length; i++) {
            ctx.lineTo(segment.path[i].x, segment.path[i].y);
        }
        
        ctx.stroke();
        this.drawFencePostsOnCanvas(ctx, segment.path);
    }
    
    drawFencePostsOnCanvas(ctx, path) {
        ctx.fillStyle = '#6c757d';
        ctx.strokeStyle = '#495057';
        ctx.lineWidth = 1;
        
        path.forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
        });
    }
    
    generateQuote() {
        if (this.fenceSegments.length === 0) {
            alert('Please draw your fence layout first');
            return;
        }
        
        const quoteData = {
            segments: this.fenceSegments,
            totalLength: this.fenceSegments.reduce((sum, segment) => sum + segment.length, 0),
            style: this.selectedStyle,
            color: this.selectedColor,
            estimate: this.calculateTotalEstimate()
        };
        
        // Store quote data in session storage for the quote page
        sessionStorage.setItem('fenceQuoteData', JSON.stringify(quoteData));
        
        // Redirect to quote page or show quote modal
        alert('Quote generated! Redirecting to quote page...');
        // window.location.href = '/quote'; // Uncomment when quote page is ready
    }
    
    async saveDrawing() {
        const drawingData = {
            segments: this.fenceSegments,
            style: this.selectedStyle,
            color: this.selectedColor,
            scale: this.scale,
            timestamp: new Date().toISOString(),
            totalLength: this.fenceSegments.reduce((sum, segment) => sum + segment.length, 0),
            estimate: this.calculateTotalEstimate()
        };
        
        try {
            // Try to save to backend first
            const response = await frappe.call({
                method: 'webshop.webshop.api.fence_calculator.save_fence_drawing',
                args: {
                    data: JSON.stringify(drawingData)
                }
            });
            
            if (response.message && response.message.success) {
                alert('Drawing saved successfully to your account!');
            } else {
                // Fallback to local download
                this.downloadDrawing(drawingData);
            }
        } catch (error) {
            console.error('Error saving drawing to backend:', error);
            // Fallback to local download
            this.downloadDrawing(drawingData);
        }
    }
    
    downloadDrawing(drawingData) {
        const dataStr = JSON.stringify(drawingData);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.download = 'fence-drawing.json';
        link.href = URL.createObjectURL(dataBlob);
        link.click();
        
        alert('Drawing downloaded as JSON file');
    }
    
    requestEstimate() {
        if (this.fenceSegments.length === 0) {
            alert('Please draw your fence layout first');
            return;
        }
        
        const estimateData = {
            segments: this.fenceSegments,
            totalLength: this.fenceSegments.reduce((sum, segment) => sum + segment.length, 0),
            style: this.selectedStyle,
            color: this.selectedColor,
            estimate: this.calculateTotalEstimate(),
            customerInfo: this.getCustomerInfo()
        };
        
        // Show estimate request form
        this.showEstimateRequestForm(estimateData);
    }
    
    calculateTotalEstimate() {
        if (!this.selectedStyle || this.fenceSegments.length === 0) return 0;
        
        const totalLength = this.fenceSegments.reduce((sum, segment) => sum + segment.length, 0);
        const pricing = this.pricing[this.selectedStyle];
        
        if (!pricing) return 0;
        
        return pricing.base + (totalLength * pricing.perFoot);
    }
    
    getCustomerInfo() {
        // This would typically collect customer information
        return {
            name: prompt('Enter your name:') || 'Anonymous',
            email: prompt('Enter your email:') || '',
            phone: prompt('Enter your phone:') || ''
        };
    }
    
    showEstimateRequestForm(estimateData) {
        const formHtml = `
            <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;">
                <div style="background: white; padding: 30px; border-radius: 12px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
                    <h2 style="margin-bottom: 20px; color: #007bff;">Request Free Estimate</h2>
                    
                    <div style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                        <h3 style="margin-bottom: 10px;">Project Summary</h3>
                        <p><strong>Total Length:</strong> ${estimateData.totalLength.toFixed(1)} ft</p>
                        <p><strong>Style:</strong> ${this.getSelectedStyleName()}</p>
                        <p><strong>Estimated Cost:</strong> $${estimateData.estimate.toFixed(2)}</p>
                    </div>
                    
                    <form id="estimateForm">
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Full Name *</label>
                            <input type="text" id="customerName" required style="width: 100%; padding: 10px; border: 2px solid #dee2e6; border-radius: 6px;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Email *</label>
                            <input type="email" id="customerEmail" required style="width: 100%; padding: 10px; border: 2px solid #dee2e6; border-radius: 6px;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Phone *</label>
                            <input type="tel" id="customerPhone" required style="width: 100%; padding: 10px; border: 2px solid #dee2e6; border-radius: 6px;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Address</label>
                            <textarea id="customerAddress" rows="3" style="width: 100%; padding: 10px; border: 2px solid #dee2e6; border-radius: 6px; resize: vertical;"></textarea>
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 500;">Additional Notes</label>
                            <textarea id="customerNotes" rows="3" style="width: 100%; padding: 10px; border: 2px solid #dee2e6; border-radius: 6px; resize: vertical;" placeholder="Any special requirements or questions..."></textarea>
                        </div>
                        
                        <div style="display: flex; gap: 10px;">
                            <button type="submit" style="flex: 1; padding: 12px; background: #007bff; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Submit Request</button>
                            <button type="button" onclick="this.closest('div[style*=\"position: fixed\"]').remove()" style="padding: 12px 20px; background: #6c757d; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">Cancel</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', formHtml);
        
        // Handle form submission
        document.getElementById('estimateForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitEstimateRequest(estimateData);
        });
    }
    
    async submitEstimateRequest(estimateData) {
        const formData = {
            name: document.getElementById('customerName').value,
            email: document.getElementById('customerEmail').value,
            phone: document.getElementById('customerPhone').value,
            address: document.getElementById('customerAddress').value,
            notes: document.getElementById('customerNotes').value,
            ...estimateData
        };
        
        try {
            // Send data to backend API
            const response = await frappe.call({
                method: 'webshop.webshop.api.fence_calculator.submit_fence_estimate',
                args: {
                    data: JSON.stringify(formData)
                }
            });
            
            if (response.message && response.message.success) {
                // Show success message
                alert('Thank you! Your estimate request has been submitted successfully. We will contact you within 1-2 business days.');
                
                // Remove the form
                document.querySelector('div[style*="position: fixed"]').remove();
            } else {
                throw new Error(response.message?.message || 'Failed to submit request');
            }
        } catch (error) {
            console.error('Error submitting estimate request:', error);
            alert('Sorry, there was an error submitting your request. Please try again or contact us directly.');
        }
    }
}

// Initialize the fence calculator when the page loads
let fenceCalculator;
document.addEventListener('DOMContentLoaded', () => {
    fenceCalculator = new FenceCalculator();
});

// Make it globally accessible
window.fenceCalculator = fenceCalculator;
