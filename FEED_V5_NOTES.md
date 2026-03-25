Feed / post modal / repost modal refinements:
- removed stories wrapper by flattening stories rail render
- fixed repost modal layering above post modal via higher shared modal z-index
- rebuilt repost modal flow: no post preview, centered footer actions, recipients first for direct mode
- direct repost recipients now come only from mutual follow connections; recipients with allowMessagesFrom=none are shown but disabled
- added post likes modal and clickable likes count in feed + post modal
- changed repost action icon to forward arrow
- added original-post navigation for reposted posts
- improved repost-of-repost rendering via recursive repost includes on backend and recursive quote rendering on frontend
- normalized post modal right pane background and comment composer alignment; composer remains visible with empty comments
