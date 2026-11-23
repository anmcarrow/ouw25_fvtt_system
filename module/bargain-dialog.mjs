import { calculateBargain } from "./bargain.mjs";
import { lethalWoundSlot } from "./merchant.mjs";
import { canonicalPortName, locationChoices } from "./ports.mjs";
import { MERCHANT_TRAITS } from "./traits.mjs";

const pending = new Set();
const MAX_ENEMIES = 20;
const CONSEQUENCES = [
  "unrest", "damage", "threat", "omen", "news", "worsening",
  "past", "hidden", "deadline", "responsibility", "bystanders", "grudge"
];
const PAYMENT_FIELDS = [
  ["traits", "Traits"], ["captainTraits", "CaptainTraits"], ["time", "Time"], ["unrest", "Unrest"],
  ["cash", "Cash"], ["budget", "Budget"]
];

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
  return {
    goal: get("goal").trim(), partial: form.elements.partial.checked, inflation: form.elements.inflation.checked,
    consequence: get("consequence"), custom: get("custom").trim(),
    advantages: get("advantages"), complications: get("complications"), traits: get("traits"),
    captainTraits: get("captainTraits"), time: get("time"), unrest: get("unrest"),
    cash: get("cash"), budget: get("budget"), loan: get("loan"), enemies: get("enemies"),
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

function eligible(actor, type, permission = "OBSERVER") {
  return actor?.documentName === "Actor" && actor.type === type
    && game.actors.get(actor.id) === actor && actor.testUserPermission(game.user, permission);
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
  for (const value of [values.cash, values.budget]) {
    if (!/^(0|[1-9]\d*)$/.test(String(value)) || !Number.isSafeInteger(Number(value))) return false;
  }
  if (!eligible(actor, "merchant", "OWNER") || actor.system.pocketMoney !== snapshot.cash) return false;
  if (Number(values.cash) > actor.system.pocketMoney) return false;
  if (Number(values.budget)) {
    if (!eligible(cooperative, "cooperative", "OWNER") || cooperative.system.budget !== snapshot.budget
      || Number(values.budget) > cooperative.system.budget) return false;
  }
  return true;
}

export async function applyPayment(actor, cooperative, values, snapshot) {
  if (!validatePayment(actor, cooperative, values, snapshot)) throw new Error("changed");
  const updates = [];
  if (Number(values.cash)) updates.push({ _id: actor.id, "system.pocketMoney": snapshot.cash - Number(values.cash) });
  if (Number(values.budget)) updates.push({ _id: cooperative.id, "system.budget": snapshot.budget - Number(values.budget) });
  if (updates.length) await foundry.documents.Actor.updateDocuments(updates);
  if ((Number(values.cash) && actor.system.pocketMoney !== snapshot.cash - Number(values.cash))
    || (Number(values.budget) && cooperative.system.budget !== snapshot.budget - Number(values.budget))) {
    throw new Error("Partial payment");
  }
}

export async function openBargain(actor) {
  if (!eligible(actor, "merchant", "OWNER") || pending.has(actor.uuid)) return;
  pending.add(actor.uuid);
  let leader = actor;
  let cooperative = null;
  const helpers = new Map();
  const snapshot = { cash: actor.system.pocketMoney, budget: null };
  const friends = actor.items.filter(item => item.type === "relationship" && item.system.direction === "friend")
    .map(item => ({ id: item.id, name: item.name }));
  const paymentFields = PAYMENT_FIELDS.map(([name, key]) => ({
    name, label: `OUW25.BargainCalc.${key}`, value: ["traits", "captainTraits"].includes(name) ? traitCount(actor) : 0
  })).sort((a, b) => Array.from(game.i18n.localize(b.label)).length - Array.from(game.i18n.localize(a.label)).length);
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
          if (result.remaining || !validatePayment(actor, cooperative, values, snapshot)) throw new Error("changed");
          return { values, result };
        } catch {
          ui.notifications.warn(game.i18n.localize("OUW25.BargainCalc.InvalidPayment"));
          return false;
        }
      } },
      render: (_event, dialog) => {
        const root = dialog.element;
        const form = root.querySelector("form");
        const submit = root.querySelector('[data-action="ok"]');
        root.querySelector("[data-leader]").replaceChildren(participant(leader));
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
          const target = contactCooperative(cooperative, leader);
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
        refreshDebts();
        form.elements.existingDebt.addEventListener("change", () => {
          const debt = leader.items.get(form.elements.existingDebt.value);
          root.querySelector("[data-new-creditor]").hidden = Boolean(debt);
          refreshLocations();
          form.elements.creditorLocation.value = debt?.system.location ?? "";
        });
        const update = () => {
          const values = readValues(form);
          const target = values.knowOpponent ? contactCooperative(cooperative, leader) : null;
          form.elements.consequence.disabled = !values.partial;
          root.querySelector("[data-custom]").hidden = !values.partial || values.consequence !== "custom";
          root.querySelectorAll("[data-enemy-row]").forEach((row, index) => {
            row.hidden = index >= Number(values.enemies) || index >= MAX_ENEMIES;
          });
          root.querySelector("[data-contact-target]").textContent = values.knowOpponent
            ? target ? game.i18n.format("OUW25.BargainCalc.ContactTarget", { name: target.name })
              : game.i18n.localize("OUW25.BargainCalc.ContactUnavailable")
            : "";
          try {
            const result = calculateBargain(values);
            root.querySelector("[data-price]").textContent = game.i18n.format("OUW25.BargainCalc.PriceSummary", {
              neutralized: result.neutralized, spent: result.spentAdvantages, remaining: result.remainingAdvantages,
              full: result.fullPrice, price: result.price
            });
            root.querySelector("[data-summary]").textContent = game.i18n.format("OUW25.BargainCalc.PaymentSummary", {
              paid: result.paid, remaining: result.remaining, excess: result.excess,
              money: result.unitCost || "—", loan: result.loanCost || "—", unrest: Number(values.unrest) * 8
            });
            root.querySelector("[data-breakdown]").textContent = game.i18n.format("OUW25.BargainCalc.Breakdown", result.contributions);
            const valid = validatePayment(actor, cooperative, values, snapshot);
            const recordsValid = validateBargainRecords(leader, values);
            root.querySelector("[data-error]").textContent = !valid ? game.i18n.localize("OUW25.BargainCalc.InvalidPayment")
              : !recordsValid ? game.i18n.localize("OUW25.BargainCalc.RecordInvalid") : "";
            submit.disabled = !valid || !recordsValid || result.remaining > 0 || (values.knowOpponent && !target);
          } catch {
            root.querySelector("[data-price]").textContent = "";
            root.querySelector("[data-summary]").textContent = "";
            root.querySelector("[data-breakdown]").textContent = "";
            root.querySelector("[data-error]").textContent = game.i18n.localize("OUW25.BargainCalc.Invalid");
            submit.disabled = true;
          }
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
                root.querySelector("[data-leader]").replaceChildren(participant(dropped));
                form.elements.traits.value = traitCount(dropped);
                refreshDebts();
              } else if (zone.dataset.drop === "cooperative") {
                cooperative = dropped;
                snapshot.budget = dropped.system.budget;
                root.querySelector("[data-cooperative]").replaceChildren(participant(dropped));
                zone.querySelector("[data-drop-hint]").hidden = true;
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
      }
    });
    if (!selection) return;
    const { values, result } = selection;
    if (!validateBargainRecords(leader, values)) {
      ui.notifications.warn(game.i18n.localize("OUW25.BargainCalc.RecordInvalid"));
      return;
    }
    if (values.friendIds.some(id => {
      const current = actor.items.get(id);
      return current?.type !== "relationship" || current.system.direction !== "friend";
    })) throw new Error("changed");
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
    try {
      await applyPayment(actor, cooperative, values, snapshot);
    } catch (error) {
      console.error("OUW25 | Bargain payment failed", error);
      ui.notifications.error(game.i18n.format("OUW25.BargainCalc.PaymentFailed", {
        cash: actor.system.pocketMoney, budget: cooperative?.system.budget ?? "—"
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
      ["Cash", values.cash], ["Budget", values.budget], ["Time", values.time], ["Unrest", Number(values.unrest) * 8],
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
    pending.delete(actor.uuid);
  }
}
