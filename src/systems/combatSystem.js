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

            // Smoothly rotate tower toward target (if it supports rotation)
            if (tower.currentTarget && typeof tower.rotationRadians === "number") {
                const dx = tower.currentTarget.x - tower.x;
                const dy = tower.currentTarget.y - tower.y;
                const desired = Math.atan2(dy, dx);
                // simple lerp toward desired angle
                const diff = normalizeAngle(desired - tower.rotationRadians);
                tower.rotationRadians += diff * Math.min(1, deltaSeconds * 8);
            }

            // Fire if off cooldown and a valid target exists
            if (tower.cooldownSeconds <= 0 && targetEnemy) {
                tower.cooldownSeconds = 1 / tower.attacksPerSecond;

                const dmgType = tower.damageType || "physical";

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
                        damageType: dmgType,
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

                // ---------- Splash (AOE) projectiles ----------
                if (projectile.splash) {
                    // apply to all enemies within radius; record actual applied damage
                    for (const enemy of gameState.enemies) {
                        if (enemy._isMarkedDead) continue;
                        const distance = Math.hypot(
                            enemy.x - projectile._currentX,
                            enemy.y - projectile._currentY
                        );
                        if (distance < projectile.splash.radiusPixels) {
                            const before = Math.max(0, enemy.hitPoints);

                            const raw = Math.max(
                                0,
                                Math.round(projectile.damagePerHit * gameState.modifiers.towerDamageMultiplier * typeMultFor(enemy, dmgType))
                            );
                            const applied = Math.min(raw, before); // clamp overkill

                            if (applied > 0) {
                                enemy.hitPoints = before - applied;
                                enemy._lastHitTimestamp = performance.now();
                                enemy._lastDamageAmount = applied;

                                // Floating damage text (soft red)
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

                    // --- Explosion FX: particles, scorch, screen flash, and knockback ---
                    const EX_RADIUS = projectile.splash.radiusPixels || 80;
                    const CENTER_X = projectile._currentX;
                    const CENTER_Y = projectile._currentY;

                    // Particle intensity scales with radius
                    const PARTICLE_COUNT = Math.max(20, Math.floor(EX_RADIUS / 2.0));

                    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
                        const angle = Math.random() * Math.PI * 2;
                        const speed = (Math.random() * 0.8 + 0.4) * (EX_RADIUS / 40);
                        const vx = Math.cos(angle) * speed;
                        const vy = Math.sin(angle) * speed;
                        const life = 500 + Math.random() * 600; // ms
                        const size = 2 + Math.random() * 7;

                        // color ramp: bright -> orange -> ember -> smoke
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

                    // Add a scorch decal (longer lived)
                    gameState.decals.push({
                        type: "scorch",
                        x: CENTER_X,
                        y: CENTER_Y,
                        radius: EX_RADIUS * 0.6,
                        lifeMs: 30000,     // <= total lifetime in ms
                        maxLifeMs: 30000,  // <= used for fade calculation
                        alpha: 0.85
                    });

                    // Screen flash (TONED DOWN)
                    // Much smaller alpha and shorter TTL
                    const FLASH_ALPHA = 0.16; // was ~0.95
                    const FLASH_TTL = 120;  // ms, was ~360
                    gameState.screenFlash.alpha = Math.max(gameState.screenFlash.alpha || 0, FLASH_ALPHA);
                    gameState.screenFlash.ttlMs = Math.max(gameState.screenFlash.ttlMs || 0, FLASH_TTL);

                    // Knockback: immediate positional displacement proportional to falloff
                    const MAX_KNOCKBACK = Math.max(10, Math.min(80, Math.floor(EX_RADIUS * 0.35))); // px
                    for (const enemy of gameState.enemies) {
                        if (enemy._isMarkedDead) continue;
                        const dx = enemy.x - CENTER_X;
                        const dy = enemy.y - CENTER_Y;
                        const dist = Math.hypot(dx, dy);
                        if (dist === 0) {
                            const ang = Math.random() * Math.PI * 2;
                            enemy.x += Math.cos(ang) * (MAX_KNOCKBACK * 0.25);
                            enemy.y += Math.sin(ang) * (MAX_KNOCKBACK * 0.25);
                        } else if (dist < EX_RADIUS) {
                            const falloff = 1 - (dist / EX_RADIUS); // 1 at center, 0 at edge
                            const impulse = MAX_KNOCKBACK * falloff;
                            const nx = dx / dist;
                            const ny = dy / dist;
                            enemy.x += nx * impulse;
                            enemy.y += ny * impulse;
                        }
                    }
                }
                // ---------- Direct / non-splash projectiles ----------
                else if (projectile.targetEnemy && !projectile.targetEnemy._isMarkedDead) {
                    const enemy = projectile.targetEnemy;
                    const before = Math.max(0, enemy.hitPoints);

                    const raw = Math.max(
                        0,
                        Math.round(projectile.damagePerHit * gameState.modifiers.towerDamageMultiplier * typeMultFor(enemy, dmgType))
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

                projectile._isComplete = true;
            }
        }

        // -------- Decals fade/down & cleanup (deterministic per tick) --------
        if (Array.isArray(gameState.decals) && gameState.decals.length) {
            const decayMs = Math.max(0, Math.floor(deltaSeconds * 1000));
            for (const d of gameState.decals) {
                if (typeof d.lifeMs === "number") d.lifeMs = Math.max(0, d.lifeMs - decayMs);
            }
            gameState.decals = gameState.decals.filter(d => (typeof d.lifeMs !== "number") || d.lifeMs > 0);
        }

        // Enemies cleanup & rewards
        gameState.enemies = gameState.enemies.filter((enemy) => {
            if (enemy.hitPoints <= 0) {
                gameState.money += enemy.rewardMoney;
                return false;
            }
            return !enemy._isMarkedDead;
        });

        // Projectiles cleanup
        gameState.projectiles = gameState.projectiles.filter((p) => !p._isComplete);
    }
}
