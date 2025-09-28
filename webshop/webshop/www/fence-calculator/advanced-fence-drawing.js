/**
 * Advanced Fence Drawing Engine
 * SVG-based interactive fence drawing with professional features
 */

class AdvancedFenceDrawing {
    constructor() {
        this.svg = null;
        this.currentTool = 'fence';
        this.isDrawing = false;
        this.currentPath = [];
        this.fenceSegments = [];
        this.selectedElements = [];
        this.selectedStyle = 'vinyl-privacy';
        this.selectedColor = 'white';
        
        // Enhanced drawing state
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.gridSize = 20;
        this.snapToGrid = true;
        this.showGrid = true;
        this.showRulers = true;
        this.showDimensions = true;
        this.magneticSnap = true;
        this.snapTolerance = 10;
        
        // Drawing modes
        this.drawingMode = 'line'; // line, rectangle, circle, curve
        this.cornerMode = 'auto'; // auto, round, sharp
        this.measurementUnits = 'feet'; // feet, meters, inches
        
        // Enhanced history for undo/redo
        this.history = [];
        this.historyIndex = -1;
        this.maxHistoryStates = 50;
        
        // Selection and editing
        this.selectionBox = null;
        this.isMultiSelecting = false;
        this.clipboard = [];
        
        // Smart guides and constraints
        this.guidelines = [];
        this.constraints = [];
        this.smartGuides = true;
        
        // Drawing precision
        this.precisionMode = false;
        this.angleConstraints = [0, 45, 90, 135, 180, 225, 270, 315]; // degrees
        this.lengthConstraints = [4, 6, 8, 10, 12, 16, 20]; // feet
        
        // Fence styles and colors
        this.fenceStyles = [
            { id: 'vinyl-privacy', name: 'Vinyl Privacy', icon: '🏠', height: '6\'', color: '#ffffff' },
            { id: 'vinyl-semi-privacy', name: 'Vinyl Semi-Privacy', icon: '🏠', height: '6\'', color: '#ffffff' },
            { id: 'vinyl-picket', name: 'Vinyl Picket', icon: '🏠', height: '4\'', color: '#ffffff' },
            { id: 'aluminum-privacy', name: 'Aluminum Privacy', icon: '🏗️', height: '6\'', color: '#c0c0c0' },
            { id: 'aluminum-picket', name: 'Aluminum Picket', icon: '🏗️', height: '4\'', color: '#c0c0c0' },
            { id: 'wood-privacy', name: 'Wood Privacy', icon: '🌲', height: '6\'', color: '#8b4513' },
            { id: 'wood-picket', name: 'Wood Picket', icon: '🌲', height: '4\'', color: '#8b4513' },
            { id: 'chain-link', name: 'Chain Link', icon: '🔗', height: '4\'', color: '#808080' }
        ];
        
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
        
        // Materials calculation cache
        this.lastCalculation = null;
        this.calculationTimer = null;
        
        this.init();
    }
    
    init() {
        console.log('Initializing Advanced Fence Drawing...');
        
        // Get SVG element
        this.svg = document.getElementById('fenceDrawingSVG');
        if (!this.svg) {
            console.error('SVG element not found');
            return;
        }
        
        // Initialize enhanced features
        this.initializeDrawingLayers();
        this.initializeRulers();
        this.initializeSmartGuides();
        this.initializeAdvancedTools();
        
        // Initialize UI
        this.initializeStyles();
        this.initializeColors();
        this.initializeEventListeners();
        this.initializeKeyboardShortcuts();
        
        // Set initial state
        this.saveState();
        
        console.log('Advanced Fence Drawing initialized successfully');
    }
    
    initializeDrawingLayers() {
        // Create organized layers for better drawing management
        const layers = [
            'backgroundLayer',
            'gridLayer', 
            'rulerLayer',
            'guideLayer',
            'fenceLayer',
            'dimensionLayer',
            'selectionLayer',
            'overlayLayer'
        ];
        
        layers.forEach(layerId => {
            if (!document.getElementById(layerId)) {
                const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                layer.id = layerId;
                layer.setAttribute('class', layerId);
                this.svg.appendChild(layer);
            }
        });
    }
    
    initializeRulers() {
        if (!this.showRulers) return;
        
        const rulerLayer = document.getElementById('rulerLayer');
        
        // Horizontal ruler
        const hRuler = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        hRuler.id = 'horizontalRuler';
        hRuler.setAttribute('class', 'ruler horizontal');
        
        // Vertical ruler  
        const vRuler = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        vRuler.id = 'verticalRuler';
        vRuler.setAttribute('class', 'ruler vertical');
        
        rulerLayer.appendChild(hRuler);
        rulerLayer.appendChild(vRuler);
        
        this.updateRulers();
    }
    
    initializeSmartGuides() {
        this.guideLayer = document.getElementById('guideLayer');
        this.guidelines = [];
    }
    
    initializeAdvancedTools() {
        // Create tool palette
        this.createToolPalette();
        
        // Initialize precision input
        this.createPrecisionInput();
        
        // Initialize property panel
        this.createPropertyPanel();
    }
    
    initializeKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'z':
                        e.preventDefault();
                        if (e.shiftKey) {
                            this.redo();
                        } else {
                            this.undo();
                        }
                        break;
                    case 'c':
                        e.preventDefault();
                        this.copySelected();
                        break;
                    case 'v':
                        e.preventDefault();
                        this.pasteSelected();
                        break;
                    case 'a':
                        e.preventDefault();
                        this.selectAll();
                        break;
                    case 'd':
                        e.preventDefault();
                        this.duplicateSelected();
                        break;
                    case 'g':
                        e.preventDefault();
                        this.toggleGrid();
                        break;
                    case 'r':
                        e.preventDefault();
                        this.toggleRulers();
                        break;
                }
            } else {
                switch (e.key) {
                    case 'Delete':
                    case 'Backspace':
                        this.deleteSelected();
                        break;
                    case 'Escape':
                        this.clearSelection();
                        this.cancelCurrentOperation();
                        break;
                    case 'Tab':
                        e.preventDefault();
                        this.cycleThroughElements();
                        break;
                    case 'Enter':
                        this.confirmCurrentOperation();
                        break;
                    case ' ':
                        e.preventDefault();
                        this.togglePanMode();
                        break;
                    case 'Shift':
                        this.enablePrecisionMode();
                        break;
                }
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') {
                this.disablePrecisionMode();
            }
        });
    }
    
    initializeStyles() {
        const grid = document.getElementById('fenceStylesGrid');
        if (!grid) return;
        
        grid.innerHTML = this.fenceStyles.map(style => `
            <div class="fence-style-card" data-style="${style.id}" onclick="fenceDrawing.selectStyle('${style.id}')">
                <div class="fence-style-icon">${style.icon}</div>
                <div class="fence-style-name">${style.name}</div>
                <div class="fence-style-height">${style.height}</div>
            </div>
        `).join('');
        
        // Select first style by default
        this.selectStyle(this.fenceStyles[0].id);
    }
    
    initializeColors() {
        const picker = document.getElementById('colorPicker');
        if (!picker) return;
        
        picker.innerHTML = this.colors.map(color => `
            <div class="color-option" 
                 data-color="${color.hex}" 
                 onclick="fenceDrawing.selectColor('${color.hex}')"
                 style="background-color: ${color.value};"
                 title="${color.name}">
            </div>
        `).join('');
        
        // Select first color by default
        this.selectColor(this.colors[0].hex);
    }
    
    initializeEventListeners() {
        // SVG drawing events
        this.svg.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.svg.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.svg.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.svg.addEventListener('mouseleave', (e) => this.onMouseLeave(e));
        
        // Touch events for mobile
        this.svg.addEventListener('touchstart', (e) => this.onTouchStart(e));
        this.svg.addEventListener('touchmove', (e) => this.onTouchMove(e));
        this.svg.addEventListener('touchend', (e) => this.onTouchEnd(e));
        
        // Zoom and pan
        this.svg.addEventListener('wheel', (e) => this.onWheel(e));
        
        // Tool selection
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tool = e.currentTarget.dataset.tool;
                this.selectTool(tool);
            });
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        
        // Window resize
        window.addEventListener('resize', () => this.onResize());
    }
    
    selectTool(tool) {
        this.currentTool = tool;
        
        // Update UI
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`[data-tool="${tool}"]`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
        
        // Update cursor
        this.updateCursor();
    }
    
    selectStyle(styleId) {
        this.selectedStyle = styleId;
        
        // Update UI
        document.querySelectorAll('.fence-style-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        const selectedCard = document.querySelector(`[data-style="${styleId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }
        
        // Update existing segments if any are selected
        this.updateSelectedSegments();
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
        
        // Update existing segments if any are selected
        this.updateSelectedSegments();
    }
    
    updateCursor() {
        const cursors = {
            'fence': 'crosshair',
            'gate': 'crosshair',
            'measure': 'crosshair',
            'select': 'default'
        };
        
        this.svg.style.cursor = cursors[this.currentTool] || 'default';
    }
    
    onMouseDown(e) {
        e.preventDefault();
        const point = this.getMousePosition(e);
        
        switch (this.currentTool) {
            case 'fence':
            case 'gate':
                this.startDrawing(point);
                break;
            case 'select':
                this.startSelection(point);
                break;
            case 'measure':
                this.startMeasuring(point);
                break;
        }
    }
    
    onMouseMove(e) {
        const point = this.getMousePosition(e);
        this.updateCoordinatesDisplay(point);
        
        if (this.isDrawing) {
            switch (this.currentTool) {
                case 'fence':
                case 'gate':
                    this.continueDrawing(point);
                    break;
                case 'measure':
                    this.continueMeasuring(point);
                    break;
            }
        }
        
        // Show hover effects
        this.updateHoverEffects(point);
    }
    
    updateHoverEffects(point) {
        // Visual feedback for mouse position
        // Remove existing hover indicators
        const existingHover = document.getElementById('hoverIndicator');
        if (existingHover) existingHover.remove();
        
        // Add hover indicator if near snap points
        if (this.magneticSnap) {
            const snapPoint = this.findNearestSnapPoint(point);
            if (snapPoint) {
                const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                indicator.id = 'hoverIndicator';
                indicator.setAttribute('cx', snapPoint.x);
                indicator.setAttribute('cy', snapPoint.y);
                indicator.setAttribute('r', '6');
                indicator.setAttribute('fill', 'none');
                indicator.setAttribute('stroke', '#3498db');
                indicator.setAttribute('stroke-width', '2');
                indicator.setAttribute('opacity', '0.6');
                
                const overlayLayer = document.getElementById('overlayLayer');
                if (overlayLayer) {
                    overlayLayer.appendChild(indicator);
                }
            }
        }
    }
    
    onMouseUp(e) {
        if (this.isDrawing) {
            const point = this.getMousePosition(e);
            this.finishDrawing(point);
        }
    }
    
    onMouseLeave(e) {
        if (this.isDrawing) {
            this.cancelDrawing();
        }
    }
    
    onTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            this.onMouseDown(e.touches[0]);
        }
    }
    
    onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            this.onMouseMove(e.touches[0]);
        } else if (e.touches.length === 2) {
            // Handle pinch zoom
            this.handlePinchZoom(e);
        }
    }
    
    onTouchEnd(e) {
        e.preventDefault();
        this.onMouseUp(e);
    }
    
    onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        this.zoomAt(this.getMousePosition(e), delta);
    }
    
    onKeyDown(e) {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key) {
                case 'z':
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                    break;
                case 's':
                    e.preventDefault();
                    this.saveProject();
                    break;
                case 'a':
                    e.preventDefault();
                    this.selectAll();
                    break;
            }
        }
        
        switch (e.key) {
            case 'Delete':
            case 'Backspace':
                this.deleteSelected();
                break;
            case 'Escape':
                this.clearSelection();
                break;
        }
    }
    
    onResize() {
        // Handle window resize
        this.updateViewBox();
    }
    
    getMousePosition(e) {
        const rect = this.svg.getBoundingClientRect();
        let point = {
            x: (e.clientX - rect.left) / rect.width * 1000,
            y: (e.clientY - rect.top) / rect.height * 600
        };
        
        // Apply smart snapping
        point = this.applySmartSnapping(point);
        
        return point;
    }
    
    applySmartSnapping(point) {
        let snappedPoint = { ...point };
        
        // Grid snapping
        if (this.snapToGrid) {
            snappedPoint.x = Math.round(point.x / this.gridSize) * this.gridSize;
            snappedPoint.y = Math.round(point.y / this.gridSize) * this.gridSize;
        }
        
        // Magnetic snapping to existing points
        if (this.magneticSnap) {
            const snapPoint = this.findNearestSnapPoint(point);
            if (snapPoint) {
                snappedPoint = snapPoint;
                this.showSnapIndicator(snapPoint);
            }
        }
        
        // Angle constraints in precision mode
        if (this.precisionMode && this.currentPath.length > 0) {
            const lastPoint = this.currentPath[this.currentPath.length - 1];
            snappedPoint = this.applyAngleConstraints(lastPoint, snappedPoint);
        }
        
        // Length constraints
        if (this.precisionMode && this.currentPath.length > 0) {
            const lastPoint = this.currentPath[this.currentPath.length - 1];
            snappedPoint = this.applyLengthConstraints(lastPoint, snappedPoint);
        }
        
        return snappedPoint;
    }
    
    findNearestSnapPoint(point) {
        let nearestPoint = null;
        let minDistance = this.snapTolerance;
        
        // Check existing fence points
        this.fenceSegments.forEach(segment => {
            segment.path.forEach(segPoint => {
                const distance = this.calculateDistance(point, segPoint);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestPoint = segPoint;
                }
            });
        });
        
        // Check intersection points
        const intersections = this.findIntersectionPoints();
        intersections.forEach(intersection => {
            const distance = this.calculateDistance(point, intersection);
            if (distance < minDistance) {
                minDistance = distance;
                nearestPoint = intersection;
            }
        });
        
        return nearestPoint;
    }
    
    applyAngleConstraints(fromPoint, toPoint) {
        const dx = toPoint.x - fromPoint.x;
        const dy = toPoint.y - fromPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        // Find nearest constraint angle
        let nearestAngle = angle;
        let minDiff = Infinity;
        
        this.angleConstraints.forEach(constraintAngle => {
            const diff = Math.abs(angle - constraintAngle);
            if (diff < minDiff) {
                minDiff = diff;
                nearestAngle = constraintAngle;
            }
        });
        
        // Apply constraint if close enough (within 15 degrees)
        if (minDiff < 15) {
            const radians = nearestAngle * Math.PI / 180;
            return {
                x: fromPoint.x + Math.cos(radians) * distance,
                y: fromPoint.y + Math.sin(radians) * distance
            };
        }
        
        return toPoint;
    }
    
    applyLengthConstraints(fromPoint, toPoint) {
        const distance = this.calculateDistance(fromPoint, toPoint);
        const feetDistance = distance / this.gridSize;
        
        // Find nearest constraint length
        let nearestLength = feetDistance;
        let minDiff = Infinity;
        
        this.lengthConstraints.forEach(constraintLength => {
            const diff = Math.abs(feetDistance - constraintLength);
            if (diff < minDiff && diff < 2) { // Within 2 feet
                minDiff = diff;
                nearestLength = constraintLength;
            }
        });
        
        if (minDiff < 2) {
            const angle = Math.atan2(toPoint.y - fromPoint.y, toPoint.x - fromPoint.x);
            const constrainedDistance = nearestLength * this.gridSize;
            return {
                x: fromPoint.x + Math.cos(angle) * constrainedDistance,
                y: fromPoint.y + Math.sin(angle) * constrainedDistance
            };
        }
        
        return toPoint;
    }
    
    showSnapIndicator(point) {
        // Remove existing indicator
        const existing = document.getElementById('snapIndicator');
        if (existing) existing.remove();
        
        // Create new indicator
        const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        indicator.id = 'snapIndicator';
        indicator.setAttribute('cx', point.x);
        indicator.setAttribute('cy', point.y);
        indicator.setAttribute('r', '8');
        indicator.setAttribute('fill', 'none');
        indicator.setAttribute('stroke', '#ff6b35');
        indicator.setAttribute('stroke-width', '3');
        indicator.setAttribute('opacity', '0.8');
        
        const overlayLayer = document.getElementById('overlayLayer');
        overlayLayer.appendChild(indicator);
        
        // Auto-remove after short delay
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.remove();
            }
        }, 200);
    }
    
    findIntersectionPoints() {
        const intersections = [];
        
        // Find intersections between fence segments
        for (let i = 0; i < this.fenceSegments.length; i++) {
            for (let j = i + 1; j < this.fenceSegments.length; j++) {
                const seg1 = this.fenceSegments[i];
                const seg2 = this.fenceSegments[j];
                
                // Check each line segment in path1 against each in path2
                for (let k = 1; k < seg1.path.length; k++) {
                    for (let l = 1; l < seg2.path.length; l++) {
                        const intersection = this.lineIntersection(
                            seg1.path[k-1], seg1.path[k],
                            seg2.path[l-1], seg2.path[l]
                        );
                        if (intersection) {
                            intersections.push(intersection);
                        }
                    }
                }
            }
        }
        
        return intersections;
    }
    
    lineIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y;
        const x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y;
        const x4 = p4.x, y4 = p4.y;
        
        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 1e-10) return null; // Lines are parallel
        
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
        
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: x1 + t * (x2 - x1),
                y: y1 + t * (y2 - y1)
            };
        }
        
        return null;
    }
    
    updateCoordinatesDisplay(point) {
        const display = document.getElementById('coordinatesDisplay');
        if (display) {
            const realX = (point.x / this.gridSize).toFixed(1);
            const realY = (point.y / this.gridSize).toFixed(1);
            display.textContent = `X: ${realX}ft, Y: ${realY}ft`;
        }
    }
    
    startDrawing(point) {
        this.isDrawing = true;
        this.currentPath = [point];
        
        // Create preview line
        this.createPreviewLine(point);
    }
    
    continueDrawing(point) {
        if (!this.isDrawing) return;
        
        // Update preview line
        this.updatePreviewLine(point);
        
        // Show measurement tooltip
        const lastPoint = this.currentPath[this.currentPath.length - 1];
        const distance = this.calculateDistance(lastPoint, point);
        this.showTooltip(point, `${(distance / this.gridSize).toFixed(1)} ft`);
    }
    
    finishDrawing(point) {
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        this.currentPath.push(point);
        
        // Remove preview line
        this.removePreviewLine();
        
        // Create fence segment
        this.createFenceSegment(this.currentPath);
        
        // Clear current path
        this.currentPath = [];
        
        // Hide tooltip
        this.hideTooltip();
        
        // Save state for undo
        this.saveState();
        
        // Recalculate materials
        this.scheduleCalculation();
    }
    
    cancelDrawing() {
        if (!this.isDrawing) return;
        
        this.isDrawing = false;
        this.currentPath = [];
        this.removePreviewLine();
        this.hideTooltip();
    }
    
    createPreviewLine(startPoint) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.id = 'previewLine';
        line.setAttribute('x1', startPoint.x);
        line.setAttribute('y1', startPoint.y);
        line.setAttribute('x2', startPoint.x);
        line.setAttribute('y2', startPoint.y);
        line.setAttribute('stroke', '#007bff');
        line.setAttribute('stroke-width', '3');
        line.setAttribute('stroke-dasharray', '5,5');
        line.setAttribute('opacity', '0.7');
        
        const overlayLayer = document.getElementById('overlayLayer');
        overlayLayer.appendChild(line);
    }
    
    updatePreviewLine(endPoint) {
        const line = document.getElementById('previewLine');
        if (line) {
            line.setAttribute('x2', endPoint.x);
            line.setAttribute('y2', endPoint.y);
        }
    }
    
    removePreviewLine() {
        const line = document.getElementById('previewLine');
        if (line) {
            line.remove();
        }
    }
    
    createFenceSegment(path) {
        if (path.length < 2) return;
        
        const segmentId = `segment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const isGate = this.currentTool === 'gate';
        
        // Calculate total length
        let totalLength = 0;
        for (let i = 1; i < path.length; i++) {
            totalLength += this.calculateDistance(path[i-1], path[i]);
        }
        
        // Create segment data
        const segment = {
            id: segmentId,
            path: [...path],
            style: this.selectedStyle,
            color: this.selectedColor,
            length: totalLength / this.gridSize, // Convert to feet
            isGate: isGate,
            height: this.getStyleHeight(this.selectedStyle)
        };
        
        // Add to segments array
        this.fenceSegments.push(segment);
        
        // Create SVG elements
        this.renderSegment(segment);
        
        console.log('Created segment:', segment);
    }
    
    renderSegment(segment) {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.id = segment.id;
        group.setAttribute('class', 'fence-segment');
        group.setAttribute('data-style', segment.style);
        group.setAttribute('data-color', segment.color);
        
        // Create path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const pathData = this.createPathData(segment.path);
        path.setAttribute('d', pathData);
        path.setAttribute('stroke', this.getColorValue(segment.color));
        path.setAttribute('stroke-width', segment.isGate ? '6' : '4');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('fill', 'none');
        
        if (segment.isGate) {
            path.setAttribute('stroke-dasharray', '10,5');
        }
        
        group.appendChild(path);
        
        // Add posts at connection points
        segment.path.forEach((point, index) => {
            if (index === 0 || index === segment.path.length - 1 || this.isCornerPoint(segment.path, index)) {
                const post = this.createPost(point, segment.style);
                group.appendChild(post);
            }
        });
        
        // Add measurement label
        const midPoint = this.getMidPoint(segment.path);
        const label = this.createMeasurementLabel(midPoint, `${segment.length.toFixed(1)}ft`);
        group.appendChild(label);
        
        // Add click handler for selection
        group.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectSegment(segment.id);
        });
        
        // Add to fence layer
        const fenceLayer = document.getElementById('fenceLayer');
        fenceLayer.appendChild(group);
    }
    
    createPathData(points) {
        if (points.length < 2) return '';
        
        let pathData = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            pathData += ` L ${points[i].x} ${points[i].y}`;
        }
        return pathData;
    }
    
    createPost(point, style) {
        const post = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        post.setAttribute('cx', point.x);
        post.setAttribute('cy', point.y);
        post.setAttribute('r', '4');
        post.setAttribute('fill', '#6c757d');
        post.setAttribute('stroke', '#495057');
        post.setAttribute('stroke-width', '1');
        post.setAttribute('class', 'fence-post');
        return post;
    }
    
    createMeasurementLabel(point, text) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', point.x);
        label.setAttribute('y', point.y - 10);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-family', 'Arial, sans-serif');
        label.setAttribute('font-size', '12');
        label.setAttribute('font-weight', 'bold');
        label.setAttribute('fill', '#007bff');
        label.setAttribute('class', 'measurement-label');
        label.textContent = text;
        return label;
    }
    
    getMidPoint(points) {
        if (points.length === 2) {
            return {
                x: (points[0].x + points[1].x) / 2,
                y: (points[0].y + points[1].y) / 2
            };
        }
        
        // For multi-point paths, find approximate middle
        const totalLength = this.calculatePathLength(points);
        let currentLength = 0;
        const targetLength = totalLength / 2;
        
        for (let i = 1; i < points.length; i++) {
            const segmentLength = this.calculateDistance(points[i-1], points[i]);
            if (currentLength + segmentLength >= targetLength) {
                const ratio = (targetLength - currentLength) / segmentLength;
                return {
                    x: points[i-1].x + (points[i].x - points[i-1].x) * ratio,
                    y: points[i-1].y + (points[i].y - points[i-1].y) * ratio
                };
            }
            currentLength += segmentLength;
        }
        
        return points[Math.floor(points.length / 2)];
    }
    
    calculateDistance(point1, point2) {
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    calculatePathLength(points) {
        let length = 0;
        for (let i = 1; i < points.length; i++) {
            length += this.calculateDistance(points[i-1], points[i]);
        }
        return length;
    }
    
    isCornerPoint(points, index) {
        if (index === 0 || index === points.length - 1) return false;
        if (points.length < 3) return false;
        
        const prev = points[index - 1];
        const current = points[index];
        const next = points[index + 1];
        
        // Calculate angles
        const angle1 = Math.atan2(current.y - prev.y, current.x - prev.x);
        const angle2 = Math.atan2(next.y - current.y, next.x - current.x);
        
        // If angle difference is significant, it's a corner
        const angleDiff = Math.abs(angle1 - angle2);
        return angleDiff > Math.PI / 6; // 30 degrees threshold
    }
    
    getColorValue(colorHex) {
        const color = this.colors.find(c => c.hex === colorHex);
        return color ? color.value : '#ffffff';
    }
    
    getStyleHeight(styleId) {
        const style = this.fenceStyles.find(s => s.id === styleId);
        return style ? style.height : '6\'';
    }
    
    selectSegment(segmentId) {
        if (this.currentTool !== 'select') return;
        
        // Clear previous selection if not holding Ctrl
        if (!this.isCtrlPressed) {
            this.clearSelection();
        }
        
        // Add to selection
        if (!this.selectedElements.includes(segmentId)) {
            this.selectedElements.push(segmentId);
            this.highlightSegment(segmentId, true);
        }
    }
    
    clearSelection() {
        this.selectedElements.forEach(id => {
            this.highlightSegment(id, false);
        });
        this.selectedElements = [];
    }
    
    highlightSegment(segmentId, highlighted) {
        const element = document.getElementById(segmentId);
        if (element) {
            if (highlighted) {
                element.classList.add('selected');
                element.style.filter = 'drop-shadow(0 0 5px #007bff)';
            } else {
                element.classList.remove('selected');
                element.style.filter = '';
            }
        }
    }
    
    updateSelectedSegments() {
        // Update style and color of selected segments
        this.selectedElements.forEach(id => {
            const segment = this.fenceSegments.find(s => s.id === id);
            if (segment) {
                segment.style = this.selectedStyle;
                segment.color = this.selectedColor;
                this.rerenderSegment(segment);
            }
        });
        
        if (this.selectedElements.length > 0) {
            this.scheduleCalculation();
        }
    }
    
    rerenderSegment(segment) {
        // Remove existing element
        const existingElement = document.getElementById(segment.id);
        if (existingElement) {
            existingElement.remove();
        }
        
        // Render updated segment
        this.renderSegment(segment);
        
        // Restore selection highlight if needed
        if (this.selectedElements.includes(segment.id)) {
            this.highlightSegment(segment.id, true);
        }
    }
    
    deleteSelected() {
        if (this.selectedElements.length === 0) return;
        
        // Remove from segments array and DOM
        this.selectedElements.forEach(id => {
            // Remove from segments array
            this.fenceSegments = this.fenceSegments.filter(s => s.id !== id);
            
            // Remove from DOM
            const element = document.getElementById(id);
            if (element) {
                element.remove();
            }
        });
        
        // Clear selection
        this.selectedElements = [];
        
        // Save state and recalculate
        this.saveState();
        this.scheduleCalculation();
    }
    
    // Zoom and pan functions
    zoomIn() {
        this.zoom = Math.min(this.zoom * 1.2, 5);
        this.updateViewBox();
    }
    
    zoomOut() {
        this.zoom = Math.max(this.zoom / 1.2, 0.1);
        this.updateViewBox();
    }
    
    zoomFit() {
        if (this.fenceSegments.length === 0) {
            this.zoom = 1;
            this.panX = 0;
            this.panY = 0;
        } else {
            // Calculate bounding box of all segments
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            
            this.fenceSegments.forEach(segment => {
                segment.path.forEach(point => {
                    minX = Math.min(minX, point.x);
                    minY = Math.min(minY, point.y);
                    maxX = Math.max(maxX, point.x);
                    maxY = Math.max(maxY, point.y);
                });
            });
            
            // Add padding
            const padding = 50;
            minX -= padding;
            minY -= padding;
            maxX += padding;
            maxY += padding;
            
            // Calculate zoom to fit
            const width = maxX - minX;
            const height = maxY - minY;
            const scaleX = 1000 / width;
            const scaleY = 600 / height;
            this.zoom = Math.min(scaleX, scaleY, 2);
            
            // Center the view
            this.panX = -(minX + width / 2 - 500);
            this.panY = -(minY + height / 2 - 300);
        }
        
        this.updateViewBox();
    }
    
    zoomAt(point, delta) {
        const oldZoom = this.zoom;
        this.zoom = Math.max(0.1, Math.min(5, this.zoom + delta));
        
        if (this.zoom !== oldZoom) {
            // Adjust pan to zoom at the cursor position
            const zoomRatio = this.zoom / oldZoom;
            this.panX = point.x - (point.x - this.panX) * zoomRatio;
            this.panY = point.y - (point.y - this.panY) * zoomRatio;
            
            this.updateViewBox();
        }
    }
    
    updateViewBox() {
        const width = 1000 / this.zoom;
        const height = 600 / this.zoom;
        const x = -this.panX / this.zoom;
        const y = -this.panY / this.zoom;
        
        this.svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
    }
    
    // Grid functions
    toggleGrid() {
        this.showGrid = !this.showGrid;
        const gridPattern = this.svg.querySelector('#grid');
        if (gridPattern) {
            gridPattern.style.display = this.showGrid ? 'block' : 'none';
        }
    }
    
    toggleSnap() {
        this.snapToGrid = !this.snapToGrid;
        
        // Update button visual state
        const snapBtn = document.querySelector('[onclick="fenceDrawing.toggleSnap()"]');
        if (snapBtn) {
            snapBtn.style.backgroundColor = this.snapToGrid ? '#007bff' : '';
            snapBtn.style.color = this.snapToGrid ? 'white' : '';
        }
    }
    
    // Calculation and materials
    scheduleCalculation() {
        // Debounce calculations to avoid excessive API calls
        if (this.calculationTimer) {
            clearTimeout(this.calculationTimer);
        }
        
        this.calculationTimer = setTimeout(() => {
            this.calculateMaterials();
        }, 500);
    }
    
    async calculateMaterials() {
        if (this.fenceSegments.length === 0) {
            this.updateMeasurementDisplay({});
            return;
        }
        
        try {
            // Show loading
            this.showLoading(true);
            
            // Prepare segments data for calculation
            const segmentsData = this.fenceSegments.map(segment => ({
                path: segment.path,
                style: segment.style,
                color: segment.color,
                length: segment.length,
                isGate: segment.isGate,
                scale: this.gridSize
            }));
            
            // Call calculation API - Use a simplified approach with error handling
            let response;
            try {
                response = await frappe.call({
                    method: 'webshop.fence_calculation_engine.calculate_fence_materials',
                    args: {
                        segments_data: segmentsData,
                        fence_type: this.selectedStyle,
                        color: this.selectedColor
                    }
                });
            } catch (apiError) {
                console.warn('API calculation failed, using fallback calculation');
                // Fallback to client-side calculation
                response = { message: this.calculateMaterialsFallback(segmentsData) };
            }
            
            if (response.message && response.message.success) {
                this.lastCalculation = response.message;
                this.updateMeasurementDisplay(response.message);
            } else {
                console.error('Calculation failed:', response.message);
                this.showError('Failed to calculate materials');
            }
            
        } catch (error) {
            console.error('Error calculating materials:', error);
            this.showError('Error calculating materials');
        } finally {
            this.showLoading(false);
        }
    }
    
    calculateMaterialsFallback(segmentsData) {
        // Client-side fallback calculation when API is not available
        let totalLength = 0;
        let gateCount = 0;
        
        segmentsData.forEach(segment => {
            totalLength += segment.length / this.gridSize; // Convert pixels to feet
            if (segment.isGate) gateCount++;
        });
        
        // Simple material calculation
        const panelsNeeded = Math.ceil(totalLength / 8); // Assume 8ft panels
        const postsNeeded = panelsNeeded + 1;
        const hardwareNeeded = panelsNeeded * 4;
        
        // Basic pricing (simplified)
        const materialCost = totalLength * 15; // $15 per foot
        const laborCost = totalLength * 8; // $8 per foot labor
        const gateCost = gateCount * 150;
        const totalCost = materialCost + laborCost + gateCost;
        
        return {
            success: true,
            total_length: totalLength,
            segment_count: segmentsData.length,
            materials: {
                panels: panelsNeeded,
                posts: postsNeeded,
                hardware: hardwareNeeded,
                gates: gateCount
            },
            cost_breakdown: {
                material_cost: materialCost,
                labor_cost: laborCost,
                gate_cost: gateCost,
                total_cost: totalCost,
                cost_per_foot: totalLength > 0 ? totalCost / totalLength : 0
            }
        };
    }
    
    updateMeasurementDisplay(calculation) {
        // Update basic measurements
        const totalLength = calculation.total_length || 0;
        const sectionCount = calculation.segment_count || 0;
        const gateCount = this.fenceSegments.filter(s => s.isGate).length;
        const cornerCount = this.countCorners();
        
        document.getElementById('totalLength').textContent = `${totalLength.toFixed(1)} ft`;
        document.getElementById('sectionCount').textContent = sectionCount;
        document.getElementById('gateCount').textContent = gateCount;
        document.getElementById('cornerCount').textContent = cornerCount;
        
        // Update material list
        this.updateMaterialList(calculation.materials || {});
        
        // Update cost summary
        this.updateCostSummary(calculation.cost_breakdown || {});
    }
    
    updateMaterialList(materials) {
        const container = document.getElementById('materialList');
        if (!container) return;
        
        if (Object.keys(materials).length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #6c757d; padding: 20px;">No materials calculated</div>';
            return;
        }
        
        const materialNames = {
            panels: 'Fence Panels',
            posts: 'Fence Posts',
            hardware: 'Hardware',
            gates: 'Gates',
            concrete_bags: 'Concrete Bags'
        };
        
        container.innerHTML = Object.entries(materials)
            .filter(([key, value]) => value > 0 && materialNames[key])
            .map(([key, value]) => `
                <div class="measurement-row">
                    <span class="measurement-label">${materialNames[key]}:</span>
                    <span class="measurement-value">${Math.ceil(value)}</span>
                </div>
            `).join('');
    }
    
    updateCostSummary(costBreakdown) {
        const totalCost = costBreakdown.total_cost || 0;
        const costPerFoot = costBreakdown.cost_per_foot || 0;
        
        document.getElementById('costTotal').textContent = `$${totalCost.toFixed(2)}`;
        
        if (totalCost > 0) {
            document.getElementById('costBreakdown').innerHTML = `
                Materials: $${(costBreakdown.material_cost || 0).toFixed(2)}<br>
                Labor: $${(costBreakdown.labor_cost || 0).toFixed(2)}<br>
                Per Foot: $${costPerFoot.toFixed(2)}
            `;
        } else {
            document.getElementById('costBreakdown').textContent = 'Add fence sections to see estimate';
        }
    }
    
    countCorners() {
        let corners = 0;
        this.fenceSegments.forEach(segment => {
            corners += Math.max(0, segment.path.length - 2);
        });
        return corners;
    }
    
    // History management
    saveState() {
        const state = {
            segments: JSON.parse(JSON.stringify(this.fenceSegments)),
            timestamp: Date.now()
        };
        
        // Remove states after current index
        this.history = this.history.slice(0, this.historyIndex + 1);
        
        // Add new state
        this.history.push(state);
        this.historyIndex = this.history.length - 1;
        
        // Limit history size
        if (this.history.length > 50) {
            this.history.shift();
            this.historyIndex--;
        }
    }
    
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
        }
    }
    
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
        }
    }
    
    restoreState(state) {
        // Clear current drawing
        this.clearAll(false);
        
        // Restore segments
        this.fenceSegments = JSON.parse(JSON.stringify(state.segments));
        
        // Re-render all segments
        this.fenceSegments.forEach(segment => {
            this.renderSegment(segment);
        });
        
        // Recalculate materials
        this.scheduleCalculation();
    }
    
    // Utility functions
    clearAll(saveState = true) {
        // Clear segments
        this.fenceSegments = [];
        this.selectedElements = [];
        
        // Clear SVG
        document.getElementById('fenceLayer').innerHTML = '';
        document.getElementById('measurementLayer').innerHTML = '';
        document.getElementById('overlayLayer').innerHTML = '';
        
        // Reset measurements
        this.updateMeasurementDisplay({});
        
        if (saveState) {
            this.saveState();
        }
    }
    
    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.style.display = show ? 'flex' : 'none';
        }
    }
    
    showError(message) {
        alert(`Error: ${message}`);
    }
    
    showTooltip(point, text) {
        const tooltip = document.getElementById('tooltip');
        if (tooltip) {
            tooltip.textContent = text;
            tooltip.style.left = `${point.x}px`;
            tooltip.style.top = `${point.y - 10}px`;
            tooltip.style.display = 'block';
        }
    }
    
    hideTooltip() {
        const tooltip = document.getElementById('tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }
    
    // Enhanced tool creation methods
    createToolPalette() {
        // This would create an advanced tool palette in the UI
        // For now, we'll enhance the existing tools
        console.log('Enhanced tool palette initialized');
    }
    
    createPrecisionInput() {
        // Create precision input dialog
        const precisionPanel = document.createElement('div');
        precisionPanel.id = 'precisionPanel';
        precisionPanel.className = 'precision-panel hidden';
        precisionPanel.innerHTML = `
            <h4>Precision Input</h4>
            <div class="input-group">
                <label>Length:</label>
                <input type="number" id="precisionLength" step="0.1" min="0">
                <span>ft</span>
            </div>
            <div class="input-group">
                <label>Angle:</label>
                <input type="number" id="precisionAngle" step="1" min="0" max="360">
                <span>°</span>
            </div>
            <div class="button-group">
                <button onclick="fenceDrawing.applyPrecisionInput()">Apply</button>
                <button onclick="fenceDrawing.cancelPrecisionInput()">Cancel</button>
            </div>
        `;
        
        document.body.appendChild(precisionPanel);
    }
    
    createPropertyPanel() {
        // Create property panel for selected elements
        console.log('Property panel initialized');
    }
    
    // Advanced editing features
    copySelected() {
        if (this.selectedElements.length === 0) return;
        
        this.clipboard = this.selectedElements.map(id => {
            const segment = this.fenceSegments.find(s => s.id === id);
            return JSON.parse(JSON.stringify(segment));
        });
        
        console.log(`Copied ${this.clipboard.length} elements`);
    }
    
    pasteSelected() {
        if (this.clipboard.length === 0) return;
        
        const offset = { x: 40, y: 40 }; // Offset for pasted elements
        
        this.clipboard.forEach(clipboardSegment => {
            const newSegment = JSON.parse(JSON.stringify(clipboardSegment));
            newSegment.id = Date.now() + Math.random();
            
            // Offset the path
            newSegment.path = newSegment.path.map(point => ({
                x: point.x + offset.x,
                y: point.y + offset.y
            }));
            
            this.fenceSegments.push(newSegment);
            this.renderSegment(newSegment);
        });
        
        this.saveState();
        this.scheduleCalculation();
    }
    
    duplicateSelected() {
        this.copySelected();
        this.pasteSelected();
    }
    
    selectAll() {
        this.selectedElements = this.fenceSegments.map(segment => segment.id);
        this.selectedElements.forEach(id => {
            this.highlightSegment(id, true);
        });
    }
    
    cycleThroughElements() {
        if (this.fenceSegments.length === 0) return;
        
        let currentIndex = -1;
        if (this.selectedElements.length === 1) {
            currentIndex = this.fenceSegments.findIndex(s => s.id === this.selectedElements[0]);
        }
        
        const nextIndex = (currentIndex + 1) % this.fenceSegments.length;
        const nextElement = this.fenceSegments[nextIndex];
        
        this.clearSelection();
        this.selectSegment(nextElement.id);
    }
    
    // Precision mode methods
    enablePrecisionMode() {
        this.precisionMode = true;
        this.svg.style.cursor = 'crosshair';
        this.showPrecisionIndicator();
    }
    
    disablePrecisionMode() {
        this.precisionMode = false;
        this.hidePrecisionIndicator();
        this.updateCursor();
    }
    
    showPrecisionIndicator() {
        // Visual indicator that precision mode is active
        const indicator = document.createElement('div');
        indicator.id = 'precisionIndicator';
        indicator.className = 'precision-indicator';
        indicator.textContent = 'PRECISION MODE';
        document.body.appendChild(indicator);
    }
    
    hidePrecisionIndicator() {
        const indicator = document.getElementById('precisionIndicator');
        if (indicator) indicator.remove();
    }
    
    // Enhanced operations
    cancelCurrentOperation() {
        this.isDrawing = false;
        this.currentPath = [];
        this.removePreviewLine();
        this.hideTooltip();
        this.clearTemporaryElements();
    }
    
    confirmCurrentOperation() {
        if (this.isDrawing && this.currentPath.length > 0) {
            this.finishDrawing({ x: this.currentPath[this.currentPath.length - 1].x, y: this.currentPath[this.currentPath.length - 1].y });
        }
    }
    
    togglePanMode() {
        // Toggle between drawing and pan mode
        if (this.currentTool === 'pan') {
            this.selectTool('fence');
        } else {
            this.selectTool('pan');
        }
    }
    
    clearTemporaryElements() {
        // Remove temporary visual elements
        const overlayLayer = document.getElementById('overlayLayer');
        overlayLayer.innerHTML = '';
    }
    
    // Rulers and guides
    updateRulers() {
        if (!this.showRulers) return;
        
        const hRuler = document.getElementById('horizontalRuler');
        const vRuler = document.getElementById('verticalRuler');
        
        if (!hRuler || !vRuler) return;
        
        // Clear existing rulers
        hRuler.innerHTML = '';
        vRuler.innerHTML = '';
        
        // Draw horizontal ruler
        for (let x = 0; x <= 1000; x += this.gridSize) {
            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', x);
            tick.setAttribute('y1', 0);
            tick.setAttribute('x2', x);
            tick.setAttribute('y2', x % (this.gridSize * 5) === 0 ? 15 : 10);
            tick.setAttribute('stroke', '#666');
            tick.setAttribute('stroke-width', '1');
            hRuler.appendChild(tick);
            
            // Add labels for major ticks
            if (x % (this.gridSize * 5) === 0) {
                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', x);
                label.setAttribute('y', 25);
                label.setAttribute('text-anchor', 'middle');
                label.setAttribute('font-size', '10');
                label.setAttribute('fill', '#666');
                label.textContent = (x / this.gridSize).toString();
                hRuler.appendChild(label);
            }
        }
        
        // Draw vertical ruler
        for (let y = 0; y <= 600; y += this.gridSize) {
            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', 0);
            tick.setAttribute('y1', y);
            tick.setAttribute('x2', y % (this.gridSize * 5) === 0 ? 15 : 10);
            tick.setAttribute('y2', y);
            tick.setAttribute('stroke', '#666');
            tick.setAttribute('stroke-width', '1');
            vRuler.appendChild(tick);
            
            // Add labels for major ticks
            if (y % (this.gridSize * 5) === 0) {
                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', 20);
                label.setAttribute('y', y + 3);
                label.setAttribute('font-size', '10');
                label.setAttribute('fill', '#666');
                label.textContent = (y / this.gridSize).toString();
                vRuler.appendChild(label);
            }
        }
    }
    
    toggleRulers() {
        this.showRulers = !this.showRulers;
        const rulerLayer = document.getElementById('rulerLayer');
        if (rulerLayer) {
            rulerLayer.style.display = this.showRulers ? 'block' : 'none';
        }
        this.updateRulers();
    }
    
    // Auto optimization
    async autoOptimize() {
        if (this.fenceSegments.length === 0) {
            alert('Please draw some fence sections first');
            return;
        }
        
        try {
            this.showLoading(true);
            
            const segmentsData = this.fenceSegments.map(segment => ({
                path: segment.path,
                style: segment.style,
                color: segment.color,
                length: segment.length,
                isGate: segment.isGate,
                scale: this.gridSize
            }));
            
            // Try API optimization, fallback to simple suggestions
            let response;
            try {
                response = await frappe.call({
                    method: 'webshop.fence_calculation_engine.optimize_fence_layout',
                    args: {
                        segments_data: segmentsData,
                        fence_type: this.selectedStyle
                    }
                });
            } catch (apiError) {
                console.warn('API optimization failed, using fallback');
                response = { 
                    message: { 
                        success: true, 
                        suggestions: [
                            {
                                type: 'general',
                                title: 'Fence Layout Tips',
                                description: 'Consider connecting fence sections and optimizing gate placement for cost savings.',
                                potential_savings: 100
                            }
                        ]
                    }
                };
            }
            
            if (response.message && response.message.success) {
                this.showOptimizationSuggestions(response.message.suggestions);
            }
            
        } catch (error) {
            console.error('Error optimizing layout:', error);
            this.showError('Failed to optimize layout');
        } finally {
            this.showLoading(false);
        }
    }
    
    showOptimizationSuggestions(suggestions) {
        if (suggestions.length === 0) {
            alert('Your fence layout is already optimized!');
            return;
        }
        
        let message = 'Optimization Suggestions:\n\n';
        suggestions.forEach((suggestion, index) => {
            message += `${index + 1}. ${suggestion.title}\n`;
            message += `   ${suggestion.description}\n`;
            if (suggestion.potential_savings) {
                message += `   Potential Savings: $${suggestion.potential_savings}\n`;
            }
            message += '\n';
        });
        
        alert(message);
    }
    
    // Project management
    async generateQuote() {
        if (!this.lastCalculation) {
            alert('Please draw your fence layout first');
            return;
        }
        
        // Implement quote generation
        alert('Quote generation feature coming soon!');
    }
    
    async requestEstimate() {
        if (!this.lastCalculation) {
            alert('Please draw your fence layout first');
            return;
        }
        
        // Implement estimate request
        alert('Estimate request feature coming soon!');
    }
    
    async shareProject() {
        if (this.fenceSegments.length === 0) {
            alert('Please draw your fence layout first');
            return;
        }
        
        // Generate shareable link
        const projectData = {
            segments: this.fenceSegments,
            style: this.selectedStyle,
            color: this.selectedColor,
            timestamp: Date.now()
        };
        
        const encoded = btoa(JSON.stringify(projectData));
        const shareUrl = `${window.location.origin}${window.location.pathname}?project=${encoded}`;
        
        // Copy to clipboard
        try {
            await navigator.clipboard.writeText(shareUrl);
            alert('Project link copied to clipboard!');
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = shareUrl;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert('Project link copied to clipboard!');
        }
    }
    
    // Additional enhanced methods
    toggleMagneticSnap() {
        this.magneticSnap = !this.magneticSnap;
        const btn = document.querySelector('[onclick="fenceDrawing.toggleMagneticSnap()"]');
        if (btn) {
            btn.classList.toggle('active', this.magneticSnap);
        }
        console.log('Magnetic snap:', this.magneticSnap ? 'enabled' : 'disabled');
    }
    
    showPrecisionInput() {
        const panel = document.getElementById('precisionPanel');
        if (panel) {
            panel.classList.remove('hidden');
            document.getElementById('precisionLength').focus();
        }
    }
    
    cancelPrecisionInput() {
        const panel = document.getElementById('precisionPanel');
        if (panel) {
            panel.classList.add('hidden');
        }
    }
    
    applyPrecisionInput() {
        const length = parseFloat(document.getElementById('precisionLength').value);
        const angle = parseFloat(document.getElementById('precisionAngle').value);
        
        if (this.currentPath.length > 0 && !isNaN(length) && !isNaN(angle)) {
            const lastPoint = this.currentPath[this.currentPath.length - 1];
            const radians = (angle * Math.PI) / 180;
            const distance = length * this.gridSize;
            
            const newPoint = {
                x: lastPoint.x + Math.cos(radians) * distance,
                y: lastPoint.y + Math.sin(radians) * distance
            };
            
            this.finishDrawing(newPoint);
        }
        
        this.cancelPrecisionInput();
    }
    
    showMeasurements() {
        this.showDimensions = !this.showDimensions;
        const btn = document.querySelector('[onclick="fenceDrawing.showMeasurements()"]');
        if (btn) {
            btn.classList.toggle('active', this.showDimensions);
        }
        
        if (this.showDimensions) {
            this.addDimensionLines();
        } else {
            this.removeDimensionLines();
        }
    }
    
    addDimensionLines() {
        this.removeDimensionLines(); // Clear existing
        
        const dimensionLayer = document.getElementById('dimensionLayer');
        
        this.fenceSegments.forEach(segment => {
            if (segment.path.length >= 2) {
                for (let i = 1; i < segment.path.length; i++) {
                    const start = segment.path[i-1];
                    const end = segment.path[i];
                    const distance = this.calculateDistance(start, end) / this.gridSize;
                    
                    // Create dimension line offset above the fence
                    const offset = 20;
                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('class', 'dimension-line');
                    line.setAttribute('x1', start.x);
                    line.setAttribute('y1', start.y - offset);
                    line.setAttribute('x2', end.x);
                    line.setAttribute('y2', end.y - offset);
                    line.setAttribute('stroke', '#28a745');
                    line.setAttribute('stroke-width', '1');
                    line.setAttribute('stroke-dasharray', '2,2');
                    dimensionLayer.appendChild(line);
                    
                    // Create dimension text
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.setAttribute('class', 'dimension-text');
                    text.setAttribute('x', (start.x + end.x) / 2);
                    text.setAttribute('y', ((start.y + end.y) / 2) - offset - 5);
                    text.setAttribute('text-anchor', 'middle');
                    text.setAttribute('font-size', '10');
                    text.setAttribute('fill', '#28a745');
                    text.setAttribute('font-weight', 'bold');
                    text.textContent = `${distance.toFixed(1)}'`;
                    dimensionLayer.appendChild(text);
                }
            }
        });
    }
    
    removeDimensionLines() {
        const dimensionLayer = document.getElementById('dimensionLayer');
        if (dimensionLayer) {
            dimensionLayer.innerHTML = '';
        }
    }
    
    loadProject(projectData) {
        try {
            this.clearAll(false);
            
            this.fenceSegments = projectData.segments || [];
            this.selectedStyle = projectData.style || 'vinyl-privacy';
            this.selectedColor = projectData.color || 'white';
            
            // Re-render all segments
            this.fenceSegments.forEach(segment => {
                this.renderSegment(segment);
            });
            
            // Update UI
            this.selectStyle(this.selectedStyle);
            this.selectColor(this.selectedColor);
            
            // Recalculate
            this.scheduleCalculation();
            
            // Fit to view
            setTimeout(() => {
                this.zoomFit();
            }, 100);
            
            console.log('Project loaded successfully');
        } catch (error) {
            console.error('Error loading project:', error);
            alert('Error loading shared project');
        }
    }
    
    async saveProject() {
        if (this.fenceSegments.length === 0) {
            alert('Please draw your fence layout first');
            return;
        }
        
        // Implement project saving
        alert('Project saving feature coming soon!');
    }
}

// Initialize the fence drawing application
let fenceDrawing;
document.addEventListener('DOMContentLoaded', () => {
    fenceDrawing = new AdvancedFenceDrawing();
    
    // Check for shared project in URL
    const urlParams = new URLSearchParams(window.location.search);
    const projectData = urlParams.get('project');
    if (projectData) {
        try {
            const decoded = JSON.parse(atob(projectData));
            fenceDrawing.loadProject(decoded);
        } catch (error) {
            console.error('Error loading shared project:', error);
        }
    }
});

// Make it globally accessible
window.fenceDrawing = fenceDrawing;
