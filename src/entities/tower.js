export class TowerEntity {
    constructor(definition, pixelX, pixelY, gridX, gridY, towerTypeKey) {
        this.displayName = definition.displayName;
        this.uiColor = definition.uiColor;
        this.buildCost = Number(definition.buildCost) || 0;

        this.damagePerShot = Number(definition.damagePerShot) || 0;
        this.attacksPerSecond = Number(definition.attacksPerSecond) || 1;
        this.attackRangePixels = Number(definition.attackRangePixels) || 80;

        this.splash = definition.splash ? { ...definition.splash } : null;

        this.sizeCells = Math.max(1, Math.floor(Number(definition.sizeCells ?? 1)));
        this.visualScale = Number.isFinite(definition.visualScale) ? definition.visualScale : 1;

        this.x = pixelX;
        this.y = pixelY;
        this.gridX = gridX;
        this.gridY = gridY;

        this.towerTypeKey = towerTypeKey;

        this.cooldownSeconds = 0;
        this.rotationRadians = 0;
        this.currentTarget = null;

        // Guarantee an upgrade state object so the tooltip always has something to read.
        this.upgradeState = (definition.defaultUpgradeState && typeof definition.defaultUpgradeState === "object")
            ? { ...definition.defaultUpgradeState }
            : {};
    }
}
