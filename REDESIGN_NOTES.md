# Allvision Pulse redesign notes

This update applies a systemic interface redesign focused on:
- denser information layout
- calmer dark premium surfaces
- unified spacing, radii, shadows, and typography
- quieter secondary actions and stronger primary actions
- more compact navigation, forms, cards, and working panels
- consistent container rhythm across main pages
- progressive disclosure through quieter summaries, segmented controls, modals, and reduced visual competition

## Main layers updated

### Foundation
- `frontend/src/app/styles/globals.css`
- new design tokens for spacing, radii, shadows, type scales, container width, shell sizing
- calmer background and panel contrast
- shared page rhythm via `.appPage`

### Shell and navigation
- `widgets/appShell/ui/AppShell.module.css`
- `widgets/header/ui/Header.module.css`
- `widgets/sidebar/ui/Sidebar.module.css`
- `widgets/bottomNav/ui/BottomNav.module.css`
- `widgets/notificationsBell/ui/NotificationsBell.module.css`
- `features/userSearch/ui/UserSearch.module.css`

### Shared UI kit
- `shared/ui/Button/Button.module.css`
- `shared/ui/Card/Card.module.css`
- `shared/ui/Input/Input.module.css`
- `shared/ui/Modal/Modal.module.css`
- `shared/ui/Switch/Switch.module.css`
- `shared/ui/Avatar/Avatar.module.css`

### Core social/content screens
- `entities/post/ui/PostCard.module.css`
- `features/postComposer/ui/PostComposer.module.css`
- `features/messages/ui/ChatSidebar.module.css`
- `app/(protected)/messages/Messages.module.css`
- `app/(protected)/friends/Friends.module.css`
- `app/(protected)/settings/Settings.module.css`
- `app/(protected)/profile/Profile.module.css`
- `app/(public)/auth/Auth.module.css`

### Large application modules normalized with override layer
- `app/(protected)/support/Support.module.css`
- `app/(protected)/admin/Admin.module.css`
- `app/(protected)/health/Health.module.css`
- `app/(protected)/messages/[chatId]/Chat.module.css`
- `features/stories/ui/Stories.module.css`
- `features/call/callUi.module.css`
- `features/games/GameSessionPanel.module.css`
- `shared/ui/AudioRecorder/AudioRecorder.module.css`
- `shared/ui/AudioMessage/AudioMessage.module.css`
- `shared/ui/EmojiPicker/EmojiPicker.module.css`
- `shared/ui/ImageGallery/ImageGallery.module.css`
- `shared/ui/Lightbox/Lightbox.module.css`

## Routing/layout consistency
Main protected pages were updated to use the shared `appPage` rhythm class so spacing is more consistent across the product.
