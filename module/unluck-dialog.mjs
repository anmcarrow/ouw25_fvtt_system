import { calculateCheck, checkProbabilities, hasExcessSuccesses, resolveCollision } from "./collision.mjs";
import { applyCheckCosts, checkCostSnapshot, checkCostUpdates } from "./check-costs.mjs";
import { contactCooperative, recordBargainContact, openBargain } from "./bargain-dialog.mjs";
import { registerCollisionWindow, transferCollision } from "./collision-transfer.mjs";

const pending = new Set();
const consequences = ["damage", "threat", "omen", "news", "worsening", "past", "hidden",
  "deadline", "responsibility", "bystanders", "grudge"];

function eligible(actor, type, permission = "OBSERVER") {
  return actor?.documentName === "Actor" && actor.type === type && game.actors.get(actor.id) === actor
    && actor.testUserPermission(game.user, permission);
}

function portrait(actor) {
  const entry = document.createElement("span");
  entry.className = "ouw25-bargain-participant";
  const image = document.createElement("img");
  const src = actor.prototypeToken?.texture?.src;
  image.src = src && !src.includes("*") ? src : actor.img || "icons/svg/mystery-man.svg";
  image.alt = "";
  const name = document.createElement("strong");
  name.textContent = actor.name;
  entry.append(image, name);
  return entry;
}

export async function openUnluck(actor, draft = null, title = null) {
  if (!eligible(actor, "merchant", "OWNER") || pending.has(actor.uuid)) return;
  pending.add(actor.uuid);
  let leader = actor, cooperative = null, luck = 0, donations = 0;
  let selectedWounds = new Set();
  const helpers = new Map();
  let snapshot, unregister = () => {}, actorHook, read;
  try {
    const cooperatives = Array.from(game.actors.values()).filter(item => eligible(item, "cooperative", "OWNER"));
    const automatic = cooperatives.filter(item => item.system.founders?.includes(leader.uuid));
    if (automatic.length === 1) cooperative = automatic[0];
    snapshot = checkCostSnapshot(leader, cooperative);
    const content = await foundry.applications.handlebars.renderTemplate("systems/ouw25/templates/unluck-check.hbs", {
      cooperatives, consequences: consequences.map(id => ({ id, label: `OUW25.BargainCalc.Consequences.${id}` }))
    });
    const selection = await foundry.applications.api.DialogV2.input({
      classes: ["ouw25", "ouw25-unluck-dialog"],
      window: { title: title ?? game.i18n.localize("OUW25.Collision.Title"), resizable: true },
      position: { width: 800, height: 800 }, modal: false, content, rejectClose: false,
      ok: { label: game.i18n.localize("OUW25.Collision.Roll"), callback: (_event, button) => {
        try {
          const form = button.form;
          const values = read(form);
          const calculation = calculateCheck(values);
          const target = values.knowOpponent ? contactCooperative(cooperative, leader) : null;
          if (values.knowOpponent && !target) throw new Error("contact");
          checkCostUpdates(leader, cooperative, snapshot, { ...calculation, source: values.source, wounds: values.woundSlots });
          return { values, calculation, leader, cooperative, snapshot, helpers: [...helpers.values()], contact: target };
        } catch {
          ui.notifications.warn(game.i18n.localize("OUW25.Unluck.Invalid"));
          return false;
        }
      } },
      render: (_event, dialog) => {
        const root = dialog.element, form = root.querySelector("form");
        const value = name => form.elements.namedItem(name)?.value ?? "";
        const readCount = name => value(name) === "" && !form.elements.namedItem(name).validity?.badInput ? "0" : value(name);
        read = () => ({
          goal: value("goal").trim(), opponent: value("opponent").trim() || game.i18n.localize("OUW25.BargainCalc.DefaultOpponent"),
          knowOpponent: form.elements.knowOpponent.checked, partial: form.elements.partial.checked,
          consequence: form.elements.partial.checked ? value("consequence") : "", custom: value("custom").trim(),
          advantages: readCount("advantages"), complications: readCount("complications"),
          wounds: selectedWounds.size, woundSlots: [...selectedWounds], luck, donations, source: value("source")
        });
        const update = () => {
          form.elements.consequence.disabled = !form.elements.partial.checked;
          root.querySelector("[data-custom]").hidden = !form.elements.partial.checked || value("consequence") !== "custom";
          root.querySelector("[data-luck-available]").textContent = game.i18n.format("OUW25.Unluck.LuckAvailable", { count: leader.system.luck });
          root.querySelector("[data-luck-selected]").textContent = luck;
          root.querySelector("[data-donation]").textContent = game.i18n.format("OUW25.Unluck.DonationAmount", { amount: donations * 180, dice: donations });
          const error = root.querySelector("[data-check-error]");
          const submit = root.querySelector('[data-action="ok"]');
          try {
            const values = read(), calc = calculateCheck(values);
            root.querySelector("[data-dice-count]").textContent = calc.diceCount;
            root.querySelector("[data-check-summary]").textContent = game.i18n.format("OUW25.Unluck.Summary", {
              dice: calc.diceCount, deduction: calc.deduction, luck: calc.luck
            });
            const odds = checkProbabilities(calc.diceCount, calc.deduction, calc.luck);
            root.querySelector("[data-odds]").textContent = odds ? game.i18n.format("OUW25.Unluck.OddsValues", {
              failure: (odds.Failure * 100).toFixed(1), partial: (odds.Partial * 100).toFixed(1),
              success: (odds.Success * 100).toFixed(1)
            }) : game.i18n.localize("OUW25.Unluck.OddsBroken");
            try {
              if (values.knowOpponent && !contactCooperative(cooperative, leader)) throw new Error("contact");
              checkCostUpdates(leader, cooperative, snapshot, { ...calc, source: values.source, wounds: values.woundSlots });
            } catch {
              error.textContent = game.i18n.localize("OUW25.Unluck.Invalid");
              submit.disabled = true;
              return;
            }
            error.textContent = "";
            submit.disabled = false;
          } catch {
            error.textContent = game.i18n.localize("OUW25.Unluck.Invalid");
            root.querySelector("[data-odds]").textContent = "—";
            submit.disabled = true;
          }
        };
        const showWounds = () => {
          const area = root.querySelector("[data-wounds]");
          area.replaceChildren();
          snapshot.wounds.forEach((marked, index) => {
            const label = document.createElement("label"), input = document.createElement("input");
            input.type = "checkbox"; input.checked = marked || selectedWounds.has(index + 1);
            input.disabled = marked || !eligible(leader, "merchant", "OWNER");
            input.addEventListener("change", () => {
              if (input.checked) selectedWounds.add(index + 1); else selectedWounds.delete(index + 1);
              update();
            });
            label.append(input, document.createTextNode(game.i18n.format(
              index + 1 === snapshot.wounds.length ? "OUW25.Condition.LethalWound" : "OUW25.Condition.Wound",
              { slot: index + 1 }
            )));
            area.append(label);
          });
        };
        const selectLeader = selected => {
          if (!eligible(selected, "merchant")) return;
          leader = selected; luck = 0; selectedWounds = new Set();
          const matches = cooperatives.filter(item => item.system.founders?.includes(leader.uuid));
          cooperative = matches.length === 1 ? matches[0] : null;
          form.elements.cooperative.value = cooperative?.id ?? "";
          snapshot = checkCostSnapshot(leader, cooperative);
          root.querySelector("[data-leader]").replaceChildren(portrait(leader));
          if (helpers.delete(leader.uuid)) showHelpers();
          showWounds(); update();
        };
        const showHelpers = () => {
          const list = root.querySelector("[data-helpers]"); list.replaceChildren();
          for (const helper of helpers.values()) {
            const item = document.createElement("li"), button = document.createElement("button");
            button.type = "button";
            button.append(portrait(helper), document.createTextNode(" ×"));
            button.setAttribute("aria-label", game.i18n.format("OUW25.BargainCalc.RemoveHelper", { name: helper.name }));
            button.addEventListener("click", () => { helpers.delete(helper.uuid); showHelpers(); });
            item.append(button); list.append(item);
          }
          root.querySelector("[data-helper-hint]").hidden = helpers.size > 0;
        };
        const receive = incoming => {
          form.reset();
          luck = 0; donations = 0; selectedWounds = new Set();
          if (eligible(incoming.leader, "merchant")) selectLeader(incoming.leader);
          helpers.clear();
          for (const helper of incoming.helpers ?? []) {
            if (eligible(helper, "merchant") && helper.uuid !== leader.uuid) helpers.set(helper.uuid, helper);
          }
          showHelpers();
          for (const name of ["goal", "advantages", "complications"]) form.elements[name].value = incoming[name] ?? (name === "goal" ? "" : "0");
          form.elements.opponent.value = incoming.opponent ?? "";
          form.elements.knowOpponent.checked = Boolean(incoming.knowOpponent);
          update();
        };
        unregister();
        unregister = registerCollisionWindow(actor, "check", receive);
        root.querySelector("[data-transfer-bargain]").addEventListener("click", () => {
          const values = read();
          transferCollision(actor, "bargain", { ...values, leader, helpers: [...helpers.values()] }, openBargain);
        });
        root.querySelector("[data-luck-minus]").addEventListener("click", () => { luck = Math.max(0, luck - 1); update(); });
        root.querySelector("[data-luck-plus]").addEventListener("click", () => { luck = Math.min(leader.system.luck, luck + 1); update(); });
        const luckDrop = root.querySelector("[data-luck-drop]");
        luckDrop.addEventListener("dragover", event => event.preventDefault());
        luckDrop.addEventListener("drop", event => {
          event.preventDefault();
          try {
            const data = JSON.parse(event.dataTransfer.getData("text/plain"));
            if (data.type === "OUW25Luck" && data.uuid === leader.uuid && eligible(leader, "merchant", "OWNER")) {
              luck = Math.min(leader.system.luck, luck + 1);
              update();
            }
          } catch { /* Ignore unrelated drops. */ }
        });
        root.querySelector("[data-donation-minus]").addEventListener("click", () => { donations = Math.max(0, donations - 1); update(); });
        root.querySelector("[data-donation-plus]").addEventListener("click", () => { donations++; update(); });
        form.elements.cooperative.addEventListener("change", () => {
          cooperative = cooperatives.find(item => item.id === value("cooperative")) ?? null;
          snapshot.budget = cooperative?.system.budget; update();
        });
        form.elements.partial.addEventListener("change", () => {
          if (form.elements.partial.checked && !value("consequence")) {
            form.elements.consequence.value = consequences[Math.floor(Math.random() * consequences.length)];
          }
          update();
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
              if (!eligible(dropped, "merchant")) return;
              if (zone.dataset.drop === "leader") selectLeader(dropped);
              else if (dropped.uuid !== leader.uuid) { helpers.set(dropped.uuid, dropped); showHelpers(); }
            } catch (error) { console.error("OUW25 | Check participant drop failed", error); }
          });
        }
        selectLeader(leader);
        if (draft) { receive(draft); draft = null; }
        if (actorHook !== undefined) Hooks.off("updateActor", actorHook);
        actorHook = Hooks.on("updateActor", changed => {
          if (changed !== leader && changed !== cooperative) return;
          snapshot = checkCostSnapshot(leader, cooperative);
          selectedWounds = new Set([...selectedWounds].filter(slot => !snapshot.wounds[slot - 1]));
          luck = Math.min(luck, leader.system.luck);
          showWounds(); update();
        });
      }
    });
    if (!selection) return;
    const { values, calculation, leader: roller, cooperative: payer, helpers: participants, contact } = selection;
    const documents = [...new Set([actor, roller, ...participants, ...(payer ? [payer] : []), ...(contact ? [contact] : [])])];
    if (documents.some(document => !document.testUserPermission(game.user, "OBSERVER"))) throw new Error("permissions");
    const recipients = Array.from(game.users).filter(user => user.isGM
      || documents.every(document => document.testUserPermission(user, "OBSERVER"))).map(user => user.id);
    if (!recipients.length) throw new Error("recipients");
    const mode = game.settings.get("core", "messageMode");
    const roll = await new foundry.dice.Roll(`${calculation.diceCount}d6`).evaluate({ allowInteractive: !["blind", "blindroll"].includes(mode) });
    const dice = roll.dice.flatMap(term => term.results.filter(result => result.active).map(result => result.result));
    const remaining = resolveCollision(dice, calculation.deduction).remaining + calculation.luck;
    const outcome = remaining >= 2 ? "Success" : remaining === 1 ? "Partial" : "Failure";
    try {
      await applyCheckCosts(roller, payer, selection.snapshot, { ...calculation, source: values.source, wounds: values.woundSlots });
      if (contact) await recordBargainContact(contact, values.opponent);
    } catch (error) {
      console.error("OUW25 | Check costs failed", error);
      ui.notifications.error(game.i18n.localize("OUW25.Unluck.CostsFailed"));
      return;
    }
    const result = game.i18n.format("OUW25.Collision.Result", {
      outcome: game.i18n.localize(`OUW25.Collision.${outcome}`), remaining
    });
    const consequence = values.consequence === "custom" ? values.custom
      : values.consequence ? game.i18n.localize(`OUW25.BargainCalc.Consequences.${values.consequence}`) : "—";
    const details = [
      ["Goal", values.goal || game.i18n.localize("OUW25.BargainCalc.GoalPlaceholder")],
      ["Opponent", values.opponent], ["Leader", roller.name],
      ["Helpers", participants.map(item => item.name).join(", ") || "—"],
      ["PartialConsequence", consequence], ["Complications", calculation.deduction],
      ["Advantages", values.advantages]
    ].map(([label, value]) => ({ label: `OUW25.BargainCalc.${label}`, value }));
    details.push({ label: "OUW25.Collision.Dice", value: calculation.diceCount },
      { label: "OUW25.Unluck.Luck", value: calculation.luck },
      { label: "OUW25.Unluck.Donation", value: calculation.donation },
      { label: "OUW25.Unluck.Wounds", value: values.woundSlots.join(", ") || "—" });
    try {
      const { ChatMessage } = foundry.documents;
      const flavor = await foundry.applications.handlebars.renderTemplate("systems/ouw25/templates/check-card.hbs", {
        actorName: roller.name, title: title ?? game.i18n.localize("OUW25.Collision.Title"), result, details,
        hint: [game.i18n.localize("OUW25.Unluck.AfterRoll"),
          ...(hasExcessSuccesses(remaining, values.partial) ? [game.i18n.localize("OUW25.Unluck.ChangePlan")] : [])].join(" ")
      });
      const message = { speaker: ChatMessage.getSpeaker({ actor: roller }), flavor, rolls: [roll] };
      ChatMessage.applyRollMode(message, mode);
      message.whisper = ["public", "ic", "publicroll", "roll"].includes(mode)
        ? recipients : (message.whisper ?? []).filter(id => recipients.includes(id));
      if (!message.whisper.length) throw new Error("No authorized recipients");
      await ChatMessage.create(message);
    } catch (error) {
      console.error("OUW25 | Check chat failed", error);
      ui.notifications.error(game.i18n.localize("OUW25.Unluck.ChatFailed"));
    }
  } finally {
    unregister();
    if (actorHook !== undefined) Hooks.off("updateActor", actorHook);
    pending.delete(actor.uuid);
  }
}
