Feed / post modal refinement v4

Changes in this iteration:
- removed remaining visual background from stories rail and tightened add-badge placement
- added confirmation dialogs for deleting posts and comments
- rebuilt post modal side pane to use a single unified background and bottom-anchored comment composer
- aligned comment composer avatar / input / send button
- added working repost flow:
  - repost to own wall with optional note
  - repost to direct messages with optional note and recipient picker
- added repost rendering support for posts that reference another post
- updated backend post create/get responses to include repostOf payload so reposts render immediately
