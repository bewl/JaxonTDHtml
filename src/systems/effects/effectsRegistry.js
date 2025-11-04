import { addExplosionParticles, addScorchDecal, triggerScreenFlash } from './util.js';
import { ProjectileEntity } from '../../entities/projectile.js';

function applyTrailTravel(gameState, projectile, cfg, deltaSeconds) {
    if (!cfg?.enabled) return;
    const life = cfg.lifeMs ?? 400;
    const sizeMin = cfg.sizeMin ?? 2;
    const sizeMax = cfg.sizeMax ?? 5;
    const jitter = cfg.jitter ?? 4;
    const countPerSecond = cfg.countPerSecond ?? 24;
    const spawnCount = Math.max(1, Math.floor(countPerSecond * deltaSeconds));
    const color = cfg.color ?? "#ffaa00";

    for (let i = 0; i < spawnCount; i++) {
        const jx = (Math.random() - 0.5) * jitter;
        const jy = (Math.random() - 0.5) * jitter;
        const size = sizeMin + Math.random() * (sizeMax - sizeMin);

        gameState.particles.push({
            type: "trail",
            x: projectile._currentX + jx,
            y: projectile._currentY + jy,
            vx: 0,
            vy: 0,
            lifeMs: life,
            maxLifeMs: life,
            size,
            color
        });
    }
}

function applyExplosionImpact(gameState, projectile, cfg, aoeRadius) {
    if (!cfg?.enabled) return;
    const exRadiusCandidate = (cfg.radiusPixelsOverride ?? aoeRadius);
    const exRadius = exRadiusCandidate || 80;
    const cx = projectile._currentX;
    const cy = projectile._currentY;

    addExplosionParticles(gameState, cx, cy, exRadius);
    addScorchDecal(gameState, cx, cy, exRadius * 0.6, 30000, 0.85);
    triggerScreenFlash(gameState, cfg.flashAlpha ?? 0.16, cfg.flashTtl ?? 120);
}

function applyKnockbackImpact(gameState, projectile, cfg, aoeRadius) {
    if (!cfg?.enabled) return;
    const kRadius = aoeRadius || 80;
    const cx = projectile._currentX;
    const cy = projectile._currentY;
    const maxKb = Number.isFinite(cfg.maxPx) ? Math.max(0, cfg.maxPx)
        : Math.max(10, Math.min(80, Math.floor(kRadius * 0.35)));

    for (const enemy of gameState.enemies) {
        if (enemy?._isMarkedDead) continue;
        const dxc = enemy.x - cx;
        const dyc = enemy.y - cy;
        const dist = Math.hypot(dxc, dyc);
        if (dist >= kRadius) continue;

        const falloff = 1 - (dist / kRadius);
        const impulse = maxKb * falloff;

        let fx = 0, fy = 0;
        if (Number.isFinite(enemy.vx) && Number.isFinite(enemy.vy) && (enemy.vx || enemy.vy)) {
            fx = enemy.vx; fy = enemy.vy;
        } else if (enemy.nextWaypoint && Number.isFinite(enemy.nextWaypoint.x) && Number.isFinite(enemy.nextWaypoint.y)) {
            fx = enemy.nextWaypoint.x - enemy.x;
            fy = enemy.nextWaypoint.y - enemy.y;
        } else if (Array.isArray(enemy.waypoints) && enemy._waypointIndex != null && enemy.waypoints[enemy._waypointIndex]) {
            const wp = enemy.waypoints[enemy._waypointIndex];
            fx = wp.x - enemy.x; fy = wp.y - enemy.y;
        } else if (Number.isFinite(enemy._prevX) && Number.isFinite(enemy._prevY)) {
            fx = enemy.x - enemy._prevX; fy = enemy.y - enemy._prevY;
        }

        if (fx || fy) {
            const len = Math.hypot(fx, fy) || 1;
            const bnx = -(fx / len);
            const bny = -(fy / len);
            enemy.x += bnx * impulse;
            enemy.y += bny * impulse;
        } else {
            if (dist === 0) {
                const ang = Math.random() * Math.PI * 2;
                enemy.x += Math.cos(ang) * (maxKb * 0.25);
                enemy.y += Math.sin(ang) * (maxKb * 0.25);
            } else {
                const onx = dxc / dist, ony = dyc / dist;
                enemy.x += onx * impulse;
                enemy.y += ony * impulse;
            }
        }
    }
}

function applyClusterImpact(gameState, projectile, cfg) {
    if (!cfg?.enabled) return;

    const count = Math.max(1, cfg.count ?? 6);
    const spreadDeg = Math.max(1, cfg.spread ?? 360);
    const childDistance = Math.max(0, cfg.childDistance ?? 40);
    const childSpeedScale = cfg.childSpeedScale ?? 1.0;
    const childDamageScale = cfg.childDamageScale ?? 0.35;
    const childAoe = cfg.childAoe ?? { radiusPixels: 40 };
    const childFx = cfg.childEffects ?? { explosion: { enabled: true, flashAlpha: 0.08, flashTtl: 80 } };

    const centerAngle = Math.random() * Math.PI * 2;
    const cx = projectile._currentX;
    const cy = projectile._currentY;

    for (let i = 0; i < count; i++) {
        const angle = centerAngle + ((i / count) - 0.5) * (spreadDeg * Math.PI / 180);
        const dist = childDistance + Math.random() * (cfg.childDistanceJitter ?? 20);
        const tx = cx + Math.cos(angle) * dist;
        const ty = cy + Math.sin(angle) * dist;

        const child = new ProjectileEntity({
            x: cx,
            y: cy,
            targetX: tx,
            targetY: ty,
            damagePerHit: Math.round((projectile.damagePerHit || 0) * childDamageScale),
            towerTypeKey: projectile.towerTypeKey,
            targetEnemy: null,
            damageType: projectile.damageType || "physical",
            aoe: childAoe,
            effects: childFx
        });

        if (childSpeedScale !== 1 && gameState.configuration?.projectileLerpSpeedPerSecond) {
            child._overrideLerpSpeed = gameState.configuration.projectileLerpSpeedPerSecond * childSpeedScale;
        }

        gameState.projectiles.push(child);
    }
}

function applyChainImpact(gameState, projectile, cfg) {
    if (!cfg?.enabled) return;

    const maxJumps = Math.max(1, cfg.maxJumps ?? 3);
    const jumpRadius = Math.max(1, cfg.jumpRadius ?? 120);
    const falloff = Math.max(0, Math.min(1, cfg.damageFalloff ?? 0.6));
    const preferUntargeted = !!cfg.preferUntargeted;

    const boltTtlMs = Math.max(60, cfg.boltTtlMs ?? 140);
    const boltSegments = Math.max(6, cfg.boltSegments ?? 12);
    const boltAmplitude = Math.max(2, cfg.boltAmplitude ?? 8);
    const coreWidth = Math.max(1, cfg.coreWidth ?? 2);
    const coreColor = cfg.coreColor || "#e0f2fe";
    const glowColor = cfg.glowColor || "#93c5fd";

    let currentX = projectile._currentX;
    let currentY = projectile._currentY;
    let currentDamage = projectile.damagePerHit;

    const visited = new Set();
    const now = performance.now();
    gameState.lightningBeams ||= [];

    const makeJaggedPath = (x1, y1, x2, y2, segments, amplitude) => {
        const pts = [];
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len, ny = dy / len;
        const px = -ny, py = nx; // perpendicular

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const bx = x1 + dx * t;
            const by = y1 + dy * t;

            // more jitter near the middle, less at endpoints
            const falloff = 1 - Math.abs(0.5 - t) * 2; // 0 at ends, 1 mid
            const jitter = (Math.random() * 2 - 1) * amplitude * (0.35 + 0.65 * falloff);

            pts.push({ x: bx + px * jitter, y: by + py * jitter });
        }
        return pts;
    };

    for (let j = 0; j < maxJumps; j++) {
        let best = null;
        let bestDist = Infinity;

        for (const enemy of gameState.enemies) {
            if (enemy?._isMarkedDead) continue;
            if (visited.has(enemy)) continue;

            const d = Math.hypot(enemy.x - currentX, enemy.y - currentY);
            if (d > jumpRadius) continue;

            if (preferUntargeted && enemy !== projectile.targetEnemy) {
                if (!best || (d < bestDist && best === projectile.targetEnemy)) {
                    best = enemy; bestDist = d;
                }
            } else if (d < bestDist) {
                best = enemy; bestDist = d;
            }
        }

        if (!best) break;

        // Apply damage to this hop
        const before = Math.max(0, best.hitPoints);
        const dmgType = projectile.damageType || "physical";
        const mult = (typeof typeMultFor === "function") ? typeMultFor(best, dmgType) : 1;
        const raw = Math.max(0, Math.round(currentDamage * (gameState?.modifiers?.towerDamageMultiplier ?? 1) * mult));
        const applied = Math.min(before, raw);

        if (applied > 0) {
            best.hitPoints = before - applied;
            best._lastHitTimestamp = performance.now();
            best._lastDamageAmount = applied;
        }

        // Visual: precomputed jagged bolt path for this hop
        const points = makeJaggedPath(currentX, currentY, best.x, best.y, boltSegments, boltAmplitude);
        gameState.lightningBeams.push({
            points,
            createdAt: now,
            ttlMs: boltTtlMs,
            lineWidth: coreWidth,
            coreColor,
            glowColor
        });

        visited.add(best);
        currentX = best.x;
        currentY = best.y;
        currentDamage = Math.round(currentDamage * falloff);
        if (currentDamage <= 0) break;
    }
}

function applyAftershockImpact(gameState, projectile, cfg, aoeRadius) {
    if (!cfg?.enabled) return;

    const delayMs = Math.max(0, cfg.delayMs ?? 600);
    const radius = (cfg.radiusPixelsOverride ?? aoeRadius) || 80;
    const dmgMult = cfg.damageMultiplier ?? 0.5;
    const flashAlpha = cfg.flashAlpha ?? 0.08;
    const flashTtl = cfg.flashTtl ?? 90;

    const entry = {
        type: "aftershock",
        x: projectile._currentX,
        y: projectile._currentY,
        radius,
        damagePerHit: Math.round((projectile.damagePerHit || 0) * dmgMult),
        damageType: projectile.damageType || "physical",
        towerTypeKey: projectile.towerTypeKey,
        effects: { explosion: { enabled: true, flashAlpha, flashTtl } },
        dueAt: performance.now() + delayMs
    };
    (gameState.scheduledEffects ||= []).push(entry);
}

export const EffectsRegistry = {
    applyTravel(gameState, projectile, deltaSeconds) {
        const effects = projectile.effects;
        if (!effects) return;
        if (effects.trail) applyTrailTravel(gameState, projectile, effects.trail, deltaSeconds);
    },

    applyImpact(gameState, projectile, aoeRadius) {
        const effects = projectile.effects;
        if (!effects) return;

        if (effects.explosion) applyExplosionImpact(gameState, projectile, effects.explosion, aoeRadius);
        if (effects.knockback) applyKnockbackImpact(gameState, projectile, effects.knockback, aoeRadius);
        if (effects.cluster) applyClusterImpact?.(gameState, projectile, effects.cluster);
        if (effects.chain) applyChainImpact?.(gameState, projectile, effects.chain);
        if (effects.aftershock) applyAftershockImpact(gameState, projectile, effects.aftershock, aoeRadius);
    }
};
