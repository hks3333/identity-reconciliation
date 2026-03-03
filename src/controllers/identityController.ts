import { type Request, type Response } from 'express';
import { query } from '../db.js';

interface Contact {
  id: number;
  phoneNumber: string | null;
  email: string | null;
  linkedId: number | null;
  linkPrecedence: 'primary' | 'secondary';
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export const identifyContact = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, phoneNumber } = req.body;

    if (!email && !phoneNumber) {
      res.status(400).json({ error: 'Email or phoneNumber is required' });
      return;
    }

    const searchResult = await query(
      `SELECT * FROM "Contact" 
       WHERE (email = $1 AND email IS NOT NULL) 
          OR ("phoneNumber" = $2 AND "phoneNumber" IS NOT NULL)`,
      [email || null, phoneNumber || null]
    );

    const matchedContacts: Contact[] = searchResult.rows;

    if (matchedContacts.length === 0) {
      const insertResult = await query(
        `INSERT INTO "Contact" (email, "phoneNumber", "linkPrecedence")
         VALUES ($1, $2, 'primary')
         RETURNING *`,
        [email || null, phoneNumber || null]
      );

      const newContact: Contact = insertResult.rows[0];

      res.status(200).json({
        contact: {
          primaryContactId: newContact.id,
          emails: newContact.email ? [newContact.email] : [],
          phoneNumbers: newContact.phoneNumber ? [newContact.phoneNumber] : [],
          secondaryContactIds: []
        }
      });
      return;
    }

  } catch (error) {
    console.error('Error in identity reconciliation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};