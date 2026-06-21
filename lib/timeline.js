function parseTime(at) {
  if (!at) return 0;
  const d = new Date(at);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

export function buildTimeline(item) {
  const events = [];
  const itemId = item.id || item.code;

  for (const log of item.logs || []) {
    events.push({
      itemId,
      code: item.code,
      vat: item.vat,
      owner: item.owner,
      source: item.source,
      batchStatus: item.status,
      at: log.at,
      type: "log",
      step: log.step,
      note: log.note || "",
      abnormal: !!log.abnormal,
    });
  }

  for (const obs of item.observations || []) {
    events.push({
      itemId,
      code: item.code,
      vat: item.vat,
      owner: item.owner,
      source: item.source,
      batchStatus: item.status,
      at: obs.at,
      type: "observation",
      step: "每日观察",
      note:
        "温度" +
        (obs.temperature || "-") +
        "，气味" +
        (obs.smell || "-") +
        "，纤维" +
        (obs.fiber || "-") +
        "，换水" +
        (obs.changedWater || "-"),
      abnormal: !!obs.abnormal,
      temperature: obs.temperature,
      smell: obs.smell,
      fiber: obs.fiber,
      changedWater: obs.changedWater,
    });
  }

  events.sort((a, b) => parseTime(a.at) - parseTime(b.at));
  return events;
}

export function buildAllTimeline(items, filters = {}) {
  let filtered = items;
  if (filters.code) {
    const q = filters.code.toLowerCase();
    filtered = filtered.filter(
      (i) =>
        (i.code || "").toLowerCase().includes(q) ||
        (i.id || "").toLowerCase().includes(q)
    );
  }
  if (filters.vat) {
    filtered = filtered.filter((i) => (i.vat || "").includes(filters.vat));
  }
  if (filters.owner) {
    filtered = filtered.filter((i) =>
      (i.owner || "").includes(filters.owner)
    );
  }

  const allEvents = [];
  for (const item of filtered) {
    allEvents.push(...buildTimeline(item));
  }
  allEvents.sort((a, b) => parseTime(a.at) - parseTime(b.at));
  return allEvents;
}

export function uniqueValues(items, key) {
  const set = new Set();
  for (const item of items) {
    const val = item[key];
    if (val) set.add(val);
  }
  return [...set].sort();
}
