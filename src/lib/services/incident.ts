// Incident-management service. Lifecycle:
//   open → contained → resolved → closed
//
// Status moves forward only; reopening creates a new incident (out of
// scope for v1). Closure requires rootCause + containmentActions +
// resolutionActions to all be non-empty — that's the "answer" auditors
// expect to see and the schema's nullable fields would otherwise let the
// row close empty.
//
// Updates: every state change writes an IncidentUpdate so the timeline
// preserves the path; the header captures the current state.

import { db } from "@/lib/db";
import { writeAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { blockedByPolicy, notFound, validationError } from "@/lib/errors";

export const INCIDENT_TYPES = [
  "security",
  "data_integrity",
  "integration_failure",
  "availability",
  "privacy",
  "contribution_processing",
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export type IncidentStatus = "open" | "contained" | "resolved" | "closed";

// Allowed forward transitions. open → closed directly is permitted for
// false-alarm scenarios (incident turned out to be a non-issue); the
// closure record + reasoning still has to be captured.
const ALLOWED_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  open: ["contained", "resolved", "closed"],
  contained: ["resolved", "closed"],
  resolved: ["closed"],
  closed: [],
};

export type OpenIncidentInput = {
  actorUserId: string;
  actorOrganizationId: string;
  organizationId?: string | null;
  companyId?: string | null;
  planId?: string | null;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  title: string;
  description: string;
  detectedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function openIncident(input: OpenIncidentInput): Promise<{ incidentId: string }> {
  if (!input.title.trim()) throw validationError("title is required");
  if (!input.description.trim()) throw validationError("description is required");
  if (input.detectedAt.getTime() > Date.now() + 60_000) {
    throw validationError("detectedAt cannot be in the future");
  }

  if (input.organizationId) {
    const org = await db.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true },
    });
    if (!org) throw notFound("Organization");
  }

  return db.$transaction(async (tx) => {
    const incident = await tx.incident.create({
      data: {
        organizationId: input.organizationId ?? null,
        companyId: input.companyId ?? null,
        planId: input.planId ?? null,
        incidentType: input.incidentType,
        severity: input.severity,
        status: "open",
        title: input.title.trim(),
        description: input.description.trim(),
        detectedAt: input.detectedAt,
        reportedById: input.actorUserId,
      },
    });

    await tx.incidentUpdate.create({
      data: {
        incidentId: incident.id,
        authorId: input.actorUserId,
        kind: "status_change",
        fromStatus: null,
        toStatus: "open",
        content: `Incident opened — ${input.title.trim()}`,
      },
    });

    await writeAudit(
      {
        // Audit is scoped to the actor's org so it shows in their evidence
        // queries; the incident itself carries its own organizationId.
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.incidentOpened,
        entityType: "incident",
        entityId: incident.id,
        metadata: {
          incidentType: input.incidentType,
          severity: input.severity,
          incidentOrganizationId: input.organizationId ?? null,
          title: input.title.trim(),
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );

    return { incidentId: incident.id };
  });
}

export type AddIncidentNoteInput = {
  actorUserId: string;
  actorOrganizationId: string;
  incidentId: string;
  note: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function addIncidentNote(input: AddIncidentNoteInput): Promise<void> {
  if (!input.note.trim()) throw validationError("Note is required");

  await db.$transaction(async (tx) => {
    const incident = await tx.incident.findUnique({
      where: { id: input.incidentId },
      select: { id: true, status: true },
    });
    if (!incident) throw notFound("Incident");
    if (incident.status === "closed") {
      throw blockedByPolicy("Cannot add notes to a closed incident");
    }

    await tx.incidentUpdate.create({
      data: {
        incidentId: incident.id,
        authorId: input.actorUserId,
        kind: "note",
        content: input.note.trim(),
      },
    });

    await writeAudit(
      {
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.incidentUpdated,
        entityType: "incident",
        entityId: incident.id,
        metadata: { kind: "note" },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
  });
}

export type TransitionIncidentInput = {
  actorUserId: string;
  actorOrganizationId: string;
  incidentId: string;
  toStatus: Exclude<IncidentStatus, "closed">; // closeIncident handles "closed" separately
  note?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function transitionIncidentStatus(input: TransitionIncidentInput): Promise<void> {
  await db.$transaction(async (tx) => {
    const incident = await tx.incident.findUnique({
      where: { id: input.incidentId },
      select: { id: true, status: true },
    });
    if (!incident) throw notFound("Incident");
    const current = incident.status as IncidentStatus;
    const allowed = ALLOWED_TRANSITIONS[current];
    if (!allowed.includes(input.toStatus)) {
      throw blockedByPolicy(
        `Cannot transition from ${current} to ${input.toStatus}`,
        { currentStatus: current, allowed },
      );
    }

    await tx.incident.update({
      where: { id: incident.id },
      data: { status: input.toStatus },
    });

    await tx.incidentUpdate.create({
      data: {
        incidentId: incident.id,
        authorId: input.actorUserId,
        kind: "status_change",
        fromStatus: current,
        toStatus: input.toStatus,
        content: input.note?.trim() || `Status changed: ${current} → ${input.toStatus}`,
      },
    });

    await writeAudit(
      {
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.incidentStatusChanged,
        entityType: "incident",
        entityId: incident.id,
        metadata: { fromStatus: current, toStatus: input.toStatus },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
  });
}

export type CustomerNotificationDecisionInput = {
  actorUserId: string;
  actorOrganizationId: string;
  incidentId: string;
  required: boolean;
  notes: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function recordCustomerNotificationDecision(
  input: CustomerNotificationDecisionInput,
): Promise<void> {
  if (!input.notes.trim()) {
    throw validationError("A reasoning note is required for the customer-notification decision");
  }

  await db.$transaction(async (tx) => {
    const incident = await tx.incident.findUnique({
      where: { id: input.incidentId },
      select: { id: true, status: true },
    });
    if (!incident) throw notFound("Incident");
    if (incident.status === "closed") {
      throw blockedByPolicy("Cannot change customer-notification on a closed incident");
    }

    await tx.incident.update({
      where: { id: incident.id },
      data: {
        customerNotificationRequired: input.required,
        customerNotificationDecidedById: input.actorUserId,
        customerNotificationDecidedAt: new Date(),
        customerNotificationNotes: input.notes.trim(),
      },
    });

    await tx.incidentUpdate.create({
      data: {
        incidentId: incident.id,
        authorId: input.actorUserId,
        kind: "customer_notification",
        content: `Customer notification ${input.required ? "REQUIRED" : "not required"}: ${input.notes.trim()}`,
      },
    });

    await writeAudit(
      {
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.incidentCustomerNotificationDecided,
        entityType: "incident",
        entityId: incident.id,
        metadata: { required: input.required },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
  });
}

export type CloseIncidentInput = {
  actorUserId: string;
  actorOrganizationId: string;
  incidentId: string;
  rootCause: string;
  containmentActions: string;
  resolutionActions: string;
  closingNote?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

export async function closeIncident(input: CloseIncidentInput): Promise<void> {
  if (!input.rootCause.trim()) throw validationError("rootCause is required to close");
  if (!input.containmentActions.trim()) throw validationError("containmentActions is required to close");
  if (!input.resolutionActions.trim()) throw validationError("resolutionActions is required to close");

  await db.$transaction(async (tx) => {
    const incident = await tx.incident.findUnique({
      where: { id: input.incidentId },
      select: { id: true, status: true },
    });
    if (!incident) throw notFound("Incident");
    if (incident.status === "closed") {
      throw blockedByPolicy("Incident is already closed");
    }
    const current = incident.status as IncidentStatus;

    const now = new Date();
    await tx.incident.update({
      where: { id: incident.id },
      data: {
        status: "closed",
        rootCause: input.rootCause.trim(),
        containmentActions: input.containmentActions.trim(),
        resolutionActions: input.resolutionActions.trim(),
        closedById: input.actorUserId,
        closedAt: now,
      },
    });

    await tx.incidentUpdate.create({
      data: {
        incidentId: incident.id,
        authorId: input.actorUserId,
        kind: "status_change",
        fromStatus: current,
        toStatus: "closed",
        content:
          input.closingNote?.trim() ||
          `Closed. Root cause + containment + resolution recorded.`,
      },
    });

    await writeAudit(
      {
        organizationId: input.actorOrganizationId,
        actorUserId: input.actorUserId,
        action: AUDIT_ACTIONS.incidentClosed,
        entityType: "incident",
        entityId: incident.id,
        metadata: { fromStatus: current, hasClosingNote: Boolean(input.closingNote?.trim()) },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        requestId: input.requestId,
      },
      tx,
    );
  });
}
