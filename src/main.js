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

    gameState.gridMap = new GridMap(configuration, gameCanvas);
    renderer.gridMap = gameState.gridMap;

    // Clearing towers on resize keeps the demo simple
    gameState.towers.length = 0;
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

    console.log("Grid cell size changed. Towers cleared.");
});

userInterface.autoStartNextWaveCheckbox.addEventListener("change", (event) => {
    gameState.autoStartNextWave = Boolean(event.target.checked);
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

    // Build content (keep names descriptive)
    const attacksPerSecond = tower.attacksPerSecond.toFixed(2);
    const damagePerShot = tower.damagePerShot;
    const attackRangePixels = tower.attackRangePixels;

    tooltipElement.innerHTML = `
    <div class="titleRow" style="color:${tower.uiColor}">
      <span class="colorSwatch" style="color:${tower.uiColor}; background:${tower.uiColor}"></span>
      <span>${tower.displayName}</span>
    </div>
    <div class="statRow">
      <span class="label">Type</span><span>${tower.towerTypeKey}</span>
    </div>
    <div class="statRow">
      <span class="label">Damage / Shot</span><span>${damagePerShot}</span>
    </div>
    <div class="statRow">
      <span class="label">Attacks / Sec</span><span>${attacksPerSecond}</span>
    </div>
    <div class="statRow">
      <span class="label">Range (px)</span><span>${attackRangePixels}</span>
    </div>
    <div class="statRow">
      <span class="label">Build Cost</span><span>$${tower.buildCost}</span>
    </div>
  `;

    // Position with a gentle offset; clamp to viewport
    const offsetX = 16;
    const offsetY = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    tooltipElement.style.display = "block";
    tooltipElement.style.left = "0px";
    tooltipElement.style.top = "0px";

    // Measure after visible
    const rect = tooltipElement.getBoundingClientRect();
    const desiredLeft = Math.min(mouseClientX + offsetX, Math.max(8, viewportWidth - rect.width - 8));
    const desiredTop = Math.min(mouseClientY + offsetY, Math.max(8, viewportHeight - rect.height - 8));

    tooltipElement.style.left = `${desiredLeft}px`;
    tooltipElement.style.top = `${desiredTop}px`;
}

function hideTowerTooltip(userInterface) {
    const tooltipElement = userInterface.towerInfoTooltip;
    if (tooltipElement) {
        tooltipElement.style.display = "none";
    }
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

    // Optional starter towers for demo
    // gameState.towers.push(gameState.factories.createTower("basic", 3, 9));
    // gameState.towers.push(gameState.factories.createTower("sniper", 9, 4));
    // gameState.towers.push(gameState.factories.createTower("splash", 16, 10));

    refreshStatsPanel(userInterface, gameState, configuration);
    requestAnimationFrame(animationFrame);
}

initialize();
