export class TowerEntity {
    constructor(definition, pixelX, pixelY, gridX, gridY, towerTypeKey) {
        this.displayName = definition.displayName;
        this.uiColor = definition.uiColor;
        this.buildCost = definition.buildCost;
        this.attackRangePixels = definition.attackRangePixels;
        this.attacksPerSecond = definition.attacksPerSecond;
        this.damagePerShot = definition.damagePerShot;
        this.baseRadiusPixels = definition.baseRadiusPixels;
        this.splash = definition.splash;
        this.x = pixelX;
        this.y = pixelY;
        this.gridX = gridX;
        this.gridY = gridY;
        this.towerTypeKey = towerTypeKey;
        this.cooldownSeconds = 0;
    }
}