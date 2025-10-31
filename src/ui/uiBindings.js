export function createUserInterfaceBindings(documentRoot = document) {
  return {
    moneyValue: documentRoot.getElementById("moneyValue"),
    livesValue: documentRoot.getElementById("livesValue"),
    currentWaveValue: documentRoot.getElementById("currentWaveValue"),
    maxWaveValue: documentRoot.getElementById("maxWaveValue"),
    enemiesAliveValue: documentRoot.getElementById("enemiesAliveValue"),
    towerButtonRow: documentRoot.getElementById("towerButtonRow"),
    startWaveButton: documentRoot.getElementById("startWaveButton"),
    refundLastTowerButton: documentRoot.getElementById("refundLastTowerButton"),
    targetingModeSelect: documentRoot.getElementById("targetingModeSelect"),
    gridCellSizeInput: documentRoot.getElementById("gridCellSizeInput"),
    autoStartNextWaveCheckbox: documentRoot.getElementById("autoStartNextWaveCheckbox"),
    towerInfoTooltip: documentRoot.getElementById("towerInfoTooltip"),
  };
}

export function buildTowerButtonsFromConfig(userInterface, configuration, onSelect) {
  userInterface.towerButtonRow.innerHTML = "";
  Object.entries(configuration.towersByTypeKey).forEach(([towerTypeKey, definition]) => {
    const button = document.createElement("button");
    button.className = "towerButton";
    button.id = `towerButton-${towerTypeKey}`;
    button.style.color = definition.uiColor;
    button.innerHTML = `${definition.displayName}<br>$${definition.buildCost}`;
    button.addEventListener("click", () => onSelect(towerTypeKey, button));
    userInterface.towerButtonRow.appendChild(button);
  });
}

export function refreshStatsPanel(userInterface, gameState, configuration) {
  userInterface.moneyValue.textContent = gameState.money;
  userInterface.livesValue.textContent = gameState.lives;
  userInterface.currentWaveValue.textContent = gameState.currentWaveNumber;
  userInterface.maxWaveValue.textContent = configuration.maximumWaveNumber;
  userInterface.enemiesAliveValue.textContent = gameState.enemies.length;
}
