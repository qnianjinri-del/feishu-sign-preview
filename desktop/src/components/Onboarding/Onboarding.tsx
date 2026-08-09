import { ArrowLeft, CheckCircle2, Cloud, Laptop, LoaderCircle, X } from "lucide-react";
import { useState } from "react";
import {
  checkSyncService,
  runTaskSync,
  verifySyncConnection,
} from "../../services/syncCoordinator";
import { useTaskStore } from "../../stores/taskStore";

type Step = "choice" | "service" | "token" | "decision";

interface OnboardingProps {
  onClose: () => void;
}

function shortcutDisplay(value: string): string {
  return value
    .replace(/CommandOrControl|Command/gi, "⌘")
    .replace(/Control/gi, "⌃")
    .replace(/Option|Alt/gi, "⌥")
    .replace(/Shift/gi, "⇧")
    .replace(/\+/g, "");
}

export function Onboarding({ onClose }: OnboardingProps) {
  const settings = useTaskStore((state) => state.settings);
  const syncRuntime = useTaskStore((state) => state.syncRuntime);
  const setOnboardingCompleted = useTaskStore((state) => state.setOnboardingCompleted);
  const setSyncConfig = useTaskStore((state) => state.setSyncConfig);
  const setSyncEnabled = useTaskStore((state) => state.setSyncEnabled);
  const applyRemoteSnapshot = useTaskStore((state) => state.applyRemoteSnapshot);
  const acceptRemoteSnapshot = useTaskStore((state) => state.acceptRemoteSnapshot);
  const mergeLocalWithRemote = useTaskStore((state) => state.mergeLocalWithRemote);
  const [step, setStep] = useState<Step>("choice");
  const [serviceUrl, setServiceUrl] = useState(settings.syncServiceUrl);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serviceReady, setServiceReady] = useState(false);

  const finish = () => {
    setOnboardingCompleted(true);
    onClose();
  };

  const probe = async () => {
    if (!serviceUrl.trim()) {
      setError("请填写同步服务地址");
      return;
    }
    setBusy(true);
    setError(null);
    setServiceReady(false);
    try {
      const result = await checkSyncService(serviceUrl.trim());
      if (!result.syncConfigured) {
        setError("网关可以访问，但尚未配置飞书应用、多维表格或 Client token");
        return;
      }
      setServiceReady(true);
    } catch (probeError) {
      setError(probeError instanceof Error ? probeError.message : "无法连接同步服务");
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    if (!token.trim()) {
      setError("请填写 Client token");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const cleanUrl = serviceUrl.trim().replace(/\/+$/, "");
      const snapshot = await verifySyncConnection(cleanUrl, token.trim());
      setToken("");
      setSyncConfig(cleanUrl, settings.syncPollIntervalSeconds);
      setSyncEnabled(true);
      if (applyRemoteSnapshot(snapshot)) finish();
      else setStep("decision");
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "同步验证失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-label="欢迎使用 FloatList">
      <section className="onboarding-panel">
        <header>
          <div>
            <span className="eyebrow">FLOATLIST 0.2</span>
            <h2>{step === "choice" ? "从今天最重要的事开始" : "连接你的同步网关"}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="稍后设置" onClick={finish}><X size={16} /></button>
        </header>

        {step === "choice" && (
          <>
            <p className="onboarding-lead">清单默认只保存在这台 Mac。需要时，也可以连接你已经部署好的飞书同步网关。</p>
            <div className="onboarding-choices">
              <button type="button" onClick={finish}>
                <Laptop size={20} />
                <strong>仅本地使用</strong>
                <span>立即开始，无需账号或网络</span>
              </button>
              <button type="button" onClick={() => setStep("service")}>
                <Cloud size={20} />
                <strong>连接飞书</strong>
                <span>连接已有 FloatList 网关</span>
              </button>
            </div>
            <div className="shortcut-tips">
              <span><kbd>{shortcutDisplay(settings.quickAddShortcut)}</kbd> 随时新增任务</span>
              <span><kbd>{shortcutDisplay(settings.toggleWindowShortcut)}</kbd> 显示或隐藏</span>
            </div>
          </>
        )}

        {step === "service" && (
          <div className="onboarding-step">
            <p>应用只会访问你填写的网关地址，不会直接连接飞书开放平台。</p>
            <label>
              <span>同步服务地址</span>
              <input
                autoFocus
                aria-label="向导同步服务地址"
                value={serviceUrl}
                placeholder="https://sync.example.com"
                onChange={(event) => {
                  setServiceUrl(event.target.value);
                  setServiceReady(false);
                  setError(null);
                }}
              />
            </label>
            {serviceReady && <p className="onboarding-success"><CheckCircle2 size={14} /> 网关已就绪，可以验证令牌</p>}
            {error && <p className="onboarding-error">{error}</p>}
            <div className="onboarding-actions">
              <button type="button" className="secondary-button" onClick={() => setStep("choice")}><ArrowLeft size={14} /> 返回</button>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => void probe()}>
                {busy && <LoaderCircle size={14} />} 检查连接
              </button>
              {serviceReady && <button type="button" className="primary-button" onClick={() => setStep("token")}>下一步</button>}
            </div>
          </div>
        )}

        {step === "token" && (
          <div className="onboarding-step">
            <p>Client token 仅保存到 macOS 钥匙串，不会写入 FloatList 数据文件。</p>
            <label>
              <span>Client token</span>
              <input
                autoFocus
                aria-label="向导 Client token"
                type="password"
                autoComplete="off"
                value={token}
                placeholder="粘贴网关配置的独立令牌"
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
            {error && <p className="onboarding-error">{error}</p>}
            <div className="onboarding-actions">
              <button type="button" className="secondary-button" onClick={() => setStep("service")}><ArrowLeft size={14} /> 返回</button>
              <button type="button" className="primary-button" disabled={busy} onClick={() => void connect()}>
                {busy && <LoaderCircle size={14} />} 验证并启用同步
              </button>
            </div>
          </div>
        )}

        {step === "decision" && (
          <div className="onboarding-step">
            <p>本地和飞书中都有任务，请选择第一次同步的处理方式。</p>
            <div className="sync-decision onboarding-decision">
              <button type="button" className="secondary-button" onClick={() => { acceptRemoteSnapshot(); finish(); }}>采用飞书</button>
              <button type="button" className="primary-button" onClick={() => { mergeLocalWithRemote(); finish(); void runTaskSync(); }}>合并本地事项</button>
            </div>
            {syncRuntime.message && <p className="onboarding-error">{syncRuntime.message}</p>}
          </div>
        )}

        <footer>
          <button type="button" className="text-button" onClick={finish}>稍后设置，先本地使用</button>
        </footer>
      </section>
    </div>
  );
}
