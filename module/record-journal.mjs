const SYSTEM_ID = "ouw25";
const RECORD_TYPES = new Set(["contact", "contract", "cargo", "port", "debt", "relationship", "possession"]);

export function journalTableKey(item) {
  if (!RECORD_TYPES.has(item.type)) return null;
  return ["debt", "relationship"].includes(item.type) ? `${item.type}-${item.system.direction}` : item.type;
}

const JOURNAL_CLASSES = ["ouw25-journal", "ouw25-journal-cooperative", "ouw25-journal-merchant"];

export function styleSystemJournal(application, element, resolve = uuid => fromUuidSync(uuid, { strict: false })) {
  const document = application.document;
  const journal = document?.documentName === "JournalEntryPage" ? document.parent : document;
  const flags = journal?.flags?.[SYSTEM_ID];
  if (!flags?.actorUuid || !flags.tableKey || !element?.classList) return;
  element.classList.remove(...JOURNAL_CLASSES);
  const tone = resolve(flags.actorUuid)?.type === "cooperative" ? "cooperative" : "merchant";
  element.classList.add("ouw25-journal", `ouw25-journal-${tone}`);
}

export function copyPageOwnership(source, journal, users) {
  const parentDefault = source.parent.ownership.default ?? 0;
  const ownDefault = source.ownership.default;
  const ownership = { default: Math.min(parentDefault, ownDefault === -1 ? parentDefault : (ownDefault ?? 0),
    journal.ownership.default ?? 0) };
  for (const user of users) {
    if (user.isGM) continue;
    ownership[user.id] = Math.min(source.parent.getUserLevel(user), source.getUserLevel(user), journal.getUserLevel(user));
  }
  return ownership;
}

export async function journalPresentation(item, user) {
  const uuid = item.flags?.ouw25?.journalPageUuid;
  if (!uuid) return null;
  let page;
  try { page = await fromUuid(uuid); } catch { return { unavailable: true }; }
  if (!page || page.documentName !== "JournalEntryPage"
    || !page.parent?.testUserPermission(user, "OBSERVER")
    || !page.testUserPermission(user, "OBSERVER")) return { unavailable: true };

  const html = await foundry.applications.ux.TextEditor.enrichHTML(page.text?.content ?? "", {
    secrets: page.testUserPermission(user, "OWNER"), documents: false, links: false,
    embeds: false, rolls: false, custom: false
  });
  const element = document.createElement("template");
  element.innerHTML = html;
  const preview = element.content.textContent.replace(/\s+/g, " ").trim().slice(0, 200);
  const flags = page.parent.flags?.ouw25;
  return { available: true, preview, needsCopy: flags?.tableKey !== journalTableKey(item)
    || Boolean(item.parent && flags?.actorUuid !== item.parent.uuid) };
}

function canObserve(document, user) {
  return Boolean(document?.testUserPermission?.(user, "OBSERVER")
    && (!document.parent || document.parent.testUserPermission?.(user, "OBSERVER")));
}

export function journalIndexForActor(actor, user, journals) {
  const entries = [];
  for (const journal of journals ?? []) {
    const flags = journal.flags?.ouw25;
    if (flags?.actorUuid !== actor.uuid || !flags.tableKey || !canObserve(journal, user)) continue;
    for (const page of journal.pages ?? []) {
      if (canObserve(page, user)) entries.push({
        uuid: page.uuid, name: page.name, table: `OUW25.Journal.Tables.${flags.tableKey}`
      });
    }
  }
  return entries;
}

export async function clearDeletedJournalLinks(document, journalDeleted, actors) {
  const uuid = document.uuid;
  if (!uuid) return;
  for (const actor of actors ?? []) {
    if (!actor.isOwner) continue;
    for (const item of actor.items) {
      const linked = item.flags?.ouw25?.journalPageUuid;
      if (linked && (journalDeleted ? linked.startsWith(`${uuid}.JournalEntryPage.`) : linked === uuid)) {
        await item.unsetFlag(SYSTEM_ID, "journalPageUuid");
      }
    }
    if (!journalDeleted) continue;
    const tables = actor.flags?.ouw25?.journalTables;
    if (!tables || !Object.values(tables).includes(uuid)) continue;
    const updates = Object.fromEntries(Object.entries(tables)
      .filter(([, value]) => value === uuid)
      .map(([key]) => [`flags.${SYSTEM_ID}.journalTables.-=${key}`, null]));
    await actor.update(updates);
  }
}

function stringsIn(value, seen = new Set()) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  return Object.values(value).flatMap(entry => stringsIn(entry, seen));
}

async function containsVisibleLink(content, uuid, source, owner) {
  if (!content.includes(uuid) && !/@(?:UUID|Embed)\[\./i.test(content) && !/data-uuid=["']\./i.test(content)) return false;
  const html = await foundry.applications.ux.TextEditor.enrichHTML(content, {
    secrets: owner, documents: false, links: false, embeds: false, rolls: false, custom: false
  });
  const element = document.createElement("template");
  element.innerHTML = html;
  const refs = [
    ...[...element.content.querySelectorAll("[data-uuid]")].map(link => link.dataset.uuid),
    ...[...element.content.textContent.matchAll(/@(UUID|Embed)\[([^\]]+)\]/gi)].map(([, type, value]) => {
      if (type.toLowerCase() === "uuid") return value;
      const named = value.match(/(?:^|\s)uuid=(?:"([^"]+)"|'([^']+)'|(\S+))/);
      return named ? (named[1] ?? named[2] ?? named[3]) : value.split(/\s+/)[0];
    })
  ];
  for (const reference of refs) {
    if (typeof reference !== "string") continue;
    const ref = reference.split("#")[0];
    if (ref === uuid) return true;
    if (ref.startsWith(".")) {
      try {
        if ((await fromUuid(ref, { relative: source }))?.uuid === uuid) return true;
      } catch { /* invalid relative reference */ }
    }
  }
  return false;
}

export async function findJournalBacklinks(item, user) {
  const uuid = item.flags?.ouw25?.journalPageUuid;
  if (!uuid) return [];
  let page;
  try { page = await fromUuid(uuid); } catch { return []; }
  if (page?.documentName !== "JournalEntryPage" || !canObserve(page, user)) return [];

  const sources = [];
  for (const journal of game.journal ?? []) {
    if (!canObserve(journal, user)) continue;
    for (const source of journal.pages ?? []) {
      if (source.uuid !== uuid && canObserve(source, user) && source.type === "text") {
        sources.push({ document: source, name: `${journal.name} — ${source.name}`, texts: [source.text?.content ?? ""] });
      }
    }
  }
  const addItem = source => {
    if (canObserve(source, user)) {
      sources.push({ document: source, name: source.parent ? `${source.parent.name} — ${source.name}` : source.name,
        texts: stringsIn(source.system?.toObject?.() ?? source.system) });
    }
  };
  for (const actor of game.actors ?? []) {
    if (!canObserve(actor, user)) continue;
    sources.push({ document: actor, name: actor.name, texts: stringsIn(actor.system?.toObject?.() ?? actor.system) });
    for (const source of actor.items ?? []) addItem(source);
  }
  for (const source of game.items ?? []) addItem(source);

  const links = [];
  for (const { document: source, name, texts } of sources) {
    const owner = source.testUserPermission(user, "OWNER");
    for (const text of texts) {
      if (await containsVisibleLink(text, uuid, source, owner)) {
        links.push({ uuid: source.uuid, name });
        break;
      }
    }
  }
  return links;
}

export async function openJournalBacklink(uuid, user) {
  let source;
  try { source = await fromUuid(uuid); } catch { return; }
  if (!canObserve(source, user)) return;
  if (source.documentName === "JournalEntryPage") {
    return source.parent.sheet.render({ force: true, pageId: source.id });
  }
  return source.sheet?.render({ force: true });
}

export async function openRecordJournal(actor, item, editable, copy = false) {
  const tableKey = journalTableKey(item);
  if (!tableKey) return;
  const sourceUuid = item.flags?.ouw25?.journalPageUuid;
  let source;
  if (sourceUuid) {
    try { source = await fromUuid(sourceUuid); } catch { /* inaccessible or deleted */ }
    if (!source || source.documentName !== "JournalEntryPage"
      || !source.parent?.testUserPermission(game.user, "OBSERVER")
      || !source.testUserPermission(game.user, "OBSERVER")) {
      ui.notifications.warn(game.i18n.localize("OUW25.Journal.Unavailable"));
      return;
    }
    const sourceFlags = source.parent.flags?.ouw25;
    if ((sourceFlags?.tableKey === tableKey && sourceFlags?.actorUuid === actor.uuid) || !editable || !copy) {
      return source.parent.sheet.render({ force: true, pageId: source.id });
    }
    if (!source.testUserPermission(game.user, "OWNER")) {
      ui.notifications.warn(game.i18n.localize("OUW25.Journal.NoEditPermission"));
      return;
    }
    if (source.type !== "text") {
      ui.notifications.warn(game.i18n.localize("OUW25.Journal.TextOnly"));
      return;
    }
  }
  if (!editable || !actor.isOwner) return;

  const getCurrent = () => actor.items.get(item.id);
  const unchanged = () => getCurrent() && journalTableKey(getCurrent()) === tableKey
    && getCurrent().flags?.ouw25?.journalPageUuid === sourceUuid;
  const journalUuid = actor.flags?.ouw25?.journalTables?.[tableKey];
  let journal;
  if (journalUuid) {
    try { journal = await fromUuid(journalUuid); } catch { /* inaccessible or deleted */ }
    if (!journal || journal.documentName !== "JournalEntry"
      || journal.flags?.ouw25?.actorUuid !== actor.uuid || journal.flags?.ouw25?.tableKey !== tableKey) {
      ui.notifications.warn(game.i18n.localize("OUW25.Journal.Unavailable"));
      return;
    }
  } else {
    journal = game.journal.find(entry =>
      entry.flags?.ouw25?.actorUuid === actor.uuid && entry.flags?.ouw25?.tableKey === tableKey
    );
  }
  if (!journal) {
    if (!game.user.can("JOURNAL_CREATE")) {
      ui.notifications.warn(game.i18n.localize("OUW25.Journal.NoCreatePermission"));
      return;
    }
    journal = await foundry.documents.JournalEntry.create({
      name: game.i18n.format("OUW25.Journal.Name", {
        actor: actor.name, table: game.i18n.localize(`OUW25.Journal.Tables.${tableKey}`)
      }),
      ownership: { ...actor.ownership },
      flags: { [SYSTEM_ID]: { actorUuid: actor.uuid, tableKey } }
    });
    if (!journal) throw new Error("Journal creation failed");
    ui.notifications.info(game.i18n.localize("OUW25.Journal.OwnershipSnapshot"));
  }
  if (!journal.testUserPermission(game.user, "OWNER")) {
    ui.notifications.warn(game.i18n.localize("OUW25.Journal.NoEditPermission"));
    return;
  }
  if (!unchanged()) {
    ui.notifications.warn(game.i18n.localize("OUW25.Creation.Changed"));
    return;
  }
  if (!journalUuid) {
    try {
      await actor.setFlag(SYSTEM_ID, "journalTables", {
        ...actor.flags?.ouw25?.journalTables, [tableKey]: journal.uuid
      });
    } catch (error) {
      console.error(error);
      ui.notifications.error(game.i18n.localize("OUW25.Journal.LinkFailed"));
      return;
    }
  }
  if (!unchanged() || !actor.isOwner || !journal.testUserPermission(game.user, "OWNER")) {
    ui.notifications.warn(game.i18n.localize("OUW25.Creation.Changed"));
    return;
  }
  const sourceVersion = source?._stats?.modifiedTime ?? null;
  const existing = journal.pages.find(page =>
    page.flags?.ouw25?.recordUuid === item.uuid
      && (page.flags?.ouw25?.copiedFrom ?? null) === (sourceUuid ?? null)
      && (page.flags?.ouw25?.sourceVersion ?? null) === sourceVersion
  );
  const page = existing ?? (await journal.createEmbeddedDocuments("JournalEntryPage", [{
    name: item.name, type: "text",
    text: source ? { content: source.text.content, markdown: source.text.markdown, format: source.text.format } : { content: "" },
    ...(source?.title ? { title: { show: source.title.show, level: source.title.level } } : {}),
    ...(source ? { ownership: copyPageOwnership(source, journal, game.users) } : {}),
    flags: { [SYSTEM_ID]: { recordUuid: item.uuid, copiedFrom: sourceUuid ?? null, sourceVersion } }
  }]))[0];
  if (!page) throw new Error("Journal page creation failed");
  if (!unchanged() || !actor.isOwner || !journal.testUserPermission(game.user, "OWNER")) {
    ui.notifications.warn(game.i18n.localize("OUW25.Journal.LinkFailed"));
    return;
  }
  try {
    await getCurrent().setFlag(SYSTEM_ID, "journalPageUuid", page.uuid);
  } catch (error) {
    console.error(error);
    ui.notifications.error(game.i18n.localize("OUW25.Journal.LinkFailed"));
    return;
  }
  return journal.sheet.render({ force: true, pageId: page.id });
}
