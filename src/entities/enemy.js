export class EnemyEntity {
    constructor(statBlock, waypoints) {
        this.hitPoints = statBlock.hitPoints;
        this.maximumHitPoints = statBlock.hitPoints;

        // Store the configured speed in CELLS/second (as defined in your stat blocks)
        this.movementSpeedCellsPerSecond = statBlock.movementSpeedCellsPerSecond;

        this.drawRadiusPixels = statBlock.drawRadiusPixels;
        this.rewardMoney = statBlock.rewardMoney ?? 8;
        this.fillColor = statBlock.fillColor;
        this.isBoss = Boolean(statBlock.isBoss);
        this.name = statBlock.name || (this.isBoss ? "BOSS" : "Enemy");

        // IMPORTANT: keep a reference to the active path (CSS-pixel waypoints)
        this.waypoints = waypoints;

        // Spawn at the first waypoint (CSS px coords)
        this.x = waypoints[0].x;
        this.y = waypoints[0].y;

        // Start aiming toward the next waypoint (movement system will clamp if needed)
        this.currentWaypointIndex = 1;

        this._isMarkedDead = false;
    }

}