export function HorizontalBarChart({ items }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="bar-chart">
      {items.map((item) => (
        <div className="bar-row" key={item.label}>
          <div className="bar-label">{item.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(item.value / max) * 100}%`, background: item.color }} />
          </div>
          <div className="bar-value">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({ items, totalLabel = "Total" }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let angle = 0;
  const slices = items.map((item) => {
    const start = angle;
    const size = total > 0 ? (item.value / total) * 360 : 0;
    angle += size;
    return `${item.color} ${start}deg ${start + size}deg`;
  });
  const background = total > 0 ? `conic-gradient(${slices.join(", ")})` : "conic-gradient(rgba(255,255,255,0.08) 0deg 360deg)";

  return (
    <div className="donut-wrap">
      <div className="donut-chart" style={{ background }}>
        <div className="donut-center">
          <strong>{total}</strong>
          <span>{totalLabel}</span>
        </div>
      </div>
      <div className="legend-list">
        {items.map((item) => (
          <div className="legend-item" key={item.label}>
            <div className="legend-left">
              <span className="legend-dot" style={{ background: item.color }} />
              <span>{item.label}</span>
            </div>
            <div className="legend-value">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function exportRowsToCsv(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
