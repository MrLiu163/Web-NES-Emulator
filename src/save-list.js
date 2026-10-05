export function defaultSaveName(gameName, date) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(date));
  return `${gameName} ${parts}`;
}
export function orderedSaves(records, gameId) {
  return records.filter(s => s.gameId === gameId && !s.deletedAt).sort((a, b) =>
    (a.order ?? -a.date) - (b.order ?? -b.date) || b.date - a.date || a.id.localeCompare(b.id));
}
export function moveSave(records, sourceId, targetId) {
  const result = [...records];
  const from = result.findIndex(s => s.id === sourceId);
  const to = result.findIndex(s => s.id === targetId);
  if (from < 0 || to < 0 || from === to) return result;
  result.splice(to, 0, result.splice(from, 1)[0]);
  return result;
}
