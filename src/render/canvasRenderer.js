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
        this._mapDesignerPath = null; // map designer overlay (array of {x,y} or null)
        this._hideBasePathWhileEditing = false;
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

    /**
     * Provide a path of grid cells for the map designer overlay, or null to clear.
     * @param {{x:number,y:number}[]|null} cells
     */
    setMapDesignerOverlay(cells) {
        this._mapDesignerPath = Array.isArray(cells) ? cells : null;
    }

    /**
     * When true, the renderer won't draw the base (configured) path;
     * you'll see only the editor overlay if present.
    */
    setHideBasePathWhileEditing(hide) {
        this._hideBasePathWhileEditing = !!hide;
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

        const showBasePath = !this._hideBasePathWhileEditing;
        const waypoints = (this.gridMap && Array.isArray(this.gridMap.waypoints)) ? this.gridMap.waypoints : [];
        const hasDrawablePath = showBasePath && waypoints.length >= 2;

        for (let gridX = 0; gridX < this.gridMap.gridColumnCount; gridX += 1) {
            for (let gridY = 0; gridY < this.gridMap.gridRowCount; gridY += 1) {
                const cellX = gridX * this.gridMap.gridCellSize;
                const cellY = gridY * this.gridMap.gridCellSize;
                const isPathCell = hasDrawablePath && this.gridMap.isGridCellOnPath(gridX, gridY);
                ctx.fillStyle = isPathCell ? "#17202b" : "rgba(255,255,255,0.02)";
                ctx.fillRect(cellX, cellY, this.gridMap.gridCellSize - 1, this.gridMap.gridCellSize - 1);
            }
        }

        if (hasDrawablePath) {
            ctx.beginPath();
            ctx.lineWidth = 20;
            ctx.lineCap = "round";
            ctx.strokeStyle = "#2c566f";
            ctx.moveTo(waypoints[0].x, waypoints[0].y);
            for (let i = 1; i < waypoints.length; i += 1) {
                const wp = waypoints[i];
                ctx.lineTo(wp.x, wp.y);
            }
            ctx.stroke();
        }

        if (Array.isArray(gameState.decals) && gameState.decals.length) {
            for (const d of gameState.decals) {
                const fade = (typeof d.maxLifeMs === "number" && d.maxLifeMs > 0)
                    ? Math.max(0, Math.min(1, d.lifeMs / d.maxLifeMs))
                    : 1;
                const baseAlpha = (typeof d.alpha === "number" ? d.alpha : 0.85);
                const alpha = baseAlpha * fade;
                const r = d.radius || 48;

                const g = ctx.createRadialGradient(d.x, d.y, r * 0.2, d.x, d.y, r);
                g.addColorStop(0, hexToRgba("#000000", alpha * 0.35));
                g.addColorStop(1, "rgba(0,0,0,0)");

                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        for (const tower of gameState.towers) this.drawTower(tower);
        for (const enemy of gameState.enemies) this.drawEnemy(enemy);
        for (const projectile of gameState.projectiles) this.drawProjectile(projectile);

        if (Array.isArray(gameState.particles) && gameState.particles.length) {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            for (const p of gameState.particles) {
                const fade = (typeof p.maxLifeMs === "number" && p.maxLifeMs > 0)
                    ? Math.max(0, Math.min(1, p.lifeMs / p.maxLifeMs))
                    : 1;
                if (fade <= 0) continue;
                ctx.globalAlpha = fade;
                ctx.fillStyle = p.color || "#ffffff";
                const size = Math.max(1, p.size || 2);
                ctx.beginPath();
                ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            ctx.globalAlpha = 1;
        }

        if (Array.isArray(gameState.lightningBeams) && gameState.lightningBeams.length) {
            const now = performance.now();
            const kept = [];
            for (const beam of gameState.lightningBeams) {
                const ttl = Math.max(1, beam.ttlMs || 120);
                const age = Math.max(0, now - (beam.createdAt || now));
                const p = Math.min(1, age / ttl);
                const fade = 1 - p;
                if (fade <= 0) continue;

                const pts = beam.points;
                if (!Array.isArray(pts) || pts.length < 2) continue;

                ctx.save();
                ctx.globalCompositeOperation = "lighter";
                ctx.lineCap = "round";
                ctx.lineJoin = "round";

                ctx.strokeStyle = hexToRgba(beam.glowColor || "#93c5fd", 0.35 * fade);
                ctx.lineWidth = (beam.lineWidth || 2) * 3;
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                ctx.stroke();

                ctx.strokeStyle = hexToRgba(beam.coreColor || "#e0f2fe", 0.95 * fade);
                ctx.lineWidth = (beam.lineWidth || 2);
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                ctx.stroke();

                ctx.restore();

                if (age < ttl) kept.push(beam);
            }
            gameState.lightningBeams = kept;
        }

        if (Array.isArray(gameState.ripples) && gameState.ripples.length) {
            const now = performance.now();
            const keptRipples = [];
            for (const r of gameState.ripples) {
                const age = Math.max(0, now - (r.createdAt || now));
                const dur = Math.max(1, r.durationMs || 500);
                if (age >= dur) continue;

                const t = age / dur;
                const radius = r.startRadius + (r.endRadius - r.startRadius) * t;
                const fade = (1 - t) * (r.alpha ?? 0.6);

                ctx.save();
                ctx.globalCompositeOperation = "screen";
                ctx.lineCap = "round";

                ctx.strokeStyle = hexToRgba(r.glowColor || "#fbbf24", 0.35 * fade);
                ctx.lineWidth = Math.max(1, r.glowWidth || 8);
                ctx.beginPath();
                ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
                ctx.stroke();

                ctx.strokeStyle = hexToRgba(r.coreColor || "#fde68a", 0.9 * fade);
                ctx.lineWidth = Math.max(1, r.coreWidth || 3);
                ctx.beginPath();
                ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
                ctx.stroke();

                ctx.restore();
                keptRipples.push(r);
            }
            gameState.ripples = keptRipples;
        }

        if (gameState.screenFlash && gameState.screenFlash.ttlMs > 0 && (gameState.screenFlash.alpha || 0) > 0) {
            const maxT = Math.max(1, gameState.screenFlash.maxTtlMs || gameState.screenFlash.ttlMs);
            const ratio = Math.max(0, Math.min(1, gameState.screenFlash.ttlMs / maxT));
            const effectiveAlpha = (gameState.screenFlash.alpha || 0) * ratio;

            ctx.save();
            ctx.globalCompositeOperation = "screen";
            ctx.fillStyle = hexToRgba("#ffffff", effectiveAlpha);
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.restore();
        }

        if (this.hoverPreview && this.configuration.showRangeOnHover) {
            const { x, y, radiusPixels, strokeColor } = this.hoverPreview;
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, radiusPixels, 0, Math.PI * 2);
            ctx.strokeStyle = strokeColor || "rgba(100,200,100,0.8)";
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        }

        if (this.placementGhost) this.drawGhostTower(this.placementGhost);

        if (Array.isArray(gameState.floatingTexts)) {
            for (const ft of gameState.floatingTexts) this.drawFloatingText(ft);
        }

        if (this._mapDesignerPath && this._mapDesignerPath.length) {
            this.drawMapDesignerOverlay(this._mapDesignerPath);
        }

        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        ctx.fillStyle = "rgba(4,7,11,0.6)";
        ctx.fillRect(8, 8, 220, 80);
        ctx.fillStyle = "#dbeafe";
        ctx.font = "14px sans-serif";
        ctx.fillText("JaxonTD — Debug HUD", 18, 16);
        ctx.fillText(`Enemies: ${gameState.enemies.length}`, 18, 36);
        ctx.fillText(`Projectiles: ${gameState.projectiles.length}`, 18, 56);
        ctx.restore();
    }



    /**
     * Simple particle updater + renderer.
     * Particles are stored on gameState.particles and can be:
     *  - { type: 'fragment', x,y,vx,vy,lifeMs,maxLifeMs,size,color }
     * Particles are updated and expired here.
     */
    drawParticles(gameState) {
        const ctx = this.renderingContext2D;
        if (!Array.isArray(gameState.particles) || gameState.particles.length === 0) return;

        const now = performance.now();
        if (!gameState._lastRenderTime) gameState._lastRenderTime = now;
        const dtMs = Math.max(0, Math.min(100, now - gameState._lastRenderTime));
        gameState._lastRenderTime = now;

        // Update particle physics & life
        for (const p of gameState.particles) {
            p.lifeMs -= dtMs;
            if (p.type === "fragment") {
                // simple Euler integration + gravity
                p.vy += (0.02 * dtMs * 0.06);
                p.x += p.vx * (dtMs / 16.0);
                p.y += p.vy * (dtMs / 16.0);
            }
        }

        // Render visible particles
        for (const p of gameState.particles) {
            if (p.lifeMs <= 0) continue;
            const ageFrac = Math.max(0, Math.min(1, 1 - (p.lifeMs / p.maxLifeMs)));
            if (p.type === "fragment") {
                const alpha = Math.max(0, 1 - ageFrac);
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                const size = Math.max(1, (p.size || 3) * (1 - ageFrac * 0.8));
                ctx.fillStyle = p.color || "#ffb24d";
                ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // Cull dead particles only (decals are handled in the game tick)
        gameState.particles = gameState.particles.filter(p => p.lifeMs > 0);
    }

    drawTower(tower) {
        const ctx = this.renderingContext2D;
        ctx.save();
        ctx.translate(tower.x, tower.y);

        // === Visual scaling ===
        // Use tower.visualScale if defined, else default to 1
        const scale = tower.visualScale ?? 1;

        // Apply visual scale
        ctx.scale(scale, scale);

        const rotationRadians = (typeof tower.rotationRadians === "number")
            ? tower.rotationRadians
            : 0;
        ctx.rotate(rotationRadians);

        let circleFillColor = "#123b40";
        let rectFillColor = tower.uiColor || "#84cc16";
        if (tower.towerTypeKey === "sniper") circleFillColor = "#40334d";
        if (tower.towerTypeKey === "splash") circleFillColor = "#4b322d";

        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2); // base circle
        ctx.fillStyle = circleFillColor;
        ctx.fill();

        ctx.fillStyle = rectFillColor;
        ctx.fillRect(0, -3, 14, 6); // barrel

        ctx.restore();
    }



    drawGhostTower(ghost) {
        const ctx = this.renderingContext2D;
        const { x, y, uiColor, isValid, sizeCells = 1 } = ghost;
        const cellSize = this.gridMap.gridCellSize;
        const widthPx = sizeCells * cellSize;
        const heightPx = sizeCells * cellSize;

        ctx.save();
        ctx.translate(x, y);

        // Footprint rect centered on (x, y)
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = isValid
            ? "rgba(12, 59, 64, 0.45)"
            : "rgba(128, 32, 32, 0.45)";
        ctx.strokeStyle = isValid
            ? "rgba(255,255,255,0.35)"
            : "rgba(255, 80, 80, 0.8)";
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.rect(-widthPx / 2, -heightPx / 2, widthPx, heightPx);
        ctx.fill();
        ctx.stroke();

        // Optional: subtle center “barrel” hint so orientation remains visible
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = uiColor || "#84cc16";
        const barrelLen = Math.max(14, Math.floor(14 + (sizeCells - 1) * 6));
        ctx.fillRect(-barrelLen / 2, -3, barrelLen, 6);

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

    drawMapDesignerOverlay(cells) {
        const ctx = this.renderingContext2D;
        const size = this.gridMap.gridCellSize;

        ctx.save();

        // Slight dim overlay so edited cells pop
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Draw working path cells
        ctx.lineWidth = 2;
        for (const c of cells) {
            const x = c.x * size;
            const y = c.y * size;

            // cell fill
            ctx.fillStyle = "rgba(56, 189, 248, 0.25)"; // cyan-ish
            ctx.fillRect(x, y, size - 1, size - 1);

            // outline
            ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
            ctx.strokeRect(x + 0.5, y + 0.5, size - 2, size - 2);
        }

        // Legend chip
        ctx.font = "12px system-ui, Segoe UI, Roboto, Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        const boxW = 180, boxH = 54;
        ctx.fillRect(10, 10, boxW, boxH);
        ctx.fillStyle = "#dbeafe";
        ctx.fillText("Map Designer (drag to paint)", 16, 16);
        ctx.fillText("Left-drag: add / erase (tool)", 16, 32);

        ctx.restore();
    }

    /**
 * Renders an overlay for the in-editor path:
 *  - fills each selected grid cell with a subtle tint
 *  - draws a polyline through cell centers (in array order)
 */
    drawMapDesignerOverlay(cells) {
        const ctx = this.renderingContext2D;
        const size = this.gridMap.gridCellSize;

        ctx.save();

        // 1) Fill selected cells (subtle cyan tint)
        ctx.globalAlpha = 0.28;
        ctx.fillStyle = "#22d3ee"; // cyan
        for (const c of cells) {
            const x = c.x * size;
            const y = c.y * size;
            ctx.fillRect(x, y, size, size);
        }

        // 2) Outline cells lightly for precision
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = "rgba(34, 211, 238, 0.7)";
        ctx.lineWidth = 1;
        for (const c of cells) {
            const x = c.x * size + 0.5;
            const y = c.y * size + 0.5;
            ctx.strokeRect(x, y, size - 1, size - 1);
        }

        // 3) Path polyline (through cell centers, order = array order)
        if (cells.length >= 2) {
            ctx.globalAlpha = 0.9;
            ctx.strokeStyle = "#67e8f9"; // lighter cyan
            ctx.lineWidth = 3;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            ctx.beginPath();
            const c0 = cells[0];
            ctx.moveTo(c0.x * size + size / 2, c0.y * size + size / 2);
            for (let i = 1; i < cells.length; i += 1) {
                const ci = cells[i];
                ctx.lineTo(ci.x * size + size / 2, ci.y * size + size / 2);
            }
            ctx.stroke();

            // 4) Endpoints markers
            const start = cells[0];
            const end = cells[cells.length - 1];
            const r = 4;

            ctx.fillStyle = "#22d3ee";
            ctx.beginPath();
            ctx.arc(start.x * size + size / 2, start.y * size + size / 2, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#06b6d4";
            ctx.beginPath();
            ctx.arc(end.x * size + size / 2, end.y * size + size / 2, r, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}
