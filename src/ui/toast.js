let toastContainerElement = null;
let activeToast = null;
let autoDismissTimer = null;
let currentToastPosition = "bottom-center"; // default

function applyToastPosition(position) {
    if (!toastContainerElement) return;
    currentToastPosition = position;
    toastContainerElement.setAttribute("data-position", currentToastPosition);
}

export function initializeToastService(documentRoot = document) {
    toastContainerElement = documentRoot.getElementById("toastContainer");
    if (!toastContainerElement) {
        throw new Error(
            'toastContainer element not found in DOM. Add: <div id="toastContainer" aria-live="polite" aria-atomic="true"></div>'
        );
    }
    if (!toastContainerElement.getAttribute("data-position")) {
        applyToastPosition(currentToastPosition);
    }
}

export function setToastPosition(position) {
    const allowed = new Set([
        "top-left",
        "top-center",
        "top-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
    ]);
    const resolved = allowed.has(position) ? position : "bottom-center";
    applyToastPosition(resolved);
}

function createToastElement({ title, message, type }) {
    const element = document.createElement("div");
    element.className = `uiToast ${type || "info"}`;
    element.setAttribute("role", "status");

    element.innerHTML = `
      <div class="toastHeader">
        <div class="toastIcon">${
            type === "success" ? "✔️" :
            type === "error"   ? "⛔" :
            type === "warn"    ? "⚠️" : "ℹ️"
        }</div>
        <div class="toastContent">
          <div class="toastTitle">${title || ""}</div>
          <div class="toastMessage">${message || ""}</div>
        </div>
        <button class="toastClose" aria-label="Dismiss" type="button">&times;</button>
      </div>
      <div class="toastBar"><i></i></div>
    `;

    element.querySelector(".toastClose")?.addEventListener("click", (e) => {
        e.stopPropagation();
        dismissToast("close");
    });

    return element;
}

function dismissToast(reason = "timeout") {
    if (!activeToast) return;
    const element = activeToast;
    activeToast = null;
    clearTimeout(autoDismissTimer);

    element.classList.add("closing");
    const remove = () => {
        element.removeEventListener("animationend", remove);
        element.remove();
    };
    element.addEventListener("animationend", remove);
    setTimeout(remove, 240);
}

function pushToast({ title, message, type, durationMs }) {
    if (!toastContainerElement) initializeToastService(document);

    const duration = durationMs ?? 3500;

    // If a toast already exists, refresh it
    if (activeToast) {
        const t = activeToast;
        const titleNode = t.querySelector(".toastTitle");
        const messageNode = t.querySelector(".toastMessage");
        if (titleNode) titleNode.textContent = title || "";
        if (messageNode) messageNode.textContent = message || "";

        const bar = t.querySelector(".toastBar > i");
        if (bar) {
            bar.style.animation = "none";
            bar.offsetHeight; // force reflow
            bar.style.animation = "";
        }
        t.style.setProperty("--toast-duration", `${duration}ms`);

        clearTimeout(autoDismissTimer);
        autoDismissTimer = setTimeout(() => dismissToast("timeout"), duration + 100);
        return () => dismissToast("manual");
    }

    // Otherwise, create a new toast
    const element = createToastElement({ title, message, type });
    activeToast = element;
    element.style.setProperty("--toast-duration", `${duration}ms`);
    toastContainerElement.appendChild(element);

    autoDismissTimer = setTimeout(() => dismissToast("timeout"), duration + 100);
    return () => dismissToast("manual");
}

export const toast = {
    info(message, opts = {}) {
        return pushToast({
            title: opts.title || "Info",
            message,
            type: "info",
            durationMs: opts.durationMs ?? 3500
        });
    },
    success(message, opts = {}) {
        return pushToast({
            title: opts.title || "Success",
            message,
            type: "success",
            durationMs: opts.durationMs ?? 3000
        });
    },
    warn(message, opts = {}) {
        return pushToast({
            title: opts.title || "Warning",
            message,
            type: "warn",
            durationMs: opts.durationMs ?? 4000
        });
    },
    error(message, opts = {}) {
        return pushToast({
            title: opts.title || "Error",
            message,
            type: "error",
            durationMs: opts.durationMs ?? 5000
        });
    },
};
