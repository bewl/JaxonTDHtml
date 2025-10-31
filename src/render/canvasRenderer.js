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

        // Layout
        const margin = 12;
        const barWidth = Math.min(ctx.canvas.width - margin * 2, 600);
        const barHeight = 14;

        // lively oscillation
        const osc = Math.sin(now * 0.006) * 2; // gentle ±2px
        const timeSinceHit = now - (boss._lastHitTimestamp || 0);
        const hitShake = timeSinceHit < 140 ? (Math.random() - 0.5) * 4 : 0; // quick micro-shake

        const x = (ctx.canvas.width - barWidth) / 2;
        const y = 10 + osc + hitShake;

        // Background plate
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(x - 8, y - 22, barWidth + 16, barHeight + 36);

        // Title
        ctx.font = "bold 15px system-ui, Segoe UI, Roboto, Arial";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(boss.name || "BOSS", x + barWidth / 2, y - 18);

        // Bar background
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(x, y, barWidth, barHeight);

        // Fill amount
        const pct = Math.max(0, boss.hitPoints) / boss.maximumHitPoints;
        const filled = Math.max(0, Math.floor(barWidth * pct));

        // Slight color pulse using boss color
        const pulse = 0.6 + 0.4 * Math.abs(Math.sin(now * 0.004));
        ctx.fillStyle = boss.fillColor || "#8b5cf6";
        ctx.globalAlpha = pulse;
        ctx.fillRect(x, y, filled, barHeight);
        ctx.globalAlpha = 1;

        // HP numbers
        const nf = new Intl.NumberFormat();
        const hpText = `${nf.format(Math.max(0, Math.floor(boss.hitPoints)))} / ${nf.format(boss.maximumHitPoints)} (${Math.round(pct * 100)}%)`;
        ctx.font = "12px system-ui, Segoe UI, Roboto, Arial";
        ctx.fillStyle = "#dbeafe";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(hpText, x + barWidth / 2, y + barHeight + 4);

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

        let circleFillColor = "#123b40";
        let rectFillColor = tower.uiColor || "#84cc16";
        if (tower.towerTypeKey === "sniper") circleFillColor = "#40334d";
        if (tower.towerTypeKey === "splash") circleFillColor = "#4b322d";

        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fillStyle = circleFillColor;
        ctx.fill();

        ctx.fillStyle = rectFillColor;
        ctx.fillRect(-6, -6, 12, 6);

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
