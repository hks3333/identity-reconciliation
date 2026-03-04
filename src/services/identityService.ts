import { type Contact, ContactRepository } from '../repositories/contactRepository.js';

export interface ConsolidatedContact {
    primaryContactId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
}

export class IdentityService {
    private contactRepository: ContactRepository;

    constructor(contactRepository: ContactRepository) {
        this.contactRepository = contactRepository;
    }

    /**
     * Main method to identify and reconcile contacts
     */
    async reconcile(
        email: string | null,
        phoneNumber: string | null
    ): Promise<ConsolidatedContact> {
        // Validate input
        if (!email && !phoneNumber) {
            throw new Error('Email or phoneNumber is required');
        }

        // Find all contacts matching the email or phone
        const matchedContacts = await this.contactRepository.findByEmailOrPhone(
            email,
            phoneNumber
        );

        // Case 1: No existing contacts - create new primary
        if (matchedContacts.length === 0) {
            const newContact = await this.contactRepository.createPrimary(
                email,
                phoneNumber
            );
            return this.buildConsolidatedContact([newContact]);
        }

        // Case 2: Contacts exist - get entire linked chain
        const allLinkedIds = new Set<number>();
        for (const contact of matchedContacts) {
            const chain = await this.contactRepository.getContactChain(contact.id);
            chain.forEach(c => allLinkedIds.add(c.id));
        }

        // Fetch all contacts in the merged group
        let allContacts = await this.contactRepository.getContactsByIds(
            Array.from(allLinkedIds)
        );

        // Merge separate primaries if the request bridges two groups
        allContacts = await this.mergePrimaries(allContacts);

        // Find the single true primary (oldest contact)
        const primaryContact = this.findPrimaryContact(allContacts);

        // Check if this is a new contact (not already in our group)
        const isNewContact = !this.contactExists(allContacts, email, phoneNumber);

        if (isNewContact) {
            // Create secondary contact linked to primary
            const newContact = await this.contactRepository.createSecondary(
                email,
                phoneNumber,
                primaryContact.id
            );

            // Add the newly created contact to our list
            allContacts.push(newContact);
        }

        return this.buildConsolidatedContact(allContacts, primaryContact.id);
    }

    /**
     * Find the primary contact (oldest by createdAt)
     */
    private findPrimaryContact(contacts: Contact[]): Contact {
        return contacts.reduce((oldest, current) =>
            new Date(oldest.createdAt) < new Date(current.createdAt)
                ? oldest
                : current
        );
    }

    /**
     * If the contact group contains multiple primaries, demote all but the oldest.
     * Re-links their secondaries to the true primary.
     */
    private async mergePrimaries(contacts: Contact[]): Promise<Contact[]> {
        const primaries = contacts
            .filter(c => c.linkPrecedence === 'primary')
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (primaries.length <= 1) return contacts;

        const truePrimary = primaries[0]!;
        const demotedPrimaries = primaries.slice(1);

        for (const demoted of demotedPrimaries) {
            // Re-link all secondaries that pointed to the demoted primary
            await this.contactRepository.reassignSecondaries(demoted.id, truePrimary.id);
            // Demote the primary itself
            await this.contactRepository.convertToSecondary(demoted.id, truePrimary.id);
        }

        // Re-fetch to get the updated state
        const allIds = contacts.map(c => c.id);
        return this.contactRepository.getContactsByIds(allIds);
    }

    /**
     * Check if a contact with given email or phone already exists
     */
    private contactExists(
        contacts: Contact[],
        email: string | null,
        phoneNumber: string | null
    ): boolean {
        return contacts.some(c =>
            (email && c.email === email) || (phoneNumber && c.phoneNumber === phoneNumber)
        );
    }

    /**
     * Build consolidated contact response from all linked contacts
     */
    private buildConsolidatedContact(
        contacts: Contact[],
        primaryId?: number
    ): ConsolidatedContact {
        const emailSet = new Set<string>();
        const phoneSet = new Set<string>();
        const secondaryIds: number[] = [];

        // Determine primary if not provided
        let primary = primaryId;
        if (!primary) {
            primary = this.findPrimaryContact(contacts).id;
        }

        // Collect all unique emails and phones
        contacts.forEach(contact => {
            if (contact.email && contact.email.trim()) {
                emailSet.add(contact.email);
            }
            if (contact.phoneNumber && contact.phoneNumber.trim()) {
                phoneSet.add(contact.phoneNumber);
            }
            if (contact.id !== primary) {
                secondaryIds.push(contact.id);
            }
        });

        // Convert to arrays
        const emails = Array.from(emailSet);
        const phoneNumbers = Array.from(phoneSet);

        // Ensure primary contact's info is first
        const primaryContact = contacts.find(c => c.id === primary);
        if (primaryContact?.email && emails.includes(primaryContact.email)) {
            emails.splice(emails.indexOf(primaryContact.email), 1);
            emails.unshift(primaryContact.email);
        }
        if (primaryContact?.phoneNumber && phoneNumbers.includes(primaryContact.phoneNumber)) {
            phoneNumbers.splice(phoneNumbers.indexOf(primaryContact.phoneNumber), 1);
            phoneNumbers.unshift(primaryContact.phoneNumber);
        }

        return {
            primaryContactId: primary,
            emails,
            phoneNumbers,
            secondaryContactIds: secondaryIds.sort((a, b) => a - b)
        };
    }
}