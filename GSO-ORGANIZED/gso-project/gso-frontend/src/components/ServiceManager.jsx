import { useState } from "react";
import { api } from "../api";
import { makeServiceDraft, slugifyFieldKey } from "../utils/services";

export function DynamicServiceForm({ service, values, onChange }) {
  const fields = service?.fields || [];
  return (
    <>
      {fields.map((field) => (
        <div className="field-group" key={field.key}>
          <label>{field.label}{field.required ? " *" : ""}</label>
          {field.type === "textarea" && (
            <textarea
              value={values[field.key] || ""}
              onChange={(e) => onChange(field.key, e.target.value)}
              rows={3}
            />
          )}
          {field.type === "select" && (
            <select value={values[field.key] || ""} onChange={(e) => onChange(field.key, e.target.value)}>
              <option value="">Select an option</option>
              {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          )}
          {["text", "date", "time", "number"].includes(field.type) && (
            <input
              type={field.type}
              value={values[field.key] || ""}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </>
  );
}

export function ServiceManager({ services, onRefresh, showToast }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(makeServiceDraft());
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setDraft(makeServiceDraft());
  };

  const openEdit = (service) => {
    setEditing(service);
    setDraft({
      name: service.name,
      icon: service.icon,
      color: service.color,
      category: service.category || "General",
      is_active: service.is_active,
      fields: (service.fields || []).map((field) => ({
        ...field,
        options: Array.isArray(field.options) ? field.options.join("\n") : "",
      })),
    });
  };

  const updateField = (index, key, value) => {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field, idx) => {
        if (idx !== index) return field;
        const next = { ...field, [key]: value };
        if (key === "label" && (!field.key || field.key === slugifyFieldKey(field.label))) {
          next.key = slugifyFieldKey(value);
        }
        return next;
      }),
    }));
  };

  const addField = () => {
    setDraft((current) => ({
      ...current,
      fields: [...current.fields, { key: `field_${current.fields.length + 1}`, label: "New Field", type: "text", required: false, options: "" }],
    }));
  };

  const removeField = (index) => {
    setDraft((current) => ({
      ...current,
      fields: current.fields.filter((_, idx) => idx !== index),
    }));
  };

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        ...draft,
        fields: draft.fields.map((field) => ({
          ...field,
          key: slugifyFieldKey(field.key || field.label),
        })),
      };
      if (editing) await api.updateService(editing.id, payload);
      else await api.createService(payload);
      showToast(editing ? "Service updated" : "Service created");
      await onRefresh();
      openCreate();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const groupedServices = services.reduce((acc, service) => {
    const category = service.category || "General";
    acc[category] = acc[category] || [];
    acc[category].push(service);
    return acc;
  }, {});

  return (
    <div>
      <div className="service-manager-header">
        <div className="section-header" style={{ marginBottom: 0 }}>
          <h2>Service Builder</h2>
          <p>Add services, categories, and exactly what users must fill up.</p>
        </div>
        <button className="btn-primary" style={{ maxWidth: "200px" }} onClick={openCreate}>Add Service</button>
      </div>

      <div className="settings-section">
        <h3>{editing ? `Edit Service: ${editing.name}` : "New Service"}</h3>
        <div className="field-group"><label>Service Name</label><input value={draft.name} onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))} /></div>
        <div className="grid-2">
          <div className="field-group"><label>Icon</label><input value={draft.icon} onChange={(e) => setDraft((current) => ({ ...current, icon: e.target.value }))} /></div>
          <div className="field-group"><label>Color</label><input type="color" value={draft.color} onChange={(e) => setDraft((current) => ({ ...current, color: e.target.value }))} /></div>
        </div>
        <div className="field-group"><label>Category</label><input value={draft.category || ""} onChange={(e) => setDraft((current) => ({ ...current, category: e.target.value }))} placeholder="Maintenance, Reservation, Facility..." /></div>
        <label className="inline-check" style={{ marginBottom: "0.75rem" }}>
          <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft((current) => ({ ...current, is_active: e.target.checked }))} />
          Service is active and can appear in request choices
        </label>

        <div className="field-builder">
          {draft.fields.map((field, index) => (
            <div className="field-builder-item" key={`${field.key}-${index}`}>
              <div className="field-builder-grid">
                <div className="field-group" style={{ marginBottom: 0 }}>
                  <label>Label</label>
                  <input value={field.label} onChange={(e) => updateField(index, "label", e.target.value)} />
                </div>
                <div className="field-group" style={{ marginBottom: 0 }}>
                  <label>Key</label>
                  <input value={field.key} onChange={(e) => updateField(index, "key", e.target.value)} />
                </div>
                <div className="field-group" style={{ marginBottom: 0 }}>
                  <label>Type</label>
                  <select value={field.type} onChange={(e) => updateField(index, "type", e.target.value)}>
                    {["text", "textarea", "date", "time", "number", "select"].map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <button className="btn-reject sm" type="button" onClick={() => removeField(index)}>Remove</button>
              </div>
              <label className="inline-check" style={{ marginTop: "0.75rem" }}>
                <input type="checkbox" checked={field.required} onChange={(e) => updateField(index, "required", e.target.checked)} />
                Required
              </label>
              {field.type === "select" && (
                <div className="field-group" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
                  <label>Dropdown Options</label>
                  <textarea value={field.options || ""} onChange={(e) => updateField(index, "options", e.target.value)} rows={3} placeholder="One option per line" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="modal-footer" style={{ padding: "1rem 0 0", borderTop: "none", position: "static" }}>
          <button className="btn-ghost" onClick={addField}>Add Field</button>
          <button className="btn-primary" style={{ maxWidth: "220px" }} onClick={submit} disabled={saving}>{saving ? "Saving..." : editing ? "Save Changes" : "Create Service"}</button>
        </div>
      </div>

      <div className="users-list">
        {Object.entries(groupedServices).map(([category, items]) => (
          <div key={category} className="overview-section" style={{ padding: "1rem" }}>
            <div className="overview-title" style={{ marginBottom: "0.75rem" }}>
              <div>
                <h3>{category}</h3>
                <p>{items.length} service{items.length === 1 ? "" : "s"}</p>
              </div>
            </div>
            <div className="users-list">
              {items.map((service) => (
                <div className="service-admin-card" key={service.id}>
                  <div>
                    <div className="req-svc">{service.icon} {service.name}</div>
                    <div className="service-admin-meta">
                      {service.is_active ? "Active" : "Archived"} • {service.fields?.length || 0} field{service.fields?.length === 1 ? "" : "s"}
                    </div>
                    <div className="service-admin-fields">
                      {(service.fields || []).map((field) => (
                        <span className="field-chip" key={field.key}>{field.label}{field.required ? " *" : ""}</span>
                      ))}
                    </div>
                  </div>
                  <div className="req-actions" style={{ marginTop: 0 }}>
                    <button className="view-btn" onClick={() => openEdit(service)}>Edit</button>
                    <button
                      className={service.is_active ? "btn-reject sm" : "btn-approve sm"}
                      onClick={async () => {
                        try {
                          await api.updateService(service.id, { ...service, is_active: !service.is_active });
                          showToast(service.is_active ? "Service archived" : "Service enabled");
                          await onRefresh();
                          if (editing?.id === service.id) openCreate();
                        } catch (err) {
                          showToast(err.message, "error");
                        }
                      }}
                    >
                      {service.is_active ? "Archive" : "Enable"}
                    </button>
                    <button
                      className="btn-reject sm"
                      onClick={async () => {
                        const ok = window.confirm(`Delete "${service.name}" permanently? This cannot be undone.`);
                        if (!ok) return;
                        try {
                          await api.deleteService(service.id);
                          showToast("Service deleted permanently");
                          await onRefresh();
                          if (editing?.id === service.id) openCreate();
                        } catch (err) {
                          showToast(err.message, "error");
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
