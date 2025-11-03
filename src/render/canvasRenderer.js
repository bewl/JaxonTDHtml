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

        // ------- Layout constants -------
        const ui = (this.configuration.ui && this.configuration.ui.bossBar) || {};
        const topMargin = ui.topMarginPixels ?? 36;
        const titleGap = ui.titleToBarGapPixels ?? 6;
        const platePad = ui.platePaddingPixels ?? 8;

        // Shake/flash tunables
        const hitShakeMaxX = ui.hitShakeXPixels ?? 16; // stronger base intensity
        const hitShakeMaxY = ui.hitShakeYPixels ?? 12;
        const hitDecayMs = ui.hitDecayMs ?? 250;
        const hitShakeHz = ui.hitShakeHz ?? 18;      // oscillation frequency

        // Canvas layout
        const viewportWidth = ctx.canvas.clientWidth || ctx.canvas.width;
        const barWidth = Math.min(viewportWidth - (topMargin * 2), 600);
        const barHeight = 14;
        const xBase = (viewportWidth - barWidth) / 2;

        // -------- Damage → shake strength --------
        const maxHP = Math.max(1, boss.maximumHitPoints || 1);
        const damage = Math.max(0, boss._lastDamageAmount || 0);
        const frac = Math.min(1, damage / maxHP);         // 0..1 fraction of HP lost in one hit
        const dtHit = now - (boss._lastHitTimestamp || 0);
        const decay = Math.exp(-dtHit / hitDecayMs);       // exponential fade-out
        const strength = Math.max(0, Math.min(1, frac * decay));

        // Amplify large hits slightly more than linearly (quadratic curve)
        // Small hits = subtle, large hits = punchy.
        const amp = Math.pow(strength, 0.65); // lower exponent => stronger high end

        // Deterministic oscillation
        let groupOffsetX = 0, groupOffsetY = 0;
        if (amp > 0) {
            const w = 2 * Math.PI * hitShakeHz * (dtHit / 1000);
            groupOffsetX = Math.sin(w) * hitShakeMaxX * amp;
            groupOffsetY = Math.cos(w * 0.9) * hitShakeMaxY * amp;
        }

        // -------- Layout positioning --------
        const titleHeightPx = 18;
        const minBarTopY = topMargin + titleHeightPx + titleGap;
        const barY = minBarTopY + 10 + groupOffsetY;
        const barX = xBase + groupOffsetX;

        // -------- Background plate --------
        ctx.save();
        const plateX = xBase - platePad + groupOffsetX;
        const plateY = topMargin - platePad + groupOffsetY;
        const plateW = barWidth + platePad * 2;
        const plateH = (titleHeightPx + titleGap + barHeight + 8) + platePad * 2;

        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(plateX, plateY, plateW, plateH);

        // Flash overlay (proportional to amp)
        if (amp > 0) {
            ctx.fillStyle = `rgba(239, 68, 68, ${0.38 * amp})`;
            ctx.fillRect(plateX, plateY, plateW, plateH);
        }

        // -------- Title --------
        ctx.font = "bold 15px system-ui, Segoe UI, Roboto, Arial";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(boss.name || "BOSS", xBase + barWidth / 2 + groupOffsetX, topMargin + 2 + groupOffsetY);

        // -------- Bar background (flashes red on hit) --------
        if (amp > 0) {
            ctx.fillStyle = `rgba(239, 68, 68, ${0.22 * amp})`;
        } else {
            ctx.fillStyle = "rgba(255,255,255,0.08)";
        }
        ctx.fillRect(barX, barY, barWidth, barHeight);

        // -------- Fill amount --------
        const pct = Math.max(0, boss.hitPoints) / maxHP;
        const filled = Math.max(0, Math.floor(barWidth * pct));
        const pulse = 0.65 + 0.35 * Math.abs(Math.sin(now * 0.004));
        ctx.fillStyle = boss.fillColor || "#8b5cf6";
        ctx.globalAlpha = pulse;
        ctx.fillRect(barX, barY, filled, barHeight);
        ctx.globalAlpha = 1;

        // -------- Numbers --------
        const nf = new Intl.NumberFormat();
        const hpText = `${nf.format(Math.max(0, Math.floor(boss.hitPoints)))} / ${nf.format(maxHP)} (${Math.round(pct * 100)}%)`;
        ctx.font = "12px system-ui, Segoe UI, Roboto, Arial";
        ctx.fillStyle = "#dbeafe";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(hpText, xBase + barWidth / 2 + groupOffsetX, barY + barHeight + 4);

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

        // Floating combat text (draw above enemies/projectiles, below HUD)
        if (Array.isArray(gameState.floatingTexts)) {
            for (const ft of gameState.floatingTexts) this.drawFloatingText(ft);
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

            const grad = ctx.createRadialGradient(
                enemy.x, enemy.y, coreRadius * 0.2,
                enemy.x, enemy.y, glowRadius
            );
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

    drawFloatingText(ft) {
        const ctx = this.renderingContext2D;

        // progress 0..1
        const p = Math.min(1, Math.max(0, ft.ageMs / ft.lifetimeMs));

        // Ease-out for motion & scale
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

        const rise = ft.risePixels * easeOutCubic(p);
        const alpha = 1 - p;                 // fade out
        const scale = 1 + 0.18 * (1 - p);    // slight pop at start

        ctx.save();
        ctx.translate(ft.x, ft.y - rise);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;

        ctx.font = "bold 14px system-ui, Segoe UI, Roboto, Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Soft shadow for readability
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 6;
        ctx.fillStyle = ft.color || "#ffd166";
        ctx.fillText(ft.text, 0, 0);

        ctx.restore();
    }

}
