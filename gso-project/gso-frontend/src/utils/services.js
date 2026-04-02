export const DEFAULT_SERVICES = [
  {
    id: "svc_carpentry",
    name: "Carpentry",
    icon: "\u{1F528}",
    color: "#c97d3e",
    category: "Maintenance",
    fields: [
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "location", label: "Location / Room", type: "text", required: true },
      { key: "preferred_date", label: "Preferred Date", type: "date", required: true },
    ],
  },
  {
    id: "svc_electrical",
    name: "Electrical",
    icon: "\u26A1",
    color: "#e8c74a",
    category: "Maintenance",
    fields: [
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "location", label: "Location / Room", type: "text", required: true },
      { key: "preferred_date", label: "Preferred Date", type: "date", required: true },
    ],
  },
  {
    id: "svc_room_reservation",
    name: "Room Reservation",
    icon: "\u{1F3DB}\uFE0F",
    color: "#4a90d9",
    category: "Reservation",
    fields: [
      { key: "description", label: "Purpose", type: "textarea", required: true },
      { key: "location", label: "Room / Venue", type: "text", required: true },
      { key: "preferred_date", label: "Reservation Date", type: "date", required: true },
    ],
  },
  {
    id: "svc_plumbing",
    name: "Plumbing",
    icon: "\u{1F527}",
    color: "#4db8a4",
    category: "Maintenance",
    fields: [
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "location", label: "Location / Room", type: "text", required: true },
      { key: "preferred_date", label: "Preferred Date", type: "date", required: true },
    ],
  },
  {
    id: "svc_cleaning",
    name: "Cleaning",
    icon: "\u{1F9F9}",
    color: "#8c6fcf",
    category: "Facility",
    fields: [
      { key: "description", label: "Description", type: "textarea", required: true },
      { key: "location", label: "Location / Room", type: "text", required: true },
      { key: "preferred_date", label: "Preferred Date", type: "date", required: true },
    ],
  },
];

export const SERVICE_ICONS = Object.fromEntries(DEFAULT_SERVICES.map((service) => [service.name, service.icon]));
export const SERVICE_COLORS = Object.fromEntries(DEFAULT_SERVICES.map((service) => [service.name, service.color]));

export function getServiceCatalog(services = []) {
  return services.length ? services : DEFAULT_SERVICES;
}

export function getServiceMeta(serviceType, services = []) {
  const catalog = getServiceCatalog(services);
  return catalog.find((service) => service.name === serviceType) || {
    id: null,
    name: serviceType,
    icon: "\u{1F9F0}",
    color: "#3b82f6",
    category: "General",
    fields: [],
  };
}

export function getServiceNamesFromRequests(list = []) {
  return [...new Set(list.map((item) => item.service_type).filter(Boolean))].sort();
}

export function getServiceOptionsForRequests(services, requests) {
  const fromCatalog = getServiceCatalog(services).map((service) => service.name);
  const fromRequests = getServiceNamesFromRequests(requests);
  return ["all", ...new Set([...fromCatalog, ...fromRequests])];
}

export function getRequestDetails(req) {
  if (req?.request_details && typeof req.request_details === "object") return req.request_details;
  if (!req?.request_details_json) return {};
  try {
    return JSON.parse(req.request_details_json);
  } catch {
    return {};
  }
}

export function getRequestDescription(req) {
  return req.description || "See request details";
}

export function getRequestLocation(req) {
  return req.location || "Not specified";
}

export function getRequestPreferredDate(req) {
  return req.preferred_date || null;
}

export function getRequestDetailEntries(req, services = []) {
  const details = getRequestDetails(req);
  const meta = getServiceMeta(req.service_type, services);
  const fields = meta.fields?.length ? meta.fields : Object.keys(details).map((key) => ({ key, label: key.replace(/_/g, " ") }));
  return fields
    .map((field) => ({ label: field.label, value: details[field.key] }))
    .filter((item) => item.value !== undefined && item.value !== null && item.value !== "");
}

export function slugifyFieldKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "field";
}

export function makeServiceDraft() {
  return {
    name: "",
    icon: "\u{1F9F0}",
    color: "#3b82f6",
    category: "General",
    is_active: true,
    fields: [
      { key: "description", label: "Description", type: "textarea", required: true, options: "" },
      { key: "location", label: "Location", type: "text", required: true, options: "" },
      { key: "preferred_date", label: "Preferred Date", type: "date", required: true, options: "" },
    ],
  };
}
