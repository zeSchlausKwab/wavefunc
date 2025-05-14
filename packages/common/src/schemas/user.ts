import { z } from 'zod'

export const PublicKeySchema = z
    .string()
    .length(64)
    .regex(/^[0-9a-f]+$/)

export const UserProfileSchema = z.object({
    pubkey: PublicKeySchema,
    name: z.string().min(1).max(50).optional(),
    about: z.string().max(500).optional(),
    picture: z.string().url().optional(),
    nip05: z.string().optional(),
})

export const UserContactsSchema = z.object({
    pubkey: PublicKeySchema,
    contacts: z.array(PublicKeySchema),
    createdAt: z.number(),
})

export type UserProfile = z.infer<typeof UserProfileSchema>
export type UserContacts = z.infer<typeof UserContactsSchema>
