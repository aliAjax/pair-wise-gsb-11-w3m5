import { create } from "zustand";
import type { IsolationPoint, Permit, ShutdownInfo, InspectionReading } from "./types";
import { STORAGE_KEY, emptyPermitState, seedPermits } from "./constants";

type DraftInput = {
  area: string;
  equipmentKey: string;
  equipmentName: string;
  equipmentKind: Permit["equipmentKind"];
  startAt: string;
  endAt: string;
  guardian: string;
};

type IssueInput = DraftInput & {
  issueNote: string;
};

type NewVersionInput = IssueInput & {
  reason: string;
};

type PermitState = {
  permits: Permit[];
  loaded: boolean;
  hydrate: () => void;
  createDraft: (input: DraftInput) => Permit;
  updateDraftMeta: (id: string, patch: Partial<DraftInput>) => void;
  setShutdown: (id: string, shutdown: ShutdownInfo) => void;
  addIsolation: (id: string, point: Omit<IsolationPoint, "id">) => void;
  updateIsolation: (id: string, pointId: string, patch: Partial<IsolationPoint>) => void;
  removeIsolation: (id: string, pointId: string) => void;
  addReading: (id: string, reading: Omit<InspectionReading, "id">) => void;
  removeReading: (id: string, readingId: string) => void;
  issue: (id: string, input: IssueInput) => void;
  reclaim: (id: string, reason: string) => void;
  createNewVersion: (id: string, input: NewVersionInput) => Permit;
  removeDraft: (id: string) => void;
  resetAll: () => void;
};

function load(): Permit[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedPermits();
  try {
    const parsed = JSON.parse(raw) as Permit[];
    return Array.isArray(parsed) ? parsed : seedPermits();
  } catch {
    return seedPermits();
  }
}

function persist(permits: Permit[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(permits));
}

function nextCode(permits: Permit[]): string {
  const year = new Date().getFullYear();
  const nums = permits
    .map((p) => Number(p.code.match(/DH-\d{4}-(\d+)/)?.[1] ?? 0))
    .filter((n) => Number.isFinite(n));
  const seq = String(Math.max(0, ...nums) + 1).padStart(4, "0");
  return `DH-${year}-${seq}`;
}

function mutate(permits: Permit[], id: string, fn: (p: Permit) => Permit): Permit[] {
  return permits.map((p) => (p.id === id ? { ...fn(p), updatedAt: new Date().toISOString() } : p));
}

export const usePermitStore = create<PermitState>((set, get) => ({
  permits: [],
  loaded: false,

  hydrate: () => {
    if (get().loaded) return;
    set({ permits: load(), loaded: true });
  },

  createDraft: (input) => {
    const { permits } = get();
    const blank = emptyPermitState();
    const permit: Permit = {
      id: crypto.randomUUID(),
      baseId: crypto.randomUUID(),
      code: nextCode(permits),
      version: 1,
      ...input,
      status: "draft",
      shutdown: blank.shutdown,
      isolation: blank.isolation,
      readings: blank.readings,
      issueNote: "",
      issuedAt: "",
      reclaimedAt: "",
      reclaimReason: "",
      revisionReason: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const next = [permit, ...permits];
    persist(next);
    set({ permits: next });
    return permit;
  },

  updateDraftMeta: (id, patch) => {
    const next = mutate(get().permits, id, (p) =>
      p.status === "draft"
        ? { ...p, ...patch }
        : p // 已签发票冻结基础信息
    );
    persist(next);
    set({ permits: next });
  },

  setShutdown: (id, shutdown) => {
    const next = mutate(get().permits, id, (p) =>
      p.status === "draft" ? { ...p, shutdown } : p
    );
    persist(next);
    set({ permits: next });
  },

  addIsolation: (id, point) => {
    const next = mutate(get().permits, id, (p) =>
      p.status === "draft" ? { ...p, isolation: [...p.isolation, { ...point, id: crypto.randomUUID() }] } : p
    );
    persist(next);
    set({ permits: next });
  },

  updateIsolation: (id, pointId, patch) => {
    const next = mutate(get().permits, id, (p) =>
      p.status === "draft"
        ? { ...p, isolation: p.isolation.map((it) => (it.id === pointId ? { ...it, ...patch } : it)) }
        : p
    );
    persist(next);
    set({ permits: next });
  },

  removeIsolation: (id, pointId) => {
    const next = mutate(get().permits, id, (p) =>
      p.status === "draft" ? { ...p, isolation: p.isolation.filter((it) => it.id !== pointId) } : p
    );
    persist(next);
    set({ permits: next });
  },

  addReading: (id, reading) => {
    const next = mutate(get().permits, id, (p) =>
      p.status === "draft" ? { ...p, readings: [...p.readings, { ...reading, id: crypto.randomUUID() }] } : p
    );
    persist(next);
    set({ permits: next });
  },

  removeReading: (id, readingId) => {
    const next = mutate(get().permits, id, (p) =>
      p.status === "draft" ? { ...p, readings: p.readings.filter((it) => it.id !== readingId) } : p
    );
    persist(next);
    set({ permits: next });
  },

  // 签发：冻结巡检读数与隔离清单（后续操作对 issued 票据全部失效）
  issue: (id, input) => {
    const next = mutate(get().permits, id, (p) => {
      if (p.status !== "draft") return p;
      return {
        ...p,
        ...input,
        status: "issued",
        issuedAt: new Date().toISOString(),
        isolation: p.isolation.map((it) => ({ ...it })),
        readings: p.readings.map((it) => ({ ...it }))
      };
    });
    persist(next);
    set({ permits: next });
  },

  // 回收原许可（现场条件变化/作业结束）
  reclaim: (id, reason) => {
    const next = mutate(get().permits, id, (p) =>
      p.status === "issued"
        ? { ...p, status: "reclaimed", reclaimedAt: new Date().toISOString(), reclaimReason: reason }
        : p
    );
    persist(next);
    set({ permits: next });
  },

  // 现场条件变化：回收原票 → 新建带原因的版本（同票号、版本号 +1），从原票冻结快照复制
  createNewVersion: (id, input) => {
    const permits = get().permits;
    const original = permits.find((p) => p.id === id);
    if (!original) throw new Error("原作业票不存在");
    const nowIso = new Date().toISOString();

    const reclaimed: Permit = {
      ...original,
      status: "reclaimed",
      reclaimedAt: nowIso,
      reclaimReason: `现场条件变化，由 ${original.code} V${original.version} 升级替换`,
      updatedAt: nowIso
    };

    const blank = emptyPermitState();
    const versioned: Permit = {
      ...original,
      id: crypto.randomUUID(),
      baseId: original.baseId,
      code: original.code,
      version: original.version + 1,
      ...input,
      status: "draft",
      // 复制冻结的停用/隔离/巡检数据作为新版本起点，允许在签发前重新核对
      shutdown: structuredClone(original.shutdown.state === "stopped" ? original.shutdown : blank.shutdown),
      isolation: structuredClone(original.isolation),
      readings: structuredClone(original.readings),
      issueNote: "",
      issuedAt: "",
      reclaimedAt: "",
      reclaimReason: "",
      revisionReason: input.reason,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const next = [versioned, ...permits.map((p) => (p.id === id ? reclaimed : p))];
    persist(next);
    set({ permits: next });
    return versioned;
  },

  removeDraft: (id) => {
    const next = get().permits.filter((p) => !(p.id === id && p.status === "draft"));
    persist(next);
    set({ permits: next });
  },

  resetAll: () => {
    const seeded = seedPermits();
    persist(seeded);
    set({ permits: seeded });
  }
}));
