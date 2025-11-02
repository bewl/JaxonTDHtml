// ===========================================
// File: src/ui/toast.js
// ===========================================

let toastContainerElement = null;
const activeToasts = new Set();
const maximumActiveToasts = 5;

// Positioning -------------------------------------------------------------
let currentToastPosition = "bottom-center"; // default

function applyToastPosition(position) {
    if (!toastContainerElement) return;
    currentToastPosition = position;
    toastContainerElement.setAttribute("data-position", currentToastPosition);
}

/**
 * Initialize the toast service. Call once during app boot.
 */
export function initializeToastService(documentRoot = document) {
    toastContainerElement = documentRoot.getElementById("toastContainer");
    if (!toastContainerElement) {
        throw new Error(
            'toastContainer element not found in DOM. Add: <div id="toastContainer" aria-live="polite" aria-atomic="true"></div>'
        );
    }
    if (!toastContainerElement.getAttribute("data-position")) {
        applyToastPosition(currentToastPosition); // "bottom-center" by default
    }
}

/**
 * Public: change the toast container position at runtime.
 * Allowed: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right"
 */
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

// Creation / dismissal ----------------------------------------------------

/**
 * Internal: create a toast HTMLElement and wire behaviors.
 * Returns the HTMLElement (not a function).
 */
/**
 * Internal: create a toast HTMLElement and wire behaviors.
 * Returns the HTMLElement (not a function).
 */
function createToastElement({
    title,
    message,
    type,
    durationMs,
    onClick,
    dismissOnClick = true,
}) {
    const element = document.createElement("div");
    element.className = `uiToast ${type || "info"}`;
    element.setAttribute("role", "status");

    // Toast structure
    element.innerHTML = `
    <div class="toastHeader">
      <div class="toastIcon">${type === "success"
            ? "✔️"
            : type === "error"
                ? "⛔"
                : type === "warn"
                    ? "⚠️"
                    : "ℹ️"
        }</div>
      <div class="toastContent">
        <div class="toastTitle">${title || ""}</div>
        <div class="toastMessage">${message || ""}</div>
      </div>
      <button class="toastClose" aria-label="Dismiss" type="button">&times;</button>
    </div>
    <div class="toastBar"><i></i></div>
  `;

    const closeButton = element.querySelector(".toastClose");

    // Set progress bar duration for CSS animation
    element.style.setProperty("--toast-duration", `${durationMs}ms`);

    let isClosed = false;

    function dismiss(reason = "user") {
        if (isClosed) return;
        isClosed = true;

        // Add closing animation class
        element.classList.add("closing");

        const remove = () => {
            element.removeEventListener("animationend", remove);
            element.remove();
            activeToasts.delete(element);
        };

        // Wait for animation to finish, fallback after 240ms
        element.addEventListener("animationend", remove);
        setTimeout(remove, 240);
    }

    // --- Auto-dismiss after timer expires ---
    const autoDismissTimer = setTimeout(() => {
        if (!isClosed) {
            dismiss("timeout");
        }
    }, durationMs + 100); // buffer for smoother sync with CSS

    // Override dismiss to clear timer if closed early
    const originalDismiss = dismiss;
    dismiss = function (reason = "user") {
        clearTimeout(autoDismissTimer);
        originalDismiss(reason);
    };
    element.__dismiss = dismiss;
    // ----------------------------------------

    // Click anywhere: optional onClick, then dismiss (by default)
    element.addEventListener("click", () => {
        try {
            if (typeof onClick === "function") onClick();
        } catch {
            /* ignore handler errors */
        }
        if (dismissOnClick) dismiss("click");
    });

    // ✕ button closes without triggering onClick
    if (closeButton) {
        closeButton.addEventListener("click", (event) => {
            event.stopPropagation();
            dismiss("close");
        });
    }

    return element;
}


/**
 * Internal: create/append a toast node and return a dismiss function.
 * - Synchronously culls oldest toasts if we are at capacity (prevents freeze).
 * - Supports coalescing by key (refreshes existing toast instead of adding a new one).
 */
function pushToast(options) {
    if (!toastContainerElement) initializeToastService(document);

    // Optional coalescing: refresh an existing toast with the same key
    if (options.coalesceKey) {
        for (const t of activeToasts) {
            if (t.dataset && t.dataset.key === options.coalesceKey) {
                // Refresh title/message if provided
                if (options.title) {
                    const titleNode = t.querySelector(".toastTitle");
                    if (titleNode) titleNode.textContent = options.title;
                }
                if (options.message) {
                    const messageNode = t.querySelector(".toastMessage");
                    if (messageNode) messageNode.textContent = options.message;
                }
                // Restart CSS progress animation by toggling it
                const bar = t.querySelector(".toastBar > i");
                if (bar) {
                    // reset animation
                    bar.style.animation = "none";
                    // force reflow to apply
                    // eslint-disable-next-line no-unused-expressions
                    bar.offsetHeight;
                    bar.style.animation = ""; // reapply original keyframes
                }
                // Reset duration var as well
                t.style.setProperty(
                    "--toast-duration",
                    `${options.durationMs ?? 3500}ms`
                );

                return () => t.__dismiss?.("manual");
            }
        }
    }

    // Synchronous culling (no animation) to avoid while-loop spins
    while (activeToasts.size >= maximumActiveToasts) {
        const oldest = activeToasts.values().next().value;
        if (!oldest) break;
        oldest.remove();
        activeToasts.delete(oldest);
    }

    const element = createToastElement(options);
    if (options.coalesceKey) element.dataset.key = options.coalesceKey;

    activeToasts.add(element);
    toastContainerElement.appendChild(element);

    // Return a manual dismiss function
    return () => element.__dismiss?.("manual");
}

// Public API --------------------------------------------------------------

export const toast = {
    info(message, opts = {}) {
        return pushToast({
            title: opts.title || "Info",
            message,
            type: "info",
            durationMs: opts.durationMs ?? 3500,
            onClick: opts.onClick,
            dismissOnClick: opts.dismissOnClick !== false,
            coalesceKey: opts.coalesceKey,
        });
    },
    success(message, opts = {}) {
        return pushToast({
            title: opts.title || "Success",
            message,
            type: "success",
            durationMs: opts.durationMs ?? 3000,
            onClick: opts.onClick,
            dismissOnClick: opts.dismissOnClick !== false,
            coalesceKey: opts.coalesceKey,
        });
    },
    warn(message, opts = {}) {
        return pushToast({
            title: opts.title || "Warning",
            message,
            type: "warn",
            durationMs: opts.durationMs ?? 4000,
            onClick: opts.onClick,
            dismissOnClick: opts.dismissOnClick !== false,
            coalesceKey: opts.coalesceKey,
        });
    },
    error(message, opts = {}) {
        return pushToast({
            title: opts.title || "Error",
            message,
            type: "error",
            durationMs: opts.durationMs ?? 5000,
            onClick: opts.onClick,
            dismissOnClick: opts.dismissOnClick !== false,
            coalesceKey: opts.coalesceKey,
        });
    },
};
