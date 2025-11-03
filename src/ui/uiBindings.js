// ===========================================
// File: src/ui/uiBindings.js
// ===========================================

/**
 * Collects and returns all DOM elements used by the UI.
 * This must match the ids/classes referenced by main.js and site.css.
 */
export function createUserInterfaceBindings() {
    return {
        // Panels & containers
        towerButtonRow: document.getElementById("towerButtonRow"),

        // Stats panel
        statsContainer: document.getElementById("statsContainer"),
        moneyValue: document.getElementById("moneyValue"),
        livesValue: document.getElementById("livesValue"),
        currentWaveValue: document.getElementById("currentWaveValue"),
        maxWaveValue: document.getElementById("maxWaveValue"),
        enemiesAliveValue: document.getElementById("enemiesAliveValue"),

        // Controls
        startWaveButton: document.getElementById("startWaveButton"),
        refundLastTowerButton: document.getElementById("refundLastTowerButton"),
        targetingModeSelect: document.getElementById("targetingModeSelect"),
        gridCellSizeInput: document.getElementById("gridCellSizeInput"),
        autoStartNextWaveCheckbox: document.getElementById("autoStartNextWaveCheckbox"),

        // Tooltip
        towerInfoTooltip: document.getElementById("towerInfoTooltip"),
    };
}

/**
 * Builds the Tower buttons in the sidebar from the game configuration.
 * IMPORTANT for affordance/disable logic:
 *  - Each button gets class "towerButton"
 *  - Each button sets data-tower-type="<towerKey>"
 *
 * @param {ReturnType<typeof createUserInterfaceBindings>} ui
 * @param {Object} configuration - expects configuration.towersByTypeKey
 * @param {(towerTypeKey: string, buttonEl: HTMLButtonElement) => void} onSelectTowerType
 */
export function buildTowerButtonsFromConfig(ui, configuration, onSelectTowerType) {
    const row = ui.towerButtonRow;
    if (!row) return;

    // Clear any previous buttons (rebuild-safe)
    row.innerHTML = "";

    const towers = configuration?.towersByTypeKey || {};
    for (const [towerKey, def] of Object.entries(towers)) {
        const btn = document.createElement("button");
        btn.className = "towerButton";
        // critical for disable styling and selection
        btn.setAttribute("data-tower-type", towerKey);

        // Visuals / label
        // Keep concise but informative: name + cost
        const cost = Number.isFinite(def.buildCost) ? def.buildCost : 0;
        btn.textContent = `${def.displayName || towerKey} ($${cost})`;

        // Optional: glow color via CSS variable if provided
        if (def.uiColor) {
            btn.style.setProperty("--glow-color", def.uiColor);
            btn.style.color = def.uiColor;   
        }

        // Click -> hand back to main.js’s selectTowerType
        btn.addEventListener("click", () => onSelectTowerType(towerKey, btn));

        // Hover tooltip hint (lightweight; main.js has full tooltip for placed towers)
        btn.title = `Build Cost: $${cost}`;

        row.appendChild(btn);
    }
}

/**
 * Updates the stats panel numbers.
 * Keep this tightly coupled to the DOM ids used in index.html.
 */
export function refreshStatsPanel(ui, gameState, configuration) {
    if (!ui || !gameState) return;

    if (ui.moneyValue) ui.moneyValue.textContent = String(gameState.money ?? 0);
    if (ui.livesValue) ui.livesValue.textContent = String(gameState.lives ?? 0);
    if (ui.currentWaveValue) ui.currentWaveValue.textContent = String(gameState.currentWaveNumber ?? 0);
    if (ui.maxWaveValue) ui.maxWaveValue.textContent = String(configuration?.maximumWaveNumber ?? 0);

    // Enemies alive is derived from array length of active enemies
    if (ui.enemiesAliveValue) {
        const aliveCount = (gameState.enemies || []).filter(e => !e._isMarkedDead).length;
        ui.enemiesAliveValue.textContent = String(aliveCount);
    }
}
