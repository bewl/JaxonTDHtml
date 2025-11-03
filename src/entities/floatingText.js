// ===========================================
// File: src/entities/floatingText.js
// ===========================================
export class FloatingText {
    constructor({ x, y, text, color = "#ffd166", lifetimeMs = 900, risePixels = 28 }) {
        this.x = x;
        this.y = y;
        this.text = String(text);
        this.color = color;
        this.lifetimeMs = lifetimeMs;
        this.risePixels = risePixels;
        this.ageMs = 0;
    }
    get isExpired() {
        return this.ageMs >= this.lifetimeMs;
    }
}
