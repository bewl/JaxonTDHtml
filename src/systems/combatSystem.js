import { distanceBetweenPoints, linearInterpolate } from "../core/mathUtils.js";
import { ProjectileEntity } from "../entities/projectile.js";

function chooseTargetByMode(targetingMode, tower, enemies) {
    const enemiesWithinRange = enemies.filter((enemy) => {
        if (enemy._isMarkedDead) return false;
        const towerPoint = { x: tower.x, y: tower.y };
        return distanceBetweenPoints(towerPoint, enemy) <= tower.attackRangePixels;
    });
    if (enemiesWithinRange.length === 0) return null;
    switch (targetingMode) {
        case "first":
            return enemiesWithinRange.reduce((best, candidate) =>
                best.currentWaypointIndex > candidate.currentWaypointIndex ? best : candidate
            );
        case "last":
            return enemiesWithinRange.reduce((best, candidate) =>
                best.currentWaypointIndex < candidate.currentWaypointIndex ? best : candidate
            );
        case "strongest":
            return enemiesWithinRange.reduce((best, candidate) =>
                best.hitPoints > candidate.hitPoints ? best : candidate
            );
        case "weakest":
            return enemiesWithinRange.reduce((best, candidate) =>
                best.hitPoints < candidate.hitPoints ? best : candidate
            );
        case "closest":
        default: {
            const towerPoint = { x: tower.x, y: tower.y };
            return enemiesWithinRange.reduce((best, candidate) =>
                distanceBetweenPoints(towerPoint, best) < distanceBetweenPoints(towerPoint, candidate) ? best : candidate
            );
        }
    }
}

export class CombatSystem {
    constructor(getTargetingMode) {
        this.getTargetingMode = getTargetingMode;
    }
    tick(gameState, deltaSeconds) {
        // Towers fire
        for (const tower of gameState.towers) {
            tower.cooldownSeconds -= deltaSeconds;
            if (tower.cooldownSeconds <= 0) {
                const targetEnemy = chooseTargetByMode(
                    this.getTargetingMode(),
                    tower,
                    gameState.enemies
                );
                if (targetEnemy) {
                    tower.cooldownSeconds = 1 / tower.attacksPerSecond;
                    gameState.projectiles.push(
                        new ProjectileEntity({
                            x: tower.x,
                            y: tower.y,
                            targetX: targetEnemy.x,
                            targetY: targetEnemy.y,
                            damagePerHit: tower.damagePerShot,
                            towerTypeKey: tower.towerTypeKey,
                            splash: tower.splash,
                            targetEnemy,
                        })
                    );
                }
            }
        }
        // Projectiles resolve
        for (const projectile of gameState.projectiles) {
            projectile.travelProgress += deltaSeconds * gameState.configuration.projectileLerpSpeedPerSecond;
            const t = Math.min(projectile.travelProgress, 1);
            projectile._currentX = linearInterpolate(projectile.x, projectile.targetX, t);
            projectile._currentY = linearInterpolate(projectile.y, projectile.targetY, t);
            if (projectile.travelProgress >= 1) {
                if (projectile.splash) {
                    for (const enemy of gameState.enemies) {
                        if (enemy._isMarkedDead) continue;
                        const distance = Math.hypot(
                            enemy.x - projectile._currentX,
                            enemy.y - projectile._currentY
                        );
                        if (distance < projectile.splash.radiusPixels) {
                            enemy.hitPoints -= projectile.damagePerHit;
                            enemy._lastHitTimestamp = performance.now();
                        }
                    }
                } else if (projectile.targetEnemy && !projectile.targetEnemy._isMarkedDead) {
                    projectile.targetEnemy.hitPoints -= projectile.damagePerHit;
                    projectile.targetEnemy._lastHitTimestamp = performance.now();
                }
                projectile._isComplete = true;
            }
        }
        // Cleanup
        gameState.enemies = gameState.enemies.filter((enemy) => {
            if (enemy.hitPoints <= 0) {
                gameState.money += enemy.rewardMoney;
                return false;
            }
            return !enemy._isMarkedDead;
        });
        gameState.projectiles = gameState.projectiles.filter((p) => !p._isComplete);
    }
}
