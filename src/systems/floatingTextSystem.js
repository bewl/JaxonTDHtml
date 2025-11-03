// ===========================================
// File: src/systems/floatingTextSystem.js
// ===========================================
export class FloatingTextSystem {
    tick(gameState, deltaSeconds) {
        const dtMs = Math.max(0, (deltaSeconds || 0) * 1000);
        const texts = gameState.floatingTexts;
        if (!Array.isArray(texts) || texts.length === 0) return;

        for (const t of texts) t.ageMs += dtMs;
        gameState.floatingTexts = texts.filter((t) => !t.isExpired);
    }
}
