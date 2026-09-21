import type { AreaDef, EquipmentDef, Permit } from "./types";

export const STORAGE_KEY = "dfwlfront-10-hot-work-permits";
export const VERSION_KEY = "dfwlfront-10-hot-work-version";

export const AREAS: AreaDef[] = [
  { key: "fueling", name: "加油区" },
  { key: "tank-farm", name: "油罐区" },
  { key: "pipeline-rack", name: "管线区" },
  { key: "cashier", name: "收银及配电区" }
];

export const EQUIPMENT: EquipmentDef[] = [
  { key: "tank-1", name: "1号油罐（92#汽油）", kind: "tank", area: "tank-farm" },
  { key: "tank-2", name: "2号油罐（95#汽油）", kind: "tank", area: "tank-farm" },
  { key: "tank-3", name: "3号油罐（0#柴油）", kind: "tank", area: "tank-farm" },
  { key: "unload-port", name: "卸油口及快速接头", kind: "pipeline", area: "tank-farm" },
  { key: "disp-1", name: "1号加油机", kind: "dispenser", area: "fueling" },
  { key: "disp-2", name: "2号加油机", kind: "dispenser", area: "fueling" },
  { key: "disp-3", name: "3号加油机", kind: "dispenser", area: "fueling" },
  { key: "vent-line", name: "通气管线（罐区→罩棚）", kind: "pipeline", area: "pipeline-rack" },
  { key: "oil-line-a", name: "供油主管线 A 段", kind: "pipeline", area: "pipeline-rack" },
  { key: "oil-line-b", name: "供油支管线 B 段", kind: "pipeline", area: "pipeline-rack" },
  { key: "power-cab", name: "加油机配电柜", kind: "dispenser", area: "cashier" }
];

export const EQUIPMENT_KIND_TEXT: Record<string, string> = {
  tank: "油罐",
  dispenser: "加油机",
  pipeline: "管线"
};

export const ISOLATION_METHODS = ["加装盲板", "拆卸管段", "双阀关闭+导淋泄压", "断电上锁", "法兰断开+封堵"];

export const INSPECTION_PRESETS = [
  { item: "作业点可燃气体浓度", unit: "%LEL", limit: "≤ 10" },
  { item: "作业点氧含量", unit: "%VOL", limit: "19.5 ~ 23.5" },
  { item: "相邻设备表面温度", unit: "℃", limit: "≤ 40" },
  { item: "管线残余压力", unit: "MPa", limit: "≤ 0.01" }
];

export const STATUS_TEXT: Record<string, string> = {
  draft: "待签发",
  issued: "已签发",
  reclaimed: "已回收"
};

export function areaName(key: string): string {
  return AREAS.find((area) => area.key === key)?.name ?? key;
}

export function equipmentOf(key: string): EquipmentDef | undefined {
  return EQUIPMENT.find((item) => item.key === key);
}

function isoDaysFromNow(days: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

// 初始隔离/巡检模板
export function emptyPermitState() {
  return {
    shutdown: {
      state: "in_use" as const,
      stoppedAt: "",
      method: "",
      recorder: "",
      note: ""
    },
    isolation: [] as Permit["isolation"],
    readings: [] as Permit["readings"]
  };
}

export function seedPermits(): Permit[] {
  const now = Date.now();
  const iso = (value: number) => new Date(value).toISOString();
  const make = (partial: Partial<Permit> & Pick<Permit, "id" | "code" | "area" | "equipmentKey" | "equipmentName" | "equipmentKind" | "startAt" | "endAt" | "guardian" | "status">): Permit => ({
    baseId: partial.id!,
    version: 1,
    shutdown: emptyPermitState().shutdown,
    isolation: [],
    readings: [],
    issueNote: "",
    issuedAt: "",
    reclaimedAt: "",
    reclaimReason: "",
    revisionReason: "",
    createdAt: iso(now),
    updatedAt: iso(now),
    ...partial
  });

  const issuedId = crypto.randomUUID();
  const issued: Permit = make({
    id: issuedId,
    code: "DH-2026-0001",
    area: "fueling",
    equipmentKey: "disp-1",
    equipmentName: "1号加油机",
    equipmentKind: "dispenser",
    startAt: isoDaysFromNow(0, 9),
    endAt: isoDaysFromNow(0, 17),
    guardian: "何鑫",
    status: "issued",
    shutdown: {
      state: "stopped",
      stoppedAt: isoDaysFromNow(0, 7),
      method: "配电柜断电、管路泄压、残余油品回收",
      recorder: "李建国",
      note: "停用牌已悬挂，现场张贴“禁止合闸”标识"
    },
    isolation: [
      {
        id: crypto.randomUUID(),
        location: "1号加油机进油球阀",
        method: "双阀关闭+导淋泄压",
        locked: true,
        confirmer: "王志强",
        confirmedAt: isoDaysFromNow(0, 7)
      },
      {
        id: crypto.randomUUID(),
        location: "加油机配电柜 3QF 回路",
        method: "断电上锁",
        locked: true,
        confirmer: "赵明",
        confirmedAt: isoDaysFromNow(0, 7)
      }
    ],
    readings: [
      { id: crypto.randomUUID(), item: "作业点可燃气体浓度", value: "2", unit: "%LEL", limit: "≤ 10", result: "合格", inspector: "孙倩", inspectedAt: isoDaysFromNow(0, 8) },
      { id: crypto.randomUUID(), item: "相邻设备表面温度", value: "26", unit: "℃", limit: "≤ 40", result: "合格", inspector: "孙倩", inspectedAt: isoDaysFromNow(0, 8) }
    ],
    issueNote: "盲板、上锁均已现场复核，准予动火",
    issuedAt: isoDaysFromNow(0, 8)
  });

  const draft: Permit = make({
    id: crypto.randomUUID(),
    code: "DH-2026-0002",
    area: "tank-farm",
    equipmentKey: "unload-port",
    equipmentName: "卸油口及快速接头",
    equipmentKind: "pipeline",
    startAt: isoDaysFromNow(1, 9),
    endAt: isoDaysFromNow(1, 12),
    guardian: "周磊",
    status: "draft",
    shutdown: {
      state: "in_use",
      stoppedAt: "",
      method: "",
      recorder: "",
      note: "卸油口仍处于待用状态，须先停用并记录"
    }
  });

  return [issued, draft];
}
