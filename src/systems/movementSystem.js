export class MovementSystem {
    tick(gameState, deltaSeconds) {
        const dt = Math.max(0, Number(deltaSeconds) || 0);
        if (dt === 0) return;

        const gridCellSize = Number(gameState.configuration?.gridCellSize) || 40;

        for (const enemy of gameState.enemies) {
            if (enemy._isMarkedDead) continue;

            const waypoints = enemy.waypoints;
            if (!Array.isArray(waypoints) || waypoints.length < 2) continue;

            // ---- Resolve speed: CELLS/sec -> PX/sec ----
            let speedPxPerSec;
            if (Number.isFinite(enemy.movementSpeedCellsPerSecond)) {
                speedPxPerSec = enemy.movementSpeedCellsPerSecond * gridCellSize;
            } else {
                speedPxPerSec =
                    Number(enemy.speedPixelsPerSecond) ||
                    Number(enemy.pixelsPerSecond) ||
                    Number(enemy.speed) ||
                    Number(gameState.configuration?.enemyDefaultSpeedPixelsPerSecond) ||
                    40;
            }

            // ---- Init/Clamp index ----
            let idx = Number.isInteger(enemy.currentWaypointIndex)
                ? enemy.currentWaypointIndex
                : undefined;

            if (idx === undefined) {
                const w0 = waypoints[0];
                const nearStart = Math.hypot((enemy.x ?? 0) - w0.x, (enemy.y ?? 0) - w0.y) <= 1e-4;
                idx = nearStart ? 1 : 0;
            }
            idx = Math.max(0, Math.min(idx, waypoints.length - 1));

            let remaining = speedPxPerSec * dt;

            // ---- Consume distance; recompute direction each step (resize-safe) ----
            while (remaining > 0 && idx < waypoints.length) {
                const target = waypoints[idx];
                const dx = target.x - enemy.x;
                const dy = target.y - enemy.y;
                const dist = Math.hypot(dx, dy);

                if (dist <= 0.0001) {
                    idx += 1;
                    continue;
                }

                if (remaining >= dist) {
                    // Reach this waypoint this frame
                    enemy.x = target.x;
                    enemy.y = target.y;
                    remaining -= dist;
                    idx += 1;
                    continue;
                }

                // Move partially toward target and finish this frame
                const nx = dx / dist;
                const ny = dy / dist;
                enemy.x += nx * remaining;
                enemy.y += ny * remaining;
                remaining = 0;
            }

            // ---- End-of-path handling ----
            if (idx >= waypoints.length) {
                // Snap to final waypoint for visual correctness
                const last = waypoints[waypoints.length - 1];
                enemy.x = last.x;
                enemy.y = last.y;

                // Only count life loss once per enemy
                if (!enemy._reachedEndOfPath) {
                    enemy._reachedEndOfPath = true;
                    // Mark for removal; CombatSystem's cleanup will filter it out this frame
                    enemy._isMarkedDead = true;

                    // Decrement lives (clamped at 0)
                    gameState.lives = Math.max(0, (gameState.lives || 0) - 1);
                }

                // Keep index pinned at the end for any UI that reads it
                enemy.currentWaypointIndex = waypoints.length - 1;
                continue;
            }

            enemy.currentWaypointIndex = idx;
        }
    }
}