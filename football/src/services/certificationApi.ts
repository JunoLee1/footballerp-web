import type { Certification, CertEntityType, CertificationType, CertStatus } from "../types/certification";

const BASE = "/api/certification";

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export const certificationApi = {
  list(params?: {
    entityType?: CertEntityType;
    certType?: CertificationType;
    status?: CertStatus;
    playerId?: string;
    coachId?: string;
    staffId?: number;
  }): Promise<Certification[]> {
    const qs = new URLSearchParams(
      Object.entries(params ?? {})
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    ).toString();
    return req(`${BASE}${qs ? `?${qs}` : ""}`);
  },

  get(id: number): Promise<Certification> {
    return req(`${BASE}/${id}`);
  },

  create(body: {
    certType: CertificationType;
    entityType: CertEntityType;
    issuingBody: string;
    issuedAt: string;
    expiresAt: string;
    reminderDays?: number[];
    notes?: string;
    playerId?: string;
    coachId?: string;
    staffId?: number;
    facilityZone?: string;
  }): Promise<Certification> {
    return req(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  update(id: number, body: Partial<{
    issuingBody: string;
    issuedAt: string;
    expiresAt: string;
    documentUrl: string;
    reminderDays: number[];
    notes: string;
  }>): Promise<Certification> {
    return req(`${BASE}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  },

  submit(id: number):    Promise<Certification> { return req(`${BASE}/${id}/submit`,     { method: "POST" }); },
  approve(id: number):   Promise<Certification> { return req(`${BASE}/${id}/approve`,    { method: "POST" }); },
  gmApprove(id: number): Promise<Certification> { return req(`${BASE}/${id}/gm-approve`, { method: "POST" }); },

  reject(id: number, reason: string): Promise<Certification> {
    return req(`${BASE}/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
  },

  suspend(id: number): Promise<Certification> { return req(`${BASE}/${id}/suspend`, { method: "POST" }); },
  cancel(id: number):  Promise<Certification> { return req(`${BASE}/${id}/cancel`,  { method: "POST" }); },

  uploadDocument(id: number, file: File): Promise<Certification> {
    const form = new FormData();
    form.append("file", file);
    return req(`${BASE}/${id}/upload`, { method: "POST", body: form });
  },
};
