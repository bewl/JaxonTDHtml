import { projectPointOntoSegment } from "../core/mathUtils.js";


export class GridMap {
    constructor(configuration, canvasElement) {
        this.configuration = configuration;
        this.canvasElement = canvasElement;
        this.gridCellSize = configuration.gridCellSize;
        this.gridColumnCount = Math.floor(canvasElement.width / this.gridCellSize);
        this.gridRowCount = Math.floor(canvasElement.height / this.gridCellSize);
        this.waypoints = configuration.map.pathCells.map((cell) => ({
            x: cell.x * this.gridCellSize + this.gridCellSize / 2,
            y: cell.y * this.gridCellSize + this.gridCellSize / 2,
        }));
    }
    isGridCellOnPath(gridX, gridY) {
        const { gridCellSize, waypoints } = this;
        const pathThicknessPixels = this.configuration.map.pathThicknessMultiplier * gridCellSize;
        const centerX = gridX * gridCellSize + gridCellSize / 2;
        const centerY = gridY * gridCellSize + gridCellSize / 2;
        const point = { x: centerX, y: centerY };
        for (let i = 0; i < waypoints.length - 1; i += 1) {
            const segmentStart = waypoints[i];
            const segmentEnd = waypoints[i + 1];
            const projected = projectPointOntoSegment(segmentStart, segmentEnd, point);
            const distance = Math.hypot(projected.x - centerX, projected.y - centerY);
            if (distance < pathThicknessPixels) return true;
        }
        return false;
    }
}