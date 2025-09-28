"""
Advanced Fence Calculation Engine
Implements comprehensive fence calculation algorithms for material estimation,
connectivity analysis, and pricing calculations.
"""

import frappe
import json
import math
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from enum import Enum


class FenceType(Enum):
    VINYL_PRIVACY = "vinyl-privacy"
    VINYL_SEMI_PRIVACY = "vinyl-semi-privacy"
    VINYL_PICKET = "vinyl-picket"
    ALUMINUM_PRIVACY = "aluminum-privacy"
    ALUMINUM_PICKET = "aluminum-picket"
    WOOD_PRIVACY = "wood-privacy"
    WOOD_PICKET = "wood-picket"
    CHAIN_LINK = "chain-link"


@dataclass
class Point:
    x: float
    y: float
    
    def distance_to(self, other: 'Point') -> float:
        return math.sqrt((self.x - other.x)**2 + (self.y - other.y)**2)
    
    def angle_to(self, other: 'Point') -> float:
        """Calculate angle in degrees from this point to another"""
        dx = other.x - self.x
        dy = other.y - self.y
        return math.degrees(math.atan2(dy, dx))


@dataclass
class FenceSegment:
    id: str
    start: Point
    end: Point
    fence_type: FenceType
    height: float = 6.0  # feet
    is_gate: bool = False
    gate_width: Optional[float] = None
    
    @property
    def length(self) -> float:
        return self.start.distance_to(self.end)
    
    @property
    def angle(self) -> float:
        return self.start.angle_to(self.end)


@dataclass
class MaterialSpecs:
    """Material specifications for different fence types"""
    panel_width: float = 8.0  # Standard panel width in feet
    post_spacing: float = 8.0  # Standard post spacing in feet
    post_depth: float = 2.0   # Post burial depth in feet
    panel_height: float = 6.0  # Panel height in feet
    
    # Material-specific multipliers
    hardware_per_panel: int = 4  # Number of hardware pieces per panel
    concrete_bags_per_post: float = 1.5  # Concrete bags needed per post
    
    # Waste factors (percentage)
    panel_waste_factor: float = 0.05  # 5% waste
    post_waste_factor: float = 0.02   # 2% waste
    hardware_waste_factor: float = 0.10  # 10% waste


class FenceCalculationEngine:
    """Advanced fence calculation engine with comprehensive algorithms"""
    
    def __init__(self):
        self.material_specs = self._load_material_specs()
        self.pricing_data = self._load_pricing_data()
    
    def _load_material_specs(self) -> Dict[FenceType, MaterialSpecs]:
        """Load material specifications for each fence type"""
        specs = {}
        
        # Default specs for all types
        default_specs = MaterialSpecs()
        
        # Custom specs for specific fence types
        specs[FenceType.VINYL_PRIVACY] = MaterialSpecs(
            panel_width=8.0,
            panel_height=6.0,
            hardware_per_panel=4,
            concrete_bags_per_post=1.5
        )
        
        specs[FenceType.VINYL_PICKET] = MaterialSpecs(
            panel_width=8.0,
            panel_height=4.0,
            hardware_per_panel=3,
            concrete_bags_per_post=1.0
        )
        
        specs[FenceType.ALUMINUM_PRIVACY] = MaterialSpecs(
            panel_width=6.0,
            panel_height=6.0,
            hardware_per_panel=6,
            concrete_bags_per_post=2.0
        )
        
        specs[FenceType.WOOD_PRIVACY] = MaterialSpecs(
            panel_width=8.0,
            panel_height=6.0,
            hardware_per_panel=8,
            concrete_bags_per_post=1.5
        )
        
        specs[FenceType.CHAIN_LINK] = MaterialSpecs(
            panel_width=10.0,  # Chain link sold by linear foot
            panel_height=4.0,
            hardware_per_panel=2,
            concrete_bags_per_post=1.5
        )
        
        # Fill in missing types with default specs
        for fence_type in FenceType:
            if fence_type not in specs:
                specs[fence_type] = default_specs
        
        return specs
    
    def _load_pricing_data(self) -> Dict[str, Dict[str, float]]:
        """Load pricing data from database or return defaults"""
        try:
            # Try to get pricing from database
            pricing = frappe.call('webshop.webshop.api.fence_calculator.get_pricing_from_database')
            if pricing:
                return pricing
        except:
            pass
        
        # Default pricing data
        return {
            'vinyl-privacy': {'base': 25, 'per_foot': 18, 'labor_per_foot': 8},
            'vinyl-semi-privacy': {'base': 22, 'per_foot': 16, 'labor_per_foot': 7},
            'vinyl-picket': {'base': 20, 'per_foot': 14, 'labor_per_foot': 6},
            'aluminum-privacy': {'base': 35, 'per_foot': 25, 'labor_per_foot': 10},
            'aluminum-picket': {'base': 30, 'per_foot': 22, 'labor_per_foot': 9},
            'wood-privacy': {'base': 18, 'per_foot': 12, 'labor_per_foot': 6},
            'wood-picket': {'base': 15, 'per_foot': 10, 'labor_per_foot': 5},
            'chain-link': {'base': 12, 'per_foot': 8, 'labor_per_foot': 4}
        }
    
    def calculate_fence_project(self, segments: List[Dict], fence_type: str, 
                              color: str = "white") -> Dict:
        """
        Main calculation method that processes fence segments and returns
        comprehensive material and cost calculations
        """
        try:
            # Convert input to FenceSegment objects
            fence_segments = self._parse_segments(segments, fence_type)
            
            # Perform connectivity analysis
            connected_groups = self.analyze_connectivity(fence_segments)
            
            # Calculate materials for each group
            total_materials = {}
            total_cost = 0
            
            for group in connected_groups:
                group_materials = self.calculate_materials_for_group(group, fence_type)
                group_cost = self.calculate_pricing(group_materials, fence_type)
                
                # Merge materials
                for material, quantity in group_materials.items():
                    total_materials[material] = total_materials.get(material, 0) + quantity
                
                total_cost += group_cost['total_cost']
            
            # Apply cut optimization
            optimized_materials = self.optimize_cuts(total_materials, fence_type)
            
            # Generate final report
            return {
                'success': True,
                'total_length': sum(seg.length for seg in fence_segments),
                'segment_count': len(fence_segments),
                'connected_groups': len(connected_groups),
                'materials': optimized_materials,
                'cost_breakdown': self.calculate_pricing(optimized_materials, fence_type),
                'segments': [self._segment_to_dict(seg) for seg in fence_segments]
            }
            
        except Exception as e:
            frappe.log_error(f"Error in fence calculation: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _parse_segments(self, segments: List[Dict], fence_type: str) -> List[FenceSegment]:
        """Parse input segments into FenceSegment objects"""
        fence_segments = []
        
        for i, segment in enumerate(segments):
            # Extract path points
            path = segment.get('path', [])
            if len(path) < 2:
                continue
            
            # For multi-point paths, create multiple segments
            for j in range(len(path) - 1):
                start_point = Point(path[j]['x'], path[j]['y'])
                end_point = Point(path[j + 1]['x'], path[j + 1]['y'])
                
                # Convert coordinates from pixels to feet (assuming scale)
                scale = segment.get('scale', 1)  # pixels per foot
                start_point.x /= scale
                start_point.y /= scale
                end_point.x /= scale
                end_point.y /= scale
                
                # Determine if this is a gate
                segment_length = start_point.distance_to(end_point)
                is_gate = segment_length < 10  # Gates are typically less than 10 feet
                
                fence_segment = FenceSegment(
                    id=f"SEG-{i}-{j}",
                    start=start_point,
                    end=end_point,
                    fence_type=FenceType(fence_type),
                    height=segment.get('height', 6.0),
                    is_gate=is_gate,
                    gate_width=segment_length if is_gate else None
                )
                
                fence_segments.append(fence_segment)
        
        return fence_segments
    
    def analyze_connectivity(self, segments: List[FenceSegment]) -> List[List[FenceSegment]]:
        """
        Analyze fence segments and group them into connected fence lines.
        This is crucial for proper material calculation and post counting.
        """
        if not segments:
            return []
        
        # Build connection graph
        connections = {}
        for i, seg1 in enumerate(segments):
            connections[i] = []
            for j, seg2 in enumerate(segments):
                if i != j and self._segments_connected(seg1, seg2):
                    connections[i].append(j)
        
        # Find connected groups using DFS
        visited = set()
        groups = []
        
        for i in range(len(segments)):
            if i not in visited:
                group = []
                self._dfs_connectivity(i, connections, visited, group)
                groups.append([segments[idx] for idx in group])
        
        return groups
    
    def _segments_connected(self, seg1: FenceSegment, seg2: FenceSegment, 
                          tolerance: float = 0.5) -> bool:
        """Check if two segments are connected within tolerance"""
        points1 = [seg1.start, seg1.end]
        points2 = [seg2.start, seg2.end]
        
        for p1 in points1:
            for p2 in points2:
                if p1.distance_to(p2) <= tolerance:
                    return True
        return False
    
    def _dfs_connectivity(self, node: int, connections: Dict, visited: set, group: List):
        """Depth-first search for connectivity analysis"""
        visited.add(node)
        group.append(node)
        
        for neighbor in connections[node]:
            if neighbor not in visited:
                self._dfs_connectivity(neighbor, connections, visited, group)
    
    def calculate_materials_for_group(self, group: List[FenceSegment], 
                                    fence_type: str) -> Dict[str, float]:
        """Calculate materials needed for a connected group of fence segments"""
        fence_type_enum = FenceType(fence_type)
        specs = self.material_specs[fence_type_enum]
        
        total_length = sum(seg.length for seg in group)
        gate_count = sum(1 for seg in group if seg.is_gate)
        
        # Panel calculation
        # For connected fence lines, we calculate panels based on total length
        # minus gate widths (gates don't need panels)
        fence_length = total_length - sum(seg.gate_width or 0 for seg in group if seg.is_gate)
        panels_needed = math.ceil(fence_length / specs.panel_width)
        
        # Post calculation - more complex for connected groups
        posts_needed = self._calculate_posts_for_group(group, specs)
        
        # Hardware calculation
        hardware_needed = panels_needed * specs.hardware_per_panel
        
        # Gates (if any)
        gates_needed = gate_count
        
        # Concrete for posts
        concrete_needed = posts_needed * specs.concrete_bags_per_post
        
        # Apply waste factors
        panels_with_waste = math.ceil(panels_needed * (1 + specs.panel_waste_factor))
        posts_with_waste = math.ceil(posts_needed * (1 + specs.post_waste_factor))
        hardware_with_waste = math.ceil(hardware_needed * (1 + specs.hardware_waste_factor))
        
        return {
            'panels': panels_with_waste,
            'posts': posts_with_waste,
            'hardware': hardware_with_waste,
            'gates': gates_needed,
            'concrete_bags': math.ceil(concrete_needed),
            'total_length': total_length
        }
    
    def _calculate_posts_for_group(self, group: List[FenceSegment], 
                                 specs: MaterialSpecs) -> int:
        """
        Calculate posts needed for a connected group of segments.
        This considers corner posts, end posts, and line posts.
        """
        if not group:
            return 0
        
        # Build adjacency list to understand fence topology
        points = []
        point_connections = {}
        
        for seg in group:
            for point in [seg.start, seg.end]:
                # Find existing point or add new one
                existing_point = None
                for i, existing in enumerate(points):
                    if existing.distance_to(point) <= 0.5:  # tolerance
                        existing_point = i
                        break
                
                if existing_point is None:
                    points.append(point)
                    point_connections[len(points) - 1] = []
                    existing_point = len(points) - 1
        
        # Count connections for each point
        for seg in group:
            start_idx = self._find_point_index(seg.start, points)
            end_idx = self._find_point_index(seg.end, points)
            
            if start_idx is not None and end_idx is not None:
                point_connections[start_idx].append(end_idx)
                point_connections[end_idx].append(start_idx)
        
        # Calculate posts based on point types
        corner_posts = 0  # Points with > 2 connections
        end_posts = 0     # Points with 1 connection
        line_posts = 0    # Posts along straight runs
        
        for point_idx, connections in point_connections.items():
            connection_count = len(set(connections))  # Remove duplicates
            
            if connection_count == 1:
                end_posts += 1
            elif connection_count > 2:
                corner_posts += 1
            # Points with exactly 2 connections are handled by line posts
        
        # Calculate line posts (posts between corners/ends)
        total_length = sum(seg.length for seg in group if not seg.is_gate)
        theoretical_posts = math.ceil(total_length / specs.post_spacing)
        line_posts = max(0, theoretical_posts - corner_posts - end_posts)
        
        return corner_posts + end_posts + line_posts
    
    def _find_point_index(self, point: Point, points: List[Point], 
                         tolerance: float = 0.5) -> Optional[int]:
        """Find index of point in list within tolerance"""
        for i, existing in enumerate(points):
            if existing.distance_to(point) <= tolerance:
                return i
        return None
    
    def optimize_cuts(self, materials: Dict[str, float], fence_type: str) -> Dict[str, float]:
        """
        Optimize material cuts using bin packing algorithm.
        This minimizes waste by finding optimal cutting patterns.
        """
        fence_type_enum = FenceType(fence_type)
        specs = self.material_specs[fence_type_enum]
        
        # For now, implement a simple optimization
        # In a full implementation, this would use advanced bin packing algorithms
        
        optimized = materials.copy()
        
        # Panel optimization example
        if 'panels' in materials:
            # Check if we can use larger panels to reduce cuts
            panel_count = materials['panels']
            standard_width = specs.panel_width
            
            # Example: If we need 15 panels of 8ft, we might optimize for 12ft panels
            # This is a simplified example - real optimization would be more complex
            optimized['panels'] = panel_count
            optimized['cut_waste_factor'] = 0.03  # 3% waste from cuts
        
        return optimized
    
    def calculate_pricing(self, materials: Dict[str, float], fence_type: str) -> Dict:
        """Calculate detailed pricing breakdown"""
        pricing = self.pricing_data.get(fence_type, {})
        
        base_cost = pricing.get('base', 0)
        per_foot_cost = pricing.get('per_foot', 0)
        labor_per_foot = pricing.get('labor_per_foot', 0)
        
        total_length = materials.get('total_length', 0)
        
        # Material costs
        material_cost = base_cost + (total_length * per_foot_cost)
        
        # Labor costs
        labor_cost = total_length * labor_per_foot
        
        # Additional costs
        gate_cost = materials.get('gates', 0) * 150  # $150 per gate
        concrete_cost = materials.get('concrete_bags', 0) * 8  # $8 per bag
        hardware_cost = materials.get('hardware', 0) * 2  # $2 per piece
        
        subtotal = material_cost + labor_cost + gate_cost + concrete_cost + hardware_cost
        
        # Tax and markup
        tax_rate = 0.08  # 8% tax
        markup_rate = 0.20  # 20% markup
        
        markup = subtotal * markup_rate
        tax = (subtotal + markup) * tax_rate
        total_cost = subtotal + markup + tax
        
        return {
            'material_cost': round(material_cost, 2),
            'labor_cost': round(labor_cost, 2),
            'gate_cost': round(gate_cost, 2),
            'concrete_cost': round(concrete_cost, 2),
            'hardware_cost': round(hardware_cost, 2),
            'subtotal': round(subtotal, 2),
            'markup': round(markup, 2),
            'tax': round(tax, 2),
            'total_cost': round(total_cost, 2),
            'cost_per_foot': round(total_cost / total_length, 2) if total_length > 0 else 0
        }
    
    def _segment_to_dict(self, segment: FenceSegment) -> Dict:
        """Convert FenceSegment to dictionary for JSON serialization"""
        return {
            'id': segment.id,
            'start': {'x': segment.start.x, 'y': segment.start.y},
            'end': {'x': segment.end.x, 'y': segment.end.y},
            'length': round(segment.length, 2),
            'angle': round(segment.angle, 2),
            'fence_type': segment.fence_type.value,
            'height': segment.height,
            'is_gate': segment.is_gate,
            'gate_width': segment.gate_width
        }


# Global instance for use by API calls
fence_calculator = FenceCalculationEngine()


@frappe.whitelist(allow_guest=True)
def calculate_fence_materials(segments_data, fence_type, color="white"):
    """API endpoint for fence material calculation"""
    try:
        if isinstance(segments_data, str):
            segments_data = json.loads(segments_data)
        
        result = fence_calculator.calculate_fence_project(
            segments_data, fence_type, color
        )
        
        return result
        
    except Exception as e:
        frappe.log_error(f"Error in calculate_fence_materials: {e}")
        return {
            'success': False,
            'error': str(e)
        }


@frappe.whitelist(allow_guest=True)
def get_fence_specifications(fence_type):
    """Get specifications for a fence type"""
    try:
        specs = fence_calculator.material_specs.get(FenceType(fence_type))
        if specs:
            return {
                'success': True,
                'specifications': {
                    'panel_width': specs.panel_width,
                    'post_spacing': specs.post_spacing,
                    'panel_height': specs.panel_height,
                    'hardware_per_panel': specs.hardware_per_panel,
                    'concrete_bags_per_post': specs.concrete_bags_per_post
                }
            }
        else:
            return {
                'success': False,
                'error': 'Fence type not found'
            }
            
    except Exception as e:
        frappe.log_error(f"Error getting fence specifications: {e}")
        return {
            'success': False,
            'error': str(e)
        }


@frappe.whitelist(allow_guest=True)
def optimize_fence_layout(segments_data, fence_type):
    """Optimize fence layout for cost and material efficiency"""
    try:
        if isinstance(segments_data, str):
            segments_data = json.loads(segments_data)
        
        # Calculate current layout
        current_result = fence_calculator.calculate_fence_project(
            segments_data, fence_type
        )
        
        # Generate optimization suggestions
        suggestions = []
        
        if current_result['success']:
            total_length = current_result['total_length']
            cost_per_foot = current_result['cost_breakdown']['cost_per_foot']
            
            # Suggest panel size optimization
            if total_length > 50:
                suggestions.append({
                    'type': 'panel_optimization',
                    'title': 'Consider Larger Panels',
                    'description': 'Using 10ft panels instead of 8ft could reduce material costs',
                    'potential_savings': round(total_length * 0.5, 2)
                })
            
            # Suggest gate placement optimization
            gate_count = current_result.get('materials', {}).get('gates', 0)
            if gate_count > 2:
                suggestions.append({
                    'type': 'gate_optimization',
                    'title': 'Optimize Gate Placement',
                    'description': 'Consider reducing the number of gates to lower costs',
                    'potential_savings': round((gate_count - 2) * 150, 2)
                })
            
            # Suggest connectivity improvements
            if current_result['connected_groups'] > 1:
                suggestions.append({
                    'type': 'connectivity',
                    'title': 'Connect Fence Sections',
                    'description': 'Connecting separate fence sections can reduce post requirements',
                    'potential_savings': round(current_result['connected_groups'] * 100, 2)
                })
        
        return {
            'success': True,
            'current_result': current_result,
            'suggestions': suggestions
        }
        
    except Exception as e:
        frappe.log_error(f"Error optimizing fence layout: {e}")
        return {
            'success': False,
            'error': str(e)
        }
