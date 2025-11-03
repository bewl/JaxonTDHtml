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

    // ------- Damage Types (from config or fallback) -------
    const DAMAGE_TYPES = Array.isArray(configuration?.damageTypes) && configuration.damageTypes.length
        ? configuration.damageTypes
        : ["physical", "fire", "cold", "electric", "poison"];

    // ====== DOM ======
    const panel = createEl("div", { id: "adminPanel", class: "admin-panel", "aria-hidden": "true" });

    const header = createEl("div", { class: "admin-header" }, [
        createEl("div", { class: "admin-title" }, ["Admin Controls"]),
        createEl("button", { type: "button", id: "adminCloseBtn", class: "admin-close-btn" }, ["×"])
    ]);

    // --- New: tab bar + content host ---
    const tabsBar = createEl("div", { class: "admin-tabs" });
    const contentHost = createEl("div", { class: "admin-content" });

    panel.append(header, tabsBar, contentHost);
    rootDocument.body.appendChild(panel);

    // ====== Section Registry (extensible) ======
    const sections = [];                          // { id, title, buttonEl, render, mountOnce }
    let activeSectionId = null;

    function registerSection({ id, title, render }) {
        if (!id || !title || typeof render !== "function") return;

        const buttonEl = createEl("button", { class: "admin-tab", "data-tab-id": id, type: "button" }, [title]);
        buttonEl.addEventListener("click", () => activateSection(id));

        sections.push({ id, title, buttonEl, render, mountOnce: false });
        tabsBar.appendChild(buttonEl);

        // Auto-activate the first section
        if (!activeSectionId) {
            activateSection(id);
        }
    }

    function activateSection(id) {
        if (activeSectionId === id) return;
        activeSectionId = id;

        // Tab active styles
        for (const s of sections) {
            if (s.id === id) s.buttonEl.classList.add("active");
            else s.buttonEl.classList.remove("active");
        }

        // Swap content
        contentHost.innerHTML = "";
        const section = sections.find(s => s.id === id);
        if (!section) return;

        const el = section.render();
        if (el) contentHost.appendChild(el);
    }

    // ====== Built-in Sections ======

    // ---------- Enemy / Boss Builder ----------
    registerSection({
        id: "enemy",
        title: "Enemy / Boss",
        render: () => {
            // form
            const form = createEl("form", { id: "enemyBuilderForm", class: "admin-form" }, [
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

                createEl("div", { class: "admin-subtitle" }, ["Damage Taken Multipliers"]),
                createEl("div", { class: "rows-grid" }, DAMAGE_TYPES.map((t) =>
                    createLabeledNumber(`${t.toUpperCase()}`, `eb_mult_${t}`, 1.0, 0, 10, 0.05)
                )),

                createEl("div", { class: "row" }, [
                    createEl("button", { type: "submit", class: "admin-btn primary" }, ["Spawn"]),
                    createEl("button", { type: "button", id: "spawnBossPresetBtn", class: "admin-btn warning" }, ["Boss Preset"])
                ])
            ]);

            const section = createEl("section", { class: "admin-section" }, [
                createEl("h2", { class: "admin-section-title" }, ["Enemy / Boss Builder"]),
                form
            ]);

            // Events
            form.addEventListener("submit", (e) => {
                e.preventDefault();
                const hp = int("#eb_hp", 1);
                const speed = num("#eb_speedCPS", 0);
                const radius = int("#eb_radius", 1);
                const reward = int("#eb_reward", 0);
                const color = str("#eb_color", "#10b981");
                const name = str("#eb_name", "Enemy");
                const isBoss = bool("#eb_isBoss");
                const bossCol = str("#eb_bossFill", "#8b5cf6");

                const damageTypeMultipliers = {};
                for (const t of DAMAGE_TYPES) {
                    const v = num(`#eb_mult_${t}`, 1);
                    damageTypeMultipliers[t] = Math.max(0, v);
                }

                const statBlock = {
                    hitPoints: hp,
                    movementSpeedCellsPerSecond: speed,
                    drawRadiusPixels: radius,
                    rewardMoney: reward,
                    fillColor: isBoss ? bossCol : color,
                    isBoss,
                    name: name || (isBoss ? "BOSS" : "Enemy"),
                    damageTypeMultipliers,
                };

                const waypoints = gameState.gridMap?.waypoints || [];
                if (waypoints.length < 2) return;

                const enemy = gameState.factories.createEnemy(statBlock);
                gameState.enemies.push(enemy);
            });

            section.querySelector("#spawnBossPresetBtn").addEventListener("click", () => {
                const waypoints = gameState.gridMap?.waypoints || [];
                if (waypoints.length < 2) return;

                const statBlock = {
                    hitPoints: 12000,
                    movementSpeedCellsPerSecond: 1.2,
                    drawRadiusPixels: 22,
                    rewardMoney: 200,
                    fillColor: "#8b5cf6",
                    isBoss: true,
                    name: "BOSS",
                    damageTypeMultipliers: Object.fromEntries(DAMAGE_TYPES.map(t => [t, 1])),
                };
                const enemy = gameState.factories.createEnemy(statBlock);
                gameState.enemies.push(enemy);
            });

            return section;
        }
    });

    // ---------- Tower Creator ----------
    registerSection({
        id: "towerCreator",
        title: "Tower Creator",
        render: () => {
            const form = createEl("form", { id: "towerCreatorForm", class: "admin-form" }, [
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

                createLabeledSelect("Damage Type", "tw_dmgType", DAMAGE_TYPES, "physical"),

                createEl("div", { class: "row" }, [
                    createEl("button", { type: "submit", class: "admin-btn success" }, ["Add To Shop"]),
                    createEl("button", { type: "button", id: "tw_selectBtn", class: "admin-btn" }, ["Select In Shop"])
                ]),
                createEl("div", { class: "hintText" }, [
                    "After adding, the shop buttons rebuild using the current configuration."
                ])
            ]);

            const section = createEl("section", { class: "admin-section" }, [
                createEl("h2", { class: "admin-section-title" }, ["Tower Creator"]),
                form
            ]);

            // Events
            form.addEventListener("submit", (e) => {
                e.preventDefault();

                const key = sanitizeKey(str("#tw_key", "custom"));
                const name = str("#tw_name", "Custom Tower");
                const cost = int("#tw_cost", 0);
                const color = str("#tw_color", "#38bdf8");
                const damage = int("#tw_damage", 1);
                const aps = num("#tw_aps", 1);
                const rangePx = int("#tw_range", 40);
                const splashPx = int("#tw_splash", 0);
                const dmgType = str("#tw_dmgType", "physical");

                const def = {
                    displayName: name,
                    buildCost: cost,
                    uiColor: color,
                    damagePerShot: damage,
                    attacksPerSecond: aps,
                    attackRangePixels: rangePx,
                    damageType: dmgType,
                };
                if (splashPx > 0) def.splash = { radiusPixels: splashPx };

                configuration.towersByTypeKey[key] = def;

                if (typeof rebuildTowerButtons === "function") {
                    rebuildTowerButtons();
                }
            });

            section.querySelector("#tw_selectBtn").addEventListener("click", () => {
                const key = sanitizeKey(str("#tw_key", "custom"));
                if (typeof selectTowerType === "function") {
                    selectTowerType(key);
                }
            });

            return section;
        }
    });

    // ---------- Player / Economy ----------
    registerSection({
        id: "economy",
        title: "Player / Economy",
        render: () => {
            const defaultMoney = Number(configuration?.startingMoney ?? gameState.money ?? 0);
            const defaultLives = Number(configuration?.startingLives ?? gameState.lives ?? 0);

            const form = createEl("form", { id: "economyForm", class: "admin-form" }, [
                createEl("div", { class: "row2" }, [
                    createLabeledNumber("Set Money ($)", "setMoney", defaultMoney, 0, 9_999_999, 1),
                    createLabeledNumber("Set Lives", "setLives", defaultLives, 0, 9_999, 1),
                ]),
                createEl("div", { class: "row" }, [
                    createEl("button", { type: "submit", class: "admin-btn" }, ["Apply"])
                ])
            ]);

            const section = createEl("section", { class: "admin-section" }, [
                createEl("h2", { class: "admin-section-title" }, ["Player / Economy"]),
                form
            ]);

            form.addEventListener("submit", (e) => {
                e.preventDefault();
                const money = int("#setMoney", defaultMoney);
                const lives = int("#setLives", defaultLives);
                gameState.money = Math.max(0, money);
                gameState.lives = Math.max(0, lives);
            });

            return section;
        }
    });

    // ---------- Global Modifiers ----------
    registerSection({
        id: "modifiers",
        title: "Global Modifiers",
        render: () => {
            const form = createEl("form", { id: "modsForm", class: "admin-form" }, [
                createEl("div", { class: "row2" }, [
                    createLabeledNumber(
                        "Tower Damage Multiplier",
                        "gm_dmgMult",
                        gameState?.modifiers?.towerDamageMultiplier ?? 1,
                        0, 100, 0.05
                    ),
                    createLabeledText("Notes", "gm_notes", "Set >1 for more damage, 0 to disable tower damage."),
                ]),
                createEl("div", { class: "row" }, [
                    createEl("button", { type: "submit", class: "admin-btn" }, ["Apply"])
                ])
            ]);

            const section = createEl("section", { class: "admin-section" }, [
                createEl("h2", { class: "admin-section-title" }, ["Global Modifiers"]),
                form
            ]);

            form.addEventListener("submit", (e) => {
                e.preventDefault();
                const m = Math.max(0, num("#gm_dmgMult", 1));
                if (!gameState.modifiers) gameState.modifiers = {};
                gameState.modifiers.towerDamageMultiplier = m;
            });

            return section;
        }
    });

    // ====== Panel Controls ======
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

    header.querySelector("#adminCloseBtn").addEventListener("click", close);

    // ====== Return API (now includes registerSection) ======
    return { open, close, toggle, element: panel, registerSection };

    // ====== Small utilities ======
    function q(sel) { return panel.querySelector(sel); }
    function num(sel, fallback = 0) {
        const n = Number(panel.querySelector(sel)?.value);
        return Number.isFinite(n) ? n : fallback;
    }
    function int(sel, fallback = 0) {
        const n = Math.floor(Number(panel.querySelector(sel)?.value));
        return Number.isFinite(n) ? n : fallback;
    }
    function str(sel, fallback = "") {
        const v = panel.querySelector(sel)?.value;
        return (v == null || v === "") ? fallback : v;
    }
    function bool(sel) {
        return !!panel.querySelector(sel)?.checked;
    }
    function sanitizeKey(key) {
        return String(key).trim().toLowerCase().replace(/[^a-z0-9_\-]/g, "-");
    }

    // NEW: labeled select helper (kept local to this module)
    function createLabeledSelect(label, id, options, defaultValue) {
        const select = createEl("select", { id, class: "admin-input" },
            options.map(opt => createEl("option", { value: opt, ...(opt === defaultValue ? { selected: "" } : {}) }, [opt]))
        );
        return createEl("label", { class: "admin-label" }, [
            createEl("span", { class: "admin-label-text" }, [label]),
            select
        ]);
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
