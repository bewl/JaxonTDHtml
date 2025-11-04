export const GAME_CONFIG = {
    gridCellSize: 40,
    startingMoney: 2000,
    startingLives: 20,
    maximumWaveNumber: 100,
    towerRefundRate: 0.6,
    projectileLerpSpeedPerSecond: 6,
    showRangeOnHover: true,
    map: {
        pathCells: [
            { x: 0, y: 5 },
            { x: 4, y: 5 },
            { x: 4, y: 2 },
            { x: 9, y: 2 },
            { x: 9, y: 8 },
            { x: 13, y: 8 },
            { x: 13, y: 3 },
            { x: 20, y: 3 },
            { x: 22, y: 3 },
        ],
        pathThicknessMultiplier: 0.6,
    },
    towersByTypeKey: {
        basic: {
            displayName: "Basic",
            uiColor: "#84cc16",
            buildCost: 30,
            attackRangePixels: 90,
            attacksPerSecond: 0.8,
            damagePerShot: 8,
            baseRadiusPixels: 8,
        },
        sniper: {
            displayName: "Sniper",
            uiColor: "#a78bfa",
            buildCost: 60,
            attackRangePixels: 220,
            attacksPerSecond: 1.6,
            damagePerShot: 28,
            baseRadiusPixels: 5,
        },
        splash: {
            displayName: "Splash",
            uiColor: "#f87171",
            buildCost: 80,
            attackRangePixels: 120,
            attacksPerSecond: 1.2,
            damagePerShot: 12,
            baseRadiusPixels: 14,
            splash: { radiusPixels: 40 },
            projectileEffects: {
                cluster: {
                    enabled: true,
                    count: 6,
                    spread: 360,
                    childDistance: 40,
                    childDistanceJitter: 20,
                    childSpeedScale: 1.25,
                    childDamageScale: 0.35,
                    childAoe: { radiusPixels: 40 },
                    childEffects: { explosion: { enabled: true, flashAlpha: 0.04, flashTtl: 80 } }
                }
            }
        },
        missile: {
            displayName: "Missile",
            uiColor: "#eeff00ff",
            buildCost: 120,
            attackRangePixels: 240,
            attacksPerSecond: 0.5,
            damagePerShot: 25,
            baseRadiusPixels: 14,
            splash: { radiusPixels: 80 },
        },
        // inside export const GAME_CONFIG = { ... towersByTypeKey: { ... } }
        nuke: {
            displayName: "Nuke",
            buildCost: 300,
            uiColor: "#ffaa00",
            damagePerShot: 400,
            attacksPerSecond: 0.15,          // very slow
            attackRangePixels: 220,          // long range
            splash: { radiusPixels: 120 },   // big boom
            sizeCells: 2,                     // << NEW: occupies 2x2 cells
            visualScale: 4,   // draw it bigger than normal
            projectileEffects: {
                explosion: { enabled: true, flashAlpha: 0.12, flashTtl: 100 },
                knockback: { enabled: true, maxPx: 60 }
            }
        },
        tesla: {
            displayName: "Tesla",
            uiColor: "#38bdf8",
            buildCost: 140,
            attackRangePixels: 180,
            attacksPerSecond: 1.1,
            damagePerShot: 22,
            baseRadiusPixels: 10,
            damageType: "electric",
            projectileEffects: {
                trail: { enabled: true, color: "#93c5fd", lifeMs: 250, countPerSecond: 36, sizeMin: 1, sizeMax: 3 },
                chain: {
                    enabled: true,
                    maxJumps: 3,
                    jumpRadius: 120,
                    damageFalloff: 0.6,
                    boltTtlMs: 140,        // longer = lingers more
                    boltSegments: 14,      // more segments = more detail
                    boltAmplitude: 10,     // more = wilder zig-zags
                    coreWidth: 2,          // core stroke width
                    coreColor: "#e0f2fe",
                    glowColor: "#93c5fd"
                }
            }
        },
        aftershock: {
            displayName: "Aftershock",
            uiColor: "#f59e0b",
            buildCost: 150,
            attackRangePixels: 160,
            attacksPerSecond: 0.9,
            damagePerShot: 28,
            baseRadiusPixels: 12,
            damageType: "physical",
            aoe: { radiusPixels: 70 },

            // Start with NO aftershock/ripple by default.
            // (You can keep a mild explosion if you want a baseline visual)
            projectileEffects: {
                explosion: { enabled: true, flashAlpha: 0.07, flashTtl: 100 }
            },

            upgrades: {
                damage: {
                    displayName: "Seismic Charge",
                    levels: [
                        { cost: 100, multiplier: { damagePerShot: 1.3 } },
                        { cost: 200, multiplier: { damagePerShot: 1.6 } },
                        { cost: 400, multiplier: { damagePerShot: 2.0 } }
                    ]
                },
                range: {
                    displayName: "Epicenter Expansion",
                    levels: [
                        { cost: 120, multiplier: { attackRangePixels: 1.2 } },
                        { cost: 220, multiplier: { attackRangePixels: 1.5 } }
                    ]
                },
                shockwave: {
                    displayName: "Groundbreaker",
                    levels: [
                        {
                            cost: 300,
                            // Unlock AFTERSHOCK + RIPPLE together.
                            // Deep-merge in TowerUpgradeSystem.applyUpgrade keeps existing effects.
                            unlocksEffect: {
                                projectileEffects: {
                                    aftershock: {
                                        enabled: true,
                                        delayMs: 600,
                                        radiusPixelsOverride: 90,
                                        damageMultiplier: 0.6,
                                        flashAlpha: 0.06,
                                        flashTtl: 100,
                                        ripple: {
                                            enabled: true,
                                            startRadius: 18,
                                            endRadius: 160,
                                            durationMs: 650,
                                            coreWidth: 3,
                                            glowWidth: 10,
                                            coreColor: "#fde68a",
                                            glowColor: "#fbbf24",
                                            alpha: 0.6
                                        }
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        }


    },
    ui: {
        bossBar: {
            topMarginPixels: 36,
            titleToBarGapPixels: 6,
            platePaddingPixels: 8,

            // Jitter (independent, non-circular)
            jitterXPixels: 4,        // horizontal jitter amplitude
            jitterYPixels: 3,        // vertical jitter amplitude
            jitterSpeedHz: 2.4,      // base speed of jitter

            // Hit micro-shake (decays quickly)
            hitShakeXPixels: 4,
            hitShakeYPixels: 4,
        },
    },
    damageTypes: ["physical", "fire", "cold", "electric", "poison"]
};

// Factories kept as plain functions so we never need to deep-clone config with functions.
export const WavePlanFactory = {
    makeWaveEntries(waveNumber) {
        if (waveNumber % 10 === 0) {
            return [{ enemyTypeKey: "boss", count: 1, spawnIntervalSeconds: 2.0 }];
        }
        const count = Math.min(12 + waveNumber * 2, 40);
        return [{ enemyTypeKey: "grunt", count, spawnIntervalSeconds: 0.6 }];
    },
};

export const EnemyStatFactories = {
    grunt(waveNumber) {
        return {
            hitPoints: 30 + Math.floor(waveNumber * 6),
            movementSpeedCellsPerSecond: 1 + waveNumber * 0.04,
            drawRadiusPixels: 12,
            rewardMoney: 8,
            fillColor: "#e11d48",
            isBoss: false,
        };
    },
    boss(waveNumber) {
        const baseHp = 800;
        const hpGrowthRate = 1.05;
        const speedBase = 0.9;
        const speedGrowth = 0.05;
        const baseReward = 80;
        const rewardGrowth = 1.25;

        const scaledHp = Math.floor(baseHp * Math.pow(hpGrowthRate, waveNumber - 1));
        const scaledSpeed = parseFloat((speedBase + waveNumber * speedGrowth).toFixed(2));
        const scaledReward = Math.floor(baseReward * Math.pow(rewardGrowth, waveNumber - 1));

        return {
            name: `Boss — Wave ${waveNumber}`,
            hitPoints: scaledHp,
            movementSpeedCellsPerSecond: scaledSpeed,
            drawRadiusPixels: 22,
            rewardMoney: scaledReward,
            fillColor: "#8b5cf6",
            isBoss: true,
        };
    },
};