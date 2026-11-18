import { randomUUID } from "node:crypto";

import type { PersonaDetailDto, PersonaPayloadDto, PersonaSummaryDto } from "@xuyueji/contracts";
import { NotFoundError, VersionConflictError } from "@xuyueji/domain";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { personas, personaVersions } from "../db/schema.js";
import { toIso } from "../time.js";
import { enqueueSyncChange } from "./sync-log.js";

export type PersonaRow = typeof personas.$inferSelect;
export type PersonaVersionRow = typeof personaVersions.$inferSelect;

function payloadOf(version: PersonaVersionRow | undefined): PersonaPayloadDto | null {
  if (!version) {
    return null;
  }
  const value = version.payloadJsonb;
  return {
    displayName:
      typeof value.displayName === "string" && value.displayName.length > 0
        ? value.displayName
        : "未命名 Persona",
    description: typeof value.description === "string" ? value.description : "",
  };
}

export function toPersonaSummary(
  persona: PersonaRow,
  activeVersion: PersonaVersionRow | undefined,
): PersonaSummaryDto {
  const payload = payloadOf(activeVersion);
  return {
    id: persona.id,
    displayName: payload?.displayName ?? "未命名 Persona",
    activeVersionId: persona.activeVersionId,
    revision: activeVersion?.revision ?? 0,
    updatedAt: toIso(persona.updatedAt),
  };
}

export async function listPersonas(
  db: Database,
  ownerUserId: string,
): Promise<PersonaSummaryDto[]> {
  const rows = await db
    .select({ persona: personas, version: personaVersions })
    .from(personas)
    .leftJoin(personaVersions, eq(personaVersions.id, personas.activeVersionId))
    .where(and(eq(personas.ownerUserId, ownerUserId), isNull(personas.deletedAt)))
    .orderBy(desc(personas.updatedAt));

  return rows.map((row) => toPersonaSummary(row.persona, row.version ?? undefined));
}

export async function getPersona(
  db: Database,
  ownerUserId: string,
  personaId: string,
): Promise<PersonaDetailDto> {
  const [persona] = await db
    .select()
    .from(personas)
    .where(
      and(
        eq(personas.id, personaId),
        eq(personas.ownerUserId, ownerUserId),
        isNull(personas.deletedAt),
      ),
    )
    .limit(1);
  if (!persona) {
    throw new NotFoundError("Persona not found.", { personaId });
  }

  const versions = await db
    .select()
    .from(personaVersions)
    .where(eq(personaVersions.personaId, personaId))
    .orderBy(desc(personaVersions.revision));

  const active = versions.find((version) => version.id === persona.activeVersionId);
  return {
    persona: toPersonaSummary(persona, active),
    activeVersion: active
      ? {
          id: active.id,
          revision: active.revision,
          payload: payloadOf(active) as PersonaPayloadDto,
          createdAt: toIso(active.createdAt),
        }
      : null,
    versions: versions.map((version) => ({
      id: version.id,
      revision: version.revision,
      createdAt: toIso(version.createdAt),
    })),
  };
}

export async function createPersona(
  db: Database,
  input: {
    ownerUserId: string;
    payload: PersonaPayloadDto;
    now: string;
  },
): Promise<PersonaDetailDto> {
  const personaId = randomUUID();
  const versionId = randomUUID();

  return db.transaction(async (tx) => {
    const [persona] = await tx
      .insert(personas)
      .values({
        id: personaId,
        ownerUserId: input.ownerUserId,
        activeVersionId: versionId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    if (!persona) {
      throw new Error("Persona insert returned no row.");
    }
    const [version] = await tx
      .insert(personaVersions)
      .values({
        id: versionId,
        personaId,
        ownerUserId: input.ownerUserId,
        revision: 1,
        payloadJsonb: input.payload,
        createdAt: input.now,
      })
      .returning();
    if (!version) {
      throw new Error("Persona version insert returned no row.");
    }
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "persona",
      entityId: personaId,
      revision: 1,
      op: "upsert",
    });

    return {
      persona: toPersonaSummary(persona, version),
      activeVersion: {
        id: version.id,
        revision: version.revision,
        payload: input.payload,
        createdAt: toIso(version.createdAt),
      },
      versions: [
        {
          id: version.id,
          revision: version.revision,
          createdAt: toIso(version.createdAt),
        },
      ],
    };
  });
}

export async function addPersonaVersion(
  db: Database,
  input: {
    ownerUserId: string;
    personaId: string;
    expectedActiveVersionId: string;
    payload: PersonaPayloadDto;
    now: string;
  },
): Promise<{ persona: PersonaSummaryDto; version: PersonaVersionRow; versionCount: number }> {
  return db.transaction(async (tx) => {
    const [persona] = await tx
      .select()
      .from(personas)
      .where(
        and(
          eq(personas.id, input.personaId),
          eq(personas.ownerUserId, input.ownerUserId),
          isNull(personas.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!persona) {
      throw new NotFoundError("Persona not found.", { personaId: input.personaId });
    }
    if (persona.activeVersionId !== input.expectedActiveVersionId) {
      throw new VersionConflictError("Persona changed on another device.", {
        personaId: persona.id,
        expectedActiveVersionId: input.expectedActiveVersionId,
        actualActiveVersionId: persona.activeVersionId,
      });
    }

    const [latest] = await tx
      .select({ revision: personaVersions.revision })
      .from(personaVersions)
      .where(eq(personaVersions.personaId, persona.id))
      .orderBy(desc(personaVersions.revision))
      .limit(1);
    const revision = (latest?.revision ?? 0) + 1;
    const versionId = randomUUID();

    const [version] = await tx
      .insert(personaVersions)
      .values({
        id: versionId,
        personaId: persona.id,
        ownerUserId: input.ownerUserId,
        revision,
        payloadJsonb: input.payload,
        createdAt: input.now,
      })
      .returning();
    if (!version) {
      throw new Error("Persona version insert returned no row.");
    }
    const [updated] = await tx
      .update(personas)
      .set({ activeVersionId: versionId, updatedAt: input.now })
      .where(eq(personas.id, persona.id))
      .returning();
    if (!updated) {
      throw new Error("Persona update returned no row.");
    }
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "persona",
      entityId: persona.id,
      revision,
      op: "upsert",
    });

    const versionRows = await tx
      .select({ revision: personaVersions.revision })
      .from(personaVersions)
      .where(eq(personaVersions.personaId, persona.id));

    return {
      persona: toPersonaSummary(updated, version),
      version,
      versionCount: versionRows.length,
    };
  });
}

export async function deletePersona(
  db: Database,
  input: { ownerUserId: string; personaId: string; now: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [persona] = await tx
      .select()
      .from(personas)
      .where(
        and(
          eq(personas.id, input.personaId),
          eq(personas.ownerUserId, input.ownerUserId),
          isNull(personas.deletedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!persona) {
      throw new NotFoundError("Persona not found.", { personaId: input.personaId });
    }
    await tx
      .update(personas)
      .set({ deletedAt: input.now, updatedAt: input.now })
      .where(eq(personas.id, persona.id));
    await enqueueSyncChange(tx, {
      ownerUserId: input.ownerUserId,
      entityType: "persona",
      entityId: persona.id,
      revision: 1,
      op: "delete",
    });
  });
}
