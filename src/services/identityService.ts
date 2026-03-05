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

        // Resolve to primary IDs (walk up via linkedId)
        const primaryIds = new Set<number>();
        for (const c of matchedContacts) {
            if (c.linkPrecedence === 'primary') {
                primaryIds.add(c.id);
            }
            if (c.linkedId) {
                primaryIds.add(c.linkedId);
            }
        }

        // Fetch the full cluster in one query
        let allContacts = await this.contactRepository.getContactCluster(
            Array.from(primaryIds)
        );

        // Merge separate primaries if the request bridges two groups
        allContacts = await this.mergePrimaries(allContacts);

        // Find the single true primary (oldest contact)
        const primaryContact = this.findPrimaryContact(allContacts);

        // Check if the request brings genuinely new information to the cluster
        const clusterEmails = new Set(allContacts.map(c => c.email).filter(Boolean));
        const clusterPhones = new Set(allContacts.map(c => c.phoneNumber).filter(Boolean));

        const isNewEmail = email && !clusterEmails.has(email);
        const isNewPhone = phoneNumber && !clusterPhones.has(phoneNumber);

        if (isNewEmail || isNewPhone) {
            const newContact = await this.contactRepository.createSecondary(
                email,
                phoneNumber,
                primaryContact.id
            );
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
            await this.contactRepository.reassignSecondaries(demoted.id, truePrimary.id);
            await this.contactRepository.convertToSecondary(demoted.id, truePrimary.id);
        }

        // Re-fetch via cluster to get updated state
        return this.contactRepository.getContactCluster([truePrimary.id]);
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
        const primary = primaryId ?? this.findPrimaryContact(contacts).id;

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