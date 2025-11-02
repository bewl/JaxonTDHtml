// ===========================================
// File: src/systems/combatSystem.js
// ===========================================

import { distanceBetweenPoints, linearInterpolate } from "../core/mathUtils.js";
import { ProjectileEntity } from "../entities/projectile.js";

// -------------------------------------------
// Target selection
// -------------------------------------------
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

// -------------------------------------------
// Tower rotation helpers
// -------------------------------------------
function updateTowerFacingTowardsTarget(tower, target, deltaTimeSeconds, options = {}) {
    if (!tower || !target) return;

    const {
        maxRotationSpeedRadiansPerSecond = Math.PI * 2, // rotation speed cap
        spriteForwardOffsetRadians = 0,                 // adjust for tower art orientation
    } = options;

    const dx = target.x - tower.x;
    const dy = target.y - tower.y;
    const desiredAngle = Math.atan2(dy, dx) + spriteForwardOffsetRadians;

    // Initialize rotation if undefined
    if (typeof tower.rotationRadians !== "number" || Number.isNaN(tower.rotationRadians)) {
        tower.rotationRadians = desiredAngle;
        return;
    }

    // Smallest angular delta in [-PI, PI]
    let delta = normalizeAngleRadians(desiredAngle - tower.rotationRadians);

    // Clamp the turn speed for smoother motion
    const maxStep = Math.max(0, maxRotationSpeedRadiansPerSecond) * Math.max(0, deltaTimeSeconds || 0);
    if (delta > maxStep) delta = maxStep;
    if (delta < -maxStep) delta = -maxStep;

    tower.rotationRadians = normalizeAngleRadians(tower.rotationRadians + delta);
}

function normalizeAngleRadians(radians) {
    let a = radians;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a <= -Math.PI) a += Math.PI * 2;
    return a;
}

// -------------------------------------------
// Combat System
// -------------------------------------------
export class CombatSystem {
    constructor(getTargetingMode) {
        this.getTargetingMode = getTargetingMode;
    }

    tick(gameState, deltaSeconds) {
        // Towers: aim every frame, fire when ready
        for (const tower of gameState.towers) {
            tower.cooldownSeconds -= deltaSeconds;

            // Always reacquire a target to stay responsive
            const targetEnemy = chooseTargetByMode(
                this.getTargetingMode(),
                tower,
                gameState.enemies
            );

            tower.currentTarget = targetEnemy || null;

            // Smoothly rotate tower toward target
            if (targetEnemy) {
                updateTowerFacingTowardsTarget(tower, targetEnemy, deltaSeconds, {
                    // Adjust if your tower art faces up/down instead of right
                    spriteForwardOffsetRadians: 0
                });
            }

            // Fire if off cooldown and a valid target exists
            if (tower.cooldownSeconds <= 0 && targetEnemy) {
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

        // Cleanup phase
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
