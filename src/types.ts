// 动火作业隔离确认台：领域类型

export type EquipmentType = "油罐" | "加油机" | "管线" | "其他";
export type EquipmentStatus = "在用" | "停用";
export type FireLevel = "一级动火" | "二级动火";

export interface Area {
  id: string;
  name: string;
}

/** 油罐 / 加油机 / 管线等设备的停用登记 */
export interface StopRecord {
  stoppedAt: string; // 停用时间 ISO
  reason: string; // 停用原因
  operator: string; // 停用确认人
}

export interface Equipment {
  id: string;
  code: string;
  name: string;
  type: EquipmentType;
  areaId: string;
  status: EquipmentStatus;
  stop?: StopRecord;
}

export type IsolationMethod = "盲板隔离" | "阀门关断" | "加装堵头" | "电气断电上锁";

export interface IsolationPoint {
  id: string;
  name: string; // 隔离点名称/位置
  method: IsolationMethod;
  confirmed: boolean; // 是否已确认隔离到位
  confirmer: string; // 确认人
  confirmedAt: string; // 确认时间 ISO
}

export type ReadingMetric = "可燃气体浓度" | "氧含量" | "硫化氢" | "一氧化碳";

export interface InspectionReading {
  id: string;
  metric: ReadingMetric;
  value: number | ""; // 巡检读数
  unit: string;
  qualified: boolean; // 依据限值自动判定
  measuredAt: string; // 检测时间 ISO
  inspector: string; // 巡检确认人
}

export type PermitStatus = "草稿" | "已签发" | "已作旧" | "已回收";

export interface Permit {
  id: string;
  permitNo: string; // 作业票号（同票号按 version 迭代）
  version: number; // 版本号，从 1 开始
  areaId: string;
  equipmentId: string;
  fireLevel: FireLevel;
  workContent: string; // 动火作业内容
  applicant: string; // 申请人
  watcher: string; // 监护人
  startAt: string; // 许可时段起 ISO
  endAt: string; // 许可时段止 ISO
  status: PermitStatus;
  frozen: boolean; // 签发后冻结巡检读数与隔离清单
  isolations: IsolationPoint[];
  readings: InspectionReading[];
  changeReason?: string; // 新建版本的现场变化原因
  parentVersionId?: string; // 上一版本许可 id
  supersededBy?: string; // 被哪个新版本替代
  issuer?: string; // 签发人
  issuedAt?: string; // 签发时间
  recoveredAt?: string; // 回收时间
  recoverReason?: string; // 回收原因
  createdAt: string;
  updatedAt: string;
}

/** 作业票冲突（同区域或同设备，时段相邻或重叠） */
export interface PermitConflict {
  a: Permit;
  b: Permit;
  sameArea: boolean;
  sameEquipment: boolean;
  adjacent: boolean; // true=首尾相接（相邻），false=时段重叠
}

export interface SaveResult {
  ok: boolean;
  conflicts?: PermitConflict[];
  errors?: string[];
}
