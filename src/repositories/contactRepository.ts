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
    ): Promise<Contact> {
        const result = await query(
            `INSERT INTO "Contact" (email, "phoneNumber", "linkPrecedence")
       VALUES ($1, $2, 'primary')
       RETURNING *`,
            [email, phoneNumber]
        );
        return result.rows[0];
    }

    async createSecondary(
        email: string | null,
        phoneNumber: string | null,
        linkedId: number
    ): Promise<Contact> {
        const result = await query(
            `INSERT INTO "Contact" (email, "phoneNumber", "linkedId", "linkPrecedence")
       VALUES ($1, $2, $3, 'secondary')
       RETURNING *`,
            [email, phoneNumber, linkedId]
        );
        return result.rows[0];
    }

    async getContactChain(contactId: number): Promise<Contact[]> {
        const result = await query(
            `WITH RECURSIVE contact_chain AS (
        SELECT * FROM "Contact" 
        WHERE id = $1 AND "deletedAt" IS NULL
        
        UNION ALL
        
        SELECT c.* FROM "Contact" c
        INNER JOIN contact_chain cc ON c."linkedId" = cc.id
        WHERE c."deletedAt" IS NULL
      )
      SELECT * FROM contact_chain
      ORDER BY "createdAt" ASC`,
            [contactId]
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

    async updateLinkedId(contactId: number, linkedId: number): Promise<Contact> {
        const result = await query(
            `UPDATE "Contact" 
       SET "linkedId" = $1, "updatedAt" = NOW()
       WHERE id = $2
       RETURNING *`,
            [linkedId, contactId]
        );
        return result.rows[0];
    }
}