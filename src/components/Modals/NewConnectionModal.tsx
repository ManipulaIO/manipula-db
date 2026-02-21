import { useState } from "react";
import { api } from "../../lib/invoke";
import { useConnectionStore } from "../../store/connectionStore";
import type { DbConnectionConfig } from "../../types";

interface Props {
  onClose: () => void;
}

type Driver = "postgres" | "mysql" | "sqlite";

const DEFAULT_PORTS: Record<Driver, number> = {
  postgres: 5432,
  mysql: 3306,
  sqlite: 0,
};

export function NewConnectionModal({ onClose }: Props) {
  const { saveConnection } = useConnectionStore();

  const [driver, setDriver] = useState<Driver>("postgres");
  const [name, setName] = useState("");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState<string>("5432");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  const buildConfig = (): DbConnectionConfig => ({
    id: crypto.randomUUID(),
    name: name || `${driver}://${host || database}`,
    driver,
    host: driver !== "sqlite" ? host : undefined,
    port: driver !== "sqlite" ? Number(port) : undefined,
    database: database || undefined,
    username: driver !== "sqlite" ? username : undefined,
  });

  const handleDriverChange = (d: Driver) => {
    setDriver(d);
    if (d !== "sqlite") setPort(String(DEFAULT_PORTS[d]));
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await api.testConnection(buildConfig(), password);
      setTestResult({ ok: true, msg: "Connection successful!" });
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setTestResult({ ok: false, msg: "Please enter a connection name." });
      return;
    }
    setSaving(true);
    try {
      const config = buildConfig();
      config.name = name;
      await saveConnection(config, password);
      onClose();
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-[480px] rounded shadow-xl flex flex-col"
        style={{
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
            New Connection
          </span>
          <button
            onClick={onClose}
            className="text-lg leading-none"
            style={{ color: "var(--text-muted)" }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-5 py-5">
          {/* Driver tabs */}
          <div className="flex gap-2">
            {(["postgres", "mysql", "sqlite"] as Driver[]).map((d) => (
              <button
                key={d}
                onClick={() => handleDriverChange(d)}
                className="px-4 py-1.5 rounded text-sm font-medium transition-colors"
                style={{
                  background: driver === d ? "var(--accent)" : "var(--bg-secondary)",
                  color: driver === d ? "#fff" : "var(--text-secondary)",
                }}
              >
                {d === "postgres" ? "PostgreSQL" : d === "mysql" ? "MySQL" : "SQLite"}
              </button>
            ))}
          </div>

          <Field label="Connection Name">
            <Input
              value={name}
              onChange={setName}
              placeholder={`My ${driver} DB`}
            />
          </Field>

          {driver === "sqlite" ? (
            <Field label="Database File Path">
              <Input
                value={database}
                onChange={setDatabase}
                placeholder="/path/to/database.db"
              />
            </Field>
          ) : (
            <>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Field label="Host">
                    <Input
                      value={host}
                      onChange={setHost}
                      placeholder="localhost"
                    />
                  </Field>
                </div>
                <div className="w-24">
                  <Field label="Port">
                    <Input
                      value={port}
                      onChange={setPort}
                      placeholder={String(DEFAULT_PORTS[driver])}
                    />
                  </Field>
                </div>
              </div>

              <Field label="Database">
                <Input
                  value={database}
                  onChange={setDatabase}
                  placeholder="mydb"
                />
              </Field>

              <div className="flex gap-3">
                <div className="flex-1">
                  <Field label="Username">
                    <Input
                      value={username}
                      onChange={setUsername}
                      placeholder={driver === "postgres" ? "postgres" : "root"}
                    />
                  </Field>
                </div>
                <div className="flex-1">
                  <Field label="Password">
                    <Input
                      type="password"
                      value={password}
                      onChange={setPassword}
                      placeholder="••••••••"
                    />
                  </Field>
                </div>
              </div>
            </>
          )}

          {testResult && (
            <p
              className="text-sm px-3 py-2 rounded"
              style={{
                background: testResult.ok
                  ? "rgba(137, 209, 133, 0.1)"
                  : "rgba(244, 135, 113, 0.1)",
                color: testResult.ok ? "var(--success)" : "var(--error)",
                border: `1px solid ${testResult.ok ? "var(--success)" : "var(--error)"}`,
              }}
            >
              {testResult.msg}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-1.5 rounded text-sm font-medium transition-colors"
            style={{
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          >
            {testing ? "Testing…" : "Test Connection"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded text-sm"
              style={{ color: "var(--text-secondary)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 rounded text-sm font-medium"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-1.5 rounded text-sm outline-none"
      style={{
        background: "var(--bg-secondary)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
      }}
    />
  );
}
