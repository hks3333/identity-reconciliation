import { query } from '../db.js';

export interface Contact {
    id: number;
    phoneNumber: string | null;
    email: string | null;
    linkedId: number | null;
    linkPrecedence: 'primary' | 'secondary';
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}

export class ContactRepository {
    async findByEmailOrPhone(
        email: string | null,
        phoneNumber: string | null
    ): Promise<Contact[]> {
        const result = await query(
            `SELECT * FROM "Contact" 
       WHERE "deletedAt" IS NULL AND (
         (email = $1 AND email IS NOT NULL) 
         OR ("phoneNumber" = $2 AND "phoneNumber" IS NOT NULL)
       )
       ORDER BY "createdAt" ASC`,
            [email, phoneNumber]
        );
        return result.rows;
    }

    async createPrimary(
        email: string | null,
        phoneNumber: string | null
    ): Promise<Contact | null> {
        try {
            const result = await query(
                `INSERT INTO "Contact" (email, "phoneNumber", "linkPrecedence")
       VALUES ($1, $2, 'primary')
       RETURNING *`,
                [email, phoneNumber]
            );
            return result.rows[0];
        } catch (error: unknown) {
            if (error instanceof Error && 'code' in error && (error as any).code === '23505') {
                return null; // Duplicate — another request already inserted this
            }
            throw error;
        }
    }

    async createSecondary(
        email: string | null,
        phoneNumber: string | null,
        linkedId: number
    ): Promise<Contact | null> {
        try {
            const result = await query(
                `INSERT INTO "Contact" (email, "phoneNumber", "linkedId", "linkPrecedence")
       VALUES ($1, $2, $3, 'secondary')
       RETURNING *`,
                [email, phoneNumber, linkedId]
            );
            return result.rows[0];
        } catch (error: unknown) {
            if (error instanceof Error && 'code' in error && (error as any).code === '23505') {
                return null; // Duplicate — another request already inserted this
            }
            throw error;
        }
    }

    /**
     * Fetches the full contact cluster for a set of primary IDs.
     * Returns all contacts where id OR linkedId matches any of the given primary IDs.
     */
    async getContactCluster(primaryIds: number[]): Promise<Contact[]> {
        if (primaryIds.length === 0) return [];

        const result = await query(
            `SELECT * FROM "Contact" 
       WHERE (id = ANY($1) OR "linkedId" = ANY($1)) AND "deletedAt" IS NULL
       ORDER BY "createdAt" ASC`,
            [primaryIds]
        );
        return result.rows;
    }

    async getContactsByIds(ids: number[]): Promise<Contact[]> {
        if (ids.length === 0) return [];

        const result = await query(
            `SELECT * FROM "Contact" 
       WHERE id = ANY($1) AND "deletedAt" IS NULL
       ORDER BY "createdAt" ASC`,
            [ids]
        );
        return result.rows;
    }

    /**
     * Demotes a primary contact to secondary, linking it to a new primary.
     */
    async convertToSecondary(contactId: number, newPrimaryId: number): Promise<Contact> {
        const result = await query(
            `UPDATE "Contact" 
       SET "linkedId" = $1, "linkPrecedence" = 'secondary', "updatedAt" = NOW()
       WHERE id = $2
       RETURNING *`,
            [newPrimaryId, contactId]
        );
        return result.rows[0];
    }

    /**
     * Re-links all secondaries that point to oldPrimaryId so they point to newPrimaryId instead.
     */
    async reassignSecondaries(oldPrimaryId: number, newPrimaryId: number): Promise<void> {
        await query(
            `UPDATE "Contact" 
       SET "linkedId" = $1, "updatedAt" = NOW()
       WHERE "linkedId" = $2 AND "deletedAt" IS NULL`,
            [newPrimaryId, oldPrimaryId]
        );
    }
}