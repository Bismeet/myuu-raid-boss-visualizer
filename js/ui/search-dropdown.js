const MENU_SELECTOR = ".inline-results, .selector-results, .boss-move-results, .search-results";
const CONTAINER_SELECTOR = ".selector-search, .pokemon-search, .quick-search, .boss-move-selector-search, [data-search-dropdown]";

function getContainer(node) {
  return node?.closest?.(CONTAINER_SELECTOR) || null;
}

function getMenu(node) {
  const container = getContainer(node);
  return container?.querySelector(MENU_SELECTOR) || null;
}

export function closeSearchDropdowns(root, exceptContainer = null) {
  if (!root) return;
  root.querySelectorAll(MENU_SELECTOR).forEach((menu) => {
    if (exceptContainer?.contains(menu)) return;
    menu.classList.add("hidden");
    menu.querySelectorAll(".dropdown-option-active").forEach((option) => option.classList.remove("dropdown-option-active"));
    const container = getContainer(menu);
    container?.querySelector("input")?.setAttribute("aria-expanded", "false");
  });
}

export function openSearchDropdown(input, menu = getMenu(input)) {
  if (!input || !menu) return null;
  const container = getContainer(input);
  closeSearchDropdowns(input.closest(".app-view") || input.ownerDocument, container);
  menu.classList.remove("hidden");
  menu.setAttribute("role", "listbox");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "true");
  return menu;
}

export function setupSearchDropdownController(root) {
  if (!root || root.dataset.searchDropdownController === "true") return;
  root.dataset.searchDropdownController = "true";

  root.addEventListener("keydown", (event) => {
    const input = event.target.closest("input");
    const menu = input ? getMenu(input) : null;
    if (!input || !menu || menu.classList.contains("hidden")) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeSearchDropdowns(root);
      input.focus();
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
    const options = [...menu.querySelectorAll("button:not(:disabled)")];
    if (!options.length) return;
    const activeIndex = options.findIndex((option) => option.classList.contains("dropdown-option-active"));

    if (event.key === "Enter") {
      if (activeIndex < 0) return;
      event.preventDefault();
      options[activeIndex].click();
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = activeIndex < 0
      ? (direction > 0 ? 0 : options.length - 1)
      : (activeIndex + direction + options.length) % options.length;
    options.forEach((option, index) => option.classList.toggle("dropdown-option-active", index === nextIndex));
    options[nextIndex].scrollIntoView({ block: "nearest" });
  });

  root.addEventListener("pointerdown", (event) => {
    if (!getContainer(event.target)) closeSearchDropdowns(root);
  });

  document.addEventListener("pointerdown", (event) => {
    if (!root.isConnected || root.contains(event.target)) return;
    closeSearchDropdowns(root);
  });
}
