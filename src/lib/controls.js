(() => {
  const root = document.documentElement;
  const syncPreferences = () => {
    for (const radio of document.querySelectorAll("[data-view-radio]")) {
      radio.checked = radio.value === root.dataset.view;
    }
    for (const checkbox of document.querySelectorAll(
      "[data-original-switch]",
    )) {
      checkbox.checked = root.dataset.original === "on";
    }
    for (const checkbox of document.querySelectorAll("[data-usd-switch]")) {
      checkbox.checked = root.dataset.usd === "hidden";
    }
  };

  const feedback = new WeakMap();
  const popover = document.getElementById("price-detail");
  function showPriceDetail(trigger, text) {
    if (typeof popover.showPopover !== "function") return;
    popover.querySelector("p").textContent = text;
    const bounds = trigger.getBoundingClientRect();
    popover.showPopover({ source: trigger });
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    const fitsBelow = bounds.bottom + 6 + height < window.innerHeight - 8;
    popover.style.left = `${Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8))}px`;
    popover.style.top = `${Math.max(8, fitsBelow ? bounds.bottom + 6 : bounds.top - height - 6)}px`;
  }
  document.addEventListener("g1:price-detail", ({ detail }) => {
    showPriceDetail(detail.trigger, detail.text);
  });
  document.addEventListener("click", async (event) => {
    const target = event.target;
    const copy = target.closest("[data-copy]");
    if (copy) {
      const label = copy.querySelector("[data-copy-status]");
      try {
        await navigator.clipboard.writeText(copy.dataset.copy);
        label.textContent = "已复制";
      } catch {
        label.textContent = "复制失败";
      }
      clearTimeout(feedback.get(copy));
      feedback.set(
        copy,
        setTimeout(() => {
          label.textContent = "";
        }, 1200),
      );
    }

    const trigger = target.closest("[data-price-detail]");
    if (trigger) showPriceDetail(trigger, trigger.title);
  });

  document.addEventListener("change", (event) => {
    const input = event.target;
    if (input.matches("[data-view-radio], [data-original-switch]")) {
      const view = input.matches("[data-view-radio]");
      const field = view ? "view" : "original";
      const value = view ? input.value : input.checked ? "on" : "off";
      root.dataset[field] = value;
      try {
        localStorage.setItem(`g1:${field}`, value);
      } catch {}
      if (view) {
        const url = new URL(location.href);
        url.searchParams.set("view", value);
        history.replaceState(history.state, "", url);
      }
      document.dispatchEvent(new Event("g1:preferences"));
    }
    if (input.matches("[data-usd-switch]")) {
      const url = new URL(location.href);
      if (input.checked) url.searchParams.set("usd", "hide");
      else url.searchParams.delete("usd");
      history.replaceState(history.state, "", url);
      root.dataset.usd = input.checked ? "hidden" : "shown";
      try {
        if (input.checked) localStorage.setItem("g1:usd", "hide");
        else localStorage.removeItem("g1:usd");
      } catch {}
      document.dispatchEvent(new Event("g1:preferences"));
    }
    if (input.matches("[data-sku-line], [data-sku-history]")) {
      const table = document.getElementById("country-skus");
      table.dataset.filterLine = document.querySelector(
        "[data-sku-line]:checked",
      ).value;
      table.dataset.showHistory = document.querySelector("[data-sku-history]")
        .checked
        ? "yes"
        : "no";
      const visible = [...table.querySelectorAll("[data-sku-group]")].some(
        (group) => {
          if (
            table.dataset.filterLine !== "all" &&
            group.dataset.skuGroup !== table.dataset.filterLine
          )
            return false;
          const selector =
            table.dataset.showHistory === "yes"
              ? "[data-sku-row]"
              : '[data-sku-row="active"]';
          return group.querySelector(selector);
        },
      );
      table.querySelector("[data-sku-empty]").hidden = visible;
    }
    if (input.matches("[data-change-kind]")) {
      for (const group of document.querySelectorAll("[data-kind-panel]")) {
        group.hidden = group.dataset.kindPanel !== input.value;
      }
    }
  });

  document.addEventListener("g1:preferences", syncPreferences);
  const applyPreferences = () => {
    const params = new URLSearchParams(location.search);
    const view = params.get("view");
    const hideUsd = params.get("usd") === "hide";
    if (["intro", "year", "renew"].includes(view)) root.dataset.view = view;
    if (hideUsd) root.dataset.usd = "hidden";
    try {
      const saved = ["intro", "year", "renew"].includes(view)
        ? view
        : localStorage.getItem("g1:view");
      if (["intro", "year", "renew"].includes(saved)) root.dataset.view = saved;
      root.dataset.original =
        localStorage.getItem("g1:original") === "off" ? "off" : "on";
      root.dataset.usd =
        hideUsd || localStorage.getItem("g1:usd") === "hide"
          ? "hidden"
          : "shown";
    } catch {}
    document.dispatchEvent(new Event("g1:preferences"));
  };
  if (document.querySelector("[data-view-radio]")) {
    window.addEventListener("pageshow", applyPreferences);
    window.addEventListener("popstate", applyPreferences);
    syncPreferences();
  }

  const openChange = () => {
    const id = location.hash.slice(1);
    if (/^change-[a-z]{3}$/.test(id)) {
      const group = document.getElementById(id);
      if (group) group.open = true;
    }
  };
  if (document.querySelector("[data-kind-panel]")) {
    openChange();
    window.addEventListener("hashchange", openChange);
  }

  const matrixFilters = document.querySelectorAll("[data-matrix-filter]");
  const syncMatrixFilters = () => {
    const params = new URLSearchParams(location.search);
    for (const field of matrixFilters) {
      const value = params.get(field.dataset.matrixFilter);
      field.value = value ?? "";
      if (field.type === "select-one" && field.selectedIndex === -1)
        field.value = "";
    }
  };
  const updateMatrixFilter = (field) => {
    if (!field.matches("[data-matrix-filter]")) return;
    const key = field.dataset.matrixFilter;
    const value = field.value;
    const url = new URL(location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    history.replaceState(history.state, "", url);
    document.dispatchEvent(new Event("g1:matrix"));
  };
  if (matrixFilters.length) {
    syncMatrixFilters();
    window.addEventListener("pageshow", syncMatrixFilters);
    window.addEventListener("popstate", syncMatrixFilters);
    document.addEventListener("input", (event) => {
      if (event.target.type === "search") updateMatrixFilter(event.target);
    });
    document.addEventListener("change", (event) => {
      if (event.target.type !== "search") updateMatrixFilter(event.target);
    });
  }

  const filter = (input) => {
    const container = document.getElementById(input.dataset.filterTarget);
    const query = input.value.trim().toLowerCase();
    let count = 0;
    for (const row of container.querySelectorAll("[data-match]")) {
      row.hidden = !row.dataset.match.toLowerCase().includes(query);
      if (!row.hidden) count++;
    }
    for (const group of container.querySelectorAll("[data-filter-group]")) {
      group.hidden = !group.querySelector("[data-match]:not([hidden])");
    }
    container.querySelector("[data-filter-empty]").hidden = count > 0;
  };
  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-filter-target]")) filter(event.target);
  });
  for (const input of document.querySelectorAll("[data-filter-target]")) {
    if (input.value) filter(input);
  }
})();
