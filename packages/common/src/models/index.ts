import { z } from 'zod'

// Define a basic user model
export const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
    pubkey: z.string(),
    createdAt: z.date(),
})

export type User = z.infer<typeof UserSchema>

// Define a basic note/post model
export const PostSchema = z.object({
    id: z.string(),
    content: z.string(),
    authorId: z.string(),
    createdAt: z.date(),
    tags: z.array(z.string()).optional(),
})

export type Post = z.infer<typeof PostSchema>
