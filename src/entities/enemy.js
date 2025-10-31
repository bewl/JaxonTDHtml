export class EnemyEntity {
    constructor(statBlock, waypoints) {
        this.hitPoints = statBlock.hitPoints;
        this.maximumHitPoints = statBlock.hitPoints;
        this.movementSpeedCellsPerSecond = statBlock.movementSpeedCellsPerSecond;
        this.drawRadiusPixels = statBlock.drawRadiusPixels;
        this.rewardMoney = statBlock.rewardMoney ?? 8;
        this.fillColor = statBlock.fillColor;
        this.isBoss = Boolean(statBlock.isBoss);
        this.name = statBlock.name || (this.isBoss ? "BOSS" : "Enemy");
        this.x = waypoints[0].x;
        this.y = waypoints[0].y;
        this.currentWaypointIndex = 0;
        this._isMarkedDead = false;
    }
}