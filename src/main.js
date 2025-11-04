// ===========================================
// File: src/main.js
// ===========================================

import { GAME_CONFIG, WavePlanFactory, EnemyStatFactories } from "./config/gameConfig.js";
import { GridMap } from "./map/gridMap.js";

import { MovementSystem } from "./systems/movementSystem.js";
import { CombatSystem } from "./systems/combatSystem.js";
import { WaveSpawnerSystem } from "./systems/waveSpawnerSystem.js";

import { CanvasRenderer } from "./render/canvasRenderer.js";

import {
    createUserInterfaceBindings,
    buildTowerButtonsFromConfig,
    refreshStatsPanel,
} from "./ui/uiBindings.js";
import { toast, initializeToastService, setToastPosition } from "./ui/toast.js";

import { TowerEntity } from "./entities/tower.js";
import { EnemyEntity } from "./entities/enemy.js";

import { projectPointOntoSegment } from "./core/mathUtils.js";

import { createAdminPanel } from "./ui/adminPanel.js";

import { FloatingTextSystem } from "./systems/floatingTextSystem.js";
import { FloatingText } from "./entities/floatingText.js"; // only if you need to spawn from UI later

// ===========================================
// Responsive Canvas and Auto-Grid Helpers
// ===========================================

function resizeAndScaleCanvasForDevicePixelRatio(canvasElement, renderingContext2D) {
    const devicePixelRatio = window.devicePixelRatio || 1;

    const cssWidth = canvasElement.clientWidth;
    const cssHeight = canvasElement.clientHeight;

    canvasElement.width = Math.max(1, Math.floor(cssWidth * devicePixelRatio));
    canvasElement.height = Math.max(1, Math.floor(cssHeight * devicePixelRatio));

    renderingContext2D.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

function computeMaxPathXCell(pathCells) {
    return pathCells.reduce((maximum, cell) => Math.max(maximum, cell.x), 0);
}

// Centers a multi-cell footprint on its geometric middle.
// gridX, gridY are the TOP-LEFT cell of the footprint.
function footprintCenterPixels(gridX, gridY, sizeCells, cellSize) {
    const half = sizeCells * cellSize / 2;
    return {
        x: gridX * cellSize + half,
        y: gridY * cellSize + half,
    };
}

function isAreaOnPath(gridMap, topLeftX, topLeftY, sizeCells) {
    for (let gx = topLeftX; gx < topLeftX + sizeCells; gx += 1) {
        for (let gy = topLeftY; gy < topLeftY + sizeCells; gy += 1) {
            if (gridMap.isGridCellOnPath(gx, gy)) return true;
        }
    }
    return false;
}

function doesAreaOverlapAnyTower(gameState, topLeftX, topLeftY, sizeCells) {
    return gameState.towers.some(t => {
        const s = Math.max(1, Math.floor(Number(t.sizeCells ?? 1)));
        const ax1 = topLeftX, ay1 = topLeftY;
        const ax2 = topLeftX + sizeCells, ay2 = topLeftY + sizeCells;
        const bx1 = t.gridX, by1 = t.gridY;
        const bx2 = t.gridX + s, by2 = t.gridY + s;
        // AABB overlap in grid coords
        return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
    });
}


function recomputeGridForCanvas(configuration, gameState, renderer, gameCanvas) {
    // Optionally auto-scale grid cell size based on canvas CSS width
    if (configuration.autoScaleGridCellSize) {
        const maximumPathX = computeMaxPathXCell(configuration.map.pathCells);
        const desiredColumnCount = Math.max(maximumPathX + 2, 24);

        const cssWidth = gameCanvas.clientWidth;
        const computedGridCellSize = Math.floor(cssWidth / desiredColumnCount);

        configuration.gridCellSize = Math.max(
            configuration.minGridCellSize,
            Math.min(configuration.maxGridCellSize, computedGridCellSize)
        );
    }

    // Rebuild the grid using CSS-pixel geometry
    gameState.gridMap = new GridMap(configuration, gameCanvas);
    renderer.gridMap = gameState.gridMap;

    // ===== Preserve & realign towers (no wipe) =====
    // Towers already store gridX/gridY; recompute pixel centers for new cell size.
    for (const tower of gameState.towers) {
        tower.x = tower.gridX * configuration.gridCellSize + configuration.gridCellSize / 2;
        tower.y = tower.gridY * configuration.gridCellSize + configuration.gridCellSize / 2;
    }

    // ===== Rebind/snap enemies to the new path =====
    // 1) Point each enemy to the new waypoint list
    // 2) Snap its (x,y) onto the closest point of the new polyline so it stays on-path
    //    and set currentWaypointIndex to the next waypoint after the closest segment.
    const waypoints = gameState.gridMap.waypoints;
    if (Array.isArray(waypoints) && waypoints.length >= 2) {
        for (const enemy of gameState.enemies) {
            enemy.waypoints = waypoints;

            // Find closest segment on the new path
            let best = { distance: Infinity, x: enemy.x, y: enemy.y, segIndex: 0, t: 0 };
            for (let i = 0; i < waypoints.length - 1; i += 1) {
                const a = waypoints[i];
                const b = waypoints[i + 1];
                const proj = projectPointOntoSegment({ x: enemy.x, y: enemy.y }, a, b);
                if (proj.distance < best.distance) {
                    best = { distance: proj.distance, x: proj.x, y: proj.y, segIndex: i, t: proj.t };
                }
            }

            // Snap enemy to the new path
            enemy.x = best.x;
            enemy.y = best.y;

            // Advance index to the segment's endpoint we are headed toward.
            // (Movement system will continue from here cleanly.)
            enemy.currentWaypointIndex = Math.min(best.segIndex + 1, waypoints.length - 1);
        }
    }
}

function forEachFootprintCell(gridX, gridY, sizeCells, fn) {
    for (let x = gridX; x < gridX + sizeCells; x += 1) {
        for (let y = gridY; y < gridY + sizeCells; y += 1) {
            fn(x, y);
        }
    }
}

function handleWindowResize(configuration, gameState, renderer, gameCanvas, renderingContext2D) {
    resizeAndScaleCanvasForDevicePixelRatio(gameCanvas, renderingContext2D);
    recomputeGridForCanvas(configuration, gameState, renderer, gameCanvas);
}

// ===========================================
// Canvas, Context, and UI Bindings
// ===========================================

const gameCanvas = document.getElementById("gameCanvas");
const renderingContext2D = gameCanvas.getContext("2d");
const userInterface = createUserInterfaceBindings();

// ===========================================
// Configuration (shallow copy; functions remain referenced)
// ===========================================

const configuration = {
    ...GAME_CONFIG,
    map: { ...GAME_CONFIG.map },
    towersByTypeKey: { ...GAME_CONFIG.towersByTypeKey },
};

// Enable responsive grid and scaling
configuration.autoScaleGridCellSize = true;
configuration.minGridCellSize = 20;
configuration.maxGridCellSize = 80;

// ===========================================
// Game State and Factories
// ===========================================

const gameState = {
    configuration,
    gridMap: null,
    money: 0,
    lives: 0,
    currentWaveNumber: 0,
    autoStartNextWave: false,
    enemies: [],
    towers: [],
    projectiles: [],
    floatingTexts: [],

    // Particles & visual FX (new)
    // - particles: short-lived visual fragments (explosion debris / embers)
    // - decals: longer-lived static marks (scorch)
    // - screenFlash: used to show a quick white flash on big explosions
    particles: [],       // array of { type: 'fragment'|'scorch', x, y, vx, vy, lifeMs, maxLifeMs, size, color, ... }
    decals: [],          // array of long life persistent decals (scorch marks), rendered beneath entities
    screenFlash: {       // simple one-shot screen flash: { alpha: 0..1, ttlMs }
        alpha: 0,
        ttlMs: 0
    },

    // Admin / runtime modifiers
    modifiers: {
        towerDamageMultiplier: 1, // <= Admin panel will change this
    },
    factories: {
        // Use the current grid's waypoints at creation time (no stale closure)
        createEnemy: (statBlock) => new EnemyEntity(statBlock, gameState.gridMap.waypoints),

        createTower: (towerTypeKey, gridX, gridY) => {
            const definition = { ...configuration.towersByTypeKey[towerTypeKey] };
            const sizeCells = Math.max(1, Math.floor(Number(definition.sizeCells ?? 1)));

            const { x: pixelX, y: pixelY } = footprintCenterPixels(
                gridX,
                gridY,
                sizeCells,
                configuration.gridCellSize
            );

            return new TowerEntity(definition, pixelX, pixelY, gridX, gridY, towerTypeKey);
        },

    },
};


// Create map and renderer (grid will be recomputed in initialize())
gameState.gridMap = new GridMap(configuration, gameCanvas);
const renderer = new CanvasRenderer(renderingContext2D, gameState.gridMap, configuration);

// ===========================================
// Systems
// ===========================================

const movementSystem = new MovementSystem();
const combatSystem = new CombatSystem(() => userInterface.targetingModeSelect.value);
const floatingTextSystem = new FloatingTextSystem();
const waveSpawnerSystem = new WaveSpawnerSystem(
    WavePlanFactory,
    EnemyStatFactories,
    (completedWaveNumber, currentGameState) => {
        const moreWavesRemain = completedWaveNumber < configuration.maximumWaveNumber;
        const playerIsAlive = currentGameState.lives > 0;

        if (
            currentGameState.autoStartNextWave &&
            moreWavesRemain &&
            playerIsAlive &&
            !waveSpawnerSystem.isActive
        ) {
            // Small breathing room before the next wave starts
            setTimeout(() => {
                if (!waveSpawnerSystem.isActive) {
                    waveSpawnerSystem.startWave(currentGameState);
                }
            }, 800);
        }
    }
);


// ===========================================
// UI Behavior (with toggleable selection)
// ===========================================

let selectedTowerTypeKey = null;
let selectedTowerButtonElement = null;
let lastPlacedTower = null;

// Drag-to-place state
let isDragPlacing = false;
let lastDragPlacedCellKey = null; // "x,y" guard so we don't double-place in same cell while dragging

function clearPlacementSelection() {
    selectedTowerTypeKey = null;
    if (selectedTowerButtonElement) {
        selectedTowerButtonElement.classList.remove("selected");
        selectedTowerButtonElement = null;
    }
    renderer.setHoverPreview(null);
    renderer.setPlacementGhost(null);
}

function selectTowerType(towerTypeKey, buttonElement) {
    // Toggle off if the same button is clicked again
    if (selectedTowerTypeKey === towerTypeKey && selectedTowerButtonElement === buttonElement) {
        clearPlacementSelection();
        return;
    }

    selectedTowerTypeKey = towerTypeKey;

    if (selectedTowerButtonElement) {
        selectedTowerButtonElement.classList.remove("selected");
    }
    selectedTowerButtonElement = buttonElement;
    selectedTowerButtonElement.classList.add("selected");
}

/**
 * Attempts to place the currently selected tower at (gridX, gridY).
 * Returns true if a tower was placed, else false.
 */
function tryPlaceSelectedTowerAtCell(gridX, gridY) {
    if (!selectedTowerTypeKey) return false;

    const def = configuration.towersByTypeKey[selectedTowerTypeKey];
    if (!def) return false;

    const sizeCells = Math.max(1, Math.floor(Number(def.sizeCells ?? 1)));

    // Clamp to keep the full footprint in-bounds
    const maxX = gameState.gridMap.gridColumnCount - sizeCells;
    const maxY = gameState.gridMap.gridRowCount - sizeCells;
    const topLeftX = Math.min(Math.max(0, gridX), maxX);
    const topLeftY = Math.min(Math.max(0, gridY), maxY);

    const isOnPath = isAreaOnPath(gameState.gridMap, topLeftX, topLeftY, sizeCells);
    const isOccupied = doesAreaOverlapAnyTower(gameState, topLeftX, topLeftY, sizeCells);
    if (isOnPath || isOccupied) return false;

    // Cost check
    if (gameState.money < def.buildCost) {
        toast.warn("You do not have enough money for that tower.", {
            title: "Insufficient Funds",
            durationMs: 2500,
            coalesceKey: "insufficient-funds"
        });
        return false;
    }

    gameState.money -= def.buildCost;

    const tower = gameState.factories.createTower(selectedTowerTypeKey, topLeftX, topLeftY);
    gameState.towers.push(tower);
    lastPlacedTower = tower;

    updateTowerButtonsDisableState(gameState);
    refreshStatsPanel(userInterface, gameState, configuration);
    return true;
}




buildTowerButtonsFromConfig(userInterface, configuration, selectTowerType);

// ===========================================
// Register UI Event Listseners
// ===========================================

userInterface.refundLastTowerButton.addEventListener("click", () => {
    if (!lastPlacedTower) return;

    const refundAmount = Math.floor(
        configuration.towersByTypeKey[lastPlacedTower.towerTypeKey].buildCost * configuration.towerRefundRate
    );

    gameState.money += refundAmount;
    gameState.towers = gameState.towers.filter((tower) => tower !== lastPlacedTower);
    lastPlacedTower = null;

    updateTowerButtonsDisableState(gameState);

    refreshStatsPanel(userInterface, gameState, configuration);
});

userInterface.startWaveButton.addEventListener("click", () => {
    if (!waveSpawnerSystem.isActive) {
        waveSpawnerSystem.startWave(gameState);
    }
});

userInterface.gridCellSizeInput.addEventListener("change", () => {
    const newGridCellSize = Number(userInterface.gridCellSizeInput.value);
    configuration.gridCellSize = newGridCellSize;

    gameState.gridMap = new GridMap(configuration, gameCanvas);
    renderer.gridMap = gameState.gridMap;

    gameState.towers.length = 0;
});

userInterface.autoStartNextWaveCheckbox.addEventListener("change", (event) => {
    gameState.autoStartNextWave = Boolean(event.target.checked);
});

// ===========================================
// Admin Panel (hacker sandbox)
// ===========================================

// Helper so admin can programmatically select a tower after adding it
function findShopButtonForTowerKey(key) {
    return document.querySelector(`.towerButton[data-tower-type="${key}"]`) ||
        document.querySelector(`.tower-button[data-tower-type="${key}"]`);
}

// ===========================================
// Map Designer (admin-driven, live overlay on main canvas)
// (Place this ABOVE mapDesignerHooks and ABOVE createAdminPanel call.)
// ===========================================
const mapDesigner = {
    isActive: false,
    tool: "path",            // "path" | "erase"
    workingPath: [],
    dragPainting: false,

    // snapshot so enabling gives a fresh canvas, and you can restore if you CANCEL
    stash: null,             // { towers, enemies, projectiles, money, lives, currentWaveNumber, spawnerActive }
    didCommitLast: false,    // if you commit, we don't restore the stash on disable
};

// Start with a blank workingPath (fresh canvas)
function startBlankWorkingPath() {
    mapDesigner.workingPath = [];
}

function clonePathCellsFromConfig() {
    const src = configuration?.map?.pathCells ?? [];
    return src.map(c => ({ x: c.x | 0, y: c.y | 0 }));
}

function setWorkingFromConfig() {
    mapDesigner.workingPath = clonePathCellsFromConfig();
}

function exportWorkingJSON() {
    return JSON.stringify(mapDesigner.workingPath, null, 2);
}

function loadWorkingFromJSON(text) {
    try {
        const arr = JSON.parse(text);
        if (!Array.isArray(arr)) return false;
        mapDesigner.workingPath = arr
            .map(o => ({ x: Number(o.x) | 0, y: Number(o.y) | 0 }))
            .filter(o => Number.isFinite(o.x) && Number.isFinite(o.y));
        return true;
    } catch { return false; }
}

function commitWorkingToConfigAndRebuild() {
    // Validate before committing
    const { ok, reason } = validateWorkingPath(mapDesigner.workingPath, gameState.gridMap);
    if (!ok) {
        toast.error(reason || "Invalid path.", { title: "Map Designer", durationMs: 4000 });
        return;
    }

    // Replace map path with a deep copy of the working path
    configuration.map.pathCells = mapDesigner.workingPath.map(c => ({ x: c.x | 0, y: c.y | 0 }));

    // Recompute grid & realign entities
    recomputeGridForCanvas(configuration, gameState, renderer, gameCanvas);

    // From here on, consider this a new run — don't restore previous stash on disable
    mapDesigner.didCommitLast = true;
}

function snapToGrid(px, py) {
    const size = configuration.gridCellSize;
    return { gx: Math.floor(px / size), gy: Math.floor(py / size) };
}

function cellIndexInWorking(gx, gy) {
    return mapDesigner.workingPath.findIndex(c => c.x === gx && c.y === gy);
}

function addCell(gx, gy) {
    if (gx < 0 || gy < 0) return;
    if (gx >= gameState.gridMap.gridColumnCount || gy >= gameState.gridMap.gridRowCount) return;
    if (cellIndexInWorking(gx, gy) === -1) {
        mapDesigner.workingPath.push({ x: gx, y: gy });
    }
}

function eraseCell(gx, gy) {
    const i = cellIndexInWorking(gx, gy);
    if (i >= 0) mapDesigner.workingPath.splice(i, 1);
}

const mapDesignerHooks = {
    enable() {
        // Snapshot gameplay so editor starts with a fresh canvas
        mapDesigner.stash = {
            towers: [...gameState.towers],
            enemies: [...gameState.enemies],
            projectiles: [...gameState.projectiles],
            money: gameState.money,
            lives: gameState.lives,
            currentWaveNumber: gameState.currentWaveNumber,
            spawnerActive: !!waveSpawnerSystem.isActive,
        };

        // Fresh canvas: stop action and clear everything visible
        waveSpawnerSystem.isActive = false;
        gameState.towers.length = 0;
        gameState.enemies.length = 0;
        gameState.projectiles.length = 0;

        // Fresh working path by request
        startBlankWorkingPath();

        mapDesigner.didCommitLast = false;
        mapDesigner.isActive = true;
        mapDesigner.dragPainting = false;
    },
    disable() {
        mapDesigner.isActive = false;
        mapDesigner.dragPainting = false;

        // If the user did not commit, restore the snapshot so nothing is lost
        if (mapDesigner.stash && !mapDesigner.didCommitLast) {
            gameState.towers = mapDesigner.stash.towers;
            gameState.enemies = mapDesigner.stash.enemies;
            gameState.projectiles = mapDesigner.stash.projectiles;
            gameState.money = mapDesigner.stash.money;
            gameState.lives = mapDesigner.stash.lives;
            gameState.currentWaveNumber = mapDesigner.stash.currentWaveNumber;
            waveSpawnerSystem.isActive = mapDesigner.stash.spawnerActive;
        }

        mapDesigner.stash = null;
    },
    clear() {
        // Keep editor active so painting can resume immediately after a clear
        mapDesigner.isActive = true;
        mapDesigner.dragPainting = false;

        // Reset tool to PATH to ensure clicks add cells (not erase)
        mapDesigner.tool = "path";

        // Wipe both working and committed paths
        mapDesigner.workingPath = [];
        configuration.map.pathCells = [];

        // Fresh grid (blank path)
        recomputeGridForCanvas(configuration, gameState, renderer, gameCanvas);

        // Make sure the overlay points at the (now empty) working path; update() will keep it in sync
        if (renderer.setMapDesignerOverlay) {
            renderer.setMapDesignerOverlay(mapDesigner.workingPath);
        }
    },
    startBlank() {
        startBlankWorkingPath();
    },
    setTool(tool) {
        mapDesigner.tool = tool === "erase" ? "erase" : "path";
    },
    getExportText() {
        return exportWorkingJSON();
    },
    loadFromJSON(text) {
        return loadWorkingFromJSON(text);
    },
    commitToConfig() {
        commitWorkingToConfigAndRebuild();
    }
};

function validateWorkingPath(path, grid) {
    // must have at least 2 cells
    if (!Array.isArray(path) || path.length < 2) {
        return { ok: false, reason: "Path must have at least START and END cells." };
    }

    const cols = grid.gridColumnCount;
    const rows = grid.gridRowCount;

    // helper: is cell within grid bounds
    const inBounds = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;

    // helper: edge cell?
    const isEdge = (x, y) => (x === 0 || y === 0 || x === cols - 1 || y === rows - 1);

    // 1) All cells must be in-bounds
    for (const c of path) {
        if (!inBounds(c.x, c.y)) {
            return { ok: false, reason: `Cell (${c.x},${c.y}) is out of bounds.` };
        }
    }

    // 2) START and END must be on an edge
    const start = path[0];
    const end = path[path.length - 1];
    if (!isEdge(start.x, start.y)) {
        return { ok: false, reason: "START cell must be on the grid edge." };
    }
    if (!isEdge(end.x, end.y)) {
        return { ok: false, reason: "END cell must be on the grid edge." };
    }

    // 3) Contiguity: every step must be 4-neighbor adjacent (Manhattan distance == 1)
    for (let i = 1; i < path.length; i += 1) {
        const a = path[i - 1], b = path[i];
        const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
        if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) {
            return { ok: false, reason: `Path is not contiguous at (${a.x},${a.y}) → (${b.x},${b.y}).` };
        }
    }

    return { ok: true };
}



const adminPanel = createAdminPanel(document, gameState, configuration, {
    rebuildTowerButtons: () => {
        // Rebuild and keep current selection if still present
        const previous = selectedTowerTypeKey;
        buildTowerButtonsFromConfig(userInterface, configuration, selectTowerType);

        // Re-run disabled state logic after any price changes/new towers
        updateTowerButtonsDisableState(gameState);

        if (previous && configuration.towersByTypeKey[previous]) {
            const btn = findShopButtonForTowerKey(previous);
            if (btn) selectTowerType(previous, btn);
        }
    },
    selectTowerType: (key) => {
        const btn = findShopButtonForTowerKey(key);
        if (btn) selectTowerType(key, btn);
    },
    mapDesignerHooks,
    startWaveNow: () => {
        if (!waveSpawnerSystem.isActive) {
            waveSpawnerSystem.startWave(gameState);
        }
    }
});

const openAdminButton = document.getElementById("openAdminPanelButton");
if (openAdminButton) {
    openAdminButton.addEventListener("click", () => adminPanel.toggle());
}

// Global hotkeys: F10 or ` (backtick) toggles panel
window.addEventListener("keydown", (evt) => {
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    const typing = activeTag === "input" || activeTag === "textarea" || activeTag === "select" || document.activeElement?.isContentEditable;
    if (typing) return;

    if (evt.code === "F10" || evt.key === "`") {
        evt.preventDefault();
        adminPanel.toggle();
    }
});

// ===========================================
// Pointer Interactions (hover -> tower range or placement ghost)
// ===========================================

function getCanvasBoundingClientRect() {
    return gameCanvas.getBoundingClientRect();
}

function showTowerTooltip(userInterface, tower, mouseClientX, mouseClientY) {
    const tooltipElement = userInterface.towerInfoTooltip;
    if (!tooltipElement) return;

    // --- Stats to display ---
    const attacksPerSecond = Number(tower.attacksPerSecond ?? 0);
    const baseDamagePerShot = Number(tower.damagePerShot ?? 0);
    const attackRangePixels = Number(tower.attackRangePixels ?? 0);
    const buildCost = Number(tower.buildCost ?? 0);

    // Global damage multiplier from admin modifiers (defaults to 1)
    const globalMult = Math.max(0, Number(gameState?.modifiers?.towerDamageMultiplier ?? 1));
    const effectiveDamagePerShot = Math.max(0, Math.round(baseDamagePerShot * globalMult));

    const splashRadius =
        tower?.splash && Number.isFinite(tower.splash.radiusPixels)
            ? Number(tower.splash.radiusPixels)
            : null;

    tooltipElement.innerHTML = `
    <div class="titleRow" style="color:${tower.uiColor}">
      <span class="colorSwatch" style="color:${tower.uiColor}; background:${tower.uiColor}"></span>
      <span>${tower.displayName}</span>
    </div>
    <div class="statRow">
      <span class="label">Type</span><span>${tower.towerTypeKey}</span>
    </div>
    <div class="statRow">
      <span class="label">Damage / Shot</span>
      <span>${baseDamagePerShot} <span style="color:#9fb3c8;">(${effectiveDamagePerShot})</span></span>
    </div>
    <div class="statRow">
      <span class="label">Damage Type</span><span>${tower.damageType || "physical"}</span>
    </div>
    <div class="statRow">
      <span class="label">Attacks / Sec</span><span>${attacksPerSecond.toFixed(2)}</span>
    </div>
    <div class="statRow">
      <span class="label">Range (px)</span><span>${attackRangePixels}</span>
    </div>
    ${splashRadius !== null ? `
    <div class="statRow">
      <span class="label">Splash (px)</span><span>${splashRadius}</span>
    </div>` : ``}
    <div class="statRow">
      <span class="label">Build Cost</span><span>$${buildCost}</span>
    </div>
    ${globalMult !== 1 ? `
    <div class="statRow">
      <span class="label">Global Dmg Mult</span><span>x${Number(globalMult).toFixed(2)}</span>
    </div>` : ``}
  `;

    // Show + position (CSS uses .visible to fade in)
    tooltipElement.style.display = "block";
    tooltipElement.classList.add("visible");

    const offsetX = 16;
    const offsetY = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Reset to measure
    tooltipElement.style.left = "0px";
    tooltipElement.style.top = "0px";
    const rect = tooltipElement.getBoundingClientRect();

    const desiredLeft = Math.min(mouseClientX + offsetX, Math.max(8, viewportWidth - rect.width - 8));
    const desiredTop = Math.min(mouseClientY + offsetY, Math.max(8, viewportHeight - rect.height - 8));

    tooltipElement.style.left = `${desiredLeft}px`;
    tooltipElement.style.top = `${desiredTop}px`;
}



function hideTowerTooltip(userInterface) {
    const tooltipElement = userInterface.towerInfoTooltip;
    if (!tooltipElement) return;

    // Fade out (CSS handles opacity); then display:none after transition
    tooltipElement.classList.remove("visible");

    // Optional: wait for transition before fully hiding
    // Keep it simple/robust if transitions are disabled:
    tooltipElement.style.display = "none";
}

function findTowerUnderPointer(gameState, mouseX, mouseY) {
    const pickRadiusPixels = 14;
    for (let i = gameState.towers.length - 1; i >= 0; i -= 1) {
        const tower = gameState.towers[i];
        const dx = mouseX - tower.x;
        const dy = mouseY - tower.y;
        if (dx * dx + dy * dy <= pickRadiusPixels * pickRadiusPixels) {
            return tower;
        }
    }
    return null;
}

/**
 * Applies a disabled style to tower shop buttons when the player cannot afford them.
 * Sources cost from:
 *   1) gameState.configuration.towersByTypeKey[key].buildCost
 *   2) window.GAME_CONFIG.towersByTypeKey[key].buildCost (fallback)
 *   3) Parses "$<num>" from button text as last resort
 */
function updateTowerButtonsDisableState(gameState) {
    // --- HARD INSTRUMENTATION: this should always print once per call ---
    const config = gameState?.configuration?.towersByTypeKey || {};
    const fallback = (window?.GAME_CONFIG?.towersByTypeKey) || {};

    const buttons = document.querySelectorAll('.towerButton[data-tower-type], .tower-button[data-tower-type]');

    buttons.forEach((btn) => {
        const key = btn.getAttribute('data-tower-type') || btn.dataset.towerType;

        // 1) Primary source
        let cost = config[key]?.buildCost;

        // 2) Fallback to global GAME_CONFIG if needed
        if (!Number.isFinite(cost)) {
            cost = fallback[key]?.buildCost;
        }

        // 3) Last-resort: parse from button text, e.g., "Sniper ($60)"
        if (!Number.isFinite(cost)) {
            const match = /\$\s*([\d.]+)/.exec(btn.textContent);
            cost = match ? Number(match[1]) : NaN;
        }

        const isValidCost = Number.isFinite(cost);
        const canAfford = isValidCost && (Number(gameState?.money ?? 0) >= cost);

        if (canAfford) {
            btn.classList.remove('is-disabled');
            btn.removeAttribute('disabled');
        } else {
            btn.classList.add('is-disabled');
            btn.setAttribute('disabled', 'disabled');
        }
    });
}

// Expose a manual trigger in module scope so you can call it from DevTools:
// > __affordanceTest()
window.__affordanceTest = () => updateTowerButtonsDisableState(gameState);



gameCanvas.addEventListener("mousemove", (mouseEvent) => {
    const rect = getCanvasBoundingClientRect();
    const mouseX = mouseEvent.clientX - rect.left;
    const mouseY = mouseEvent.clientY - rect.top;

    const gridX = Math.floor(mouseX / configuration.gridCellSize);
    const gridY = Math.floor(mouseY / configuration.gridCellSize);

    // 1) If hovering an existing tower, show range + tooltip; hide placement ghost
    const hoveredTower = findTowerUnderPointer(gameState, mouseX, mouseY);
    if (hoveredTower) {
        renderer.setPlacementGhost(null);
        renderer.setHoverPreview({
            x: hoveredTower.x,
            y: hoveredTower.y,
            radiusPixels: hoveredTower.attackRangePixels,
            strokeColor: hoveredTower.uiColor,
        });
        showTowerTooltip(userInterface, hoveredTower, mouseEvent.clientX, mouseEvent.clientY);
    } else {
        hideTowerTooltip(userInterface);

        // 2) Placement mode ghost + range ring (always compute; also mark invalid)
        const towerDefinition = selectedTowerTypeKey
            ? configuration.towersByTypeKey[selectedTowerTypeKey]
            : null;

        if (towerDefinition) {
            const sizeCells = Math.max(1, Math.floor(Number(towerDefinition.sizeCells ?? 1)));

            // Clamp footprint to grid
            const maxX = gameState.gridMap.gridColumnCount - sizeCells;
            const maxY = gameState.gridMap.gridRowCount - sizeCells;
            const topLeftX = Math.min(Math.max(0, gridX), maxX);
            const topLeftY = Math.min(Math.max(0, gridY), maxY);

            const center = footprintCenterPixels(
                topLeftX,
                topLeftY,
                sizeCells,
                configuration.gridCellSize
            );

            const isOnPath = isAreaOnPath(gameState.gridMap, topLeftX, topLeftY, sizeCells);
            const isOccupied = doesAreaOverlapAnyTower(gameState, topLeftX, topLeftY, sizeCells);
            const isValid = !isOnPath && !isOccupied;

            renderer.setPlacementGhost({
                x: center.x,
                y: center.y,
                uiColor: towerDefinition.uiColor,
                towerTypeKey: selectedTowerTypeKey,
                isValid,
                sizeCells, // <<< important for ghost size
            });

            renderer.setHoverPreview({
                x: center.x,
                y: center.y,
                radiusPixels: towerDefinition.attackRangePixels,
                strokeColor: towerDefinition.uiColor,
            });
        } else {
            renderer.setPlacementGhost(null);
            renderer.setHoverPreview(null);
        }
    }

    // 3) Drag-to-place: place when you move into a new valid cell
    if (isDragPlacing && selectedTowerTypeKey) {
        const cellKey = `${gridX},${gridY}`;
        if (cellKey !== lastDragPlacedCellKey) {
            // Only attempt placement if cell is not on path or occupied
            const isOnPath = gameState.gridMap.isGridCellOnPath(gridX, gridY);
            const isOccupied = gameState.towers.some((t) => t.gridX === gridX && t.gridY === gridY);
            if (!isOnPath && !isOccupied) {
                if (tryPlaceSelectedTowerAtCell(gridX, gridY)) {
                    lastDragPlacedCellKey = cellKey;
                } else {
                    // If we fail due to funds, stop dragging to avoid spam
                    if (gameState.money <= 0) {
                        isDragPlacing = false;
                        lastDragPlacedCellKey = null;
                    }
                }
            } else {
                // moving through invalid cells shouldn't reset the guard;
                // only reset when we actually place or leave drag mode
            }
        }
    }
});

gameCanvas.addEventListener("mouseleave", () => {
    // Clear visuals when the cursor leaves the canvas
    renderer.setPlacementGhost(null);
    renderer.setHoverPreview(null);
    hideTowerTooltip(userInterface);
});

gameCanvas.addEventListener("click", (mouseEvent) => {
    const rect = getCanvasBoundingClientRect();
    const mouseX = mouseEvent.clientX - rect.left;
    const mouseY = mouseEvent.clientY - rect.top;

    const gridX = Math.floor(mouseX / configuration.gridCellSize);
    const gridY = Math.floor(mouseY / configuration.gridCellSize);

    tryPlaceSelectedTowerAtCell(gridX, gridY);
});

gameCanvas.addEventListener("mousedown", (mouseEvent) => {
    if (!selectedTowerTypeKey) return;
    isDragPlacing = true;
    lastDragPlacedCellKey = null;

    const rect = getCanvasBoundingClientRect();
    const mouseX = mouseEvent.clientX - rect.left;
    const mouseY = mouseEvent.clientY - rect.top;
    const gridX = Math.floor(mouseX / configuration.gridCellSize);
    const gridY = Math.floor(mouseY / configuration.gridCellSize);

    // place immediately where drag begins
    if (tryPlaceSelectedTowerAtCell(gridX, gridY)) {
        lastDragPlacedCellKey = `${gridX},${gridY}`;
    }
});

window.addEventListener("mouseup", () => {
    isDragPlacing = false;
    lastDragPlacedCellKey = null;
});

gameCanvas.addEventListener("mouseleave", () => {
    isDragPlacing = false;
    lastDragPlacedCellKey = null;
});

// --- Map Designer pointer handlers ---
gameCanvas.addEventListener("mousedown", (e) => {
    if (!mapDesigner.isActive) return;
    const rect = getCanvasBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const { gx, gy } = snapToGrid(mouseX, mouseY);

    if (mapDesigner.tool === "erase") eraseCell(gx, gy);
    else addCell(gx, gy);

    mapDesigner.dragPainting = true;
});

gameCanvas.addEventListener("mousemove", (e) => {
    if (!mapDesigner.isActive || !mapDesigner.dragPainting) return;
    const rect = getCanvasBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const { gx, gy } = snapToGrid(mouseX, mouseY);
    if (mapDesigner.tool === "erase") eraseCell(gx, gy);
    else addCell(gx, gy);
});

["mouseup", "mouseleave"].forEach(type => {
    gameCanvas.addEventListener(type, () => {
        if (mapDesigner.isActive) mapDesigner.dragPainting = false;
    });
});




// Allow ESC to toggle selection off
window.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape") {
        clearPlacementSelection();
    }
});

// ===========================================
// Game Loop
// ===========================================

let lastFrameTimestamp = performance.now();

function animationFrame(timestamp) {
    const deltaSeconds = (timestamp - lastFrameTimestamp) / 1000;
    lastFrameTimestamp = timestamp;

    update(deltaSeconds);
    renderer.drawFrame(gameState);
    requestAnimationFrame(animationFrame);
}

function update(deltaSeconds) {
    movementSystem.tick(gameState, deltaSeconds);
    combatSystem.tick(gameState, deltaSeconds);
    waveSpawnerSystem.tick(gameState, deltaSeconds);
    floatingTextSystem.tick(gameState, deltaSeconds); // << new

    updateTowerButtonsDisableState(gameState);

    if (gameState.lives <= 0) {
        toast.error("You ran out of lives. Click to restart run.", {
            title: "Game Over",
            durationMs: 7000,
            onClick: () => resetGameState(),
        });
    }

    // Persist the overlay path on the renderer; draw happens in drawFrame.
    renderer.setMapDesignerOverlay(mapDesigner.isActive ? mapDesigner.workingPath : null);


    refreshStatsPanel(userInterface, gameState, configuration);
}

function resetGameState() {
    gameState.money = configuration.startingMoney;
    gameState.lives = configuration.startingLives;
    gameState.currentWaveNumber = 0;
    gameState.enemies.length = 0;
    gameState.towers.length = 0;
    gameState.projectiles.length = 0;
}

// ===========================================
// Initialize
// ===========================================

function initialize() {
    // Set up responsive canvas and grid before anything else
    handleWindowResize(configuration, gameState, renderer, gameCanvas, renderingContext2D);
    window.addEventListener("resize", () =>
        handleWindowResize(configuration, gameState, renderer, gameCanvas, renderingContext2D)
    );

    initializeToastService(document);

    // Default is bottom-center; you can set it explicitly:
    setToastPosition("bottom-center");

    // Initialize core stats
    gameState.money = configuration.startingMoney;
    gameState.lives = configuration.startingLives;

    // NEW: set initial disabled/enabled states
    updateTowerButtonsDisableState(gameState);

    // Optional starter towers for demo
    // gameState.towers.push(gameState.factories.createTower("basic", 3, 9));
    // gameState.towers.push(gameState.factories.createTower("sniper", 9, 4));
    // gameState.towers.push(gameState.factories.createTower("splash", 16, 10));

    refreshStatsPanel(userInterface, gameState, configuration);
    requestAnimationFrame(animationFrame);
}

initialize();
