import { TowerUpgradeSystem } from "../systems/towerUpgradeSystem.js";
import { GAME_CONFIG } from "../config/gameConfig.js";
import { toast } from "./toast.js";

let upgradePanelElement = null;
let currentTower = null;
let currentGameState = null;

export function initializeTowerUpgradePanel(documentRoot = document) {
    upgradePanelElement = documentRoot.getElementById("towerUpgradePanel");
    if (!upgradePanelElement) {
        console.warn("towerUpgradePanel element not found in DOM");
        return;
    }
    upgradePanelElement.innerHTML = `<div class="upgradeContent"></div>`;
}

export function showTowerUpgrades(tower, gameState) {
    if (!upgradePanelElement) initializeTowerUpgradePanel();
    if (!upgradePanelElement) return;

    currentTower = tower;
    currentGameState = gameState;

    const towerCfg = GAME_CONFIG.towersByTypeKey[tower.towerTypeKey];
    if (!towerCfg?.upgrades) {
        upgradePanelElement.innerHTML = `
          <div class="upgradeContent">
            <div class="noUpgrades">No upgrades available for <strong>${tower.displayName || tower.towerTypeKey}</strong></div>
          </div>`;
        return;
    }

    const rowsHtml = Object.entries(towerCfg.upgrades).map(([key, path]) => {
        const level = tower.upgradeState?.[key] ?? 0;
        const max = path.levels.length;
        const next = path.levels[level];
        const canUpgrade = TowerUpgradeSystem.canUpgrade(tower, key, GAME_CONFIG, gameState.money);
        const disabled = !next || !canUpgrade;
        const costText = next ? `$${next.cost}` : "MAX";

        return `
          <div class="upgradeRow ${disabled ? "disabled" : ""}" data-upgrade-key="${key}">
            <div class="upgradeLabel">
              <span class="upgradeName">${path.displayName || key}</span>
              <span class="upgradeLevel">Lv ${level}/${max}</span>
            </div>
            <button class="upgradeButton" ${disabled ? "disabled" : ""}>${costText}</button>
          </div>`;
    }).join("");

    upgradePanelElement.querySelector(".upgradeContent").innerHTML = rowsHtml;

    upgradePanelElement.querySelectorAll(".upgradeButton").forEach(btn => {
        btn.addEventListener("click", () => {
            const row = btn.closest(".upgradeRow");
            const key = row?.dataset?.upgradeKey;
            if (!key) return;

            const can = TowerUpgradeSystem.canUpgrade(currentTower, key, GAME_CONFIG, currentGameState.money);
            if (!can) {
                toast.warn("Not enough money or already maxed!", { durationMs: 1600 });
                return;
            }

            const nextCost = TowerUpgradeSystem.getNextUpgradeCost(currentTower, key, GAME_CONFIG);
            currentGameState.money -= nextCost;
            TowerUpgradeSystem.applyUpgrade(currentTower, key, GAME_CONFIG);

            toast.success(`Upgraded: ${currentTower.displayName || currentTower.towerTypeKey} — ${key}`, { durationMs: 1400 });

            showTowerUpgrades(currentTower, currentGameState);
        });
    });
}

export function clearTowerUpgrades() {
    if (!upgradePanelElement) initializeTowerUpgradePanel();
    if (!upgradePanelElement) return;
    upgradePanelElement.innerHTML = `<div class="upgradeContent"><div class="noUpgrades">Select or place a tower</div></div>`;
    currentTower = null;
    currentGameState = null;
}
