// ===========================================
// File: src/systems/combatSystem.js
// ===========================================

import { distanceBetweenPoints, linearInterpolate } from "../core/mathUtils.js";
import { ProjectileEntity } from "../entities/projectile.js";
import { FloatingText } from "../entities/floatingText.js";
import { EffectsRegistry } from './effects/effectsRegistry.js';

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

/**
 * Normalizes any angle (radians) to the range -PI..PI.
 * Keeps tower rotation interpolation stable and avoids overshoot.
 */
function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

/**
 * Returns a damage multiplier based on enemy type or resistances.
 * For now, all damage types deal 1x (no modifier), but you can extend this later.
 *
 * @param {EnemyEntity} enemy
 * @param {string} damageType  e.g. "physical", "fire", "energy"
 * @returns {number} multiplier (default 1)
 */
function typeMultFor(enemy, damageType) {
    if (!enemy || !damageType) return 1;

    // Example extensibility (uncomment or expand later):
    // if (enemy.type === 'metal' && damageType === 'fire') return 1.25;
    // if (enemy.type === 'shielded' && damageType === 'energy') return 0.75;

    return 1;
}

// -------------------------------------------
// Combat System
// -------------------------------------------
export class CombatSystem {
    constructor(getTargetingMode) {
        this.getTargetingMode = getTargetingMode;
    }

    tick(gameState, deltaSeconds) {
        // cache previous enemy positions for direction inference
        for (const enemy of gameState.enemies) {
            if (enemy._prevX === undefined) enemy._prevX = enemy.x;
            if (enemy._prevY === undefined) enemy._prevY = enemy.y;
        }

        // towers: aim and fire
        for (const tower of gameState.towers) {
            tower.cooldownSeconds -= deltaSeconds;

            const targetEnemy = chooseTargetByMode(
                this.getTargetingMode(),
                tower,
                gameState.enemies
            );

            tower.currentTarget = targetEnemy || null;

            // rotate toward target if tower supports rotation
            if (tower.currentTarget && typeof tower.rotationRadians === "number") {
                const dx = tower.currentTarget.x - tower.x;
                const dy = tower.currentTarget.y - tower.y;
                const desired = Math.atan2(dy, dx);
                const diff = normalizeAngle(desired - tower.rotationRadians);
                tower.rotationRadians += diff * Math.min(1, deltaSeconds * 8);
            }

            // fire when off cooldown and target available
            if (tower.cooldownSeconds <= 0 && targetEnemy) {
                tower.cooldownSeconds = 1 / tower.attacksPerSecond;
                const dmgType = tower.damageType || "physical";

                const aoeConfig = tower.aoe || tower.splash || null;          // damage radius (if any)
                const effectsConfig = tower.projectileEffects || null;         // visual/physics effects

                gameState.projectiles.push(
                    new ProjectileEntity({
                        x: tower.x,
                        y: tower.y,
                        targetX: targetEnemy.x,
                        targetY: targetEnemy.y,
                        damagePerHit: tower.damagePerShot,
                        towerTypeKey: tower.towerTypeKey,
                        targetEnemy,
                        damageType: dmgType,
                        aoe: aoeConfig,
                        effects: effectsConfig
                    })
                );
            }
        }

        // projectiles travel + impact
        for (const projectile of gameState.projectiles) {
            const lerpSpeed = projectile._overrideLerpSpeed ?? gameState.configuration.projectileLerpSpeedPerSecond;
            projectile.travelProgress += deltaSeconds * lerpSpeed;
            const t = Math.min(projectile.travelProgress, 1);
            projectile._currentX = linearInterpolate(projectile.x, projectile.targetX, t);
            projectile._currentY = linearInterpolate(projectile.y, projectile.targetY, t);

            // travel-time effects (e.g., trails)
            if (projectile.effects && typeof EffectsRegistry?.applyTravel === 'function') {
                EffectsRegistry.applyTravel(gameState, projectile, deltaSeconds);
            } else {
                // fallback from tower config if projectile was created without effects copied
                const towerCfg = gameState.configuration?.towersByTypeKey?.[projectile.towerTypeKey];
                if (!projectile.effects && towerCfg?.projectileEffects) {
                    projectile.effects = towerCfg.projectileEffects;
                    EffectsRegistry.applyTravel(gameState, projectile, deltaSeconds);
                }
            }

            if (projectile.travelProgress >= 1) {
                const dmgType = projectile.damageType || "physical";

                // aoe damage if configured, otherwise direct-hit
                const AOE_RADIUS =
                    (projectile.aoe && projectile.aoe.radiusPixels) ||
                    (projectile.splash && projectile.splash.radiusPixels) ||
                    0;

                if (AOE_RADIUS > 0) {
                    for (const enemy of gameState.enemies) {
                        if (enemy._isMarkedDead) continue;
                        const distance = Math.hypot(enemy.x - projectile._currentX, enemy.y - projectile._currentY);
                        if (distance < AOE_RADIUS) {
                            const before = Math.max(0, enemy.hitPoints);
                            const raw = Math.max(0, Math.round(
                                projectile.damagePerHit *
                                gameState.modifiers.towerDamageMultiplier *
                                typeMultFor(enemy, dmgType)
                            ));
                            const falloff = 1 - (distance / AOE_RADIUS);
                            const applied = Math.min(before, Math.round(raw * falloff));
                            if (applied > 0) {
                                enemy.hitPoints = before - applied;
                                enemy._lastHitTimestamp = performance.now();
                                enemy._lastDamageAmount = applied;

                                gameState.floatingTexts.push(
                                    new FloatingText({
                                        x: enemy.x,
                                        y: enemy.y - (enemy.isBoss ? 26 : 18),
                                        text: `-${applied}`,
                                        color: "#fca5a5",
                                        lifetimeMs: 900,
                                        risePixels: enemy.isBoss ? 34 : 28
                                    })
                                );
                            }
                        }
                    }
                } else if (projectile.targetEnemy && !projectile.targetEnemy._isMarkedDead) {
                    const enemy = projectile.targetEnemy;
                    const before = Math.max(0, enemy.hitPoints);
                    const raw = Math.max(0, Math.round(
                        projectile.damagePerHit *
                        gameState.modifiers.towerDamageMultiplier *
                        typeMultFor(enemy, dmgType)
                    ));
                    const applied = Math.min(raw, before);
                    if (applied > 0) {
                        enemy.hitPoints = before - applied;
                        enemy._lastHitTimestamp = performance.now();
                        enemy._lastDamageAmount = applied;

                        gameState.floatingTexts.push(
                            new FloatingText({
                                x: enemy.x,
                                y: enemy.y - (enemy.isBoss ? 26 : 18),
                                text: `-${applied}`,
                                color: "#fca5a5",
                                lifetimeMs: 900,
                                risePixels: enemy.isBoss ? 34 : 28
                            })
                        );
                    }
                }

                // impact-time effects (explosion, knockback, cluster, chain, etc.)
                if (!projectile.effects) {
                    const towerCfg = gameState.configuration?.towersByTypeKey?.[projectile.towerTypeKey];
                    if (towerCfg?.projectileEffects) projectile.effects = towerCfg.projectileEffects;
                }
                if (projectile.effects && typeof EffectsRegistry?.applyImpact === 'function') {
                    EffectsRegistry.applyImpact(gameState, projectile, AOE_RADIUS);
                }

                projectile._isComplete = true;
            }
        }

        // decals fade and cleanup
        if (Array.isArray(gameState.decals) && gameState.decals.length) {
            const decayMs = Math.max(0, Math.floor(deltaSeconds * 1000));
            for (const d of gameState.decals) {
                if (typeof d.lifeMs === "number") d.lifeMs = Math.max(0, d.lifeMs - decayMs);
            }
            gameState.decals = gameState.decals.filter(d => (typeof d.lifeMs !== "number") || d.lifeMs > 0);
        }

        // particles update: move, age, and cull
        if (Array.isArray(gameState.particles) && gameState.particles.length) {
            const step = deltaSeconds * 60; // convert to approx. frames for simple velocities
            const decayMs = Math.max(0, Math.floor(deltaSeconds * 1000));
            for (const p of gameState.particles) {
                if (Number.isFinite(p.vx)) p.x += p.vx * step;
                if (Number.isFinite(p.vy)) p.y += p.vy * step;
                if (typeof p.lifeMs === "number") p.lifeMs = Math.max(0, p.lifeMs - decayMs);
            }
            gameState.particles = gameState.particles.filter(p => (typeof p.lifeMs !== "number") || p.lifeMs > 0);
        }

        // screen flash decay
        if (gameState.screenFlash && typeof gameState.screenFlash.ttlMs === "number") {
            const decayMs = Math.max(0, Math.floor(deltaSeconds * 1000));
            gameState.screenFlash.ttlMs = Math.max(0, gameState.screenFlash.ttlMs - decayMs);
            if (gameState.screenFlash.ttlMs <= 0) {
                gameState.screenFlash.alpha = 0;
            }
        }

        // enemy cleanup and rewards
        gameState.enemies = gameState.enemies.filter((enemy) => {
            if (enemy.hitPoints <= 0) {
                gameState.money += enemy.rewardMoney;
                return false;
            }
            return !enemy._isMarkedDead;
        });

        // remove finished projectiles
        gameState.projectiles = gameState.projectiles.filter((p) => !p._isComplete);

        // store positions for next tick
        for (const enemy of gameState.enemies) {
            enemy._prevX = enemy.x;
            enemy._prevY = enemy.y;
        }
    }

}
