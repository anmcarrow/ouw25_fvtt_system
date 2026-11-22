const SYSTEM_ID = "ouw25";
const RECORD_TYPES = new Set(["contact", "contract", "cargo", "port", "debt", "relationship", "possession"]);

export function journalTableKey(item) {
  if (!RECORD_TYPES.has(item.type)) return null;
  return ["debt", "relationship"].includes(item.type) ? `${item.type}-${item.system.direction}` : item.type;
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
  return { available: true, preview, needsCopy: page.parent.flags?.ouw25?.tableKey !== journalTableKey(item) };
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
    if (source.parent.flags?.ouw25?.tableKey === tableKey || !editable || !copy) {
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
