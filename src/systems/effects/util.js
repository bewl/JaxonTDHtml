export function addExplosionParticles(gameState, x, y, radius) {
    const r = Math.max(24, radius || 80);
    const particles = Math.max(20, Math.floor(r / 2));

    for (let i = 0; i < particles; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (Math.random() * 0.8 + 0.4) * (r / 40);
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const life = 500 + Math.random() * 600;
        const size = 2 + Math.random() * 7;

        const pick = Math.random();
        const color = pick < 0.12 ? "#fff3b0" : (pick < 0.5 ? "#ffb24d" : "#6b2f1b");

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
}

export function addScorchDecal(gameState, x, y, radius, lifeMs, alpha) {
    (gameState.decals ||= []).push({
        type: "scorch",
        x, y,
        radius: radius || 48,
        lifeMs: lifeMs ?? 30000,
        maxLifeMs: lifeMs ?? 30000,
        alpha: alpha ?? 0.85
    });
}

export function triggerScreenFlash(gameState, alpha, ttlMs) {
    const a = alpha ?? 0.16;
    const t = Math.max(0, ttlMs ?? 120);
    if (!gameState.screenFlash) {
        gameState.screenFlash = { alpha: a, ttlMs: t, maxTtlMs: t };
        return;
    }
    // take the stronger flash and the longer remaining TTL
    gameState.screenFlash.alpha = Math.max(gameState.screenFlash.alpha || 0, a);
    const existingTtl = gameState.screenFlash.ttlMs || 0;
    gameState.screenFlash.ttlMs = Math.max(existingTtl, t);
    gameState.screenFlash.maxTtlMs = Math.max(gameState.screenFlash.maxTtlMs || 0, gameState.screenFlash.ttlMs);
}

