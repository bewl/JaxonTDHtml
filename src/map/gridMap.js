import { projectPointOntoSegment } from "../core/mathUtils.js";


export class GridMap {
    // Entire updated constructor
    constructor(configuration, canvasElement) {
        this.configuration = configuration;
        this.canvas = canvasElement;

        // Use CSS pixels because main.js sets ctx.setTransform(DPR, …),
        // so all world coordinates (waypoints, drawing, etc.) are in CSS px.
        const cssWidth = this.canvas.clientWidth || this.canvas.width;
        const cssHeight = this.canvas.clientHeight || this.canvas.height;

        this.gridCellSize = configuration.gridCellSize;

        // Column/row counts based on CSS px, not backing store
        this.gridColumnCount = Math.max(1, Math.floor(cssWidth / this.gridCellSize));
        this.gridRowCount = Math.max(1, Math.floor(cssHeight / this.gridCellSize));

        // Build waypoints in CSS-pixel space
        // configuration.map.pathCells is in grid units; convert to pixel centers.
        const cells = configuration.map.pathCells || [];
        this.waypoints = cells.map(c => ({
            x: c.x * this.gridCellSize + this.gridCellSize / 2,
            y: c.y * this.gridCellSize + this.gridCellSize / 2
        }));

        // Precompute a padded half-width that matches the renderer's stroke (20px)
        // Renderer uses lineWidth = 20 => 10px half-width. Give a tiny cushion for raster rounding.
        const configuredStroke = configuration.ui?.pathStrokeWidthPixels;
        const strokeWidthPx = Number.isFinite(configuredStroke) ? configuredStroke : 20;
        this._pathHalfWidthWithCushion = strokeWidthPx / 2 + 1.0;
    }
    S
    // Entire updated method
    isGridCellOnPath(gridX, gridY) {
        // Cell center in CSS px
        const cx = gridX * this.gridCellSize + this.gridCellSize / 2;
        const cy = gridY * this.gridCellSize + this.gridCellSize / 2;

        // If we don't have at least one segment, nothing is on the path
        if (!this.waypoints || this.waypoints.length < 2) return false;

        // Walk the polyline, project the point to each segment, track min distance
        let minDist = Infinity;
        for (let i = 0; i < this.waypoints.length - 1; i += 1) {
            const a = this.waypoints[i];
            const b = this.waypoints[i + 1];

            // Project (cx,cy) onto segment AB in CSS px
            const abx = b.x - a.x;
            const aby = b.y - a.y;
            const apx = cx - a.x;
            const apy = cy - a.y;
            const abLenSq = abx * abx + aby * aby;

            let t = 0;
            if (abLenSq > 0) {
                t = (apx * abx + apy * aby) / abLenSq;
                // clamp t to segment
                if (t < 0) t = 0;
                else if (t > 1) t = 1;
            }

            const closestX = a.x + abx * t;
            const closestY = a.y + aby * t;
            const dx = cx - closestX;
            const dy = cy - closestY;
            const dist = Math.hypot(dx, dy);

            if (dist < minDist) minDist = dist;
            // Early out if we’re already within the stroke width
            if (minDist <= this._pathHalfWidthWithCushion) return true;
        }

        return minDist <= this._pathHalfWidthWithCushion;
    }

}