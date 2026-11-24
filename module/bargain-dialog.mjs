import { calculateBargain } from "./bargain.mjs";
import { lethalWoundSlot } from "./merchant.mjs";
import { canonicalPortName, locationChoices } from "./ports.mjs";
import { MERCHANT_TRAITS } from "./traits.mjs";

const pending = new Set();
const MAX_ENEMIES = 20;
const MAX_UNREST = 25;
const UNREST_PER_POINT = 8;
const CONSEQUENCES = [
  "damage", "threat", "omen", "news", "worsening",
  "past", "hidden", "deadline", "responsibility", "bystanders", "grudge"
];
const PAYMENT_FIELDS = [
  ["traits", "Traits"], ["captainTraits", "CaptainTraits"], ["time", "Time"], ["unrest", "Unrest"],
  ["budget", "Budget"], ["cash", "Cash"]
];

function bargainScrollbar(root, form, scrollArea, content) {
  const consequences = root.querySelector(".ouw25-bargain-consequences");
  const viewport = root.querySelector(".window-content");
  const backdrop = document.createElement("div");
  backdrop.className = "ouw25-bargain-consequences-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  const track = document.createElement("div");
  const thumb = document.createElement("div");
  track.className = "ouw25-bargain-scrollbar";
  thumb.className = "ouw25-bargain-scrollbar-thumb";
  track.hidden = true;
  track.tabIndex = 0;
  track.setAttribute("role", "scrollbar");
  track.setAttribute("aria-label", game.i18n.localize("OUW25.BargainCalc.ScrollContent"));
  track.setAttribute("aria-orientation", "vertical");
  track.setAttribute("aria-valuemin", "0");
  scrollArea.id ||= `${root.id}-bargain-content`;
  track.setAttribute("aria-controls", scrollArea.id);
  track.append(thumb);
  viewport.append(backdrop);
  form.append(track);

  const sync = () => {
    const viewportRect = viewport.getBoundingClientRect();
    const consequencesRect = consequences.getBoundingClientRect();
    const left = Math.min(-30, consequencesRect.left - viewportRect.left - 30);
    const right = Math.max(viewportRect.width + 30, consequencesRect.right - viewportRect.left + 30);
    const top = consequencesRect.top - viewportRect.top - 15;
    const bottom = Math.max(viewportRect.height + 30, consequencesRect.bottom - viewportRect.top + 150);
    backdrop.style.left = `${left}px`;
    backdrop.style.top = `${top}px`;
    backdrop.style.width = `${right - left}px`;
    backdrop.style.height = `${bottom - top}px`;
    const height = scrollArea.clientHeight;
    const maximum = Math.max(0, scrollArea.scrollHeight - height);
    track.hidden = maximum === 0;
    track.style.top = `${scrollArea.offsetTop}px`;
    track.style.height = `${height}px`;
    const thumbHeight = maximum ? Math.min(height, Math.max(24, height * height / scrollArea.scrollHeight)) : height;
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.top = `${maximum ? (height - thumbHeight) * scrollArea.scrollTop / maximum : 0}px`;
    track.setAttribute("aria-valuemax", String(maximum));
    track.setAttribute("aria-valuenow", String(Math.round(scrollArea.scrollTop)));
  };
  let dragOffset = 0;
  const move = event => {
    const trackRect = track.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const range = trackRect.height - thumbRect.height;
    if (range > 0) {
      scrollArea.scrollTop = (event.clientY - trackRect.top - dragOffset) / range
        * (scrollArea.scrollHeight - scrollArea.clientHeight);
      sync();
    }
  };
  track.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const rect = thumb.getBoundingClientRect();
    dragOffset = event.target === thumb ? event.clientY - rect.top : rect.height / 2;
    track.setPointerCapture(event.pointerId);
    move(event);
    event.preventDefault();
  });
  track.addEventListener("pointermove", event => {
    if (track.hasPointerCapture(event.pointerId)) move(event);
  });
  track.addEventListener("wheel", event => {
    scrollArea.scrollTop += event.deltaY;
    event.preventDefault();
    sync();
  }, { passive: false });
  track.addEventListener("keydown", event => {
    const steps = { ArrowUp: -40, ArrowDown: 40, PageUp: -scrollArea.clientHeight, PageDown: scrollArea.clientHeight };
    if (event.key === "Home") scrollArea.scrollTop = 0;
    else if (event.key === "End") scrollArea.scrollTop = scrollArea.scrollHeight;
    else if (event.key in steps) scrollArea.scrollTop += steps[event.key];
    else return;
    event.preventDefault();
    sync();
  });
  scrollArea.addEventListener("scroll", sync);
  const observer = new ResizeObserver(sync);
  observer.observe(scrollArea);
  observer.observe(content);
  observer.observe(consequences);
  observer.observe(viewport);
  sync();
  return { sync, destroy() {
    observer.disconnect();
    scrollArea.removeEventListener("scroll", sync);
    backdrop.remove();
    track.remove();
  } };
}

function traitCount(actor) {
  const primary = ["merit", "flaw"].filter(kind => MERCHANT_TRAITS[kind].includes(actor.system[kind])).length;
  return primary + actor.items.filter(item => item.type === "trait"
    && Object.values(MERCHANT_TRAITS).some(codes => codes.includes(item.system.code))).length;
}

function participant(actor) {
  const element = document.createElement("span");
  element.className = "ouw25-bargain-participant";
  const portrait = document.createElement("img");
  const tokenImage = actor.prototypeToken?.texture?.src;
  portrait.src = tokenImage && !tokenImage.includes("*") ? tokenImage : actor.img || "icons/svg/mystery-man.svg";
  portrait.alt = "";
  const name = document.createElement("strong");
  name.textContent = actor.name;
  element.append(portrait, name);
  if (actor.type === "merchant") {
    const lethal = lethalWoundSlot(actor.system.past, actor.system.fragile);
    for (let slot = 1; slot <= lethal; slot++) {
      if (!actor.system[`wound${slot}`]) continue;
      const wound = document.createElement("span");
      const label = game.i18n.format(`OUW25.Condition.${slot === lethal ? "LethalWound" : "Wound"}`, { slot });
      wound.textContent = slot === lethal ? "💀" : "🩸";
      wound.setAttribute("role", "img");
      wound.setAttribute("aria-label", label);
      wound.dataset.tooltip = label;
      element.append(wound);
    }
  }
  return element;
}

function readValues(form) {
  const get = name => form.elements.namedItem(name)?.value ?? "0";
  const number = name => {
    const input = form.elements.namedItem(name);
    return input?.value === "" && !input.validity?.badInput ? "0" : input?.value ?? "0";
  };
  return {
    goal: get("goal").trim(), partial: form.elements.partial.checked, inflation: form.elements.inflation.checked,
    consequence: get("consequence"), custom: get("custom").trim(),
    advantages: number("advantages"), complications: number("complications"), traits: number("traits"),
    captainTraits: number("captainTraits"), time: number("time"), unrest: number("unrest"),
    cash: number("cash"), budget: number("budget"), loan: number("loan"), enemies: number("enemies"),
    friends: form.querySelectorAll('input[name="friend"]:checked').length,
    friendIds: [...form.querySelectorAll('input[name="friend"]:checked')].map(input => input.value),
    enemyDescription: get("enemyDescription").trim() || game.i18n.localize("OUW25.BargainCalc.DefaultOpponent"),
    knowOpponent: form.elements.knowOpponent.checked,
    existingDebt: get("existingDebt"), creditorName: get("creditorName").trim(),
    creditorLocation: get("creditorLocation"),
    debtAmount: form.elements.existingDebt.selectedOptions[0]?.dataset.amount,
    debtLocation: form.elements.existingDebt.selectedOptions[0]?.dataset.location,
    debtName: form.elements.existingDebt.selectedOptions[0]?.dataset.name,
    enemyRecords: [...form.querySelectorAll("[data-enemy-row]")].slice(0, Number(get("enemies")) || 0)
      .map(row => ({ name: row.querySelector("[data-enemy-name]").value.trim(), location: row.querySelector("[data-enemy-location]").value }))
  };
}

export function validateBargainFriends(actor, ids, friends) {
  if (!ids.length) return true;
  const available = new Set(friends.map(friend => friend.id));
  return eligible(actor, "merchant", "OWNER") && new Set(ids).size === ids.length && ids.every(id => {
    const item = actor.items.get(id);
    return available.has(id) && item?.type === "relationship" && item.system.direction === "friend";
  });
}

export async function removeBargainFriends(actor, ids, friends) {
  if (!validateBargainFriends(actor, ids, friends)) throw new Error("Friends changed");
  if (!ids.length) return;
  const removed = await actor.deleteEmbeddedDocuments("Item", ids);
  if (removed.length !== ids.length || ids.some(id => actor.items.get(id))) throw new Error("Friends removal failed");
}

function eligible(actor, type, permission = "OBSERVER") {
  return actor?.documentName === "Actor" && actor.type === type
    && game.actors.get(actor.id) === actor && actor.testUserPermission(game.user, permission);
}

export function firstFounderCooperative(leader) {
  return Array.from(game.actors.values()).find(actor => eligible(actor, "cooperative")
    && actor.system.founders?.includes(leader.uuid)) ?? null;
}

export function contactCooperative(selected, leader) {
  if (selected) return eligible(selected, "cooperative", "OWNER") ? selected : null;
  const matches = Array.from(game.actors.values()).filter(actor => eligible(actor, "cooperative", "OWNER")
    && actor.system.founders?.includes(leader.uuid));
  return matches.length === 1 ? matches[0] : null;
}

export async function recordBargainContact(cooperative, name) {
  if (!eligible(cooperative, "cooperative", "OWNER")) throw new Error("Contact permission changed");
  const normalized = name.trim().toLocaleLowerCase();
  if (cooperative.items.some(item => item.type === "contact" && item.name.trim().toLocaleLowerCase() === normalized)) return;
  const created = await cooperative.createEmbeddedDocuments("Item", [{
    type: "contact", name, system: { location: "", amount: 0, reason: game.i18n.localize("OUW25.BargainCalc.ContactRelationship") }
  }]);
  if (created.length !== 1) throw new Error("Contact creation failed");
}

export function validateBargainRecords(leader, values) {
  const count = Number(values.enemies);
  if (!Number.isSafeInteger(count) || count < 0 || count > MAX_ENEMIES
    || values.enemyRecords.length !== count || values.enemyRecords.some(enemy => !enemy.name)) return false;
  if (!(Number(values.loan) || count)) return true;
  if (!eligible(leader, "merchant", "OWNER")) return false;
  if (Number(values.loan)) {
    if (!values.existingDebt) return Boolean(values.creditorName);
    const debt = leader.items.get(values.existingDebt);
    return debt?.type === "debt" && debt.system.direction === "payable"
      && String(debt.system.amount) === values.debtAmount
      && debt.system.location === values.debtLocation && debt.name === values.debtName
      && Number.isSafeInteger(debt.system.amount + Number(values.loan));
  }
  return true;
}

export async function recordBargainConsequences(leader, values) {
  if (!validateBargainRecords(leader, values)) throw new Error("Bargain records changed");
  if (!Number(values.loan) && !values.enemyRecords.length) return;
  if (Number(values.loan) && values.existingDebt) {
    const debt = leader.items.get(values.existingDebt);
    const amount = debt.system.amount + Number(values.loan);
    const updates = [{ _id: debt.id, "system.amount": debt.system.amount + Number(values.loan),
      "system.location": values.creditorLocation }];
    const updated = await leader.updateEmbeddedDocuments("Item", updates);
    const current = leader.items.get(values.existingDebt);
    if (updated.length !== 1 || current?.system.amount !== amount
      || current.system.location !== values.creditorLocation) throw new Error("Debt update failed");
  }
  const records = values.enemyRecords.map(enemy => ({
    type: "relationship", name: enemy.name,
    system: { direction: "enemy", location: enemy.location, reason: "" }
  }));
  if (Number(values.loan) && !values.existingDebt) records.unshift({
    type: "debt", name: values.creditorName,
    system: { direction: "payable", amount: Number(values.loan), location: values.creditorLocation }
  });
  if (records.length) {
    if (!eligible(leader, "merchant", "OWNER")) throw new Error("Bargain record permission changed");
    const created = await leader.createEmbeddedDocuments("Item", records);
    if (created.length !== records.length) throw new Error("Bargain records creation failed");
  }
}

export function validatePayment(actor, cooperative, values, snapshot) {
  for (const value of [values.cash, values.budget, values.unrest ?? 0]) {
    if (!/^(0|[1-9]\d*)$/.test(String(value)) || !Number.isSafeInteger(Number(value))) return false;
  }
  if (!eligible(actor, "merchant")) return false;
  if (Number(values.cash) && (!eligible(actor, "merchant", "OWNER")
    || actor.system.pocketMoney !== snapshot.cash || Number(values.cash) > actor.system.pocketMoney)) return false;
  if (Number(values.budget) || Number(values.unrest)) {
    if (!eligible(cooperative, "cooperative", "OWNER")) return false;
    if (Number(values.budget) && (cooperative.system.budget !== snapshot.budget
      || Number(values.budget) > cooperative.system.budget)) return false;
    if (Number(values.unrest) && (cooperative.system.unrest !== snapshot.unrest
      || !Number.isInteger(cooperative.system.unrest) || cooperative.system.unrest < 0
      || Number(values.unrest) * UNREST_PER_POINT > MAX_UNREST - cooperative.system.unrest)) return false;
  }
  return true;
}

export async function applyPayment(actor, cooperative, values, snapshot) {
  if (!validatePayment(actor, cooperative, values, snapshot)) throw new Error("changed");
  const { moneyPayment } = calculateBargain(values);
  const updates = [];
  if (moneyPayment.cash) updates.push({ _id: actor.id, "system.pocketMoney": snapshot.cash - moneyPayment.cash });
  if (moneyPayment.budget || Number(values.unrest)) {
    const update = { _id: cooperative.id };
    if (moneyPayment.budget) update["system.budget"] = snapshot.budget - moneyPayment.budget;
    if (Number(values.unrest)) update["system.unrest"] = snapshot.unrest + Number(values.unrest) * UNREST_PER_POINT;
    updates.push(update);
  }
  if (updates.length) await foundry.documents.Actor.updateDocuments(updates);
  if ((moneyPayment.cash && actor.system.pocketMoney !== snapshot.cash - moneyPayment.cash)
    || (moneyPayment.budget && cooperative.system.budget !== snapshot.budget - moneyPayment.budget)
    || (Number(values.unrest) && cooperative.system.unrest !== snapshot.unrest + Number(values.unrest) * UNREST_PER_POINT)) {
    throw new Error("Partial payment");
  }
  return moneyPayment;
}

export async function openBargain(actor) {
  if (!eligible(actor, "merchant", "OWNER") || pending.has(actor.uuid)) return;
  pending.add(actor.uuid);
  let leader = actor;
  let cooperative = firstFounderCooperative(leader);
  let cooperativeManual = false;
  const helpers = new Map();
  const snapshot = { cash: leader.system.pocketMoney, budget: cooperative?.system.budget, unrest: cooperative?.system.unrest };
  let scrollbar;
  const friends = actor.items.filter(item => item.type === "relationship" && item.system.direction === "friend")
    .map(item => ({ id: item.id, name: item.name }));
  const paymentFields = PAYMENT_FIELDS.map(([name, key]) => ({
    name, label: `OUW25.BargainCalc.${key}`, value: ["traits", "captainTraits"].includes(name) ? traitCount(actor) : 0
  }));
  try {
    const content = await foundry.applications.handlebars.renderTemplate("systems/ouw25/templates/bargain.hbs", {
      actor, paymentFields, friends, maxEnemies: MAX_ENEMIES,
      enemySlots: Array.from({ length: MAX_ENEMIES }, (_, index) => ({ number: index + 1 })),
      consequences: CONSEQUENCES.map(id => ({ id, label: `OUW25.BargainCalc.Consequences.${id}` }))
    });
    const selection = await foundry.applications.api.DialogV2.input({
      classes: ["ouw25", "ouw25-bargain-dialog"],
      window: { title: game.i18n.format("OUW25.BargainCalc.WindowTitle", {
        title: game.i18n.localize("OUW25.Bargain.Title"),
        initiator: game.i18n.localize("OUW25.BargainCalc.Initiator"), name: actor.name
      }), resizable: true },
      position: { width: 800, height: 800 }, modal: false, content, rejectClose: false,
      ok: { label: game.i18n.localize("OUW25.BargainCalc.Confirm"), callback: (_event, button) => {
        try {
          const values = readValues(button.form);
          const result = calculateBargain(values);
          if (values.knowOpponent && !contactCooperative(cooperative, leader)) {
            ui.notifications.warn(game.i18n.localize("OUW25.BargainCalc.ContactUnavailable"));
            return false;
          }
          if (!validateBargainRecords(leader, values)) {
            ui.notifications.warn(game.i18n.localize("OUW25.BargainCalc.RecordInvalid"));
            return false;
          }
          if (!validateBargainFriends(actor, values.friendIds, friends)) {
            ui.notifications.warn(game.i18n.localize("OUW25.BargainCalc.FriendsInvalid"));
            return false;
          }
          if (result.remaining || !validatePayment(leader, cooperative, values, snapshot)) throw new Error("changed");
          return { values, result };
        } catch {
          ui.notifications.warn(game.i18n.localize("OUW25.BargainCalc.InvalidPayment"));
          return false;
        }
      } },
      render: (_event, dialog) => {
        const root = dialog.element;
        const form = root.querySelector("form");
        const scrollArea = root.querySelector(".dialog-content");
        const content = root.querySelector("[data-bargain]");
        scrollbar?.destroy();
        scrollbar = bargainScrollbar(root, form, scrollArea, content);
        const submit = root.querySelector('[data-action="ok"]');
        const error = root.querySelector("[data-error]");
        form.append(error);
        const showError = message => {
          if (!message) {
            error.setAttribute("aria-hidden", "true");
            return;
          }
          if (error.getAttribute("aria-hidden") === "true") error.textContent = "";
          error.setAttribute("aria-hidden", "false");
          if (error.textContent !== message) error.textContent = message;
        };
        root.querySelector("[data-leader]").replaceChildren(participant(leader));
        const showCooperative = () => {
          root.querySelector("[data-cooperative]").replaceChildren(...(cooperative ? [participant(cooperative)] : []));
          const hint = root.querySelector('[data-drop="cooperative"]')?.querySelector("[data-drop-hint]");
          if (hint) hint.hidden = Boolean(cooperative);
        };
        const refreshLimits = () => {
          const cashAllowed = eligible(leader, "merchant", "OWNER");
          const coopAllowed = eligible(cooperative, "cooperative", "OWNER");
          const limits = {
            cash: cashAllowed ? leader.system.pocketMoney : 0,
            budget: coopAllowed ? cooperative.system.budget : 0,
            unrest: coopAllowed && Number.isInteger(cooperative.system.unrest)
              ? Math.max(0, Math.floor((MAX_UNREST - cooperative.system.unrest) / UNREST_PER_POINT)) : 0
          };
          for (const [name, maximum] of Object.entries(limits)) {
            const input = form.elements[name];
            input.disabled = name === "cash" ? !cashAllowed : !coopAllowed;
            input.max = String(maximum);
            if (!input.disabled && Number(input.value) > maximum) input.value = String(maximum);
          }
        };
        const selectCooperative = (selected, manual = false) => {
          cooperative = selected;
          cooperativeManual = manual;
          snapshot.budget = selected?.system.budget;
          snapshot.unrest = selected?.system.unrest;
          if (!selected) {
            form.elements.budget.value = "0";
            form.elements.unrest.value = "0";
          }
          showCooperative();
          refreshLimits();
        };
        const option = (value, label, debt) => {
          const element = document.createElement("option");
          element.value = value;
          element.textContent = label;
          if (debt) {
            element.dataset.amount = String(debt.system.amount);
            element.dataset.location = debt.system.location;
            element.dataset.name = debt.name;
          }
          return element;
        };
        const refreshLocations = () => {
          const target = eligible(cooperative, "cooperative") ? cooperative : contactCooperative(null, leader);
          const known = target?.items.filter(item => item.type === "port").map(item => item.name) ?? [];
          const debt = leader.items.get(form.elements.existingDebt.value);
          const locations = locationChoices(known);
          for (const select of root.querySelectorAll("select[data-location]")) {
            const isCreditor = select === form.elements.creditorLocation;
            const oldLocation = isCreditor ? debt?.system.location : "";
            const choices = isCreditor && oldLocation ? locationChoices([...known, oldLocation]) : locations;
            const previous = select.value;
            select.replaceChildren(option("", game.i18n.localize("OUW25.BargainCalc.UnknownLocation")),
              ...choices.map(name => option(oldLocation && canonicalPortName(oldLocation) === name ? oldLocation : name, name)));
            if ([...select.options].some(item => item.value === previous)) select.value = previous;
          }
        };
        const refreshDebts = () => {
          const debts = leader.items.filter(item => item.type === "debt" && item.system.direction === "payable");
          form.elements.existingDebt.replaceChildren(option("", game.i18n.localize("OUW25.BargainCalc.NewDebt")),
            ...debts.map(debt => option(debt.id, `${debt.name} — ${debt.system.amount}`, debt)));
          root.querySelector("[data-new-creditor]").hidden = false;
          refreshLocations();
        };
        showCooperative();
        refreshLimits();
        refreshDebts();
        form.elements.existingDebt.addEventListener("change", () => {
          const debt = leader.items.get(form.elements.existingDebt.value);
          root.querySelector("[data-new-creditor]").hidden = Boolean(debt);
          refreshLocations();
          form.elements.creditorLocation.value = debt?.system.location ?? "";
        });
        const showPoints = contributions => {
          for (const element of root.querySelectorAll("[data-points]")) {
            const points = contributions?.[element.dataset.points] ?? "—";
            element.textContent = points;
            const label = game.i18n.format("OUW25.BargainCalc.PointsEarned", { points });
            element.setAttribute("aria-label", label);
            element.dataset.tooltip = label;
          }
        };
        const update = () => {
          refreshLimits();
          if (!form.elements.partial.checked) form.elements.consequence.value = "";
          const values = readValues(form);
          const target = values.knowOpponent ? contactCooperative(cooperative, leader) : null;
          form.elements.consequence.disabled = !values.partial;
          root.querySelector("[data-custom]").hidden = !values.partial || values.consequence !== "custom";
          root.querySelector("[data-no-enemies]").setAttribute("aria-hidden", String(values.enemies !== "0"));
          root.querySelectorAll("[data-enemy-row]").forEach((row, index) => {
            row.hidden = index >= Number(values.enemies) || index >= MAX_ENEMIES;
          });
          root.querySelector("[data-contact-target]").textContent = values.knowOpponent && !target
            ? game.i18n.localize("OUW25.BargainCalc.ContactUnavailable") : "";
          try {
            const result = calculateBargain(values);
            const priceIcon = root.querySelector("[data-price-icon]");
            priceIcon.textContent = result.remaining ? "🟠" : "🟢";
            priceIcon.setAttribute("aria-label", game.i18n.localize(`OUW25.BargainCalc.${result.remaining ? "PriceUncovered" : "PriceCovered"}`));
            root.querySelector("[data-price]").textContent = game.i18n.format("OUW25.BargainCalc.PriceSummary", {
              neutralized: result.neutralized, spent: result.spentAdvantages, remaining: result.remainingAdvantages,
              full: result.fullPrice, price: result.price
            });
            root.querySelector("[data-summary]").textContent = game.i18n.format("OUW25.BargainCalc.PaymentSummary", {
              paid: result.paid, remaining: result.remaining, excess: result.excess,
              money: result.unitCost || "—", loan: result.loanCost || "—", unrest: Number(values.unrest) * UNREST_PER_POINT
            });
            if (result.moneyPayment.unspent) {
              root.querySelector("[data-summary]").textContent += ` ${game.i18n.format("OUW25.BargainCalc.MoneyUsed", result.moneyPayment)}`;
            }
            root.querySelector("[data-breakdown]").textContent = game.i18n.format("OUW25.BargainCalc.Breakdown", { ...result.contributions, sum: result.paid });
            showPoints(result.contributions);
            const valid = validatePayment(leader, cooperative, values, snapshot);
            const recordsValid = validateBargainRecords(leader, values);
            const friendsValid = validateBargainFriends(actor, values.friendIds, friends);
            showError(!valid ? game.i18n.localize("OUW25.BargainCalc.InvalidPayment")
              : !recordsValid ? game.i18n.localize("OUW25.BargainCalc.RecordInvalid")
              : !friendsValid ? game.i18n.localize("OUW25.BargainCalc.FriendsInvalid") : "");
            submit.disabled = !valid || !recordsValid || !friendsValid || result.remaining > 0 || (values.knowOpponent && !target);
          } catch {
            const priceIcon = root.querySelector("[data-price-icon]");
            priceIcon.textContent = "🟠";
            priceIcon.setAttribute("aria-label", game.i18n.localize("OUW25.BargainCalc.PriceUnavailable"));
            root.querySelector("[data-price]").textContent = "";
            root.querySelector("[data-summary]").textContent = "";
            root.querySelector("[data-breakdown]").textContent = "";
            showPoints(null);
            showError(game.i18n.localize("OUW25.BargainCalc.Invalid"));
            submit.disabled = true;
          }
          scrollbar.sync();
        };
        form.elements.partial.addEventListener("change", () => {
          if (form.elements.partial.checked) {
            form.elements.consequence.value = CONSEQUENCES[Math.floor(Math.random() * CONSEQUENCES.length)];
          }
        });
        form.addEventListener("input", update);
        form.addEventListener("change", update);
        for (const zone of root.querySelectorAll("[data-drop]")) {
          zone.addEventListener("dragover", event => event.preventDefault());
          zone.addEventListener("drop", async event => {
            event.preventDefault();
            try {
              const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
              if (data.type !== "Actor") return;
              const dropped = await foundry.documents.Actor.fromDropData(data);
              const type = zone.dataset.drop === "cooperative" ? "cooperative" : "merchant";
              const permission = zone.dataset.drop === "cooperative" ? "OWNER" : "OBSERVER";
              if (!eligible(dropped, type, permission)) return;
              if (zone.dataset.drop === "leader") {
                leader = dropped;
                snapshot.cash = dropped.system.pocketMoney;
                if (!eligible(leader, "merchant", "OWNER")) form.elements.cash.value = "0";
                if (!cooperativeManual) selectCooperative(firstFounderCooperative(leader));
                else refreshLimits();
                root.querySelector("[data-leader]").replaceChildren(participant(dropped));
                form.elements.traits.value = traitCount(dropped);
                refreshDebts();
              } else if (zone.dataset.drop === "cooperative") {
                selectCooperative(dropped, true);
                refreshLocations();
              } else if (dropped.uuid !== actor.uuid && !helpers.has(dropped.uuid)) {
                helpers.set(dropped.uuid, dropped);
                const item = document.createElement("li");
                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "ouw25-bargain-entry";
                remove.append(participant(dropped), document.createTextNode(" ×"));
                remove.setAttribute("aria-label", game.i18n.format("OUW25.BargainCalc.RemoveHelper", { name: dropped.name }));
                remove.addEventListener("click", () => {
                  helpers.delete(dropped.uuid);
                  item.remove();
                  zone.querySelector("[data-drop-hint]").hidden = helpers.size > 0;
                });
                item.append(remove);
                root.querySelector("[data-helpers]").append(item);
                zone.querySelector("[data-drop-hint]").hidden = true;
              }
              update();
            } catch (error) { console.error("OUW25 | Bargain drop failed", error); }
          });
        }
        update();
        const style = getComputedStyle(scrollArea);
        const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const height = root.offsetHeight - scrollArea.clientHeight + content.offsetHeight + padding;
        root.style.setProperty("--ouw25-bargain-min-height", `${Math.ceil(height)}px`);
        dialog.setPosition();
        scrollbar.sync();
      }
    });
    if (!selection) return;
    const { values, result } = selection;
    if (!validateBargainRecords(leader, values)) {
      ui.notifications.warn(game.i18n.localize("OUW25.BargainCalc.RecordInvalid"));
      return;
    }
    if (!validateBargainFriends(actor, values.friendIds, friends)) {
      ui.notifications.warn(game.i18n.localize("OUW25.BargainCalc.FriendsInvalid"));
      return;
    }
    const contactTarget = values.knowOpponent ? contactCooperative(cooperative, leader) : null;
    if (values.knowOpponent && !contactTarget) {
      ui.notifications.warn(game.i18n.localize("OUW25.BargainCalc.ContactUnavailable"));
      return;
    }
    const documents = [actor, leader, ...helpers.values(), ...(cooperative ? [cooperative] : []),
      ...(contactTarget && contactTarget !== cooperative ? [contactTarget] : [])];
    if (documents.some(document => !document.testUserPermission(game.user, "OBSERVER"))) throw new Error("changed");
    const recipients = Array.from(game.users).filter(user => user.isGM
      || documents.every(document => document.testUserPermission(user, "OBSERVER"))).map(user => user.id);
    if (!recipients.length) throw new Error("changed");
    let moneyPayment;
    try {
      moneyPayment = await applyPayment(leader, cooperative, values, snapshot);
    } catch (error) {
      console.error("OUW25 | Bargain payment failed", error);
      ui.notifications.error(game.i18n.format("OUW25.BargainCalc.PaymentFailed", {
        cash: leader.system.pocketMoney, budget: cooperative?.system.budget ?? "—", unrest: cooperative?.system.unrest ?? "—"
      }));
      return;
    }
    try {
      await recordBargainConsequences(leader, values);
    } catch (error) {
      console.error("OUW25 | Bargain records failed", error);
      ui.notifications.error(game.i18n.localize("OUW25.BargainCalc.RecordFailed"));
      return;
    }
    try {
      await removeBargainFriends(actor, values.friendIds, friends);
    } catch (error) {
      console.error("OUW25 | Bargain friends removal failed", error);
      ui.notifications.error(game.i18n.localize("OUW25.BargainCalc.FriendsFailed"));
      return;
    }
    if (contactTarget) {
      try {
        await recordBargainContact(contactTarget, values.enemyDescription);
      } catch (error) {
        console.error("OUW25 | Bargain contact failed", error);
        ui.notifications.error(game.i18n.localize("OUW25.BargainCalc.ContactFailed"));
        return;
      }
    }
    const chosenFriends = friends.filter(friend => values.friendIds.includes(friend.id)).map(friend => friend.name).join(", ");
    const consequence = values.partial
      ? values.consequence === "custom" ? values.custom || game.i18n.localize("OUW25.BargainCalc.Custom")
        : game.i18n.localize(`OUW25.BargainCalc.Consequences.${values.consequence}`) : "—";
    const rows = [
      ["Goal", values.goal || game.i18n.localize("OUW25.BargainCalc.GoalPlaceholder")], ["Opponent", values.enemyDescription],
      ["Leader", leader.name], ["Helpers", [...helpers.values()].map(item => item.name).join(", ") || "—"],
      ["Outcome", game.i18n.localize(`OUW25.BargainCalc.${values.partial ? "Partial" : "Full"}`)],
      ["Inflation", game.i18n.localize(`OUW25.BargainCalc.${values.inflation ? "Enabled" : "Disabled"}`)],
      ["Complications", values.complications], ["Advantages", values.advantages],
      ["Neutralized", `${result.neutralized} (${result.spentAdvantages})`],
      ["AdvantagePoints", result.contributions.advantages],
      ["PartialConsequence", consequence],
      ["Price", result.price], ["Paid", result.paid], ["Excess", result.excess],
      ["Cash", moneyPayment.cash], ["Budget", moneyPayment.budget], ["Time", values.time], ["Unrest", Number(values.unrest) * UNREST_PER_POINT],
      ["Loan", `${values.loan} ${values.existingDebt ? leader.items.get(values.existingDebt)?.name ?? "" : values.creditorName} ${values.creditorLocation}`],
      ["Enemies", values.enemyRecords.map(enemy => `${enemy.name}${enemy.location ? ` (${enemy.location})` : ""}`).join(", ") || "—"],
      ["Friends", chosenFriends || "—"]
    ].map(([label, value]) => ({ label: `OUW25.BargainCalc.${label}`, value }));
    try {
      const { ChatMessage } = foundry.documents;
      const card = await foundry.applications.handlebars.renderTemplate("systems/ouw25/templates/check-card.hbs", {
        actorName: actor.name, title: game.i18n.localize("OUW25.Bargain.Title"),
        result: game.i18n.localize("OUW25.BargainCalc.Manual"), details: rows
      });
      const message = { speaker: ChatMessage.getSpeaker({ actor }), content: card };
      const mode = game.settings.get("core", "messageMode");
      ChatMessage.applyMode(message, mode);
      message.whisper = ["public", "ic", "publicroll", "roll"].includes(mode)
        ? recipients : (message.whisper ?? []).filter(id => recipients.includes(id));
      if (!message.whisper.length) throw new Error("No authorized recipients");
      await ChatMessage.create(message);
    } catch (error) {
      console.error("OUW25 | Bargain chat failed", error);
      ui.notifications.error(game.i18n.localize("OUW25.BargainCalc.ChatFailed"));
    }
  } finally {
    scrollbar?.destroy();
    pending.delete(actor.uuid);
  }
}
