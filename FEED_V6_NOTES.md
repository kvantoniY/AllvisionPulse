Feed / Post modal iteration v6

Updated areas:
- flat repost behavior (always repost original post, no deep nesting)
- repost modal simplified to destination-only flow
- post modal compact mode for text-only posts
- comments: image attachments, one-level replies, reply target chip, inline replies, load more buttons
- comments empty state kept with composer visible
- stories rail background fully flattened

Main files changed:
- frontend/src/features/postModal/ui/PostModal.tsx
- frontend/src/features/postModal/ui/PostModal.module.css
- frontend/src/features/postRepost/ui/RepostModal.tsx
- frontend/src/features/postRepost/ui/RepostModal.module.css
- frontend/src/entities/post/ui/PostCard.tsx
- frontend/src/entities/post/ui/PostCard.module.css
- frontend/src/shared/api/postsApi.ts
- frontend/src/shared/types/social.ts
- frontend/src/features/stories/ui/Stories.module.css
- backend/src/routes/posts.ts
- backend/dist/routes/posts.js
