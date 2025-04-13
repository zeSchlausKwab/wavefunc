import { useEffect, useState } from 'react'
import type { Post } from '../lib/api'
import { api } from '../lib/api'

export default function PostList() {
    const [posts, setPosts] = useState<Post[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchPosts = async () => {
        setLoading(true)
        setError(null)

        try {
            // Type-safe API call using Eden Treaty directly
            const response = await api.api.posts.get()

            if (Array.isArray(response.data)) {
                const posts = response.data.map((post) => ({
                    id: post.id,
                    content: post.content,
                    authorId: post.pubkey,
                    createdAt: new Date(post.created_at),
                    tags: post.tags.map((tag) => tag[1]),
                }))
                setPosts(posts)
            } else {
                console.error('Failed response:', response)
                setError('Failed to fetch posts')
            }
        } catch (err) {
            setError('Error connecting to the server')
            console.error('Fetch error:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchPosts()
    }, [])

    return (
        <div className="posts-container p-4">
            <h2 className="text-xl font-bold mb-4">Posts</h2>

            {error && (
                <div className="error-message bg-red-100 p-3 mb-4 rounded text-red-700">
                    {error}
                    <button onClick={fetchPosts} className="ml-4 px-4 py-2 bg-blue-500 text-white rounded">
                        Retry
                    </button>
                </div>
            )}

            {loading ? (
                <div className="loading">Loading posts...</div>
            ) : (
                <div className="posts-list space-y-4">
                    {posts.length === 0 ? (
                        <div className="no-posts">No posts found</div>
                    ) : (
                        posts.map((post) => (
                            <div key={post.id} className="post border p-4 rounded">
                                <div className="post-content mb-2">{post.content}</div>
                                <div className="post-meta text-sm text-gray-500">
                                    <span>Author: {post.authorId}</span>
                                    <span className="ml-4">
                                        Posted: {new Date(post.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="post-tags mt-2">
                                    {post.tags.map((tag) => (
                                        <span key={tag} className="tag bg-gray-200 px-2 py-1 mr-2 rounded text-xs">
                                            #{tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            <div className="mt-4">
                <button onClick={fetchPosts} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                    Refresh Posts
                </button>
            </div>
        </div>
    )
}
