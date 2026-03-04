import { type Request, type Response } from 'express';
import { IdentityService } from '../services/identityService.js';
import { ContactRepository } from '../repositories/contactRepository.js';

const contactRepository = new ContactRepository();
const identityService = new IdentityService(contactRepository);

export const identifyContact = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, phoneNumber } = req.body;

    const contact = await identityService.reconcile(email, phoneNumber);

    res.status(200).json({ contact });
  } catch (error) {
    console.error('Error in identity reconciliation:', error);

    if (error instanceof Error && error.message === 'Email or phoneNumber is required') {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }
};