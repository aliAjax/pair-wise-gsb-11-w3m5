import type { Conflict, Permit, PermitSnapshot } from "./types";
import { areaName } from "./constants";

type ConflictParty = Pick<
  Permit,
  "baseId" | "area" | "equipmentKey" | "equipmentName" | "startAt" | "endAt"
>;

// 只有已签发且未回收的票参与时段互斥（待签发票作为录入拦截参考时由调用方决定）
export function activeForConflict(p: Permit): boolean {
  return p.status === "issued" && !p.reclaimedAt;
}

function snapshot(p: Permit): PermitSnapshot {
  return {
    baseId: p.baseId,
    code: p.code,
    version: p.version,
    area: p.area,
    equipmentKey: p.equipmentKey,
    equipmentName: p.equipmentName,
    equipmentKind: p.equipmentKind,
    startAt: p.startAt,
    endAt: p.endAt,
    guardian: p.guardian,
    shutdown: p.shutdown,
    isolation: p.isolation,
    readings: p.readings,
    issueNote: p.issueNote,
    issuedAt: p.issuedAt
  };
}

// 同一防火区域内，时段相邻或重叠 => 冲突（即使设备不同，区域内也只允许一张动火票）；
// 同一版本族的新旧版本之间不算冲突
export function pairConflict(a: ConflictParty, b: ConflictParty): Omit<Conflict, "key" | "a" | "b"> | null {
  if (a.baseId === b.baseId) return null;
  if (a.area !== b.area) return null;

  const aStart = new Date(a.startAt).getTime();
  const aEnd = new Date(a.endAt).getTime();
  const bStart = new Date(b.startAt).getTime();
  const bEnd = new Date(b.endAt).getTime();

  const overlap = aStart < bEnd && bStart < aEnd;
  const adjacent = !overlap && (aEnd === bStart || bEnd === aStart);
  if (!overlap && !adjacent) return null;

  return {
    reason: overlap ? "overlap" : "adjacent",
    reasonText: overlap ? "许可时段重叠" : "许可时段相邻（无间隔）",
    area: areaName(a.area),
    equipmentName: [a.equipmentName, b.equipmentName].filter(Boolean).join(" ↔ ") || "—",
    startAt: overlap ? new Date(Math.max(aStart, bStart)).toISOString() : new Date(Math.min(aEnd, bEnd)).toISOString(),
    endAt: overlap ? new Date(Math.min(aEnd, bEnd)).toISOString() : new Date(Math.max(aEnd, bEnd)).toISOString()
  };
}

// 候选票（尚未保存）与已保存票之间的冲突，用于创建/签发前拦截
export function conflictsForCandidate(
  candidate: { area: string; equipmentKey: string; startAt: string; endAt: string; baseId?: string },
  permits: Permit[],
  opts: { includeDrafts?: boolean } = {}
): Conflict[] {
  const fake: PermitSnapshot = {
    baseId: candidate.baseId ?? crypto.randomUUID(),
    code: "候选作业票",
    version: 0,
    area: candidate.area,
    equipmentKey: candidate.equipmentKey,
    equipmentName: "",
    equipmentKind: "tank",
    startAt: candidate.startAt,
    endAt: candidate.endAt,
    guardian: "",
    shutdown: { state: "in_use", stoppedAt: "", method: "", recorder: "", note: "" },
    isolation: [],
    readings: [],
    issueNote: "",
    issuedAt: ""
  };
  return permits
    .filter((p) => (opts.includeDrafts ? true : activeForConflict(p)))
    .filter((p) => p.baseId !== fake.baseId)
    .map((p) => {
      const c = pairConflict(fake, p);
      return c ? { ...c, key: `candidate-${p.id}`, a: fake, b: snapshot(p) } : null;
    })
    .filter((c): c is Conflict => c !== null);
}

// 当前全部已签发票据之间的冲突列表（刷新后仍保持一致）
export function computeConflicts(permits: Permit[]): Conflict[] {
  const active = permits.filter(activeForConflict);
  const conflicts: Conflict[] = [];
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const c = pairConflict(active[i], active[j]);
      if (c) {
        conflicts.push({ ...c, key: `${active[i].id}__${active[j].id}`, a: snapshot(active[i]), b: snapshot(active[j]) });
      }
    }
  }
  return conflicts;
}
