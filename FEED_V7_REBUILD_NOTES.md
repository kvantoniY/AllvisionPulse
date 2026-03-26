Feed v7 rebuild in current session.

Main changes:
- mobile header with title, create-post trigger and notifications
- fixed 4-item bottom navigation with hamburger sheet
- mobile create-post flow via dedicated sheet
- mobile comments and likes open in mobile sheets
- mobile notifications open in mobile sheet
- mobile feed post cards flattened into stream style
- long post text collapses on mobile with "Показать ещё"
- post images open fullscreen on mobile via updated lightbox
- desktop text-only post modal keeps comments/composer visible when text is long
- stories rail adjusted to sit directly in the page flow without card-like container

Key files:
- frontend/src/widgets/header/ui/*
- frontend/src/widgets/bottomNav/ui/*
- frontend/src/features/postComposer/ui/*
- frontend/src/features/postComments/ui/*
- frontend/src/features/postLikes/ui/PostLikesModal.tsx
- frontend/src/entities/post/ui/*
- frontend/src/app/(protected)/feed/*
- frontend/src/shared/ui/MobileSheet/*
- frontend/src/shared/ui/Lightbox/Lightbox.module.css
- frontend/src/features/postModal/ui/PostModal.module.css
