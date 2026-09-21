// 动火作业隔离确认台：领域规则（冲突判定 / 签发闸口 / 巡检限值）
import type {
  InspectionReading,
  Permit,
  PermitConflict,
  ReadingMetric,
  SaveResult,
} from "./types";

/**
 * 同区域或同设备，且时段相邻（首尾相接）或重叠 → 冲突。
 * 已回收、已作旧的票不再占用资源，不参与冲突判定。
 */
export function isActivePermit(p: Permit): boolean {
  return p.status === "草稿" || p.status === "已签发";
}

/** 两个许可时段的冲突：重叠（a.start <= b.end && b.start <= a.end）或相邻（a.end === b.start 等） */
function timeClash(a: Permit, b: Permit): "overlap" | "adjacent" | null {
  const as = +new Date(a.startAt);
  const ae = +new Date(a.endAt);
  const bs = +new Date(b.startAt);
  const be = +new Date(b.endAt);
  if (as >= ae || bs >= be) return null;
  if (ae === bs || be === as) return "adjacent";
  if (as < be && bs < ae) return "overlap";
  return null;
}

/** 计算某张票相对一组现有票的冲突（排除自身与已作旧/已回收票） */
export function conflictsFor(
  candidate: Permit,
  permits: Permit[]
): PermitConflict[] {
  if (!isActivePermit(candidate)) return [];
  const out: PermitConflict[] = [];
  for (const p of permits) {
    if (p.id === candidate.id || !isActivePermit(p)) continue;
    const sameArea = p.areaId === candidate.areaId;
    const sameEquipment = p.equipmentId === candidate.equipmentId;
    if (!sameArea && !sameEquipment) continue;
    const clash = timeClash(candidate, p);
    if (!clash) continue;
    out.push({
      a: candidate,
      b: p,
      sameArea,
      sameEquipment,
      adjacent: clash === "adjacent",
    });
  }
  return out;
}

/** 全部现存冲突（无序对，用于冲突总览，刷新后自动重算） */
export function allConflicts(permits: Permit[]): PermitConflict[] {
  const active = permits.filter(isActivePermit);
  const out: PermitConflict[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const clash = timeClash(active[i], active[j]);
      const sameArea = active[i].areaId === active[j].areaId;
      const sameEquipment = active[i].equipmentId === active[j].equipmentId;
      if (clash && (sameArea || sameEquipment)) {
        out.push({
          a: active[i],
          b: active[j],
          sameArea,
          sameEquipment,
          adjacent: clash === "adjacent",
        });
      }
    }
  }
  return out;
}

// 巡检读数限值（动火作业前）
export const READING_SPECS: {
  metric: ReadingMetric;
  unit: string;
  ok: (v: number) => boolean;
  limitText: string;
}[] = [
  {
    metric: "可燃气体浓度",
    unit: "%LEL",
    ok: (v) => v <= 10,
    limitText: "限值 ≤ 10 %LEL",
  },
  { metric: "氧含量", unit: "%", ok: (v) => v >= 19.5 && v <= 23.5, limitText: "限值 19.5% ~ 23.5%" },
  { metric: "硫化氢", unit: "ppm", ok: (v) => v <= 10, limitText: "限值 ≤ 10 ppm" },
  { metric: "一氧化碳", unit: "ppm", ok: (v) => v <= 24, limitText: "限值 ≤ 24 ppm" },
];

export function readingQualified(metric: ReadingMetric, value: number): boolean {
  return READING_SPECS.find((r) => r.metric === metric)!.ok(value);
}

export function emptyReadings(nowIso: string): InspectionReading[] {
  return READING_SPECS.map((spec) => ({
    id: crypto.randomUUID(),
    metric: spec.metric,
    value: "",
    unit: spec.unit,
    qualified: false,
    measuredAt: nowIso,
    inspector: "",
  }));
}

export interface IssueContext {
  equipmentInUse: boolean;
  equipmentName: string;
}

/**
 * 签发闸口：
 * 1) 许可时段合法；监护人齐全
 * 2) 油罐/加油机/管线等设备已登记停用
 * 3) 隔离点存在且全部确认
 * 4) 四类巡检读数齐全、合格、有确认人
 * 5) 无相邻/重叠冲突
 */
export function evaluateIssue(
  permit: Permit,
  permits: Permit[],
  ctx: IssueContext
): SaveResult {
  const errors: string[] = [];

  if (!permit.watcher.trim()) errors.push("缺少现场监护人");
  if (!permit.workContent.trim()) errors.push("缺少动火作业内容");
  const s = +new Date(permit.startAt);
  const e = +new Date(permit.endAt);
  if (!permit.startAt || !permit.endAt || !(s < e))
    errors.push("许可时段不完整或结束时间早于开始时间");

  if (ctx.equipmentInUse)
    errors.push(`设备「${ctx.equipmentName}」仍在用，已登记停用并记录停用状态、隔离点和确认人后才能签发`);

  const iso = permit.isolations;
  if (iso.length === 0) {
    errors.push("尚未登记隔离点");
  } else {
    const bad = iso.filter((i) => !i.confirmed || !i.confirmer.trim() || !i.name.trim());
    if (bad.length)
      errors.push(`有 ${bad.length} 个隔离点未确认到位或缺少隔离点/确认人`);
  }

  if (permit.readings.length < READING_SPECS.length) {
    errors.push("巡检读数不完整（可燃气体/氧含量/硫化氢/一氧化碳）");
  } else {
    const bad = permit.readings.filter(
      (r) => r.value === "" || !r.qualified || !r.inspector.trim() || !r.measuredAt
    );
    if (bad.length)
      errors.push(`有 ${bad.length} 项巡检读数缺失、不合格或缺少确认人`);
  }

  const conflicts = conflictsFor(permit, permits);
  if (conflicts.length)
    errors.push(
      `与 ${conflicts.length} 张作业票在区域/设备上时段相邻或重叠，只能保留一张作业票`
    );

  return { ok: errors.length === 0, conflicts, errors: errors.length ? errors : undefined };
}

export const DATETIME_FORMAT = "YYYY-MM-DD HH:mm";
