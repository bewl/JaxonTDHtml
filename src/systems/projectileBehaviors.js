
/**
 * Lightweight registry for projectile behaviors with lifecycle hooks.
 * Hook signatures:
 *  - onSpawn(projectile, gameState)
 *  - onTravel(projectile, gameState, deltaSeconds)   // optional per-frame travel effects
 *  - onImpact(projectile, gameState)                 // called when projectile reaches target
 *
 * Each behavior returns void and may mutate gameState (particles, decals, etc.)
 */

export const ProjectileBehaviorRegistry = {
    _behaviors: Object.create(null),

    register(key, behavior) {
        if (!key || typeof behavior !== 'object') {
            throw new Error('ProjectileBehaviorRegistry.register: invalid args');
        }
        this._behaviors[key] = behavior;
    },

    get(key) {
        return this._behaviors[key] || this._behaviors.basic;
    }
};

// ------------------------
// Shared helpers
// ------------------------
export const ProjectileHelpers = {
    /**
     * Applies AoE damage with linear falloff (1.0 at center -> 0 at edge).
     * Returns total applied damage (sum) for optional analytics.
     */
    applyAoeDamage(gameState, centerX, centerY, radiusPixels, baseDamage, damageType, damageMultiplier = 1) {
        let total = 0;
        const r = Math.max(1, radiusPixels || 1);
        for (const enemy of gameState.enemies) {
            if (!enemy || enemy._isMarkedDead) continue;
            const dx = enemy.x - centerX;
            const dy = enemy.y - centerY;
            const d  = Math.hypot(dx, dy);
            if (d >= r) continue;

            const before = Math.max(0, enemy.hitPoints);
            // Use your existing global + type multiplier (kept DRY with your helpers)
            const raw = Math.max(0, Math.round(baseDamage * (gameState?.modifiers?.towerDamageMultiplier ?? 1) * (typeof typeMultFor === 'function' ? typeMultFor(enemy, damageType) : 1) * damageMultiplier));
            const falloff = 1 - (d / r);
            const applied = Math.min(before, Math.round(raw * falloff));
            if (applied <= 0) continue;

            enemy.hitPoints = before - applied;
            enemy._lastHitTimestamp = performance.now();
            enemy._lastDamageAmount = applied;

            // Floating damage text
            gameState.floatingTexts.push(new FloatingText({
                x: enemy.x,
                y: enemy.y - (enemy.isBoss ? 26 : 18),
                text: `-${applied}`,
                color: "#fca5a5",
                lifetimeMs: 900,
                risePixels: enemy.isBoss ? 34 : 28
            }));

            total += applied;
        }
        return total;
    },

    /**
     * Minimal, fast particle blast + scorch + soft screen flash.
     * Tuned to be subtle by default.
     */
    spawnExplosionFx(gameState, x, y, radiusPixels) {
        const EX_RADIUS = Math.max(24, radiusPixels || 80);
        const PARTICLE_COUNT = Math.max(20, Math.floor(EX_RADIUS / 2.0));

        // Particles (embers/debris)
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (Math.random() * 0.8 + 0.4) * (EX_RADIUS / 40);
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const life = 500 + Math.random() * 600; // ms
            const size = 2 + Math.random() * 7;

            const r = Math.random();
            const color = r < 0.12 ? "#fff3b0" : (r < 0.5 ? "#ffb24d" : "#6b2f1b");

            gameState.particles.push({
                type: "fragment",
                x: x + (Math.random() - 0.5) * 6,
                y: y + (Math.random() - 0.5) * 6,
                vx, vy,
                lifeMs: life,
                maxLifeMs: life,
                size,
                color
            });
        }

        // Scorch decal (fades in tick via lifeMs)
        (gameState.decals ||= []).push({
            type: "scorch",
            x, y,
            radius: EX_RADIUS * 0.6,
            lifeMs: 30000,
            maxLifeMs: 30000,
            alpha: 0.85
        });

        // Gentle screen flash (already toned down per your feedback)
        const FLASH_ALPHA = 0.16;
        const FLASH_TTL   = 120;
        gameState.screenFlash.alpha = Math.max(gameState.screenFlash.alpha || 0, FLASH_ALPHA);
        gameState.screenFlash.ttlMs = Math.max(gameState.screenFlash.ttlMs || 0, FLASH_TTL);
    },

    /**
     * Applies immediate positional knockback with linear falloff to all enemies in radius.
     */
    applyKnockback(gameState, centerX, centerY, radiusPixels, maxKnockbackPx) {
        const R = Math.max(1, radiusPixels || 1);
        const MAX = Math.max(0, maxKnockbackPx || 0);
        if (MAX <= 0) return;

        for (const enemy of gameState.enemies) {
            if (!enemy || enemy._isMarkedDead) continue;
            const dx = enemy.x - centerX;
            const dy = enemy.y - centerY;
            const dist = Math.hypot(dx, dy);
            if (dist >= R) continue;

            if (dist === 0) {
                const ang = Math.random() * Math.PI * 2;
                enemy.x += Math.cos(ang) * (MAX * 0.25);
                enemy.y += Math.sin(ang) * (MAX * 0.25);
            } else {
                const falloff = 1 - (dist / R);
                const nx = dx / dist;
                const ny = dy / dist;
                enemy.x += nx * (MAX * falloff);
                enemy.y += ny * (MAX * falloff);
            }
        }
    }
};

// ------------------------
// Built-in behaviors
// ------------------------

/**
 * Default/basic projectile:
 * - Direct damage if targetEnemy is set.
 * - If projectile.splash exists -> AoE damage ONLY (no FX).
 */
ProjectileBehaviorRegistry.register('basic', {
    onSpawn(projectile, gameState) { /* no-op */ },

    onTravel(projectile, gameState, deltaSeconds) { /* no-op */ },

    onImpact(projectile, gameState) {
        const dmgType = projectile.damageType || "physical";

        if (projectile.splash) {
            // AoE damage only, use projectile.damagePerHit as base
            ProjectileHelpers.applyAoeDamage(
                gameState,
                projectile._currentX, projectile._currentY,
                projectile.splash.radiusPixels,
                projectile.damagePerHit,
                dmgType
            );
            return;
        }

        // Direct hit path
        const enemy = projectile.targetEnemy;
        if (enemy && !enemy._isMarkedDead) {
            const before = Math.max(0, enemy.hitPoints);
            const raw = Math.max(0, Math.round(
                projectile.damagePerHit *
                (gameState?.modifiers?.towerDamageMultiplier ?? 1) *
                (typeof typeMultFor === 'function' ? typeMultFor(enemy, dmgType) : 1)
            ));
            const applied = Math.min(raw, before);
            if (applied > 0) {
                enemy.hitPoints = before - applied;
                enemy._lastHitTimestamp = performance.now();
                enemy._lastDamageAmount = applied;

                gameState.floatingTexts.push(new FloatingText({
                    x: enemy.x,
                    y: enemy.y - (enemy.isBoss ? 26 : 18),
                    text: `-${applied}`,
                    color: "#fca5a5",
                    lifetimeMs: 900,
                    risePixels: enemy.isBoss ? 34 : 28
                }));
            }
        }
    }
});

/**
 * "nuke" projectile:
 * - AoE damage with visuals and knockback.
 * - Reuses the DRY helpers above.
 */
ProjectileBehaviorRegistry.register('nuke', {
    onSpawn(projectile, gameState) { /* room for trails later */ },

    onTravel(projectile, gameState, deltaSeconds) { /* room for arc/smoke */ },

    onImpact(projectile, gameState) {
        const dmgType = projectile.damageType || "physical";
        const radius  = projectile?.splash?.radiusPixels || 100;

        // 1) Damage
        ProjectileHelpers.applyAoeDamage(
            gameState,
            projectile._currentX, projectile._currentY,
            radius,
            projectile.damagePerHit,
            dmgType
        );

        // 2) FX
        ProjectileHelpers.spawnExplosionFx(gameState, projectile._currentX, projectile._currentY, radius);

        // 3) Physics (knockback)
        const MAX_KNOCKBACK = Math.max(10, Math.min(80, Math.floor(radius * 0.35)));
        ProjectileHelpers.applyKnockback(gameState, projectile._currentX, projectile._currentY, radius, MAX_KNOCKBACK);
    }
});
