Adaptive v14 fixes

- restored mobile create-post opening via header plus button by mounting PostComposer on mobile again and removing inline feed trigger
- flattened mobile feed background further and removed leftover composer row from the feed stream
- tightened desktop header against the sidebar by removing left inner gutter and making the mobile header fully opaque
- rebuilt desktop post modal into a simpler stacked layout: post meta -> media -> text -> actions -> scrollable comments -> bottom composer
- adjusted desktop modal width and media containment behavior for consistent sizing
- fixed mobile comments composer docking by removing negative margins and making the sticky footer flush to the bottom
- cleaned desktop/mobile edit-post footers so controls align and dock to the modal bottom properly
- updated repost/share icon to a more directional forward arrow
