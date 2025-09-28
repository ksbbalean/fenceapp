/**
 * Guided Fence Wizard - JavaScript Controller
 * Inspired by Catalyst Fence Estimator workflow
 */

class GuidedFenceWizard {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 12;
        this.selections = {
            material: null,
            type: null,
            height: null,
            address: null,
            fenceLayout: [],
            singleGates: 0,
            doubleGates: 0
        };
        
        this.fenceTypes = {
            vinyl: [
                { id: 'vinyl-privacy', name: 'Privacy Fence', desc: 'Complete privacy with solid panels', icon: '🏠' },
                { id: 'vinyl-semi-privacy', name: 'Semi-Privacy', desc: 'Partial privacy with spacing', icon: '🏘️' },
                { id: 'vinyl-picket', name: 'Picket Fence', desc: 'Decorative front yard fencing', icon: '🏡' }
            ],
            wood: [
                { id: 'wood-privacy', name: 'Privacy Fence', desc: 'Cedar or pressure-treated privacy', icon: '🌲' },
                { id: 'wood-picket', name: 'Picket Fence', desc: 'Classic white picket styling', icon: '🏡' },
                { id: 'wood-split-rail', name: 'Split Rail', desc: 'Rustic farm-style fencing', icon: '🚧' }
            ],
            aluminum: [
                { id: 'aluminum-ornamental', name: 'Ornamental', desc: 'Decorative aluminum with spears', icon: '⚡' },
                { id: 'aluminum-privacy', name: 'Privacy Screen', desc: 'Aluminum slats for privacy', icon: '🏢' },
                { id: 'aluminum-pool', name: 'Pool Fence', desc: 'Safety fencing for pools', icon: '🏊' }
            ],
            'chain-link': [
                { id: 'chain-link-standard', name: 'Standard', desc: 'Galvanized chain link fencing', icon: '🔗' },
                { id: 'chain-link-vinyl', name: 'Vinyl Coated', desc: 'Colored vinyl-coated chain link', icon: '🎨' },
                { id: 'chain-link-privacy', name: 'Privacy Slats', desc: 'Chain link with privacy inserts', icon: '🔒' }
            ]
        };
        
        this.pricing = {
            'vinyl-privacy': { perFoot: 28, postCost: 35, gateSingle: 250, gateDouble: 450, labor: 12 },
            'vinyl-semi-privacy': { perFoot: 24, postCost: 35, gateSingle: 220, gateDouble: 400, labor: 10 },
            'vinyl-picket': { perFoot: 22, postCost: 30, gateSingle: 200, gateDouble: 350, labor: 8 },
            'wood-privacy': { perFoot: 18, postCost: 25, gateSingle: 180, gateDouble: 320, labor: 15 },
            'wood-picket': { perFoot: 16, postCost: 20, gateSingle: 150, gateDouble: 280, labor: 12 },
            'wood-split-rail': { perFoot: 12, postCost: 18, gateSingle: 120, gateDouble: 200, labor: 8 },
            'aluminum-ornamental': { perFoot: 32, postCost: 40, gateSingle: 300, gateDouble: 550, labor: 10 },
            'aluminum-privacy': { perFoot: 35, postCost: 40, gateSingle: 320, gateDouble: 580, labor: 12 },
            'aluminum-pool': { perFoot: 25, postCost: 35, gateSingle: 250, gateDouble: 450, labor: 8 },
            'chain-link-standard': { perFoot: 8, postCost: 15, gateSingle: 80, gateDouble: 150, labor: 6 },
            'chain-link-vinyl': { perFoot: 12, postCost: 18, gateSingle: 120, gateDouble: 200, labor: 7 },
            'chain-link-privacy': { perFoot: 15, postCost: 20, gateSingle: 150, gateDouble: 250, labor: 8 }
        };
        
        this.init();
    }
    
    init() {
        this.attachEventListeners();
        this.updateProgress();
        console.log('Guided Fence Wizard initialized');
    }
    
    attachEventListeners() {
        // Material selection
        document.querySelectorAll('#step1 .selection-card').forEach(card => {
            card.addEventListener('click', (e) => this.selectMaterial(e.target.closest('.selection-card')));
        });
        
        // Height selection
        document.querySelectorAll('#step3 .selection-card').forEach(card => {
            card.addEventListener('click', (e) => this.selectHeight(e.target.closest('.selection-card')));
        });
        
        // Address input
        const addressInput = document.getElementById('addressInput');
        if (addressInput) {
            addressInput.addEventListener('input', (e) => this.handleAddressInput(e));
        }
        
        // Drawing area setup
        this.setupDrawingArea();
    }
    
    selectMaterial(card) {
        // Clear previous selections
        document.querySelectorAll('#step1 .selection-card').forEach(c => c.classList.remove('selected'));
        
        // Select current card
        card.classList.add('selected');
        this.selections.material = card.dataset.value;
        
        // Enable next button
        document.getElementById('nextBtn1').disabled = false;
        
        // Populate type selection for step 2
        this.populateTypeSelection();
        
        console.log('Material selected:', this.selections.material);
    }
    
    populateTypeSelection() {
        const typeGrid = document.getElementById('typeGrid');
        const types = this.fenceTypes[this.selections.material] || [];
        
        typeGrid.innerHTML = types.map(type => `
            <div class="selection-card" data-value="${type.id}">
                <span class="icon">${type.icon}</span>
                <div class="title">${type.name}</div>
                <div class="description">${type.desc}</div>
                <div class="checkmark">✓</div>
            </div>
        `).join('');
        
        // Attach event listeners to new type cards
        typeGrid.querySelectorAll('.selection-card').forEach(card => {
            card.addEventListener('click', (e) => this.selectType(e.target.closest('.selection-card')));
        });
    }
    
    selectType(card) {
        // Clear previous selections
        document.querySelectorAll('#step2 .selection-card').forEach(c => c.classList.remove('selected'));
        
        // Select current card
        card.classList.add('selected');
        this.selections.type = card.dataset.value;
        
        // Enable next button
        document.getElementById('nextBtn2').disabled = false;
        
        console.log('Type selected:', this.selections.type);
    }
    
    selectHeight(card) {
        // Clear previous selections
        document.querySelectorAll('#step3 .selection-card').forEach(c => c.classList.remove('selected'));
        
        // Select current card
        card.classList.add('selected');
        this.selections.height = card.dataset.value;
        
        // Enable next button
        document.getElementById('nextBtn3').disabled = false;
        
        console.log('Height selected:', this.selections.height);
    }
    
    handleAddressInput(e) {
        const address = e.target.value.trim();
        this.selections.address = address;
        
        // Enable next button if address is provided
        document.getElementById('nextBtn5').disabled = address.length < 5;
        
        if (address.length >= 5) {
            // Simulate address validation
            setTimeout(() => {
                document.getElementById('confirmedAddress').textContent = address;
            }, 100);
        }
    }
    
    setupDrawingArea() {
        const drawingArea = document.getElementById('drawingArea');
        if (!drawingArea) return;
        
        let isDrawing = false;
        let points = [];
        
        drawingArea.addEventListener('click', (e) => {
            if (e.target === drawingArea || e.target.classList.contains('map-placeholder')) {
                // Start drawing mode if placeholder is clicked
                if (!isDrawing) {
                    isDrawing = true;
                    drawingArea.innerHTML = '<svg width="100%" height="100%" style="background: #f8f9fa;"></svg>';
                    drawingArea.style.cursor = 'crosshair';
                }
                
                // Add point to fence layout
                const rect = drawingArea.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                points.push({ x, y });
                this.drawFencePoint(x, y);
                
                if (points.length > 1) {
                    this.drawFenceLine(points[points.length - 2], points[points.length - 1]);
                }
                
                this.updateDrawingMeasurements();
            }
        });
    }
    
    drawFencePoint(x, y) {
        const svg = document.querySelector('#drawingArea svg');
        if (!svg) return;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', '#3498db');
        circle.setAttribute('stroke', '#2980b9');
        circle.setAttribute('stroke-width', '2');
        svg.appendChild(circle);
    }
    
    drawFenceLine(point1, point2) {
        const svg = document.querySelector('#drawingArea svg');
        if (!svg) return;
        
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', point1.x);
        line.setAttribute('y1', point1.y);
        line.setAttribute('x2', point2.x);
        line.setAttribute('y2', point2.y);
        line.setAttribute('stroke', '#2c3e50');
        line.setAttribute('stroke-width', '3');
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);
    }
    
    updateDrawingMeasurements() {
        // Calculate approximate fence length
        const svg = document.querySelector('#drawingArea svg');
        if (!svg) return;
        
        const lines = svg.querySelectorAll('line');
        let totalLength = 0;
        
        lines.forEach(line => {
            const x1 = parseFloat(line.getAttribute('x1'));
            const y1 = parseFloat(line.getAttribute('y1'));
            const x2 = parseFloat(line.getAttribute('x2'));
            const y2 = parseFloat(line.getAttribute('y2'));
            
            const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            totalLength += length;
        });
        
        // Convert pixels to approximate feet (rough estimation)
        const approximateFeet = Math.round(totalLength / 5);
        this.selections.totalLength = approximateFeet;
        
        console.log('Estimated fence length:', approximateFeet, 'feet');
    }
    
    adjustGateCount(type, change) {
        const countElement = document.getElementById(`${type}GateCount`);
        let currentCount = parseInt(countElement.textContent);
        
        currentCount = Math.max(0, currentCount + change);
        countElement.textContent = currentCount;
        
        this.selections[`${type}Gates`] = currentCount;
        
        console.log(`${type} gates:`, currentCount);
    }
    
    calculateEstimate() {
        const fenceType = this.selections.type;
        const pricing = this.pricing[fenceType];
        
        if (!pricing) {
            console.error('Pricing not found for fence type:', fenceType);
            return;
        }
        
        const length = this.selections.totalLength || 100; // Default if no drawing
        const posts = Math.ceil(length / 8) + 1; // Post every 8 feet
        const panels = Math.ceil(length / 8);
        
        const materialCost = (length * pricing.perFoot) + (posts * pricing.postCost) + 
                           (this.selections.singleGates * pricing.gateSingle) +
                           (this.selections.doubleGates * pricing.gateDouble);
        
        const laborCost = length * pricing.labor;
        const totalCost = materialCost + laborCost;
        
        // Update display
        document.getElementById('totalLength').textContent = `${length} ft`;
        document.getElementById('panelCount').textContent = `${panels} panels`;
        document.getElementById('postCount').textContent = `${posts} posts`;
        document.getElementById('finalSingleGates').textContent = this.selections.singleGates;
        document.getElementById('finalDoubleGates').textContent = this.selections.doubleGates;
        document.getElementById('materialCost').textContent = `$${materialCost.toLocaleString()}`;
        document.getElementById('laborCost').textContent = `$${laborCost.toLocaleString()}`;
        document.getElementById('totalEstimate').textContent = `$${totalCost.toLocaleString()}`;
        
        console.log('Estimate calculated:', {
            length,
            panels,
            posts,
            materialCost,
            laborCost,
            totalCost
        });
    }
    
    updateConfirmationSummary() {
        const materialName = this.fenceTypes[this.selections.material]?.find(type => 
            type.id === this.selections.type)?.name || this.selections.material;
        
        document.getElementById('selectedMaterial').textContent = 
            this.selections.material.replace('-', ' ').toUpperCase();
        document.getElementById('selectedType').textContent = materialName;
        document.getElementById('selectedHeight').textContent = 
            this.selections.height?.replace('ft', ' feet') || '';
    }
    
    nextStep(stepNumber) {
        // Hide current step
        document.getElementById(`step${this.currentStep}`).classList.remove('active');
        
        // Show next step
        this.currentStep = stepNumber;
        document.getElementById(`step${stepNumber}`).classList.add('active');
        
        // Update progress
        this.updateProgress();
        
        // Handle special step logic
        if (stepNumber === 4) {
            this.updateConfirmationSummary();
        } else if (stepNumber === 9) {
            this.calculateEstimate();
        }
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        console.log('Moved to step:', stepNumber);
    }
    
    prevStep(stepNumber) {
        this.nextStep(stepNumber);
    }
    
    updateProgress() {
        const progressPercent = (this.currentStep / this.totalSteps) * 100;
        document.getElementById('progressFill').style.width = `${progressPercent}%`;
    }
    
    undoLastPoint() {
        const svg = document.querySelector('#drawingArea svg');
        if (!svg) return;
        
        // Remove last line and point
        const lines = svg.querySelectorAll('line');
        const circles = svg.querySelectorAll('circle');
        
        if (lines.length > 0) {
            lines[lines.length - 1].remove();
        }
        if (circles.length > 0) {
            circles[circles.length - 1].remove();
        }
        
        this.updateDrawingMeasurements();
    }
    
    clearDrawing() {
        const drawingArea = document.getElementById('drawingArea');
        drawingArea.innerHTML = `
            <div class="map-placeholder">
                <p>Click to start drawing your fence layout</p>
                <small>Drawing area will be activated here</small>
            </div>
        `;
        drawingArea.style.cursor = 'pointer';
        this.selections.totalLength = 0;
    }
    
    async submitEstimate(event) {
        event.preventDefault();
        
        const formData = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            selections: this.selections
        };
        
        try {
            // Show loading state
            const submitBtn = event.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Submitting...';
            submitBtn.disabled = true;
            
            // Submit to backend
            const response = await fetch('/api/method/webshop.api.fence_api.submit_estimate_request_api', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Frappe-CSRF-Token': frappe.csrf_token
                },
                body: JSON.stringify(formData)
            });
            
            if (response.ok) {
                this.nextStep(11); // Success page
            } else {
                throw new Error('Submission failed');
            }
            
        } catch (error) {
            console.error('Error submitting estimate:', error);
            this.nextStep(12); // Error page
        }
    }
    
    startOver() {
        // Reset all selections
        this.selections = {
            material: null,
            type: null,
            height: null,
            address: null,
            fenceLayout: [],
            singleGates: 0,
            doubleGates: 0
        };
        
        // Reset UI
        document.querySelectorAll('.selection-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        document.querySelectorAll('input').forEach(input => {
            input.value = '';
        });
        
        document.getElementById('singleGateCount').textContent = '0';
        document.getElementById('doubleGateCount').textContent = '0';
        
        this.clearDrawing();
        
        // Go back to step 1
        this.nextStep(1);
        
        console.log('Wizard reset');
    }
}

// Global functions for HTML onclick handlers
function nextStep(stepNumber) {
    window.fenceWizard.nextStep(stepNumber);
}

function prevStep(stepNumber) {
    window.fenceWizard.prevStep(stepNumber);
}

function adjustGateCount(type, change) {
    window.fenceWizard.adjustGateCount(type, change);
}

function undoLastPoint() {
    window.fenceWizard.undoLastPoint();
}

function clearDrawing() {
    window.fenceWizard.clearDrawing();
}

function submitEstimate(event) {
    window.fenceWizard.submitEstimate(event);
}

function startOver() {
    window.fenceWizard.startOver();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.fenceWizard = new GuidedFenceWizard();
    console.log('Fence Wizard ready');
});
