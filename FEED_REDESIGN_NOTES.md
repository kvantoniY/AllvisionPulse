# Feed redesign notes

## Main issues found
- The feed header behaved like a large hero block and wasted vertical space.
- Stories looked oversized relative to their utility and created a wide empty strip when there were few items.
- The post composer was expanded by default, so the main action competed with secondary tools even before the user started writing.
- Post cards were too tall, with weak hierarchy between author meta, content, media, discussion preview, and actions.
- Secondary actions like delete visually competed with the core reading flow.
- The post modal stacked everything vertically, creating long scroll and large empty zones inside the comment composer.
- Desktop and mobile behavior lacked intentional restructuring; components mostly just shrank.

## What was changed
- Rebuilt the feed page header into a compact structured intro with summary chips.
- Reworked stories into a denser horizontal strip with a clear label and smaller avatars.
- Redesigned the post composer into a collapsed-by-default pattern with progressive disclosure.
- Tightened post cards: compact header, quieter destructive action, clamped feed text, cleaner comment preview, lighter footer.
- Rebuilt the post modal into a desktop split layout: post content on the left, discussion on the right.
- Improved mobile stacking for feed intro, composer controls, story rail, post footer, and modal comment flow.

## Main files changed
- frontend/src/app/(protected)/feed/page.tsx
- frontend/src/app/(protected)/feed/Feed.module.css
- frontend/src/features/stories/ui/StoriesRail.tsx
- frontend/src/features/stories/ui/Stories.module.css
- frontend/src/features/postComposer/ui/PostComposer.tsx
- frontend/src/features/postComposer/ui/PostComposer.module.css
- frontend/src/entities/post/ui/PostCard.tsx
- frontend/src/entities/post/ui/PostCard.module.css
- frontend/src/features/postModal/ui/PostModal.tsx
- frontend/src/features/postModal/ui/PostModal.module.css
