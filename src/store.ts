// 动火作业隔离确认台：持久化状态（zustand + localStorage），刷新后作业票/隔离点/巡检版本/冲突一致
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Area,
  Equipment,
  IsolationPoint,
  Permit,
  SaveResult,
} from "./types";
import { conflictsFor, emptyReadings, evaluateIssue } from "./domain";

// ---------- 种子数据 ----------

const areas: Area[] = [
  { id: "area-dispenser", name: "加油区" },
  { id: "area-tank", name: "油罐区" },
  { id: "area-pipe", name: "罐区管线廊" },
];

const D = "2026-09-21";

const equipmentSeed: Equipment[] = [
  {
    id: "eq-p1",
    code: "JYJ-01",
    name: "1号加油机",
    type: "加油机",
    areaId: "area-dispenser",
    status: "停用",
    stop: { stoppedAt: `${D}T07:30:00.000Z`, reason: "动火前停机断电", operator: "何鑫" },
  },
  {
    id: "eq-p2",
    code: "JYJ-02",
    name: "2号加油机",
    type: "加油机",
    areaId: "area-dispenser",
    status: "在用",
  },
  {
    id: "eq-t1",
    code: "YG-01",
    name: "1号埋地油罐",
    type: "油罐",
    areaId: "area-tank",
    status: "停用",
    stop: { stoppedAt: `${D}T06:00:00.000Z`, reason: "倒空置换，等待动火", operator: "周岭" },
  },
  {
    id: "eq-t2",
    code: "YG-02",
    name: "2号埋地油罐",
    type: "油罐",
    areaId: "area-tank",
    status: "在用",
  },
  {
    id: "eq-l1",
    code: "GX-110",
    name: "1号罐进油管线",
    type: "管线",
    areaId: "area-pipe",
    status: "停用",
    stop: { stoppedAt: `${D}T06:10:00.000Z`, reason: "法兰更换前停输", operator: "周岭" },
  },
  {
    id: "eq-l2",
    code: "GX-120",
    name: "油气回收管线",
    type: "管线",
    areaId: "area-pipe",
    status: "在用",
  },
];

function iso(id: string, name: string, method: IsolationPoint["method"], who: string, at: string): IsolationPoint {
  return { id, name, method, confirmed: true, confirmer: who, confirmedAt: at };
}

function ridings() {
  return emptyReadings(`${D}T08:20:00.000Z`).map((r) => {
    if (r.metric === "可燃气体浓度") return { ...r, value: 4, qualified: true, inspector: "安宁", measuredAt: `${D}T08:20:00.000Z` };
    if (r.metric === "氧含量") return { ...r, value: 20.9, qualified: true, inspector: "安宁", measuredAt: `${D}T08:20:00.000Z` };
    if (r.metric === "硫化氢") return { ...r, value: 1, qualified: true, inspector: "安宁", measuredAt: `${D}T08:20:00.000Z` };
    return { ...r, value: 2, qualified: true, inspector: "安宁", measuredAt: `${D}T08:20:00.000Z` };
  });
}

// 已签发：加油区 / 1号加油机，08:30-11:30
const issuedV1: Permit = {
  id: "p-1001-v1",
  permitNo: "DH-20260921-1001",
  version: 1,
  areaId: "area-dispenser",
  equipmentId: "eq-p1",
  fireLevel: "二级动火",
  workContent: "1号加油机渗漏管线补焊",
  applicant: "罗安",
  watcher: "郑海",
  startAt: `${D}T08:30:00.000Z`,
  endAt: `${D}T11:30:00.000Z`,
  status: "已签发",
  frozen: true,
  isolations: [
    iso("iso-1", "加油机进油阀 V-01", "阀门关断", "何鑫", `${D}T07:40:00.000Z`),
    iso("iso-2", "加油机电源箱 S-01", "电气断电上锁", "何鑫", `${D}T07:45:00.000Z`),
  ],
  readings: ridings(),
  issuer: "站长 方启明",
  issuedAt: `${D}T08:25:00.000Z`,
  createdAt: `${D}T08:10:00.000Z`,
  updatedAt: `${D}T08:25:00.000Z`,
};

// 冲突草稿：同属加油区，时段与已签发票重叠 → 保存时将被拦截/列出冲突（此处保留作为可解决的演示状态）
const conflictDraft: Permit = {
  id: "p-1002-v1",
  permitNo: "DH-20260921-1002",
  version: 1,
  areaId: "area-dispenser",
  equipmentId: "eq-p2",
  fireLevel: "一级动火",
  workContent: "2号加油机底座切割（设备仍在用，用于演示拦截）",
  applicant: "罗安",
  watcher: "",
  startAt: `${D}T10:00:00.000Z`,
  endAt: `${D}T12:00:00.000Z`,
  status: "草稿",
  frozen: false,
  isolations: [],
  readings: emptyReadings(`${D}T09:00:00.000Z`),
  createdAt: `${D}T09:00:00.000Z`,
  updatedAt: `${D}T09:00:00.000Z`,
};

// 已作旧版本 + 新版本（现场条件变化：签发后发现风向变化，回收原票重办）
const oldV1: Permit = {
  id: "p-1003-v1",
  permitNo: "DH-20260921-1003",
  version: 1,
  areaId: "area-tank",
  equipmentId: "eq-t1",
  fireLevel: "一级动火",
  workContent: "1号油罐人孔法兰打磨",
  applicant: "高岩",
  watcher: "郑海",
  startAt: `${D}T09:00:00.000Z`,
  endAt: `${D}T15:00:00.000Z`,
  status: "已作旧",
  frozen: true,
  isolations: [
    iso("iso-3", "1号罐进出口阀 V-11", "盲板隔离", "周岭", `${D}T08:00:00.000Z`),
  ],
  readings: ridings(),
  issuer: "站长 方启明",
  issuedAt: `${D}T08:40:00.000Z`,
  supersededBy: "p-1003-v2",
  changeReason: "现场风向转为东南风，作业点靠近卸油口，需调整隔离与防护后重办",
  createdAt: `${D}T08:20:00.000Z`,
  updatedAt: `${D}T09:30:00.000Z`,
  recoveredAt: `${D}T09:30:00.000Z`,
  recoverReason: "现场条件变化，原许可回收作废",
};

const newV2: Permit = {
  id: "p-1003-v2",
  permitNo: "DH-20260921-1003",
  version: 2,
  areaId: "area-tank",
  equipmentId: "eq-t1",
  fireLevel: "一级动火",
  workContent: "1号油罐人孔法兰打磨（增加卸油口侧围挡）",
  applicant: "高岩",
  watcher: "郑海",
  startAt: `${D}T10:30:00.000Z`,
  endAt: `${D}T16:00:00.000Z`,
  status: "草稿",
  frozen: false,
  isolations: [
    iso("iso-4", "1号罐进出口阀 V-11", "盲板隔离", "周岭", `${D}T09:50:00.000Z`),
    iso("iso-5", "卸油口侧加临时盲板 B-02", "盲板隔离", "周岭", `${D}T09:55:00.000Z`),
  ],
  readings: emptyReadings(`${D}T10:00:00.000Z`),
  changeReason: "现场风向转为东南风，作业点靠近卸油口，需调整隔离与防护后重办",
  parentVersionId: "p-1003-v1",
  createdAt: `${D}T09:35:00.000Z`,
  updatedAt: `${D}T09:35:00.000Z`,
};

// ---------- Store ----------

interface State {
  areas: Area[];
  equipment: Equipment[];
  permits: Permit[];
  seq: number;

  createDraft: () => string;
  saveDraft: (p: Permit) => SaveResult;
  issuePermit: (p: Permit, issuer: string) => SaveResult;
  newVersion: (source: Permit, reason: string) => string;
  recoverPermit: (id: string, reason: string) => void;
  deletePermit: (id: string) => void;
  setEquipmentStop: (id: string, rec: Equipment["stop"]) => void;
  resumeEquipment: (id: string) => SaveResult;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      areas,
      equipment: equipmentSeed,
      permits: [issuedV1, conflictDraft, oldV1, newV2],
      seq: 1004,

      createDraft: () => {
        const seq = get().seq;
        const now = new Date().toISOString();
        const permit: Permit = {
          id: crypto.randomUUID(),
          permitNo: `DH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${seq}`,
          version: 1,
          areaId: get().areas[0].id,
          equipmentId: "",
          fireLevel: "二级动火",
          workContent: "",
          applicant: "",
          watcher: "",
          startAt: "",
          endAt: "",
          status: "草稿",
          frozen: false,
          isolations: [],
          readings: emptyReadings(now),
          createdAt: now,
          updatedAt: now,
        };
        set({ permits: [permit, ...get().permits], seq: seq + 1 });
        return permit.id;
      },

      // 草稿保存：先做冲突判定，冲突则拒绝落库（保留表单），保证相邻/重叠时段只有一张票
      saveDraft: (p) => {
        if (p.frozen) return { ok: false, errors: ["该作业票已签发冻结，不能直接修改；现场条件变化请新建带原因的版本"] };
        const conflicts = conflictsFor(p, get().permits);
        if (conflicts.length)
          return { ok: false, conflicts, errors: ["与相邻或重叠时段的作业票冲突，只能保留一张作业票"] };
        const now = new Date().toISOString();
        set({
          permits: get().permits.map((x) => (x.id === p.id ? { ...p, updatedAt: now } : x)),
        });
        return { ok: true };
      },

      // 签发：闸口全量校验；通过后冻结巡检读数与隔离清单
      issuePermit: (p, issuer) => {
        const eq = get().equipment.find((x) => x.id === p.equipmentId);
        const result = evaluateIssue(p, get().permits, {
          equipmentInUse: !eq || eq.status === "在用",
          equipmentName: eq ? `${eq.name}（${eq.code}）` : "未选择设备",
        });
        if (!result.ok) return result;
        const now = new Date().toISOString();
        const issued: Permit = {
          ...structuredClone(p),
          status: "已签发",
          frozen: true,
          issuer: issuer.trim() || "值班站长",
          issuedAt: now,
          updatedAt: now,
        };
        set({ permits: get().permits.map((x) => (x.id === p.id ? issued : x)) });
        return { ok: true };
      },

      // 现场条件变化：原票回收作旧，新建带原因的下一版本（重新确认隔离与巡检后方可签发）
      newVersion: (source, reason) => {
        if (!reason.trim()) throw new Error("缺少现场变化原因");
        const now = new Date().toISOString();
        const newId = crypto.randomUUID();
        const oldOne: Permit = {
          ...source,
          status: "已作旧",
          supersededBy: newId,
          recoveredAt: now,
          recoverReason: `现场条件变化，原许可回收：${reason.trim()}`,
          updatedAt: now,
        };
        const next: Permit = {
          ...structuredClone(source),
          id: newId,
          version: source.version + 1,
          status: "草稿",
          frozen: false,
          issuer: undefined,
          issuedAt: undefined,
          recoveredAt: undefined,
          recoverReason: undefined,
          supersededBy: undefined,
          changeReason: reason.trim(),
          parentVersionId: source.id,
          // 新版本必须重新检测与确认：巡检读数清空，隔离点保留但需重新确认
          readings: emptyReadings(now),
          isolations: source.isolations.map((i) => ({
            ...i,
            confirmed: false,
            confirmer: "",
            confirmedAt: "",
          })),
          createdAt: now,
          updatedAt: now,
        };
        set({
          permits: [
            next,
            ...get().permits.map((x) => (x.id === source.id ? oldOne : x)),
          ],
        });
        return newId;
      },

      // 完工/中止回收原许可
      recoverPermit: (id, reason) => {
        const now = new Date().toISOString();
        set({
          permits: get().permits.map((x) =>
            x.id === id
              ? { ...x, status: "已回收", recoveredAt: now, recoverReason: reason.trim() || "作业完成，许可回收", updatedAt: now }
              : x
          ),
        });
      },

      deletePermit: (id) =>
        set({ permits: get().permits.filter((x) => x.id !== id) }),

      // 设备停用登记：先记录停用状态、隔离点和确认人（停用记录），方可进入签发闸口
      setEquipmentStop: (id, rec) =>
        set({
          equipment: get().equipment.map((x) =>
            x.id === id ? { ...x, status: "停用", stop: rec } : x
          ),
        }),

      resumeEquipment: (id) => {
        const eq = get().equipment.find((x) => x.id === id);
        if (!eq) return { ok: false, errors: ["设备不存在"] };
        const blocked = get().permits.filter(
          (p) => p.equipmentId === id && (p.status === "草稿" || p.status === "已签发")
        );
        if (blocked.length)
          return {
            ok: false,
            errors: [`仍有 ${blocked.length} 张有效作业票占用该设备，恢复投用前请先回收或作废`],
          };
        set({
          equipment: get().equipment.map((x) =>
            x.id === id ? { ...x, status: "在用", stop: undefined } : x
          ),
        });
        return { ok: true };
      },
    }),
    { name: "dfwlfront-10-hotwork-isolation" }
  )
);
