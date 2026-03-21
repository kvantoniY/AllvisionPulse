# UI Enhancement Guide - Allvision Pulse

## New Components Overview

This guide walks you through the newly added beautiful UI components for the Allvision Pulse chat and video call system.

### 1. VideoRing Component
**Purpose:** Display video with Telegram-style circular progress ring (can be used for video previews or live streaming)

**Location:** `src/shared/ui/VideoRing/`

**Usage:**
```tsx
import { VideoRing } from '@/shared/ui/VideoRing';

<VideoRing
  videoElement={videoRef.current}
  duration={300} // in seconds
  currentTime={45}
  onSeek={(time) => {
    // Handle seek
  }}
  showProgress={true}
  size="medium" // 'small' | 'medium' | 'large'
/>
```

**Features:**
- Beautiful circular video display with gradient ring
- Animated progress ring that responds to video playback
- Click/drag to seek through video
- Time display (current/total)
- Smooth animations and hover effects
- Responsive to different sizes

**Sizes:**
- `small`: 120px × 120px (compact tiles)
- `medium`: 160px × 160px (standard tiles)
- `large`: 220px × 220px (main display)

---

### 2. AudioMessage Component
**Purpose:** Display received audio messages with waveform visualization

**Location:** `src/shared/ui/AudioMessage/`

**Usage:**
```tsx
import { AudioMessage } from '@/shared/ui/AudioMessage';

<AudioMessage 
  url="https://example.com/voice.webm"
  duration={15} // in seconds
  title="Voice message"
/>
```

**Features:**
- Real-time waveform visualization using Web Audio API
- Play/pause controls
- Current time and total duration display
- Beautiful gradient colors (blue to green)
- Glow effect on waveform bars
- Click to seek functionality
- Responsive design

**Browser Support:**
- Chrome/Edge 14+
- Firefox 25+
- Safari 14.1+

---

### 3. AudioRecorder Component
**Purpose:** Record audio messages with real-time waveform and timer

**Location:** `src/shared/ui/AudioRecorder/`

**Usage:**
```tsx
import { AudioRecorder } from '@/shared/ui/AudioRecorder';

<AudioRecorder
  onRecordingComplete={async (blob, duration) => {
    // Upload blob to server
    // blob: Blob object with MIME type 'audio/webm'
    // duration: recording duration in seconds
  }}
  onCancel={() => {
    // Handle cancel
  }}
/>
```

**Features:**
- Auto-initializes on mount (requests microphone permission)
- Live waveform visualization during recording
- Red pulsing recording indicator
- Duration timer in MM:SS format
- Cancel and Send buttons
- Loading state during upload
- Beautiful gradient background (red to yellow)
- Positioned as a floating panel at bottom of screen

**Customization:**
- Modal appears at bottom center of screen
- Auto-positioned above other UI elements
- Smooth slide-up animation
- Mobile-responsive

---

### 4. EmojiPicker Component
**Purpose:** Modern, beautiful emoji picker with search and categories

**Location:** `src/shared/ui/EmojiPicker/`

**Usage:**
```tsx
import { EmojiPicker } from '@/shared/ui/EmojiPicker';

<EmojiPicker
  onSelect={(emoji) => {
    // Handle emoji selection
    setText(prev => prev + emoji);
  }}
  onClose={() => {
    // Close picker
  }}
/>
```

**Features:**
- 6 emoji categories (Smileys, Gestures, Hearts, Food, Nature, Flags)
- Search functionality
- Category tabs for quick navigation
- Keyboard support (Escape to close)
- Click outside to close
- Hover effects with scale animation
- Empty state when no matches found
- 140+ emojis available

**Categories:**
1. Smileys & Emotions (😀)
2. Gestures & Body Parts (👋)
3. Hearts & Love (❤️)
4. Food & Drink (🍕)
5. Nature (🌲)
6. Travel & Places (🚀)

---

### 5. Emoji Input Handler Utility
**Purpose:** Handle emoji input from various sources (device keyboard, clipboard, picker)

**Location:** `src/shared/lib/emojiInputHandler.ts`

**Usage:**
```tsx
import { useEmojiInputHandler } from '@/shared/lib/emojiInputHandler';

const emojiHandler = useEmojiInputHandler(
  (emoji) => {
    // Called when emoji is detected
    setText(prev => prev + emoji);
  }
);

// In event handlers:
const handleInput = (e) => {
  const result = emojiHandler.onTextInput(e.target.value);
  if (result.emoji) {
    // Emoji was detected and processed
  }
};

const handlePaste = (e) => {
  const pastedText = e.clipboardData.getData('text');
  const processed = emojiHandler.onPaste(pastedText);
  // Use processed text
};
```

**Features:**
- Detects emoji from device keyboards (iOS, Android, Windows)
- Rate limiting (prevents emoji spam)
- Handles paste events intelligently
- Normalizes emoji representations across devices
- Helper methods for emoji detection and extraction
- Emoji counting utilities

---

## Integration with CallChatPanel

The `CallChatPanel` component has been updated to include:

1. **Emoji Picker Button** - Opens modern emoji picker
2. **Voice Message Recorder** - Record audio messages with waveform
3. **Audio Message Display** - Shows received audio with playback

**Updated Features:**
```tsx
// New props
- showEmojiPicker: boolean // Toggle emoji picker
- isRecording: boolean // Recording state
- onEmojiSelect: (emoji: string) => void // Emoji selection
- onAudioRecordingComplete: (blob, duration) => Promise<void> // Upload audio

// Keyboard shortcuts
- Enter: Send message
- Shift+Enter: New line
- Escape: Close emoji picker

// Voice recording
- Click 🎤 button to start recording
- Recording panel appears with waveform and timer
- Click ✓ to send or ✕ to cancel
```

**Message Types Supported:**
- `TEXT`: Regular text messages
- `AUDIO`: Voice messages (webm format)
- `IMAGE`: Image attachments
- `VIDEO_NOTE`: Short video messages
- `SYSTEM`: System notifications

---

## Styling & Customization

### Color Scheme
- **Primary Blue:** `#5984FF`
- **Success Green:** `#37D486`
- **Warning Yellow:** `#F1BB43`
- **Danger Red:** `#FF5757`

### Shadows & Effects
- Glow effects on interactive elements
- Backdrop blur (12-20px)
- Smooth transitions (0.2-0.3s)
- Rounded corners (10-20px based on component)

### Responsive Breakpoints
- Mobile: 0-640px
- Tablet: 640px-1024px
- Desktop: 1024px+

---

## Audio Processing

### Supported Formats
- Input: Any format supported by MediaRecorder API
- Output: `audio/webm;codecs=opus` (optimized for web)
- Browser Fallback: Attempts to use best available MIME type

### Web Audio API Features
- FFT Size: 256 (for waveform visualization)
- Sample Rate: Device default (usually 48000 Hz)
- Channels: Mono recording

### Performance Optimization
- Canvas rendering at 2x DPI for high-quality waveforms
- Efficient frequency data extraction
- Garbage collection: Automatic cleanup on component unmount
- Memory: ~1-2MB per recording session

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| AudioRecorder | ✅ 49+ | ✅ 25+ | ✅ 14.1+ | ✅ 15+ |
| Web Audio API | ✅ 14+ | ✅ 25+ | ✅ 14.1+ | ✅ 13+ |
| EmojiPicker | ✅ All | ✅ All | ✅ All | ✅ All |
| VideoRing | ✅ All | ✅ All | ✅ All | ✅ All |

---

## Accessibility

All components follow Web Content Accessibility Guidelines (WCAG) 2.1:

- **Keyboard Navigation:** Tab, Enter, Escape support
- **Screen Readers:** Proper ARIA labels and descriptions
- **Focus Management:** Clear focus indicators
- **Contrast Ratios:** WCAG AA compliant
- **Motion:** Respects `prefers-reduced-motion`

---

## TypeScript Support

All components are fully typed with TypeScript:

```tsx
// Example types
interface VideoRingProps {
  videoElement?: HTMLVideoElement | null;
  duration?: number;
  currentTime?: number;
  onSeek?: (time: number) => void;
  showProgress?: boolean;
  className?: string;
  size?: 'small' | 'medium' | 'large';
}

interface AudioMessageProps {
  url: string;
  duration?: number;
  title?: string;
  className?: string;
}

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => Promise<void>;
  onCancel?: () => void;
  className?: string;
}

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  className?: string;
}
```

---

## Performance Tips

1. **AudioMessage:** Use for max 60 seconds of audio (optimal compression)
2. **VideoRing:** Set size appropriately for device (avoid oversizing)
3. **EmojiPicker:** Search results are cached for faster repeated searches
4. **AudioRecorder:** Compress noise and limit recording to 5 minutes max

---

## Troubleshooting

### Waveform Not Showing
- Check browser supports Web Audio API
- Verify microphone permission is granted
- Ensure audio stream is properly initialized

### Emoji Not Appearing
- Check emoji compatibility with platform
- Verify emoji Unicode support
- Try alternative emoji set

### Video Ring Not Updating
- Ensure video element has `autoPlay` and `playsInline`
- Check video element is properly muted (if self)
- Verify stream is active before mounting component

---

## Future Enhancements

- [ ] Support for animated GIFs in picker
- [ ] Voice-to-text transcription for audio messages
- [ ] Video message recording (separate from screen share)
- [ ] Custom emoji sets and packs
- [ ] Emoji reactions on messages
- [ ] Audio message transcription & translation
- [ ] Real-time noise cancellation for recordings

---

## Contributing

When adding new emoji or features:

1. Update EMOJI_CATEGORIES in EmojiPicker.tsx
2. Add corresponding TypeScript types
3. Update this documentation
4. Test across browsers and devices
5. Ensure accessibility compliance

---

## License

All UI components are part of Allvision Pulse and follow the same license.
