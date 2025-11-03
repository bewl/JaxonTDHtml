// ===========================================
// File: src/ui/adminPanel.js
// ===========================================
/*
 Admin Control Panel — advanced sandbox.

 Features:
 - Spawn custom enemy/boss (full config)
 - Create custom tower types and inject into shop
 - Global tower damage multiplier
 - Toggle open/close via API; hotkeys wired from main.js

 NOTE: main.js should pass:
   createAdminPanel(document, gameState, configuration, {
     rebuildTowerButtons: () => buildTowerButtonsFromConfig(userInterface, configuration, selectTowerType),
     selectTowerType: (key) => selectTowerType(key, findButtonForKey(key))
   })
*/

function createEl(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") el.className = v;
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else if (k.startsWith("data-")) el.setAttribute(k, v);
        else if (k === "for") el.htmlFor = v;
        else el.setAttribute(k, v);
    }
    for (const child of [].concat(children)) {
        if (child == null) continue;
        el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return el;
}

export function createAdminPanel(rootDocument, gameState, configuration, uiHooks = {}) {
    const { rebuildTowerButtons, selectTowerType } = uiHooks;

    // ====== DOM ======
    const panel = createEl("div", { id: "adminPanel", class: "admin-panel", "aria-hidden": "true" });

    const header = createEl("div", { class: "admin-header" }, [
        createEl("div", { class: "admin-title" }, ["Admin Controls"]),
        createEl("button", { type: "button", id: "adminCloseBtn", class: "admin-close-btn" }, ["×"])
    ]);

    // ---------- Enemy/Boss Builder ----------
    const enemySection = createEl("section", { class: "admin-section" }, [
        createEl("h2", { class: "admin-section-title" }, ["Enemy / Boss Builder"]),
        createEl("form", { id: "enemyBuilderForm", class: "admin-form" }, [
            createEl("div", { class: "row2" }, [
                createLabeledNumber("Hit Points", "eb_hp", 150, 1, 10_000_000, 1),
                createLabeledNumber("Speed (cells/sec)", "eb_speedCPS", 2.0, 0.05, 99, 0.05),
            ]),
            createEl("div", { class: "row2" }, [
                createLabeledNumber("Size (px radius)", "eb_radius", 10, 1, 200, 1),
                createLabeledNumber("Reward ($)", "eb_reward", 8, 0, 999_999, 1),
            ]),
            createEl("div", { class: "row2" }, [
                createLabeledColor("Color", "eb_color", "#10b981"),
                createLabeledText("Name", "eb_name", "Enemy"),
            ]),
            createEl("div", { class: "row2" }, [
                createLabeledCheckbox("Is Boss", "eb_isBoss", false),
                createLabeledText("Boss Fill Color (optional)", "eb_bossFill", "#8b5cf6"),
            ]),
            createEl("div", { class: "row" }, [
                createEl("button", { type: "submit", class: "admin-btn primary" }, ["Spawn"]),
                createEl("button", { type: "button", id: "spawnBossPresetBtn", class: "admin-btn warning" }, ["Boss Preset"])
            ])
        ])
    ]);

    // ---------- Tower Creator ----------
    const towerSection = createEl("section", { class: "admin-section" }, [
        createEl("h2", { class: "admin-section-title" }, ["Tower Creator"]),
        createEl("form", { id: "towerCreatorForm", class: "admin-form" }, [
            createEl("div", { class: "row2" }, [
                createLabeledText("Type Key", "tw_key", "custom"),
                createLabeledText("Display Name", "tw_name", "Custom Tower"),
            ]),
            createEl("div", { class: "row2" }, [
                createLabeledNumber("Build Cost ($)", "tw_cost", 70, 0, 999_999, 1),
                createLabeledColor("UI Color", "tw_color", "#38bdf8"),
            ]),
            createEl("div", { class: "row2" }, [
                createLabeledNumber("Damage / Shot", "tw_damage", 12, 0, 9_999, 1),
                createLabeledNumber("Attacks / Sec", "tw_aps", 1.2, 0.01, 50, 0.01),
            ]),
            createEl("div", { class: "row2" }, [
                createLabeledNumber("Range (px)", "tw_range", 120, 8, 2000, 1),
                createLabeledNumber("Splash Radius (px) (0 = none)", "tw_splash", 0, 0, 600, 1),
            ]),
            createEl("div", { class: "row" }, [
                createEl("button", { type: "submit", class: "admin-btn success" }, ["Add To Shop"]),
                createEl("button", { type: "button", id: "tw_selectBtn", class: "admin-btn" }, ["Select In Shop"])
            ]),
            createEl("div", { class: "hintText" }, [
                "After adding, the shop buttons rebuild using the current configuration."
            ])
        ])
    ]);

    // ---------- Global Modifiers ----------
    const modifiersSection = createEl("section", { class: "admin-section" }, [
        createEl("h2", { class: "admin-section-title" }, ["Global Modifiers"]),
        createEl("form", { id: "modsForm", class: "admin-form" }, [
            createEl("div", { class: "row2" }, [
                createLabeledNumber("Tower Damage Multiplier", "gm_dmgMult", gameState?.modifiers?.towerDamageMultiplier ?? 1, 0, 10000000, 0.05),
                createLabeledText("Notes", "gm_notes", "Set >1 for more damage, 0 to disable tower damage."),
            ]),
            createEl("div", { class: "row" }, [
                createEl("button", { type: "submit", class: "admin-btn" }, ["Apply"])
            ])
        ])
    ]);

    panel.append(header, enemySection, towerSection, modifiersSection);
    rootDocument.body.appendChild(panel);

    // ====== Helpers ======
    function open() {
        panel.classList.add("open");
        panel.setAttribute("aria-hidden", "false");
    }
    function close() {
        panel.classList.remove("open");
        panel.setAttribute("aria-hidden", "true");
    }
    function toggle() {
        if (panel.classList.contains("open")) close();
        else open();
    }

    // ====== Events ======
    header.querySelector("#adminCloseBtn").addEventListener("click", close);

    // --- Enemy/Boss Builder submit ---
    panel.querySelector("#enemyBuilderForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const hp = int("#eb_hp", 1);
        const speed = num("#eb_speedCPS", 0);
        const radius = int("#eb_radius", 1);
        const reward = int("#eb_reward", 0);
        const color = str("#eb_color", "#10b981");
        const name = str("#eb_name", "Enemy");
        const isBoss = bool("#eb_isBoss");
        const bossCol = str("#eb_bossFill", "#8b5cf6");

        const statBlock = {
            hitPoints: hp,
            movementSpeedCellsPerSecond: speed,
            drawRadiusPixels: radius,
            rewardMoney: reward,
            fillColor: isBoss ? bossCol : color,
            isBoss,
            name: name || (isBoss ? "BOSS" : "Enemy"),
        };

        const waypoints = gameState.gridMap?.waypoints || [];
        if (waypoints.length < 2) return;

        const enemy = gameState.factories.createEnemy(statBlock);
        gameState.enemies.push(enemy);
    });

    // --- Boss preset ---
    panel.querySelector("#spawnBossPresetBtn").addEventListener("click", () => {
        const waypoints = gameState.gridMap?.waypoints || [];
        if (waypoints.length < 2) return;

        const statBlock = {
            hitPoints: 12000,
            movementSpeedCellsPerSecond: 1.2,
            drawRadiusPixels: 22,
            rewardMoney: 200,
            fillColor: "#8b5cf6",
            isBoss: true,
            name: "BOSS"
        };
        const enemy = gameState.factories.createEnemy(statBlock);
        gameState.enemies.push(enemy);
    });

    // --- Tower Creator submit ---
    panel.querySelector("#towerCreatorForm").addEventListener("submit", (e) => {
        e.preventDefault();

        const key = sanitizeKey(str("#tw_key", "custom"));
        const name = str("#tw_name", "Custom Tower");
        const cost = int("#tw_cost", 0);
        const color = str("#tw_color", "#38bdf8");
        const damage = int("#tw_damage", 1);
        const aps = num("#tw_aps", 1);
        const rangePx = int("#tw_range", 40);
        const splashPx = int("#tw_splash", 0);

        // Build a tower definition aligned with existing architecture
        const def = {
            displayName: name,
            buildCost: cost,
            uiColor: color,
            damagePerShot: damage,
            attacksPerSecond: aps,
            attackRangePixels: rangePx,
        };

        if (splashPx > 0) {
            def.splash = { radiusPixels: splashPx };
        }

        // Inject/replace in config
        configuration.towersByTypeKey[key] = def;

        // Rebuild shop buttons if hook exists
        if (typeof rebuildTowerButtons === "function") {
            rebuildTowerButtons();
        }
    });

    // --- Tower Creator: Select In Shop ---
    panel.querySelector("#tw_selectBtn").addEventListener("click", () => {
        const key = sanitizeKey(str("#tw_key", "custom"));
        if (typeof selectTowerType === "function") {
            selectTowerType(key);
        }
    });

    // --- Global Modifiers submit ---
    panel.querySelector("#modsForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const m = Math.max(0, num("#gm_dmgMult", 1));
        if (!gameState.modifiers) gameState.modifiers = {};
        gameState.modifiers.towerDamageMultiplier = m;
    });

    // ====== Return API ======
    return { open, close, toggle, element: panel };

    // ====== Small utilities ======
    function q(sel) { return panel.querySelector(sel); }
    function num(sel, fallback = 0) {
        const n = Number(q(sel)?.value);
        return Number.isFinite(n) ? n : fallback;
    }
    function int(sel, fallback = 0) {
        const n = Math.floor(Number(q(sel)?.value));
        return Number.isFinite(n) ? n : fallback;
    }
    function str(sel, fallback = "") {
        const v = q(sel)?.value;
        return (v == null || v === "") ? fallback : v;
    }
    function bool(sel) {
        return !!q(sel)?.checked;
    }
    function sanitizeKey(key) {
        return String(key).trim().toLowerCase().replace(/[^a-z0-9_\-]/g, "-");
    }
}

function createLabeledNumber(label, id, value, min, max, step) {
    return createEl("label", { class: "admin-label" }, [
        createEl("span", { class: "admin-label-text" }, [label]),
        createEl("input", {
            id, type: "number",
            value: String(value),
            min: String(min), max: String(max), step: String(step),
            class: "admin-input"
        })
    ]);
}

function createLabeledText(label, id, value) {
    return createEl("label", { class: "admin-label" }, [
        createEl("span", { class: "admin-label-text" }, [label]),
        createEl("input", { id, type: "text", value: value ?? "", class: "admin-input" })
    ]);
}

function createLabeledColor(label, id, value) {
    return createEl("label", { class: "admin-label" }, [
        createEl("span", { class: "admin-label-text" }, [label]),
        createEl("input", { id, type: "color", value, class: "admin-input" })
    ]);
}

function createLabeledCheckbox(label, id, checked) {
    return createEl("label", { class: "admin-label checkbox" }, [
        createEl("input", { id, type: "checkbox", ...(checked ? { checked: "" } : {}) }),
        createEl("span", { class: "admin-label-text" }, [label]),
    ]);
}
