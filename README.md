# Identity Reconciliation

**Live Demo:** https://identity-reconciliation-48ej.onrender.com

## API

**POST** `/identify`

```json
{
  "email": "gabbar@india.edu",
  "phoneNumber": "9495949594"
}
```

At least one of `email` or `phoneNumber` must be provided. The response returns a consolidated view of all linked contacts:

```json
{
  "contact": {
    "primaryContactId": 1,
    "emails": ["gabbar@india.edu", "kabbir@srilanka.edu"],
    "phoneNumbers": ["9495949594"],
    "secondaryContactIds": [2]
  }
}
```

## Architecture

The project follows a three-layer architecture: **Controller**, **Service**, and **Repository**. The controller handles HTTP concerns (request parsing, status codes, error responses) and delegates business logic to the service layer. The service contains the core reconciliation algorithm — matching contacts, detecting new information, and merging separate identity groups. The repository layer owns all database access and encapsulates raw SQL, keeping it isolated from business logic.

## SQL Injection Prevention

All database queries use parameterized placeholders (`$1`, `$2`, etc.) via the `pg` library's built-in query parameterization. User-supplied values are never interpolated into query strings. This ensures that even malicious input is treated as data, not executable SQL.

## Contact Chain Resolution

Rather than using a recursive query, the service resolves contact clusters in a flat, single-pass approach. When a request comes in, matching contacts are found by email or phone. From those matches, the service walks up to the primary by reading each contact's `linkedId`. It then fetches the full cluster in one query — all contacts whose `id` or `linkedId` matches any of the resolved primary IDs. This captures the primary, all its secondaries, and handles cross-group merges when a request bridges two previously separate identity groups.

## Project Structure

```
src/
  index.ts                          -- Express server setup, routes
  db.ts                             -- PostgreSQL connection pool
  controllers/
    identityController.ts           -- Request handling, validation, error responses
  services/
    identityService.ts              -- Reconciliation logic, merge, deduplication
  repositories/
    contactRepository.ts            -- SQL queries, data access
```
