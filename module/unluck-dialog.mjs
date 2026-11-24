import { calculateCheck, checkProbabilities, hasExcessSuccesses, resolveCollision } from "./collision.mjs";
import { applyCheckCosts, checkCostSnapshot, checkCostUpdates } from "./check-costs.mjs";
import { contactCooperative, firstFounderCooperative, participant, recordBargainContact, openBargain } from "./bargain-dialog.mjs";
import { registerCollisionWindow, transferCollision } from "./collision-transfer.mjs";

const pending = new Set();
const consequences = ["damage", "threat", "omen", "news", "worsening", "past", "hidden",
  "deadline", "responsibility", "bystanders", "grudge"];

function eligible(actor, type, permission = "OBSERVER") {
  return actor?.documentName === "Actor" && actor.type === type && game.actors.get(actor.id) === actor
    && actor.testUserPermission(game.user, permission);
}

export function renderLuckMarks(marks, luck) {
  const count = Math.max(1, luck);
  while (marks.children.length > count) marks.lastElementChild.remove();
  while (marks.children.length < count) {
    const mark = document.createElement("span");
    mark.className = "ouw25-unluck-luck-mark";
    if (marks.children.length) {
      const angle = Math.random() * 2 * Math.PI, distance = 20 + Math.random() * 10;
      mark.style.setProperty("--luck-x", `${Math.cos(angle) * distance}%`);
      mark.style.setProperty("--luck-y", `${Math.sin(angle) * distance}%`);
    }
    marks.append(mark);
  }
  marks.classList.toggle("is-empty", luck === 0);
}

export function reelValues(dice, deduction) {
  const values = [...dice].sort((a, b) => b - a).slice(0, 4).map(String);
  if (resolveCollision(dice, deduction).remaining > 4) values[3] = "6+";
  return values;
}

function spinReels(root, blind) {
  const reels = root.querySelectorAll("[data-reel]");
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  for (const reel of reels) {
    reel.textContent = blind ? "?" : "—";
    if (blind || reduced) continue;
    const strip = document.createElement("div");
    strip.className = "ouw25-unluck-reel-strip";
    for (let i = 0; i < 12; i++) {
      const number = document.createElement("span");
      number.textContent = String(i % 6 + 1);
      strip.append(number);
    }
    reel.replaceChildren(strip);
  }
  return reduced;
}

async function showReels(root, dice, deduction, blind, reduced) {
  if (blind || !root.isConnected) return;
  const reels = root.querySelectorAll("[data-reel]"), values = reelValues(dice, deduction);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  if (!reduced) await pause(450);
  for (let i = 0; i < reels.length && root.isConnected; i++) {
    reels[i].textContent = values[i] ?? "—";
    if (!reduced && i < reels.length - 1) await pause(260);
  }
  if (root.isConnected) await pause(1000);
}

export async function openUnluck(actor, draft = null, title = null) {
  if (!eligible(actor, "merchant", "OWNER") || pending.has(actor.uuid)) return;
  pending.add(actor.uuid);
  let leader = actor, cooperative = null, cooperativeManual = false, luck = 0, donations = 0;
  let selectedWounds = new Set();
  const helpers = new Map();
  let snapshot, unregister = () => {}, actorHook, read, refresh, dialogInstance, root, resourceObserver;
  let committed = false, closed = false, finish, generation = 0;
  try {
    const cooperatives = Array.from(game.actors.values()).filter(item => eligible(item, "cooperative", "OWNER"));
    cooperative = firstFounderCooperative(leader);
    if (cooperative && !cooperatives.includes(cooperative)) cooperatives.push(cooperative);
    snapshot = checkCostSnapshot(leader, cooperative);
    const content = await foundry.applications.handlebars.renderTemplate("systems/ouw25/templates/unluck-check.hbs", {
      cooperatives, consequences: consequences.map(id => ({ id, label: `OUW25.BargainCalc.Consequences.${id}` }))
    });
    const config = {
      classes: ["ouw25", "ouw25-unluck-dialog"],
      window: { title: game.i18n.format("OUW25.Unluck.WindowTitle", { name: actor.name }), resizable: true },
      position: { width: 650, height: 800 }, modal: false, content, form: { closeOnSubmit: false },
      buttons: [{ action: "ok", default: true, label: game.i18n.localize("OUW25.Unluck.Roll"), callback: async (_event, button) => {
        if (committed) return;
        const form = button.form;
        let selection;
        try {
          const values = read(form);
          const calculation = calculateCheck(values);
          const target = values.knowOpponent && cooperative ? contactCooperative(cooperative, leader) : null;
          if (values.knowOpponent && !target) throw new Error("contact");
          checkCostUpdates(leader, cooperative, snapshot, { ...calculation, source: values.source, wounds: values.woundSlots });
          selection = { values, calculation, leader, cooperative, snapshot, helpers: [...helpers.values()], contact: target };
        } catch {
          ui.notifications.warn(game.i18n.localize("OUW25.Unluck.Invalid"));
          setTimeout(() => { if (!closed && !committed) refresh(); }, 0);
          return;
        }
        committed = true;
        generation++;
        form.inert = true;
        let costsAttempted = false;
        try {
          if (!await perform(selection, () => { costsAttempted = true; })) {
            for (const reel of root.querySelectorAll("[data-reel]")) reel.textContent = "—";
          }
        } catch (error) {
          for (const reel of root.querySelectorAll("[data-reel]")) reel.textContent = "—";
          console.error("OUW25 | Check failed", error);
          ui.notifications.error(game.i18n.localize("OUW25.Unluck.Invalid"));
        } finally {
          if (costsAttempted) { luck = 0; donations = 0; selectedWounds.clear(); }
          committed = false;
          if (closed) finish();
          else {
            form.inert = false;
            refresh();
            setTimeout(() => { if (!closed && !committed) refresh(); }, 0);
          }
        }
      } }],
      render: (_event, dialog) => {
        dialogInstance = dialog;
        root = dialog.element;
        const form = root.querySelector("form");
        const submit = root.querySelector('[data-action="ok"]');
        if (!submit.querySelector(".ouw25-unluck-roll-label")) {
          const label = document.createElement("span");
          label.className = "ouw25-unluck-roll-label";
          label.append(...submit.childNodes);
          submit.append(label);
        }
        const staged = game.i18n.localize("OUW25.Unluck.Staged");
        submit.dataset.tooltip = staged;
        submit.setAttribute("aria-description", staged);
        const resources = root.querySelector(".ouw25-unluck-resources");
        const donationBlock = root.querySelector(".ouw25-unluck-donation");
        const statusBlock = root.querySelector(".ouw25-unluck-status");
        resourceObserver?.disconnect();
        if (resources && donationBlock && statusBlock) {
          const syncWidths = () => { statusBlock.style.width = `${donationBlock.getBoundingClientRect().width}px`; };
          syncWidths();
          if (globalThis.ResizeObserver) {
            resourceObserver = new ResizeObserver(syncWidths);
            resourceObserver.observe(donationBlock);
          }
        }
        const value = name => form.elements.namedItem(name)?.value ?? "";
        const readCount = name => value(name) === "" && !form.elements.namedItem(name).validity?.badInput ? "0" : value(name);
        read = () => ({
          goal: value("goal").trim(), opponent: value("opponent").trim() || game.i18n.localize("OUW25.BargainCalc.DefaultOpponent"),
          knowOpponent: form.elements.knowOpponent.checked, partial: form.elements.partial.checked,
          consequence: form.elements.partial.checked ? value("consequence") : "", custom: value("custom").trim(),
          advantages: readCount("advantages"), complications: readCount("complications"),
          wounds: selectedWounds.size, woundSlots: [...selectedWounds], luck, donations, source: value("source")
        });
        const marks = root.querySelector("[data-luck-marks]");
        const donationLimit = () => {
          const source = value("source");
          const payer = source === "cash" ? leader : source === "budget" ? cooperative : null;
          const type = source === "cash" ? "merchant" : "cooperative";
          const balance = source === "cash" ? payer?.system.pocketMoney : payer?.system.budget;
          return eligible(payer, type, "OWNER") && Number.isSafeInteger(balance) && balance > 0
            ? Math.min(96, Math.floor(balance / 180)) : 0;
        };
        const update = () => {
          const advantages = form.elements.advantages;
          if (/^\d+$/.test(advantages.value) && Number(advantages.value) > 96) advantages.value = "96";
          const limit = donationLimit();
          donations = Math.min(donations, limit);
          root.querySelector("[data-donation-plus]").disabled = donations >= limit;
          root.querySelector("[data-donation-minus]").disabled = donations === 0;
          form.elements.consequence.disabled = !form.elements.partial.checked;
          root.querySelector("[data-custom]").hidden = !form.elements.partial.checked || value("consequence") !== "custom";
          root.querySelector("[data-luck-selected]").textContent = luck;
          renderLuckMarks(marks, luck);
          root.querySelector("[data-donation-amount]").textContent = game.i18n.format("OUW25.Unluck.DonationTotal", { amount: donations * 180 });
          const error = root.querySelector("[data-check-error]");
          const submit = root.querySelector('[data-action="ok"]');
          try {
            const values = read(), calc = calculateCheck(values);
            const diceCount = root.querySelector("[data-dice-count]");
            diceCount.textContent = calc.diceCount;
            diceCount.style.setProperty("--dice-digits", String(calc.diceCount).length);
            const odds = checkProbabilities(calc.diceCount, calc.deduction, calc.luck);
            root.querySelector("[data-odds]").textContent = odds ? game.i18n.format("OUW25.Unluck.OddsValues", {
              failure: (odds.Failure * 100).toFixed(1), partial: (odds.Partial * 100).toFixed(1),
              success: (odds.Success * 100).toFixed(1)
            }) : game.i18n.localize("OUW25.Unluck.OddsBroken");
            try {
              if (values.knowOpponent && (!cooperative || !contactCooperative(cooperative, leader))) throw new Error("contact");
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
          area.dataset.count = snapshot.wounds.length;
          snapshot.wounds.forEach((marked, index) => {
            const label = document.createElement("label"), input = document.createElement("input");
            input.type = "checkbox"; input.checked = marked || selectedWounds.has(index + 1);
            input.disabled = marked || !eligible(leader, "merchant", "OWNER");
            input.addEventListener("change", () => {
              if (input.checked) selectedWounds.add(index + 1); else selectedWounds.delete(index + 1);
              update();
            });
            const description = game.i18n.format(
              index + 1 === snapshot.wounds.length ? "OUW25.Condition.LethalWound" : "OUW25.Condition.Wound",
              { slot: index + 1 }
            );
            input.setAttribute("aria-label", description);
            input.dataset.tooltip = description;
            label.className = "ouw25-condition-check";
            const icon = document.createElement("span");
            icon.textContent = index + 1 === snapshot.wounds.length ? "💀" : "🩸";
            icon.setAttribute("aria-hidden", "true");
            label.append(input, icon);
            area.append(label);
          });
        };
        const selectCooperative = (selected, manual = true) => {
          cooperative = eligible(selected, "cooperative") ? selected : null;
          cooperativeManual = manual;
          snapshot.budget = cooperative?.system.budget;
          root.querySelector("[data-cooperative]").replaceChildren(...(cooperative ? [participant(cooperative)] : []));
          root.querySelector("[data-cooperative-hint]").hidden = Boolean(cooperative);
          update();
        };
        const selectLeader = selected => {
          if (!eligible(selected, "merchant")) return;
          leader = selected; luck = 0; selectedWounds = new Set();
          snapshot = checkCostSnapshot(leader, cooperative);
          selectCooperative(cooperativeManual ? cooperative : firstFounderCooperative(leader), cooperativeManual);
          root.querySelector("[data-leader]").replaceChildren(participant(leader));
          if (helpers.delete(leader.uuid)) showHelpers();
          showWounds(); update();
        };
        const showHelpers = () => {
          const list = root.querySelector("[data-helpers]"); list.replaceChildren();
          for (const helper of helpers.values()) {
            const item = document.createElement("li"), button = document.createElement("button");
            button.type = "button";
            button.className = "ouw25-bargain-entry";
            button.append(participant(helper), document.createTextNode(" ×"));
            button.setAttribute("aria-label", game.i18n.format("OUW25.BargainCalc.RemoveHelper", { name: helper.name }));
            button.addEventListener("click", () => { helpers.delete(helper.uuid); showHelpers(); });
            item.append(button); list.append(item);
          }
          root.querySelector("[data-helper-hint]").hidden = helpers.size > 0;
        };
        const receive = incoming => {
          if (committed) return;
          form.reset();
          luck = 0; donations = 0; selectedWounds = new Set();
          cooperativeManual = false;
          if (eligible(incoming.leader, "merchant")) selectLeader(incoming.leader);
          if ("cooperative" in incoming) selectCooperative(incoming.cooperative);
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
          transferCollision(actor, "bargain", { ...values, leader, cooperative, helpers: [...helpers.values()] }, openBargain);
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
        root.querySelector("[data-donation-plus]").addEventListener("click", () => {
          if (donations < donationLimit()) donations++;
          update();
        });
        const cooperativeCard = root.querySelector("[data-cooperative]");
        cooperativeCard.addEventListener("click", () => selectCooperative(null));
        cooperativeCard.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectCooperative(null);
          }
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
            if (committed) return;
            const dropGeneration = generation;
            try {
              const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
              if (data.type !== "Actor") return;
              const dropped = await foundry.documents.Actor.fromDropData(data);
              if (committed || dropGeneration !== generation) return;
              if (zone.dataset.drop === "cooperative") {
                if (eligible(dropped, "cooperative", "OWNER")) selectCooperative(dropped);
              } else if (eligible(dropped, "merchant")) {
                if (zone.dataset.drop === "leader") selectLeader(dropped);
                else if (dropped.uuid !== leader.uuid) { helpers.set(dropped.uuid, dropped); showHelpers(); }
              }
            } catch (error) { console.error("OUW25 | Check participant drop failed", error); }
          });
        }
        selectLeader(leader);
        if (draft) { receive(draft); draft = null; }
        if (actorHook !== undefined) Hooks.off("updateActor", actorHook);
        actorHook = Hooks.on("updateActor", changed => {
          if (committed || changed !== leader && changed !== cooperative) return;
          snapshot = checkCostSnapshot(leader, cooperative);
          selectedWounds = new Set([...selectedWounds].filter(slot => !snapshot.wounds[slot - 1]));
          luck = Math.min(luck, leader.system.luck);
          root.querySelector("[data-leader]").replaceChildren(participant(leader));
          showWounds(); update();
        });
        refresh = () => {
          snapshot = checkCostSnapshot(leader, cooperative);
          selectedWounds = new Set([...selectedWounds].filter(slot => !snapshot.wounds[slot - 1]));
          luck = Math.min(luck, leader.system.luck);
          root.querySelector("[data-leader]").replaceChildren(participant(leader));
          showWounds(); update();
        };
      }
    };
    async function perform(selection, costsStarted) {
      const { values, calculation, leader: roller, cooperative: payer, helpers: participants, contact } = selection;
      const documents = [...new Set([actor, roller, ...participants, ...(payer ? [payer] : []), ...(contact ? [contact] : [])])];
      if (documents.some(document => !document.testUserPermission(game.user, "OBSERVER"))) throw new Error("permissions");
      const recipients = Array.from(game.users).filter(user => user.isGM
        || documents.every(document => document.testUserPermission(user, "OBSERVER"))).map(user => user.id);
      if (!recipients.length) throw new Error("recipients");
      const mode = game.settings.get("core", "messageMode");
      const blind = ["blind", "blindroll"].includes(mode);
      const reduced = spinReels(root, blind);
      const roll = await new foundry.dice.Roll(`${calculation.diceCount}d6`).evaluate({ allowInteractive: !blind });
      const dice = roll.dice.flatMap(term => term.results.filter(result => result.active).map(result => result.result));
      const remaining = resolveCollision(dice, calculation.deduction).remaining + calculation.luck;
      const outcome = remaining >= 2 ? "Success" : remaining === 1 ? "Partial" : "Failure";
      try {
        costsStarted();
        await applyCheckCosts(roller, payer, selection.snapshot, { ...calculation, source: values.source, wounds: values.woundSlots });
        if (contact) await recordBargainContact(contact, values.opponent);
      } catch (error) {
        console.error("OUW25 | Check costs failed", error);
        ui.notifications.error(game.i18n.localize("OUW25.Unluck.CostsFailed"));
        return false;
      }
      await showReels(root, dice, calculation.deduction, blind, reduced);
      const result = game.i18n.format("OUW25.Collision.Result", {
        outcome: game.i18n.localize(`OUW25.Collision.${outcome}`), remaining
      });
      const consequence = values.consequence === "custom" ? values.custom
        : values.consequence ? game.i18n.localize(`OUW25.BargainCalc.Consequences.${values.consequence}`) : "—";
      const details = [
        ["Goal", values.goal || game.i18n.localize("OUW25.BargainCalc.GoalPlaceholder")],
        ["Opponent", values.opponent], ["Leader", roller.name],
        ["Helpers", participants.map(item => item.name).join(", ") || "—"],
        ["Cooperative", payer?.name || "—"],
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
      return true;
    }
    await new Promise((resolve, reject) => {
      finish = resolve;
      const { render, ...options } = config;
      dialogInstance = new foundry.applications.api.DialogV2(options);
      dialogInstance.addEventListener("render", event => render(event, dialogInstance));
      dialogInstance.addEventListener("close", () => {
        closed = true;
        unregister();
        resourceObserver?.disconnect();
        if (actorHook !== undefined) { Hooks.off("updateActor", actorHook); actorHook = undefined; }
        if (!committed) finish();
      }, { once: true });
      Promise.resolve(dialogInstance.render({ force: true })).catch(reject);
    });
  } finally {
    unregister();
    resourceObserver?.disconnect();
    if (actorHook !== undefined) Hooks.off("updateActor", actorHook);
    pending.delete(actor.uuid);
  }
}
