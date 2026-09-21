// 动火作业票领域模型：作业票、隔离点、巡检读数、版本快照与冲突

export type PermitStatus = "draft" | "issued" | "reclaimed";

export type EquipmentKind = "tank" | "dispenser" | "pipeline";

export type AreaDef = {
  key: string;
  name: string;
};

export type EquipmentDef = {
  key: string;
  name: string;
  kind: EquipmentKind;
  area: string;
};

export type ShutdownInfo = {
  state: "in_use" | "stopped"; // 仍在用 / 已停用
  stoppedAt: string; // 停用时间
  method: string; // 停用方式（断电、泄压、吹扫等）
  recorder: string; // 停用状态记录人
  note: string;
};

export type IsolationPoint = {
  id: string;
  location: string; // 隔离点（阀门/电源/法兰等）
  method: string; // 隔离方式：加盲板、断管线、双阀+导淋等
  locked: boolean; // 是否上锁挂签
  confirmer: string; // 确认人
  confirmedAt: string;
};

export type InspectionReading = {
  id: string;
  item: string; // 巡检项（油气浓度、温度、压力等）
  value: string;
  unit: string;
  limit: string; // 限值/标准
  result: "合格" | "不合格";
  inspector: string;
  inspectedAt: string;
};

export type PermitSnapshot = {
  baseId: string;
  code: string;
  version: number;
  area: string;
  equipmentKey: string;
  equipmentName: string;
  equipmentKind: EquipmentKind;
  startAt: string;
  endAt: string;
  guardian: string;
  shutdown: ShutdownInfo;
  isolation: IsolationPoint[];
  readings: InspectionReading[];
  issueNote: string;
  issuedAt: string;
};

export type Permit = {
  id: string;
  baseId: string; // 版本族 ID（现场条件变化新建版本时沿用）
  code: string; // 作业票号
  version: number;
  area: string;
  equipmentKey: string;
  equipmentName: string;
  equipmentKind: EquipmentKind;
  startAt: string; // 许可时段起（ISO）
  endAt: string; // 许可时段止（ISO）
  guardian: string; // 监护人
  status: PermitStatus;
  shutdown: ShutdownInfo;
  isolation: IsolationPoint[];
  readings: InspectionReading[];
  issueNote: string;
  issuedAt: string;
  reclaimedAt: string;
  reclaimReason: string;
  revisionReason: string; // 本版本新建原因（首版留空）
  createdAt: string;
  updatedAt: string;
};

export type Conflict = {
  key: string;
  reason: "overlap" | "adjacent";
  reasonText: string;
  area: string;
  equipmentName: string;
  startAt: string; // 冲突时段
  endAt: string;
  a: PermitSnapshot;
  b: PermitSnapshot;
};
