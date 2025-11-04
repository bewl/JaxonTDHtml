export class TowerEntity {
    constructor(definition, pixelX, pixelY, gridX, gridY, towerTypeKey) {
        this.displayName = definition.displayName;
        this.uiColor = definition.uiColor;
        this.buildCost = Number(definition.buildCost) || 0;

        this.damagePerShot = Number(definition.damagePerShot) || 0;
        this.attacksPerSecond = Number(definition.attacksPerSecond) || 1;
        this.attackRangePixels = Number(definition.attackRangePixels) || 80;

        this.splash = definition.splash ? { ...definition.splash } : null;

        // NEW: footprint size in cells (square footprint: sizeCells x sizeCells)
        this.sizeCells = Math.max(1, Math.floor(Number(definition.sizeCells ?? 1)));
        this.visualScale = Number.isFinite(definition.visualScale) ? definition.visualScale : 1;

        this.x = pixelX;            // pixel center of the footprint
        this.y = pixelY;
        this.gridX = gridX;         // top-left cell of the footprint
        this.gridY = gridY;

        this.towerTypeKey = towerTypeKey;

        // Firing state
        this.cooldownSeconds = 0;

        // Optional: aiming/rotation
        this.rotationRadians = 0;
        this.currentTarget = null;
    }
}
