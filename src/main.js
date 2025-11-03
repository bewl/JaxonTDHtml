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
    currentWaveNumber: 9,
    autoStartNextWave: false,
    enemies: [],
    towers: [],
    projectiles: [],
    floatingTexts: [],
    // Admin / runtime modifiers
    modifiers: {
        towerDamageMultiplier: 1, // <= Admin panel will change this
    },
    factories: {
        // Use the current grid's waypoints at creation time (no stale closure)
        createEnemy: (statBlock) => new EnemyEntity(statBlock, gameState.gridMap.waypoints),

        createTower: (towerTypeKey, gridX, gridY) => {
            const definition = { ...configuration.towersByTypeKey[towerTypeKey] };
            const pixelX = gridX * configuration.gridCellSize + configuration.gridCellSize / 2;
            const pixelY = gridY * configuration.gridCellSize + configuration.gridCellSize / 2;
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

    // 1) If hovering an existing tower, show its range and the info tooltip; hide placement ghost
    const hoveredTower = findTowerUnderPointer(gameState, mouseX, mouseY);
    if (hoveredTower) {
        renderer.setPlacementGhost(null);
        renderer.setHoverPreview({
            x: hoveredTower.x,
            y: hoveredTower.y,
            radiusPixels: hoveredTower.attackRangePixels,
            strokeColor: hoveredTower.uiColor,
        });

        // ✅ Show and position the tooltip (use clientX/Y for fixed positioning)
        showTowerTooltip(userInterface, hoveredTower, mouseEvent.clientX, mouseEvent.clientY);
        return;
    }

    // If not hovering a tower, hide the tooltip
    hideTowerTooltip(userInterface);

    // 2) If in placement mode, show ghost + range at the hovered cell
    const towerDefinition = selectedTowerTypeKey
        ? configuration.towersByTypeKey[selectedTowerTypeKey]
        : null;

    if (towerDefinition) {
        const centerX = gridX * configuration.gridCellSize + configuration.gridCellSize / 2;
        const centerY = gridY * configuration.gridCellSize + configuration.gridCellSize / 2;

        renderer.setPlacementGhost({
            x: centerX,
            y: centerY,
            uiColor: towerDefinition.uiColor,
            towerTypeKey: selectedTowerTypeKey,
        });

        renderer.setHoverPreview({
            x: centerX,
            y: centerY,
            radiusPixels: towerDefinition.attackRangePixels,
            strokeColor: towerDefinition.uiColor,
        });
    } else {
        // 3) No selection and not hovering a tower -> clear previews
        renderer.setPlacementGhost(null);
        renderer.setHoverPreview(null);
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

    if (!selectedTowerTypeKey) return;
    if (gameState.gridMap.isGridCellOnPath(gridX, gridY)) return;
    if (gameState.towers.some((tower) => tower.gridX === gridX && tower.gridY === gridY)) return;

    const definition = configuration.towersByTypeKey[selectedTowerTypeKey];
    if (gameState.money < definition.buildCost) {
        toast.warn("You do not have enough money for that tower.", {
            title: "Insufficient Funds",
            durationMs: 5000,
            coalesceKey: "insufficient-funds"
        });
        return;
    }

    gameState.money -= definition.buildCost;

    updateTowerButtonsDisableState(gameState);

    const tower = gameState.factories.createTower(selectedTowerTypeKey, gridX, gridY);
    gameState.towers.push(tower);
    lastPlacedTower = tower;

    refreshStatsPanel(userInterface, gameState, configuration);
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
