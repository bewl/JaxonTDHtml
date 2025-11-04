// ===========================================
// File: src/systems/combatSystem.js
// ===========================================

import { distanceBetweenPoints, linearInterpolate } from "../core/mathUtils.js";
import { ProjectileEntity } from "../entities/projectile.js";
import { FloatingText } from "../entities/floatingText.js";


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
        // Track previous positions to infer direction when velocity is unavailable
        for (const enemy of gameState.enemies) {
            if (enemy._prevX === undefined) enemy._prevX = enemy.x;
            if (enemy._prevY === undefined) enemy._prevY = enemy.y;
        }

        // Towers: aim every frame, fire when ready
        for (const tower of gameState.towers) {
            tower.cooldownSeconds -= deltaSeconds;

            const targetEnemy = chooseTargetByMode(
                this.getTargetingMode(),
                tower,
                gameState.enemies
            );

            tower.currentTarget = targetEnemy || null;

            // Smooth rotation toward target
            if (tower.currentTarget && typeof tower.rotationRadians === "number") {
                const dx = tower.currentTarget.x - tower.x;
                const dy = tower.currentTarget.y - tower.y;
                const desired = Math.atan2(dy, dx);
                const diff = normalizeAngle(desired - tower.rotationRadians);
                tower.rotationRadians += diff * Math.min(1, deltaSeconds * 8);
            }

            // Fire projectile if ready
            if (tower.cooldownSeconds <= 0 && targetEnemy) {
                tower.cooldownSeconds = 1 / tower.attacksPerSecond;
                const dmgType = tower.damageType || "physical";

                const aoeConfig = tower.aoe || tower.splash || null;   // back-compat for radius only
                const effectsConfig = tower.projectileEffects || null;  // explicit FX

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

        // Update projectiles (travel + impact)
        for (const projectile of gameState.projectiles) {
            projectile.travelProgress += deltaSeconds * gameState.configuration.projectileLerpSpeedPerSecond;
            const t = Math.min(projectile.travelProgress, 1);
            projectile._currentX = linearInterpolate(projectile.x, projectile.targetX, t);
            projectile._currentY = linearInterpolate(projectile.y, projectile.targetY, t);

            if (projectile.travelProgress >= 1) {
                const dmgType = projectile.damageType || "physical";

                // AOE radius (new `aoe`, legacy `splash` for damage only)
                const AOE_RADIUS =
                    (projectile.aoe && projectile.aoe.radiusPixels) ||
                    (projectile.splash && projectile.splash.radiusPixels) ||
                    0;

                // Damage: AOE if configured, else direct-hit
                if (AOE_RADIUS > 0) {
                    for (const enemy of gameState.enemies) {
                        if (enemy._isMarkedDead) continue;
                        const distance = Math.hypot(
                            enemy.x - projectile._currentX,
                            enemy.y - projectile._currentY
                        );
                        if (distance < AOE_RADIUS) {
                            const before = Math.max(0, enemy.hitPoints);
                            const raw = Math.max(
                                0,
                                Math.round(
                                    projectile.damagePerHit *
                                    gameState.modifiers.towerDamageMultiplier *
                                    typeMultFor(enemy, dmgType)
                                )
                            );
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
                    const raw = Math.max(
                        0,
                        Math.round(
                            projectile.damagePerHit *
                            gameState.modifiers.towerDamageMultiplier *
                            typeMultFor(enemy, dmgType)
                        )
                    );
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

                // Effects: only if explicitly enabled on the projectile or its tower config
                const towerCfg = gameState.configuration?.towersByTypeKey?.[projectile.towerTypeKey];
                const effects = projectile.effects || towerCfg?.projectileEffects || {};

                // Explosion FX (particles + scorch + flash)
                if (effects.explosion?.enabled === true) {
                    // Avoid mixing ?? with || by grouping; default to 80 if both undefined/0
                    const exRadiusCandidate = (effects.explosion.radiusPixelsOverride ?? AOE_RADIUS);
                    const EX_RADIUS = exRadiusCandidate || 80;

                    const CENTER_X = projectile._currentX;
                    const CENTER_Y = projectile._currentY;

                    // Particles
                    const PARTICLE_COUNT = Math.max(20, Math.floor(EX_RADIUS / 2.0));
                    for (let i = 0; i < PARTICLE_COUNT; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = (Math.random() * 0.8 + 0.4) * (EX_RADIUS / 40);
                        const vx = Math.cos(angle) * speed;
                        const vy = Math.sin(angle) * speed;
                        const life = 500 + Math.random() * 600;
                        const size = 2 + Math.random() * 7;
                        const r = Math.random();
                        const color = r < 0.12 ? "#fff3b0" : (r < 0.5 ? "#ffb24d" : "#6b2f1b");

                        gameState.particles.push({
                            type: "fragment",
                            x: CENTER_X + (Math.random() - 0.5) * 6,
                            y: CENTER_Y + (Math.random() - 0.5) * 6,
                            vx, vy,
                            lifeMs: life,
                            maxLifeMs: life,
                            size,
                            color
                        });
                    }

                    // Scorch decal
                    gameState.decals.push({
                        type: "scorch",
                        x: CENTER_X,
                        y: CENTER_Y,
                        radius: EX_RADIUS * 0.6,
                        lifeMs: 30000,
                        maxLifeMs: 30000,
                        alpha: 0.85
                    });

                    // Screen flash
                    const FLASH_ALPHA = effects.explosion.flashAlpha ?? 0.16;
                    const FLASH_TTL = effects.explosion.flashTtl ?? 120;
                    if (!gameState.screenFlash) gameState.screenFlash = { alpha: 0, ttlMs: 0 };
                    gameState.screenFlash.alpha = Math.max(gameState.screenFlash.alpha || 0, FLASH_ALPHA);
                    gameState.screenFlash.ttlMs = Math.max(gameState.screenFlash.ttlMs || 0, FLASH_TTL);
                }

                // Knockback (backwards along enemy movement)
                if (effects.knockback?.enabled === true) {
                    const K_RADIUS = AOE_RADIUS || 80;
                    const CENTER_X = projectile._currentX;
                    const CENTER_Y = projectile._currentY;
                    const MAX_KNOCKBACK =
                        Number.isFinite(effects.knockback.maxPx)
                            ? Math.max(0, effects.knockback.maxPx)
                            : Math.max(10, Math.min(80, Math.floor(K_RADIUS * 0.35)));

                    for (const enemy of gameState.enemies) {
                        if (enemy._isMarkedDead) continue;

                        const dxc = enemy.x - CENTER_X;
                        const dyc = enemy.y - CENTER_Y;
                        const distFromCenter = Math.hypot(dxc, dyc);
                        if (distFromCenter >= K_RADIUS) continue;

                        const falloff = 1 - (distFromCenter / K_RADIUS);
                        const impulse = MAX_KNOCKBACK * falloff;

                        let fx = 0, fy = 0;
                        if (Number.isFinite(enemy.vx) && Number.isFinite(enemy.vy) && (enemy.vx !== 0 || enemy.vy !== 0)) {
                            fx = enemy.vx; fy = enemy.vy;
                        } else if (
                            enemy.nextWaypoint &&
                            Number.isFinite(enemy.nextWaypoint.x) &&
                            Number.isFinite(enemy.nextWaypoint.y)
                        ) {
                            fx = enemy.nextWaypoint.x - enemy.x;
                            fy = enemy.nextWaypoint.y - enemy.y;
                        } else if (
                            Array.isArray(enemy.waypoints) &&
                            enemy._waypointIndex != null &&
                            enemy.waypoints[enemy._waypointIndex] &&
                            Number.isFinite(enemy.waypoints[enemy._waypointIndex].x) &&
                            Number.isFinite(enemy.waypoints[enemy._waypointIndex].y)
                        ) {
                            const wp = enemy.waypoints[enemy._waypointIndex];
                            fx = wp.x - enemy.x;
                            fy = wp.y - enemy.y;
                        } else if (Number.isFinite(enemy._prevX) && Number.isFinite(enemy._prevY)) {
                            fx = enemy.x - enemy._prevX;
                            fy = enemy.y - enemy._prevY;
                        }

                        if (fx !== 0 || fy !== 0) {
                            const fLen = Math.hypot(fx, fy) || 1;
                            const bnx = -(fx / fLen);
                            const bny = -(fy / fLen);
                            enemy.x += bnx * impulse;
                            enemy.y += bny * impulse;
                        } else {
                            if (distFromCenter === 0) {
                                const ang = Math.random() * Math.PI * 2;
                                enemy.x += Math.cos(ang) * (MAX_KNOCKBACK * 0.25);
                                enemy.y += Math.sin(ang) * (MAX_KNOCKBACK * 0.25);
                            } else {
                                const onx = dxc / distFromCenter;
                                const ony = dyc / distFromCenter;
                                enemy.x += onx * impulse;
                                enemy.y += ony * impulse;
                            }
                        }
                    }
                }

                projectile._isComplete = true;
            }
        }

        // Fade and cleanup decals
        if (Array.isArray(gameState.decals) && gameState.decals.length) {
            const decayMs = Math.max(0, Math.floor(deltaSeconds * 1000));
            for (const d of gameState.decals) {
                if (typeof d.lifeMs === "number") d.lifeMs = Math.max(0, d.lifeMs - decayMs);
            }
            gameState.decals = gameState.decals.filter(d => (typeof d.lifeMs !== "number") || d.lifeMs > 0);
        }

        // Remove defeated enemies and reward
        gameState.enemies = gameState.enemies.filter((enemy) => {
            if (enemy.hitPoints <= 0) {
                gameState.money += enemy.rewardMoney;
                return false;
            }
            return !enemy._isMarkedDead;
        });

        // Remove completed projectiles
        gameState.projectiles = gameState.projectiles.filter((p) => !p._isComplete);

        // Store positions for next frame's direction inference
        for (const enemy of gameState.enemies) {
            enemy._prevX = enemy.x;
            enemy._prevY = enemy.y;
        }
    }


}
