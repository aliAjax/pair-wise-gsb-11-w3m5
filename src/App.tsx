import { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Modal, Row, Space, Statistic, Tag, message } from "antd";
import {
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  StopOutlined,
  WarningOutlined
} from "@ant-design/icons";
import CreatePermitForm from "./components/CreatePermitForm";
import PermitList from "./components/PermitList";
import PermitDrawer from "./components/PermitDrawer";
import ConflictPanel from "./components/ConflictPanel";
import { computeConflicts } from "./conflict";
import { usePermitStore } from "./store";

export default function App() {
  const hydrate = usePermitStore((s) => s.hydrate);
  const permits = usePermitStore((s) => s.permits);
  const loaded = usePermitStore((s) => s.loaded);
  const resetAll = usePermitStore((s) => s.resetAll);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

  // 数据持久化在 localStorage：刷新后作业票、隔离点、巡检版本与冲突由同一份数据重新派生
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const conflicts = useMemo(() => computeConflicts(permits), [permits]);

  const stats = useMemo(
    () => ({
      draft: permits.filter((p) => p.status === "draft").length,
      issued: permits.filter((p) => p.status === "issued").length,
      reclaimed: permits.filter((p) => p.status === "reclaimed").length,
      conflicts: conflicts.length,
      isolation: permits
        .filter((p) => p.status === "issued")
        .reduce((sum, p) => sum + p.isolation.length, 0)
    }),
    [permits, conflicts]
  );

  if (!loaded) return null;

  return (
    <main className="app">
      {contextHolder}
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              <AuditOutlined /> 石油行业 · 动火作业管理
            </p>
            <h1>动火作业前隔离确认台</h1>
            <p className="subtitle">
              由油站设备巡检清单改造：创建作业票选定区域、动火设备、许可时段与监护人；油罐、加油机或管线仍在用时禁止签发，须先记录停用状态、隔离点与确认人。签发后巡检读数与隔离清单冻结，现场条件变化只能回收原许可并新建带原因版本。
            </p>
          </div>
          <Space direction="vertical" align="end">
            <Space wrap className="stack">
              {["React", "Zustand", "Ant Design", "TypeScript"].map((t) => (
                <span className="tag" key={t}>
                  {t}
                </span>
              ))}
            </Space>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  // 作业票、隔离点、巡检版本与冲突全部由 localStorage 中同一份数据派生，刷新即一致性校验
                  window.location.reload();
                }}
              >
                刷新校验一致性
              </Button>
              <Button
                danger
                ghost
                onClick={() =>
                  Modal.confirm({
                    title: "重置为示例数据？",
                    content: "将清空当前全部作业票并恢复内置示例。",
                    okText: "重置",
                    cancelText: "取消",
                    onOk: () => {
                      resetAll();
                      messageApi.success("已恢复示例数据");
                    }
                  })
                }
              >
                重置示例数据
              </Button>
            </Space>
          </Space>
        </header>

        <Row gutter={[14, 14]} className="metrics">
          <Col xs={12} md={8} lg={4}>
            <Card className="metric">
              <Statistic title="待签发" value={stats.draft} prefix={<ClockCircleOutlined />} />
            </Card>
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Card className="metric">
              <Statistic
                title="有效作业票"
                value={stats.issued}
                valueStyle={{ color: "#14724f" }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Card className="metric">
              <Statistic title="已回收" value={stats.reclaimed} prefix={<StopOutlined />} />
            </Card>
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Card className="metric">
              <Statistic
                title="时段冲突"
                value={stats.conflicts}
                valueStyle={{ color: stats.conflicts ? "#cf1322" : undefined }}
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Card className="metric">
              <Statistic title="有效票隔离点" value={stats.isolation} suffix="处" />
            </Card>
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Card className="metric">
              <Statistic title="作业票总数" value={permits.length} />
            </Card>
          </Col>
        </Row>

        <Row gutter={[14, 14]}>
          <Col xs={24} lg={9} xl={8}>
            <CreatePermitForm
              onCreated={(p) => {
                setSelectedId(p.id);
                messageApi.success(`作业票 ${p.code} 已创建，请完成停用与隔离确认后签发`);
              }}
            />
            <Card size="small" className="rules-card">
              <strong>签发红线</strong>
              <ul>
                <li>同一区域许可时段相邻或重叠，只能保留一张有效作业票；</li>
                <li>油罐、加油机、管线仍在用 → 禁止签发，先记录停用状态；</li>
                <li>每个隔离点须有确认人并完成上锁挂签；</li>
                <li>巡检读数出现不合格项 → 禁止签发；</li>
                <li>签发后数据冻结；条件变化 → 回收原票、新建带原因版本。</li>
              </ul>
              <Tag color="blue">数据保存在浏览器 localStorage，刷新后保持一致</Tag>
            </Card>
          </Col>
          <Col xs={24} lg={15} xl={16}>
            <Space direction="vertical" size={14} style={{ width: "100%" }}>
              <ConflictPanel conflicts={conflicts} />
              <PermitList permits={permits} onOpen={(p) => setSelectedId(p.id)} />
            </Space>
          </Col>
        </Row>

        <PermitDrawer permitId={selectedId} onClose={() => setSelectedId(null)} />
      </div>
    </main>
  );
}
