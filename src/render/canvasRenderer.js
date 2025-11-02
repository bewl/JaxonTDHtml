// ===========================================
// File: src/render/canvasRenderer.js
// ===========================================
function hexToRgba(hex, alpha) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return `rgba(139, 92, 246, ${alpha})`; // fallback purple
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Small 1D smooth noise for jitter (no deps)
function _fract(x) { return x - Math.floor(x); }
function _lerp(a, b, t) { return a + (b - a) * t; }
function _smooth(t) { return t * t * (3 - 2 * t); }
function _hash(n) { return _fract(Math.sin(n) * 43758.5453); }
function noise1D(x, seed = 0) {
    const i = Math.floor(x), f = x - i;
    const a = _hash(i + seed), b = _hash(i + 1 + seed);
    return _lerp(a, b, _smooth(f)); // 0..1
}


export class CanvasRenderer {
    constructor(renderingContext2D, gridMap, configuration) {
        this.renderingContext2D = renderingContext2D;
        this.gridMap = gridMap;
        this.configuration = configuration;

        // Hover previews:
        // - when hovering an existing tower: show that tower's range in its color (no ghost)
        // - when in placement mode: show ghost tower + range ring at the hovered grid cell
        this.hoverPreview = null;     // { x, y, radiusPixels, strokeColor }
        this.placementGhost = null;   // { x, y, uiColor, towerTypeKey }
    }

    /**
     * Set the hover preview range circle (or null to clear).
     * @param {{x:number,y:number,radiusPixels:number,strokeColor?:string}|null} preview
     */
    setHoverPreview(preview) {
        this.hoverPreview = preview;
    }

    /**
     * Set the placement ghost (or null to clear).
     * @param {{x:number,y:number,uiColor:string,towerTypeKey:string}|null} ghost
     */
    setPlacementGhost(ghost) {
        this.placementGhost = ghost;
    }


    drawBossTopBar(boss, now) {
        const ctx = this.renderingContext2D;

        // ------- Layout constants (from config if present) -------
        const ui = (this.configuration.ui && this.configuration.ui.bossBar) || {};
        const topMargin = ui.topMarginPixels ?? 36;
        const titleGap = ui.titleToBarGapPixels ?? 6;
        const platePad = ui.platePaddingPixels ?? 8;

        const jitterXAmt = ui.jitterXPixels ?? 4;
        const jitterYAmt = ui.jitterYPixels ?? 3;
        const jitterHz = ui.jitterSpeedHz ?? 2.4;

        const hitShakeXA = ui.hitShakeXPixels ?? 4;
        const hitShakeYA = ui.hitShakeYPixels ?? 4;

        const barWidth = Math.min(ctx.canvas.width - (topMargin * 2), 600);
        const barHeight = 14;
        const xBase = (ctx.canvas.width - barWidth) / 2;

        // -------- Non-circular jitter (independent X/Y noise) --------
        const t = now * (jitterHz / 1000); // convert ms -> "seconds" for noise
        const jitterX = (noise1D(t * 1.07, 13) - 0.5) * 2 * jitterXAmt;
        const jitterY = (noise1D(t * 1.19, 29) - 0.5) * 2 * jitterYAmt;

        // -------- Micro-shake on recent hit (decays fast) --------
        const timeSinceHit = now - (boss._lastHitTimestamp || 0);
        const shakePhase = Math.max(0, 1 - timeSinceHit / 140); // 0..1 over ~140ms
        const shakeX = (Math.random() - 0.5) * 2 * hitShakeXA * shakePhase;
        const shakeY = (Math.random() - 0.5) * 2 * hitShakeYA * shakePhase;

        // -------- Final positions with vertical clamp (no top clipping) --------
        const titleHeightPx = 18; // for 15px bold font
        const minY = topMargin + titleHeightPx + titleGap; // bar's top cannot go above this
        const baseY = minY + 10; // baseline where it rests
        const y = Math.min(minY + 24, Math.max(minY, baseY + jitterY + shakeY)); // clamp
        const x = xBase + jitterX + shakeX;

        // -------- Background plate (covers title + bar) --------
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        const plateX = xBase - platePad - (jitterXAmt + hitShakeXA);   // extra room for X jitter
        const plateY = topMargin - platePad;
        const plateW = barWidth + (platePad * 2) + (jitterXAmt + hitShakeXA) * 2;
        const plateH = (titleHeightPx + titleGap + barHeight + 8) + platePad * 2;
        ctx.fillRect(plateX, plateY, plateW, plateH);

        // -------- Title --------
        ctx.font = "bold 15px system-ui, Segoe UI, Roboto, Arial";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(boss.name || "BOSS", xBase + barWidth / 2, topMargin + 2);

        // -------- Bar background --------
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x, y, barWidth, barHeight);

        // -------- Fill amount + pulse --------
        const pct = Math.max(0, boss.hitPoints) / boss.maximumHitPoints;
        const filled = Math.max(0, Math.floor(barWidth * pct));
        const pulse = 0.6 + 0.4 * Math.abs(Math.sin(now * 0.004));
        ctx.fillStyle = boss.fillColor || "#8b5cf6";
        ctx.globalAlpha = pulse;
        ctx.fillRect(x, y, filled, barHeight);
        ctx.globalAlpha = 1;

        // -------- Numbers --------
        const nf = new Intl.NumberFormat();
        const hpText = `${nf.format(Math.max(0, Math.floor(boss.hitPoints)))} / ${nf.format(boss.maximumHitPoints)} (${Math.round(pct * 100)}%)`;
        ctx.font = "12px system-ui, Segoe UI, Roboto, Arial";
        ctx.fillStyle = "#dbeafe";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(hpText, xBase + barWidth / 2, y + barHeight + 4);

        ctx.restore();

    }

    drawFrame(gameState) {
        const ctx = this.renderingContext2D;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Grid
        for (let gridX = 0; gridX < this.gridMap.gridColumnCount; gridX += 1) {
            for (let gridY = 0; gridY < this.gridMap.gridRowCount; gridY += 1) {
                const cellX = gridX * this.gridMap.gridCellSize;
                const cellY = gridY * this.gridMap.gridCellSize;
                ctx.fillStyle = this.gridMap.isGridCellOnPath(gridX, gridY)
                    ? "#17202b"
                    : "rgba(255,255,255,0.02)";
                ctx.fillRect(cellX, cellY, this.gridMap.gridCellSize - 1, this.gridMap.gridCellSize - 1);
            }
        }

        // Path stroke
        ctx.beginPath();
        ctx.lineWidth = 20;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#2c566f";
        ctx.moveTo(this.gridMap.waypoints[0].x, this.gridMap.waypoints[0].y);
        for (const waypoint of this.gridMap.waypoints) ctx.lineTo(waypoint.x, waypoint.y);
        ctx.stroke();

        // Towers
        for (const tower of gameState.towers) this.drawTower(tower);

        // Enemies
        for (const enemy of gameState.enemies) this.drawEnemy(enemy);

        // Projectiles
        for (const projectile of gameState.projectiles) this.drawProjectile(projectile);

        // Hover preview ring (range outline)
        if (this.hoverPreview && this.configuration.showRangeOnHover) {
            const { x, y, radiusPixels, strokeColor } = this.hoverPreview;

            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, radiusPixels, 0, Math.PI * 2);

            // Use the given color with translucency
            ctx.strokeStyle = strokeColor || "rgba(100,200,100,0.8)";
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        }

        // Placement ghost (semi-transparent tower body while aiming)
        if (this.placementGhost) {
            this.drawGhostTower(this.placementGhost);
        }

        // (after drawing grid, path, towers, enemies, projectiles)
        const now = performance.now();

        // Big top-of-screen boss bar (if a boss exists) — draw BEFORE HUD
        const boss = gameState.enemies.find(e => e.isBoss);
        if (boss) {
            this.drawBossTopBar(boss, now);
        }

        // === HUD (draw LAST so it never gets covered) ===
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        ctx.fillStyle = "rgba(4,7,11,0.6)";
        ctx.fillRect(8, 8, 220, 80);
        ctx.fillStyle = "#dbeafe";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(`Money: $${gameState.money}`, 16, 28);
        ctx.fillText(`Lives: ${gameState.lives}`, 16, 48);
        ctx.fillText(`Wave: ${gameState.currentWaveNumber}/${this.configuration.maximumWaveNumber}`, 16, 68);

        ctx.restore();
    }

    drawTower(tower) {
        const ctx = this.renderingContext2D;
        ctx.save();
        ctx.translate(tower.x, tower.y);

        // Ensure the tower has a rotation value (in radians). If your tower
        // update system sets this (recommended), we respect it here; otherwise
        // fall back to zero so we do not crash.
        const rotationRadians = (typeof tower.rotationRadians === "number")
            ? tower.rotationRadians
            : 0;

        // Apply rotation so the barrel points toward the current target direction.
        ctx.rotate(rotationRadians);

        // Colors by tower type (kept from your prior styling)
        let circleFillColor = "#123b40";
        let rectFillColor = tower.uiColor || "#84cc16";
        if (tower.towerTypeKey === "sniper") circleFillColor = "#40334d";
        if (tower.towerTypeKey === "splash") circleFillColor = "#4b322d";

        // Base body (unaffected by rotation visually since we rotate the whole local space)
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fillStyle = circleFillColor;
        ctx.fill();

        // Barrel points "forward" (positive X in local space) after rotation.
        // Previously: ctx.fillRect(-6, -6, 12, 6) — a centered bar.
        // Now: extend outward so it visibly aims at targets.
        ctx.fillStyle = rectFillColor;
        ctx.fillRect(0, -3, 14, 6);

        ctx.restore();
    }

    drawGhostTower(ghost) {
        const ctx = this.renderingContext2D;
        const { x, y, uiColor } = ghost;

        ctx.save();
        ctx.translate(x, y);

        // Semi-transparent base + head
        ctx.globalAlpha = 0.35;

        // Base circle (use a darker neutral to avoid overpowering the map)
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fillStyle = "#0c3b40";
        ctx.fill();

        // Turret bar colored to match UI color
        ctx.fillStyle = uiColor || "#84cc16";
        ctx.fillRect(-6, -6, 12, 6);

        ctx.restore();
    }


    drawEnemy(enemy) {
        const ctx = this.renderingContext2D;
        const now = performance.now();

        // ===== Boss glow (soft radial gradient) =====
        if (enemy.isBoss) {
            const ctx = this.renderingContext2D;
            const now = performance.now();
            const pulse = 0.6 + 0.4 * Math.sin(now * 0.006);
            const coreRadius = (enemy.drawRadiusPixels || 20);
            const glowRadius = coreRadius + 28; // how far the glow extends
            const color = enemy.fillColor || "#8b5cf6";

            const grad = ctx.createRadialGradient(enemy.x, enemy.y, coreRadius * 0.2,
                enemy.x, enemy.y, glowRadius);
            grad.addColorStop(0.0, hexToRgba(color, 0.35 * pulse));
            grad.addColorStop(0.5, hexToRgba(color, 0.18 * pulse));
            grad.addColorStop(1.0, "rgba(0,0,0,0)");

            ctx.save();
            ctx.globalCompositeOperation = "lighter"; // nice additive bloom
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(enemy.x, enemy.y, glowRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // ===== Enemy body =====
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.isBoss ? 20 : enemy.drawRadiusPixels, 0, Math.PI * 2);
        ctx.fillStyle = enemy.fillColor;
        ctx.fill();

        // ===== Health bar above enemy =====
        const healthBarWidth = enemy.isBoss ? 90 : 40;
        const healthBarHeight = 6;
        const barOffsetY = enemy.isBoss ? 38 : 28;
        const healthBarY = enemy.y - barOffsetY;
        const healthPercent = Math.max(0, enemy.hitPoints) / enemy.maximumHitPoints;

        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(enemy.x - healthBarWidth / 2, healthBarY, healthBarWidth, healthBarHeight);

        ctx.fillStyle = "#10b981";
        ctx.fillRect(
            enemy.x - healthBarWidth / 2 + 1,
            healthBarY + 1,
            Math.max(0, (healthBarWidth - 2) * healthPercent),
            healthBarHeight - 2
        );

        // Optional small labels for boss (keep or remove if you prefer only the top bar)
        if (enemy.isBoss) {
            ctx.font = "bold 12px sans-serif";
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,0.6)";
            ctx.shadowBlur = 6;
            ctx.fillText(enemy.name || "BOSS", enemy.x, healthBarY - 6);
            ctx.restore();
        }
    }


    drawProjectile(projectile) {
        const ctx = this.renderingContext2D;
        const t = Math.min(projectile.travelProgress, 1);
        const drawX = projectile.x + (projectile.targetX - projectile.x) * t;
        const drawY = projectile.y + (projectile.targetY - projectile.y) * t;

        ctx.beginPath();
        ctx.arc(drawX, drawY, projectile.towerTypeKey === "sniper" ? 3 : 5, 0, Math.PI * 2);
        ctx.fillStyle = "#fef08a";
        ctx.fill();
    }
}
