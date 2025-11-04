export const TowerUpgradeSystem = {
    canUpgrade(tower, category, gameConfig, playerMoney) {
        const towerCfg = gameConfig.towersByTypeKey[tower.towerTypeKey];
        const path = towerCfg?.upgrades?.[category];
        if (!path) return false;
        const nextLevel = (tower.upgradeState?.[category] ?? 0);
        const def = path.levels[nextLevel];
        if (!def) return false;
        return playerMoney >= def.cost;
    },

    getNextUpgradeCost(tower, category, gameConfig) {
        const towerCfg = gameConfig.towersByTypeKey[tower.towerTypeKey];
        const path = towerCfg?.upgrades?.[category];
        const level = (tower.upgradeState?.[category] ?? 0);
        return path?.levels?.[level]?.cost ?? null;
    },

    applyUpgrade(tower, category, gameConfig) {
        const towerCfg = gameConfig.towersByTypeKey[tower.towerTypeKey];
        const path = towerCfg?.upgrades?.[category];
        if (!path) return;

        const level = (tower.upgradeState?.[category] ?? 0);
        const def = path.levels?.[level];
        if (!def) return;

        // Apply stat multipliers (multiplicative)
        if (def.multiplier) {
            for (const key of Object.keys(def.multiplier)) {
                const factor = def.multiplier[key];
                if (Number.isFinite(tower[key])) {
                    tower[key] *= factor;
                }
            }
        }

        // Unlock new projectile effects WITHOUT losing existing ones (deep merge).
        if (def.unlocksEffect) {
            const current = tower.projectileEffects || {};

            // Support both shapes:
            //   A) { ripple: {...} }
            //   B) { projectileEffects: { ripple: {...} } }
            const additionRoot = def.unlocksEffect.projectileEffects
                ? def.unlocksEffect.projectileEffects
                : def.unlocksEffect;

            const merged = { ...current };
            for (const effectKey of Object.keys(additionRoot)) {
                const currVal = current[effectKey];
                const addVal = additionRoot[effectKey];

                if (currVal && typeof currVal === "object" && addVal && typeof addVal === "object") {
                    // Shallow merge per-effect objects so existing fields (e.g., enabled) persist.
                    merged[effectKey] = { ...currVal, ...addVal };
                } else {
                    merged[effectKey] = addVal;
                }
            }

            tower.projectileEffects = merged;
        }

        tower.upgradeState = { ...(tower.upgradeState || {}), [category]: level + 1 };
    }
};
