// Pure replay state: repeated seeks cannot double-count an event.
export const latestAt = (rows, time) => {
  let lo = 0, hi = rows.length;
  while (lo < hi) {const mid = (lo + hi) >>> 1; if (rows[mid].t_s <= time) lo = mid + 1; else hi = mid;}
  return rows[lo - 1];
};

export function snapshot(analysis, time, useReview = true) {
  if (!Number.isFinite(time)) throw new Error('Time must be finite');
  time = Math.max(0, Math.min(analysis.duration_s, time));
  const units = analysis.events.filter(e => e.kind === 'unit_produced' && e.t_s <= time);
  const people = new Map((analysis.employees || analysis.review?.employees || []).map(p => [p.id, {...p, units:0, reviewed:0, automatic:0}]));
  let unknown = 0;
  for (const e of units) {
    const manual = useReview ? e.review?.employee : null;
    const employee = manual || e.employee;
    if (!employee) {unknown++; continue;}
    if (!people.has(employee)) people.set(employee, {id:employee,label:employee,units:0,reviewed:0,automatic:0});
    const p = people.get(employee); p.units++; p[manual ? 'reviewed' : 'automatic']++;
  }
  return {units, people:[...people.values()], unknown};
}
