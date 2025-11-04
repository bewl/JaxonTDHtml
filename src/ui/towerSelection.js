import { showTowerUpgrades, clearTowerUpgrades } from "./towerUpgradePanel.js";

function pickTowerAt(gameState, pixelX, pixelY) {
    let best = null;
    let bestDist = Infinity;

    for (const t of gameState.towers) {
        const base = (typeof t.baseRadiusPixels === "number" ? t.baseRadiusPixels : 12);
        const scale = (typeof t.visualScale === "number" ? t.visualScale : 1);
        const r = base * scale + 6; // lenient hit radius
        const d = Math.hypot(pixelX - t.x, pixelY - t.y);
        if (d < r && d < bestDist) {
            best = t;
            bestDist = d;
        }
    }
    return best;
}

export function installTowerSelection(canvas, gameState) {
    if (!canvas) return;

    canvas.addEventListener("click", (evt) => {
        const rect = canvas.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const y = evt.clientY - rect.top;

        // If a tower type is selected for placement, defer to placement flow.
        // Selection is only when no tower type is currently chosen.
        const placing = !!window.selectedTowerTypeKey;
        if (placing) return;

        const hit = pickTowerAt(gameState, x, y);
        if (hit) {
            gameState.selectedTower = hit;
            showTowerUpgrades(hit, gameState);
        } else {
            gameState.selectedTower = null;
            clearTowerUpgrades();
        }
    });
}
