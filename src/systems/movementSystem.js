export class MovementSystem {
    tick(gameState, deltaSeconds) {
        for (const enemy of gameState.enemies) {
            const nextWaypoint = gameState.gridMap.waypoints[
                Math.min(
                    enemy.currentWaypointIndex + 1,
                    gameState.gridMap.waypoints.length - 1
                )
            ];
            const deltaX = nextWaypoint.x - enemy.x;
            const deltaY = nextWaypoint.y - enemy.y;
            const distance = Math.hypot(deltaX, deltaY);
            if (distance < 1) {
                if (enemy.currentWaypointIndex < gameState.gridMap.waypoints.length - 1) {
                    enemy.currentWaypointIndex += 1;
                } else {
                    gameState.lives -= enemy.isBoss ? 3 : 1;
                    enemy._isMarkedDead = true;
                }
            } else {
                enemy.x += (deltaX / distance) * enemy.movementSpeedCellsPerSecond * 60 * deltaSeconds;
                enemy.y += (deltaY / distance) * enemy.movementSpeedCellsPerSecond * 60 * deltaSeconds;
            }
        }
    }
}