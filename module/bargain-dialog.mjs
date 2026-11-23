import { calculateBargain } from "./bargain.mjs";
import { MERCHANT_TRAITS } from "./traits.mjs";

const pending = new Set();
const CONSEQUENCES = [
  "unrest", "damage", "threat", "omen", "news", "worsening",
  "past", "hidden", "deadline", "responsibility", "bystanders", "grudge"
];

function traitCount(actor) {
  const primary = ["merit", "flaw"].filter(kind => MERCHANT_TRAITS[kind].includes(actor.system[kind])).length;
  return primary + actor.items.filter(item => item.type === "trait"
    && Object.values(MERCHANT_TRAITS).some(codes => codes.includes(item.system.code))).length;
}

function wounds(actor) {
  return [1, 2, 3, 4].filter(number => actor.system[`wound${number}`]).length;
}

function readValues(form) {
  const get = name => form.elements.namedItem(name)?.value ?? "0";
  return {
    goal: get("goal").trim(), partial: get("outcome") === "partial", inflation: form.elements.inflation.checked,
    consequence: get("consequence"), custom: get("custom").trim(),
    advantages: get("advantages"), complications: get("complications"), traits: get("traits"),
    captainTraits: get("captainTraits"), time: get("time"), unrest: get("unrest"),
    cash: get("cash"), budget: get("budget"), loan: get("loan"), enemies: get("enemies"),
    friends: form.querySelectorAll('input[name="friend"]:checked').length,
    friendIds: [...form.querySelectorAll('input[name="friend"]:checked')].map(input => input.value),
    enemyDescription: get("enemyDescription").trim(), loanDescription: get("loanDescription").trim(),
    existingDebt: get("existingDebt")
  };
}

function eligible(actor, type, permission = "OBSERVER") {
  return actor?.documentName === "Actor" && actor.type === type
    && game.actors.get(actor.id) === actor && actor.testUserPermission(game.user, permission);
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
  const debts = actor.items.filter(item => item.type === "debt" && item.system.direction === "payable")
    .map(item => ({ id: item.id, name: item.name, amount: item.system.amount }));
  try {
    const content = await foundry.applications.handlebars.renderTemplate("systems/ouw25/templates/bargain.hbs", {
      actor, traits: traitCount(actor), wounds: wounds(actor), friends, debts,
      consequences: CONSEQUENCES.map(id => ({ id, label: `OUW25.BargainCalc.Consequences.${id}` }))
    });
    const selection = await foundry.applications.api.DialogV2.input({
      classes: ["ouw25", "ouw25-bargain-dialog"],
      window: { title: game.i18n.localize("OUW25.Bargain.Title"), resizable: true },
      position: { width: 720, height: 800 }, modal: false, content, rejectClose: false,
      ok: { label: game.i18n.localize("OUW25.BargainCalc.Confirm"), callback: (_event, button) => {
        try {
          const values = readValues(button.form);
          const result = calculateBargain(values);
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
        const update = () => {
          const values = readValues(form);
          root.querySelector("[data-partial]").hidden = !values.partial;
          root.querySelector("[data-custom]").hidden = values.consequence !== "custom";
          root.querySelector("[data-balances]").textContent = game.i18n.format("OUW25.BargainCalc.Balances", {
            cash: actor.system.pocketMoney, budget: cooperative?.system.budget ?? "—"
          });
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
            root.querySelector("[data-error]").textContent = valid ? "" : game.i18n.localize("OUW25.BargainCalc.InvalidPayment");
            submit.disabled = !valid || result.remaining > 0;
          } catch {
            root.querySelector("[data-price]").textContent = "";
            root.querySelector("[data-summary]").textContent = "";
            root.querySelector("[data-breakdown]").textContent = "";
            root.querySelector("[data-error]").textContent = game.i18n.localize("OUW25.BargainCalc.Invalid");
            submit.disabled = true;
          }
        };
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
                root.querySelector("[data-leader-name]").textContent = dropped.name;
                root.querySelector("[data-leader-wounds]").textContent = wounds(dropped);
                form.elements.traits.value = traitCount(dropped);
              } else if (zone.dataset.drop === "cooperative") {
                cooperative = dropped;
                snapshot.budget = dropped.system.budget;
                root.querySelector("[data-cooperative-name]").textContent = dropped.name;
              } else if (dropped.uuid !== actor.uuid && !helpers.has(dropped.uuid)) {
                helpers.set(dropped.uuid, dropped);
                const item = document.createElement("li");
                const remove = document.createElement("button");
                remove.type = "button";
                remove.textContent = `${dropped.name} (${game.i18n.localize("OUW25.BargainCalc.Wounds")}: ${wounds(dropped)}) ×`;
                remove.setAttribute("aria-label", game.i18n.format("OUW25.BargainCalc.RemoveHelper", { name: dropped.name }));
                remove.addEventListener("click", () => { helpers.delete(dropped.uuid); item.remove(); });
                item.append(remove);
                root.querySelector("[data-helpers]").append(item);
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
    if (values.friendIds.some(id => {
      const current = actor.items.get(id);
      return current?.type !== "relationship" || current.system.direction !== "friend";
    })) throw new Error("changed");
    const documents = [actor, leader, ...helpers.values(), ...(cooperative ? [cooperative] : [])];
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
    const chosenFriends = friends.filter(friend => values.friendIds.includes(friend.id)).map(friend => friend.name).join(", ");
    const consequence = values.partial
      ? values.consequence === "custom" ? values.custom || game.i18n.localize("OUW25.BargainCalc.Custom")
        : game.i18n.localize(`OUW25.BargainCalc.Consequences.${values.consequence}`) : "—";
    const rows = [
      ["Goal", values.goal || game.i18n.localize("OUW25.BargainCalc.GoalPlaceholder")],
      ["Leader", leader.name], ["Helpers", [...helpers.values()].map(item => item.name).join(", ") || "—"],
      ["Outcome", game.i18n.localize(`OUW25.BargainCalc.${values.partial ? "Partial" : "Full"}`)],
      ["Inflation", game.i18n.localize(`OUW25.BargainCalc.${values.inflation ? "Enabled" : "Disabled"}`)],
      ["Complications", values.complications], ["Advantages", values.advantages],
      ["Neutralized", `${result.neutralized} (${result.spentAdvantages})`],
      ["AdvantagePoints", result.contributions.advantages],
      ["PartialConsequence", consequence],
      ["Price", result.price], ["Paid", result.paid], ["Excess", result.excess],
      ["Cash", values.cash], ["Budget", values.budget], ["Time", values.time], ["Unrest", Number(values.unrest) * 8],
      ["Loan", `${values.loan} ${debts.find(debt => debt.id === values.existingDebt)?.name ?? ""} ${values.loanDescription}`], ["Enemies", `${values.enemies} ${values.enemyDescription}`],
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
