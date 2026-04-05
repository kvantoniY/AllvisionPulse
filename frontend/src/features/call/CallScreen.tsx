'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import styles from './callUi.module.css';
import type { Chat } from '@/shared/types/chat';
import {
  WebRTCRoom,
  type CallConnectionPhase,
  type DeviceInventory,
  type DeviceProblem,
  type PeerInfo,
  type PeerStatus,
} from './webrtcRoom';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { CallChatPanel } from './CallChatPanel';
import type { GameViewState } from '@/features/games/lib/useGameFullscreen';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';

const LazyGameSessionPanel = dynamic(
  () => import('@/features/games').then((mod) => mod.GameSessionPanel),
  {
    ssr: false,
    loading: () => <div style={{ padding: 16, color: 'rgba(255,255,255,0.72)' }}>Загрузка игр...</div>,
  },
);

type Props = {
  open: boolean;
  stage: 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'in_call' | 'reconnecting' | 'ending' | 'ended' | 'failed';
  chat?: Chat;
  callId: string;
  initiator: boolean;
  onConnected: () => void;
  onConnectionPhase?: (phase: CallConnectionPhase) => void;
  onHangup: (reason?: string) => void;
  onClose: () => void;
};

type TileItem = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  stream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  status: PeerStatus;
  speaking: boolean;
  screenOn: boolean;
  isSelf: boolean;
};

type MainTile = {
  title: string;
  stream: MediaStream | null;
  avatarUrl?: string | null;
  name: string;
  isScreen: boolean;
  micOn: boolean;
  camOn: boolean;
  muted: boolean;
  isSelf: boolean;
  status: PeerStatus;
};

type Banner = {
  text: string;
  tone: 'info' | 'warning' | 'error';
};


type RequestedMedia = {
  audio?: boolean | MediaTrackConstraints;
  video?: boolean | MediaTrackConstraints;
};

async function requestMediaAccess(
  requested: RequestedMedia,
  options?: { stopTracks?: boolean },
): Promise<MediaStream> {
  const wantsAudio = Boolean(requested.audio);
  const wantsVideo = Boolean(requested.video);
  const label = wantsAudio && wantsVideo ? 'камере и микрофону' : wantsVideo ? 'камере' : 'микрофону';

  if (typeof window === 'undefined') {
    throw new Error(`Доступ к ${label} доступен только в браузере.`);
  }

  if (!window.isSecureContext) {
    throw new Error(`Браузер блокирует доступ к ${label} на небезопасном соединении. Открой сайт по HTTPS или на localhost.`);
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(`Браузер не поддерживает доступ к ${label}.`);
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: requested.audio ?? false,
      video: requested.video ?? false,
    });

    if (options?.stopTracks) {
      stream.getTracks().forEach((track) => track.stop());
    }

    return stream;
  } catch (error) {
    const name = typeof error === 'object' && error && 'name' in error ? String((error as { name?: unknown }).name ?? '') : '';

    if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
      throw new Error(`Нет доступа к ${label}. Разреши его в браузере и попробуй ещё раз.`);
    }

    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
      throw new Error(wantsVideo ? 'Камера или микрофон не найдены на устройстве.' : 'Микрофон не найден на устройстве.');
    }

    if (name === 'NotReadableError' || name === 'TrackStartError') {
      throw new Error(wantsVideo ? 'Камера или микрофон уже заняты другим приложением.' : 'Микрофон уже занят другим приложением.');
    }

    throw new Error(`Не удалось получить доступ к ${label}. Попробуй ещё раз.`);
  }
}

function fmtDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getChatTitle(chat?: Chat, meId?: string) {
  if (!chat) return 'Звонок';
  if (chat.type === 'GROUP') return chat.title ?? 'Групповой звонок';
  const other = chat.members.find((member) => member.userId !== meId) ?? chat.members[0];
  return other?.user.username ?? 'Звонок';
}

function getMember(chat: Chat | undefined, userId: string | undefined) {
  if (!chat || !userId) return null;
  return chat.members.find((member) => member.userId === userId)?.user ?? null;
}

function getStatusClass(status: PeerStatus) {
  if (status === 'connected') return styles.stOnline;
  if (status === 'failed') return styles.stFailed;
  if (status === 'disconnected') return styles.stOffline;
  return styles.stConnecting;
}

function getStatusLabel(status: PeerStatus) {
  if (status === 'connected') return 'Подключён';
  if (status === 'failed') return 'Проблема со связью';
  if (status === 'disconnected') return 'Переподключение';
  return 'Подключение';
}

function getBannerClass(tone: Banner['tone']) {
  if (tone === 'error') return styles.bannerError;
  if (tone === 'warning') return styles.bannerWarning;
  return styles.bannerInfo;
}

function iconPath(name: 'mic' | 'micOff' | 'camera' | 'cameraOff' | 'screen' | 'chat' | 'game' | 'phone' | 'shareBack' | 'settings') {
  switch (name) {
    case 'mic':
      return 'M12 4a3 3 0 0 1 3 3v5a3 3 0 1 1-6 0V7a3 3 0 0 1 3-3Zm5 8a1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.07A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 1 0 10 0Z';
    case 'micOff':
      return 'M4.7 3.29a1 1 0 0 0-1.41 1.42l4.14 4.14A2.98 2.98 0 0 0 7 10v2a5 5 0 0 0 8.77 3.29l1.94 1.94A7 7 0 0 1 13 18.93V21h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.07A7 7 0 0 1 5 12a1 1 0 0 1 2 0 5 5 0 0 0 7.29 4.42l-1.56-1.56A3 3 0 0 1 9 12v-.17L4.7 3.3Zm9.84 9.84L11 9.59V7a1 1 0 0 1 2 0v4.13l2 2V12a1 1 0 0 1 2 0c0 .39-.03.77-.1 1.13l3.39 3.39a1 1 0 0 1-1.42 1.41L4.7 4.71a1 1 0 0 1 0-1.42Z';
    case 'camera':
      return 'M5 7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v1.2l2.55-1.7A1 1 0 0 1 21 7.34v9.32a1 1 0 0 1-1.45.83L17 15.8V17a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V7Z';
    case 'cameraOff':
      return 'M4.7 3.29a1 1 0 0 0-1.41 1.42l2.27 2.26A2.98 2.98 0 0 0 5 8v8a3 3 0 0 0 3 3h7.17l4 4a1 1 0 1 0 1.41-1.41L4.7 3.29ZM17 10.8V8.87l2.55-1.7A1 1 0 0 1 21 8v8a1 1 0 0 1-1.45.83L17 15.13V17a3 3 0 0 1-.5 1.67L12.83 15H8a1 1 0 0 1-1-1V9.17l-2-2V17a3 3 0 0 0 3 3h6.17l2.68 2.68A1 1 0 0 0 18.56 21L4.7 7.12V4.7Z';
    case 'screen':
      return 'M4 5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-3l1 2h2a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2h2l1-2H7a3 3 0 0 1-3-3V5Zm3-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7Z';
    case 'chat':
      return 'M5 4a3 3 0 0 0-3 3v12.2a.8.8 0 0 0 1.26.65L7.4 17H19a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H5Zm2 6a1 1 0 1 1 0-2h10a1 1 0 1 1 0 2H7Zm0 4a1 1 0 1 1 0-2h7a1 1 0 1 1 0 2H7Z';
    case 'game':
      return 'M7 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4Zm10 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM5 10h14a3 3 0 0 1 3 3v2a5 5 0 0 1-5 5h-1v-2h1a3 3 0 0 0 3-3v-2a1 1 0 0 0-1-1h-2v2a2 2 0 1 1-4 0v-2h-2v2a2 2 0 1 1-4 0v-2H5a1 1 0 0 0-1 1v2a3 3 0 0 0 3 3h1v2H7a5 5 0 0 1-5-5v-2a3 3 0 0 1 3-3Z';
    case 'phone':
      return 'M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.3 2.3.46 3.57.46a1 1 0 0 1 1 1V20a2 2 0 0 1-2 2C9.4 22 2 14.6 2 5a2 2 0 0 1 2-2h3.6a1 1 0 0 1 1 1c0 1.27.16 2.45.46 3.57a1 1 0 0 1-.24 1.02l-2.2 2.2Z';
    case 'shareBack':
      return 'M11 5a1 1 0 0 1 1 1v2h4a4 4 0 1 1 0 8h-1a1 1 0 1 1 0-2h1a2 2 0 1 0 0-4h-4v2a1 1 0 0 1-1.7.71l-4-4a1 1 0 0 1 0-1.42l4-4A1 1 0 0 1 11 5Z';
    case 'settings':
      return 'M19.14 12.94a7.48 7.48 0 0 0 .05-.94 7.48 7.48 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.18 7.18 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.48 7.48 0 0 0-.05.94c0 .32.02.63.05.94L2.82 14.16a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.8a.5.5 0 0 0 .49-.42l.36-2.54c.58-.22 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z';
  }
}

function ControlIcon({ name, className }: { name: Parameters<typeof iconPath>[0]; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? styles.ctrlSvg} aria-hidden="true">
      <path d={iconPath(name)} fill="currentColor" />
    </svg>
  );
}

function StreamRenderer({
  stream,
  className,
  showVideo = true,
  muted = false,
  sinkId,
}: {
  stream: MediaStream;
  className: string;
  showVideo?: boolean;
  muted?: boolean;
  sinkId?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const attachStream = (element: HTMLMediaElement | null) => {
      if (!element) return;
      if ((element as HTMLMediaElement & { srcObject?: MediaStream }).srcObject !== stream) {
        (element as HTMLMediaElement & { srcObject?: MediaStream }).srcObject = stream;
      }
      const tryPlay = () => {
        const playPromise = element.play();
        if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(() => null);
      };
      if (element.readyState >= 1) {
        tryPlay();
        return;
      }
      const handleLoadedMetadata = () => {
        element.removeEventListener('loadedmetadata', handleLoadedMetadata);
        tryPlay();
      };
      element.addEventListener('loadedmetadata', handleLoadedMetadata);
    };

    if (showVideo && videoRef.current) attachStream(videoRef.current);
    if (!muted && audioRef.current) attachStream(audioRef.current);
  }, [stream, muted, showVideo]);

  useEffect(() => {
    const applySink = async (element: HTMLMediaElement | null) => {
      if (!element || !sinkId || !('setSinkId' in element)) return;
      try {
        await (element as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(sinkId);
      } catch {
        // ignore
      }
    };

    void applySink(videoRef.current);
    void applySink(audioRef.current);
  }, [sinkId]);

  return (
    <>
      {showVideo ? <video ref={videoRef} className={className} autoPlay playsInline muted /> : null}
      {!muted ? <audio ref={audioRef} autoPlay className={styles.hiddenAudio} /> : null}
    </>
  );
}

function MediaTile({
  tile,
  active,
  compact,
  onClick,
  audioOutputId,
}: {
  tile: TileItem;
  active?: boolean;
  compact?: boolean;
  onClick: () => void;
  audioOutputId?: string;
}) {
  const showVideo = Boolean(tile.stream && tile.camOn);

  return (
    <button
      type="button"
      className={[
        styles.tile,
        compact ? styles.tileCompact : '',
        active ? styles.tileActive : '',
        tile.speaking ? styles.tileSpeaking : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
    >
      {tile.stream ? (
        <StreamRenderer
          stream={tile.stream}
          className={styles.tileVideo}
          muted={tile.isSelf}
          showVideo={showVideo}
          sinkId={tile.isSelf ? undefined : audioOutputId}
        />
      ) : null}

      {!showVideo ? (
        <div className={styles.tilePlaceholder}>
          <Avatar url={tile.avatarUrl ?? undefined} name={tile.name} size={compact ? 36 : 48} />
          <div className={styles.tileName}>{tile.name}</div>
        </div>
      ) : null}

      <div className={styles.tileFooter}>
        <span className={[styles.stDot, getStatusClass(tile.status)].join(' ')} />
        <span className={styles.tileFooterText}>{tile.name}</span>
        {!tile.isSelf && tile.status === 'connected' && !tile.micOn ? (
          <span className={styles.tileIconBadge} title="Микрофон выключен" aria-label="Микрофон выключен">
            <ControlIcon name="micOff" className={styles.statusIcon} />
          </span>
        ) : null}
        {!tile.isSelf && tile.status === 'connected' && !tile.camOn ? (
          <span className={styles.tileIconBadge} title="Камера выключена" aria-label="Камера выключена">
            <ControlIcon name="cameraOff" className={styles.statusIcon} />
          </span>
        ) : null}
        {tile.screenOn ? <span className={styles.tileBadgePrimary}>Экран</span> : null}
      </div>
    </button>
  );
}

const EMPTY_DEVICES: DeviceInventory = {
  audioInputs: [],
  videoInputs: [],
  audioOutputs: [],
  selectedAudioInputId: '',
  selectedVideoInputId: '',
  canSelectAudioOutput: false,
};

export function CallScreen({ open, stage, chat, callId, initiator, onConnected, onConnectionPhase, onHangup }: Props) {
  const { data: meRes } = useGetMeQuery();
  const me = meRes?.user;
  const meId = me?.id ?? '';
  const isGroup = chat?.type === 'GROUP';

  const [room, setRoom] = useState<WebRTCRoom | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Record<string, PeerInfo>>({});
  const [pinnedId, setPinnedId] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [gameViewState, setGameViewState] = useState<GameViewState>({
    mode: 'call',
    fullscreenScope: 'none',
    source: 'call',
  });
  const [toast, setToast] = useState('');
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [dockPosition, setDockPosition] = useState({ x: 16, y: 88 });
  const [banner, setBanner] = useState<Banner | null>(null);
  const [deviceProblem, setDeviceProblem] = useState<DeviceProblem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [devices, setDevices] = useState<DeviceInventory>(EMPTY_DEVICES);
  const [audioOutputId, setAudioOutputId] = useState('');

  const startedAtRef = useRef<number | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);
  const chatRef = useRef(chat);
  const meRef = useRef(me);
  const onConnectedRef = useRef(onConnected);
  const [, tick] = useState(0);
  const toastTimerRef = useRef<number | null>(null);
  const bannerTimerRef = useRef<number | null>(null);

  const title = useMemo(() => getChatTitle(chat, meId), [chat, meId]);

  const pushToast = (text: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast(text);
    toastTimerRef.current = window.setTimeout(() => {
      setToast('');
      toastTimerRef.current = null;
    }, 2600);
  };

  const pushBanner = useCallback((text: string, tone: Banner['tone'] = 'info', durationMs?: number) => {
    if (bannerTimerRef.current) {
      window.clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
    if (!text) {
      setBanner(null);
      return;
    }
    setBanner({ text, tone });
    const shouldAutoHide = durationMs !== 0 && tone !== 'error';
    if (shouldAutoHide) {
      bannerTimerRef.current = window.setTimeout(() => {
        setBanner((current) => (current?.text === text ? null : current));
        bannerTimerRef.current = null;
      }, durationMs ?? (tone === 'warning' ? 3200 : 2200));
    }
  }, []);

  useEffect(() => {
    chatRef.current = chat;
    meRef.current = me;
    onConnectedRef.current = onConnected;
  }, [chat, me, onConnected]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (gameOpen) return;
    setGameViewState({
      mode: 'call',
      fullscreenScope: 'none',
      source: 'call',
    });
  }, [gameOpen]);

  useEffect(() => {
    if (!open || !callId || !meId) return;

    const notify = pushToast;

    const participantName = (userId: string) => {
      if (userId === meId) return meRef.current?.username ?? 'You';
      return getMember(chatRef.current, userId)?.username ?? 'Participant';
    };

    const nextRoom = new WebRTCRoom(callId, meId, {
      onPeerUpdate: (peer) => setPeers((prev) => ({ ...prev, [peer.userId]: peer })),
      onPeerRemove: (userId) =>
        setPeers((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        }),
      onPeerJoined: (userId) => notify(`${participantName(userId)} присоединился(ась)`),
      onPeerLeft: (userId, reason) =>
        notify(
          reason === 'leave' || reason === 'peer_left'
            ? `${participantName(userId)} вышел(а) из звонка`
            : `${participantName(userId)} временно потерял(а) соединение`,
        ),
      onToast: notify,
      onConnected: () => {
        if (!startedAtRef.current) startedAtRef.current = Date.now();
        onConnectedRef.current();
      },
      onConnectionPhase: (phase) => {
        onConnectionPhase?.(phase);
      },
      onConnectionHint: (text, tone = 'info') => {
        if (!text) {
          pushBanner('', tone, 0);
          return;
        }
        pushBanner(text, tone, tone === 'error' ? 0 : undefined);
      },
      onDeviceProblem: (problem) => {
        setDeviceProblem(problem);
        pushBanner(problem.message, problem.blocking ? 'error' : 'warning', problem.blocking ? 0 : 4200);
      },
      onDevicesChanged: (inventory) => {
        setDevices(inventory);
        if (!audioOutputId && inventory.audioOutputs[0]?.deviceId) {
          setAudioOutputId(inventory.audioOutputs[0].deviceId);
        }
      },
      onLocalMediaChanged: (media) => {
        setMicOn(media.micOn);
        setCamOn(media.camOn);
        setSharing(media.screenOn);
        if (!media.screenOn) setScreenStream(null);
      },
    });

    setRoom(nextRoom);

    (async () => {
      try {
        try {
          await requestMediaAccess({ audio: true }, { stopTracks: true });
        } catch (error) {
          pushBanner(error instanceof Error ? error.message : 'Нет доступа к микрофону.', 'warning', 5200);
        }
        const stream = await nextRoom.initLocal({ micOn: true, camOn: false });
        setLocalStream(stream);
        const media = nextRoom.getMyMedia();
        setMicOn(media.micOn);
        setCamOn(media.camOn);
        setDevices(nextRoom.getDevices());
        await nextRoom.join();
        if (!stream) {
          pushBanner('Подключение прошло без локального микрофона. Устройство можно выбрать в настройках.', 'warning', 4200);
        }
      } catch {
        pushBanner('Звонок ещё подготавливается. Переподключаемся…', 'warning', 4200);
      }
    })();

    return () => {
      nextRoom.destroy();
      setRoom(null);
      setPeers({});
      setLocalStream(null);
      setScreenStream(null);
      setSharing(false);
      setPinnedId('');
      setBanner(null);
      setDeviceProblem(null);
      startedAtRef.current = null;
      dragRef.current = null;
      setSettingsOpen(false);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
      toastTimerRef.current = null;
      bannerTimerRef.current = null;
    };
  }, [open, callId, meId, pushBanner]);

  useEffect(() => {
    if (!open) return;
    setDockPosition({ x: 16, y: 88 });
  }, [open, sharing]);

  const peerList = useMemo(() => Object.values(peers), [peers]);

  useEffect(() => {
    if (!pinnedId) return;
    if (pinnedId === 'local' || pinnedId === '__game__') return;
    if (peers[pinnedId]) return;
    setPinnedId('');
  }, [pinnedId, peers]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      const maxX = Math.max(8, window.innerWidth - 320);
      const maxY = Math.max(72, window.innerHeight - 220);
      setDockPosition({
        x: Math.min(Math.max(8, dragRef.current.x + event.clientX - dragRef.current.startX), maxX),
        y: Math.min(Math.max(72, dragRef.current.y + event.clientY - dragRef.current.startY), maxY),
      });
    };

    const onPointerUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const tiles = useMemo<TileItem[]>(() => {
    const selfTile: TileItem = {
      id: 'local',
      name: me?.username ?? 'You',
      avatarUrl: me?.avatarUrl ?? null,
      stream: localStream,
      micOn,
      camOn,
      status: 'connected',
      speaking: false,
      screenOn: sharing,
      isSelf: true,
    };

    const remoteTiles = peerList.map<TileItem>((peer) => {
      const member = getMember(chat, peer.userId);
      return {
        id: peer.userId,
        name: member?.username ?? 'Participant',
        avatarUrl: member?.avatarUrl ?? null,
        stream: peer.stream,
        micOn: peer.media.micOn,
        camOn: peer.media.camOn,
        status: peer.status,
        speaking: peer.speaking,
        screenOn: peer.media.screenOn,
        isSelf: false,
      };
    });

    return isGroup ? [selfTile, ...remoteTiles] : remoteTiles;
  }, [camOn, chat, isGroup, localStream, me?.avatarUrl, me?.username, micOn, peerList, sharing]);

  const screenOwnerId = useMemo(() => {
    if (sharing && screenStream) return 'local';
    return tiles.find((tile) => !tile.isSelf && tile.screenOn)?.id ?? '';
  }, [sharing, screenStream, tiles]);

  const directRemoteTile = tiles[0] ?? null;
  const pinnedTile = pinnedId ? tiles.find((tile) => tile.id === pinnedId) ?? null : null;
  const showGameMain = gameOpen && pinnedId === '__game__';
  const isGameFullscreen = showGameMain && gameViewState.fullscreenScope !== 'none';
  const shouldShowGrid = isGroup && !screenOwnerId && !pinnedTile && !showGameMain;

  const mainTile = useMemo<MainTile | null>(() => {
    if (screenOwnerId && !pinnedTile) {
      if (screenOwnerId === 'local' && screenStream) {
        return {
          title: 'Your screen',
          stream: screenStream,
          avatarUrl: me?.avatarUrl ?? null,
          name: me?.username ?? 'You',
          isScreen: true,
          micOn,
          camOn: true,
          muted: true,
          isSelf: true,
          status: 'connected',
        };
      }
      const sharedTile = tiles.find((tile) => tile.id === screenOwnerId);
      if (sharedTile) {
        return {
          title: `${sharedTile.name}'s screen`,
          stream: sharedTile.stream,
          avatarUrl: sharedTile.avatarUrl ?? null,
          name: sharedTile.name,
          isScreen: true,
          micOn: sharedTile.micOn,
          camOn: true,
          muted: false,
          isSelf: false,
          status: sharedTile.status,
        };
      }
    }

    if (pinnedTile) {
      return {
        title: pinnedTile.name,
        stream: pinnedTile.stream,
        avatarUrl: pinnedTile.avatarUrl ?? null,
        name: pinnedTile.name,
        isScreen: false,
        micOn: pinnedTile.micOn,
        camOn: pinnedTile.camOn,
        muted: pinnedTile.isSelf,
        isSelf: pinnedTile.isSelf,
        status: pinnedTile.status,
      };
    }

    if (!isGroup && directRemoteTile) {
      return {
        title: directRemoteTile.name,
        stream: directRemoteTile.stream,
        avatarUrl: directRemoteTile.avatarUrl ?? null,
        name: directRemoteTile.name,
        isScreen: false,
        micOn: directRemoteTile.micOn,
        camOn: directRemoteTile.camOn,
        muted: directRemoteTile.isSelf,
        isSelf: directRemoteTile.isSelf,
        status: directRemoteTile.status,
      };
    }

    return null;
  }, [screenOwnerId, pinnedTile, isGroup, directRemoteTile, screenStream, me?.avatarUrl, me?.username, micOn, tiles]);

  const railTiles = useMemo(() => {
    if ((!mainTile && !showGameMain) || (!screenOwnerId && !pinnedTile && !showGameMain)) return [];
    const hiddenId = pinnedId || screenOwnerId;
    return tiles.filter((tile) => tile.id !== hiddenId);
  }, [mainTile, pinnedId, pinnedTile, screenOwnerId, tiles, showGameMain]);

  const duration = startedAtRef.current ? fmtDuration(Date.now() - startedAtRef.current) : '0:00';
  const connectedCount = peerList.filter((peer) => peer.status === 'connected').length + 1;
  const topSub =
    stage === 'outgoing'
      ? 'Calling…'
      : stage === 'connecting'
        ? 'Connecting…'
        : stage === 'reconnecting'
          ? 'Restoring connection…'
          : stage === 'ending'
            ? 'ing call…'
            : stage === 'failed'
              ? 'Connection failed'
              : `${duration} · ${connectedCount} ${connectedCount === 1 ? 'participant' : 'participants'}`;

  const toggleMic = async () => {
    const next = !micOn;
    setMicOn(next);
    try {
      await room?.setMic(next);
      setLocalStream(room?.getLocalStream() ?? null);
      setDeviceProblem(null);
    } catch {
      setMicOn(!next);
      const text = next ? 'Microphone could not be enabled.' : 'Microphone could not be changed.';
      pushBanner(text, 'error', 3800);
    }
  };

  const toggleCam = async () => {
    const next = !camOn;
    setCamOn(next);
    try {
      await room?.setCamera(next);
      setLocalStream(room?.getLocalStream() ?? null);
      setDeviceProblem(null);
    } catch {
      setCamOn(!next);
      const text = next ? 'Не удалось включить камеру.' : 'Не удалось переключить камеру.';
      pushBanner(text, 'error', 3800);
    }
  };

  const toggleShare = async () => {
    if (!room) return;
    if (!sharing) {
      try {
        const stream = await room.startScreenShare();
        if (!stream) {
          pushBanner('Не удалось начать демонстрацию экрана.', 'warning', 3200);
          return;
        }
        setScreenStream(stream);
        setSharing(true);
        setPinnedId('');
        pushToast('Демонстрация экрана включена');
      } catch {
        pushBanner('Демонстрация экрана недоступна в этом браузере или окне.', 'error', 3800);
      }
      return;
    }
    await room.stopScreenShare();
    setScreenStream(null);
    setSharing(false);
    pushToast('Демонстрация экрана остановлена');
  };

  const endCall = () => {
    if (isGroup && initiator) {
      setConfirm(true);
      return;
    }
    onHangup();
  };

  if (!open) return null;

  return (
    <div className={[styles.callWrap, isGameFullscreen ? styles.callGameFullscreen : ''].filter(Boolean).join(' ')} role="dialog" aria-modal="true">
      <div className={[styles.topBar, isGameFullscreen ? styles.callOverlayControls : ''].filter(Boolean).join(' ')}>
        <div className={styles.topMeta}>
          <div className={styles.topTitleRow}>
            <div className={styles.topTitle}>{title}</div>
            <span className={styles.topBadge}>{isGroup ? 'Группа' : 'Личное'}</span>
          </div>
          <div className={styles.topSub}>{topSub}</div>
        </div>

        <div className={styles.topActions}>
          {screenOwnerId && pinnedTile ? (
            <button type="button" className={styles.topGhostBtn} onClick={() => setPinnedId('')} aria-label="Вернуться к демонстрации" title="Вернуться к демонстрации">
              <ControlIcon name="shareBack" />
              
            </button>
          ) : null}
          <button type="button" className={styles.topGhostBtn} onClick={() => setSettingsOpen((value) => !value)} aria-label="Настройки устройств" title="Настройки устройств">
            <ControlIcon name="settings" />
            
          </button>
          <button type="button" className={[styles.ctrlBtn, styles.ctrlHang].join(' ')} onClick={endCall} aria-label="Завершить звонок" title="Завершить звонок">
            <ControlIcon name="phone" />
          </button>
        </div>
      </div>

      {banner ? <div className={[styles.banner, getBannerClass(banner.tone)].join(' ')}>{banner.text}</div> : null}
      {deviceProblem ? <div className={styles.deviceHint}>Состояние устройства: {deviceProblem.message}</div> : null}

      <div className={styles.stage}>
        {settingsOpen ? (
          <div className={styles.settingsPanel}>
            <div className={styles.settingsTitle}>Устройства</div>
            <label className={styles.fieldLabel}>
              <span>Микрофон</span>
              <select
                className={styles.select}
                value={devices.selectedAudioInputId}
                onChange={async (event) => {
                  try {
                    await room?.switchAudioInput(event.target.value);
                    setLocalStream(room?.getLocalStream() ?? null);
                    setDevices(room?.getDevices() ?? EMPTY_DEVICES);
                    pushBanner('Микрофон переключён.', 'info');
                  } catch {
                    pushBanner('Не удалось переключить микрофон.', 'error', 3800);
                  }
                }}
              >
                {devices.audioInputs.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.fieldLabel}>
              <span>Камера</span>
              <select
                className={styles.select}
                value={devices.selectedVideoInputId}
                onChange={async (event) => {
                  try {
                    await room?.switchVideoInput(event.target.value);
                    setLocalStream(room?.getLocalStream() ?? null);
                    setDevices(room?.getDevices() ?? EMPTY_DEVICES);
                    pushBanner('Камера переключена.', 'info');
                  } catch {
                    pushBanner('Не удалось переключить камеру.', 'error', 3800);
                  }
                }}
              >
                {devices.videoInputs.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
            </label>

            {devices.canSelectAudioOutput ? (
              <label className={styles.fieldLabel}>
                <span>Динамики</span>
                <select className={styles.select} value={audioOutputId} onChange={(event) => setAudioOutputId(event.target.value)}>
                  {devices.audioOutputs.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className={styles.deviceHint}>Этот браузер не поддерживает выбор устройства вывода звука.</div>
            )}
          </div>
        ) : null}

        {shouldShowGrid ? (
          <div className={styles.gridStage}>
            <div className={styles.grid}>
              {tiles.map((tile) => (
                <MediaTile key={tile.id} tile={tile} onClick={() => setPinnedId(tile.id)} audioOutputId={audioOutputId} />
              ))}
            </div>
          </div>
        ) : (
          <div className={[styles.mainStage, showGameMain ? styles.mainStageGame : ''].filter(Boolean).join(' ')}>
            <div className={[styles.mainVideo, showGameMain ? styles.mainVideoGame : ''].filter(Boolean).join(' ')}>
              {showGameMain ? (
                <div className={styles.gameStageMain}>
                  <LazyGameSessionPanel chat={chat} meId={meId} mode="call" onViewStateChange={setGameViewState} />
                </div>
              ) : (
                <>
                  {mainTile?.stream ? (
                    <StreamRenderer
                      stream={mainTile.stream}
                      className={styles.mainVideoEl}
                      muted={mainTile.muted}
                      showVideo={mainTile.isScreen || mainTile.camOn}
                      sinkId={mainTile.muted ? undefined : audioOutputId}
                    />
                  ) : null}

                  {!mainTile?.stream || (!mainTile.isScreen && !mainTile.camOn) ? (
                    <div className={styles.mainPlaceholder}>
                      <Avatar url={mainTile?.avatarUrl ?? undefined} name={mainTile?.name ?? title} size={88} />
                      <div className={styles.mainLabel}>{mainTile?.title ?? title}</div>
                      <div className={styles.mainSubLabel}>{mainTile ? getStatusLabel(mainTile.status) : 'Ждём участников…'}</div>
                    </div>
                  ) : null}

                  {mainTile ? (
                    <div className={styles.mainOverlay}>
                      <div className={styles.mainOverlayName}>{mainTile.title}</div>
                      <div className={styles.mainOverlayMeta}>
                        <span className={[styles.stDot, getStatusClass(mainTile.status)].join(' ')} />
                        <span>{getStatusLabel(mainTile.status)}</span>
                        {!mainTile.isSelf && mainTile.status === 'connected' && !mainTile.micOn ? (
                          <span className={styles.mainMediaFlag} title="Микрофон выключен" aria-label="Микрофон выключен">
                            <ControlIcon name="micOff" className={styles.statusIcon} />
                          </span>
                        ) : null}
                        {!mainTile.isSelf && mainTile.status === 'connected' && !mainTile.isScreen && !mainTile.camOn ? (
                          <span className={styles.mainMediaFlag} title="Камера выключена" aria-label="Камера выключена">
                            <ControlIcon name="cameraOff" className={styles.statusIcon} />
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {!isGroup && !screenOwnerId ? (
                    <div className={styles.pip}>
                      {localStream ? (
                        <StreamRenderer stream={localStream} className={styles.pipVideo} muted showVideo={camOn} />
                      ) : null}
                      {!camOn || !localStream ? (
                        <div className={styles.pipPlaceholder}>
                          <Avatar url={me?.avatarUrl ?? undefined} name={me?.username ?? 'Вы'} size={40} />
                          <div className={styles.pipName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{me?.username ?? 'Вы'}<AdminBadge role={me?.role} /></div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            {railTiles.length ? (
              <div
                className={[
                  styles.railDock,
                  showGameMain ? styles.railDockGame : '',
                  isGameFullscreen ? styles.railDockGameFullscreen : '',
                  screenOwnerId ? styles.railDockFloating : '',
                ].filter(Boolean).join(' ')}
                style={screenOwnerId && !showGameMain ? { left: dockPosition.x, top: dockPosition.y } : undefined}
              >
                {screenOwnerId && !showGameMain ? (
                  <button
                    type="button"
                    className={styles.railHandle}
                    onPointerDown={(event) => {
                      dragRef.current = {
                        startX: event.clientX,
                        startY: event.clientY,
                        x: dockPosition.x,
                        y: dockPosition.y,
                      };
                    }}
                  >
                    Переместить
                  </button>
                ) : null}

                <div className={styles.railList}>
                  {railTiles.map((tile) => (
                    <MediaTile
                      key={tile.id}
                      tile={tile}
                      compact
                      active={pinnedId === tile.id}
                      audioOutputId={audioOutputId}
                      onClick={() => setPinnedId((current) => (current === tile.id ? '' : tile.id))}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {chatOpen ? (
          <div className={[styles.sidePanel, isGameFullscreen ? styles.sidePanelHidden : ''].filter(Boolean).join(' ')}>
            <CallChatPanel chatId={chat?.id ?? ''} />
          </div>
        ) : null}
      </div>

      <div className={[styles.bottomBar, isGameFullscreen ? styles.callOverlayControls : ''].filter(Boolean).join(' ')}>
        <button
          type="button"
          className={[styles.ctrlIcon, !micOn ? styles.ctrlDanger : ''].filter(Boolean).join(' ')}
          onClick={() => void toggleMic()}
          aria-label="Переключить микрофон" title={micOn ? 'Выключить микрофон' : 'Включить микрофон'}
        >
          <ControlIcon name={micOn ? 'mic' : 'micOff'} />
          
        </button>

        <button
          type="button"
          className={[styles.ctrlIcon, !camOn ? styles.ctrlDanger : ''].filter(Boolean).join(' ')}
          onClick={() => void toggleCam()}
          aria-label="Переключить камеру" title={camOn ? 'Выключить камеру' : 'Включить камеру'}
        >
          <ControlIcon name={camOn ? 'camera' : 'cameraOff'} />
          
        </button>

        <button
          type="button"
          className={[styles.ctrlIcon, sharing ? styles.ctrlPrimary : ''].filter(Boolean).join(' ')}
          onClick={() => void toggleShare()}
          aria-label="Переключить демонстрацию экрана" title={sharing ? 'Остановить демонстрацию' : 'Начать демонстрацию'}
        >
          <ControlIcon name="screen" />
          
        </button>

        <button
          type="button"
          className={[styles.ctrlIcon, chatOpen ? styles.ctrlPrimary : ''].filter(Boolean).join(' ')}
          onClick={() => setChatOpen((value) => !value)}
          aria-label="Открыть чат звонка" title={chatOpen ? 'Скрыть чат звонка' : 'Открыть чат звонка'}
        >
          <ControlIcon name="chat" />
          
        </button>

        <button
          type="button"
          className={[styles.ctrlIcon, gameOpen ? styles.ctrlPrimary : ''].filter(Boolean).join(' ')}
          onClick={() => { setGameOpen((value) => { const next = !value; setPinnedId(next ? '__game__' : ''); return next; }); }}
          aria-label="Открыть игры" title={gameOpen ? 'Скрыть игры' : 'Открыть игры'}
        >
          <ControlIcon name="game" />
          
        </button>

        <button type="button" className={[styles.ctrlIcon, styles.ctrlHang].join(' ')} onClick={endCall} aria-label="Завершить звонок" title="Завершить звонок">
          <ControlIcon name="phone" />
          
        </button>
      </div>

      {toast ? <div className={styles.toast}>{toast}</div> : null}

      {confirm ? (
        <div className={styles.confirmWrap} role="dialog" aria-modal="true">
          <div className={styles.confirmCard}>
            <div className={styles.confirmTitle}>Завершить звонок для всех?</div>
            <div className={styles.confirmText}>Как владелец звонка, вы отключите всех текущих участников.</div>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.ctrlBtn} onClick={() => setConfirm(false)}>
                Отмена
              </button>
              <button
                type="button"
                className={[styles.ctrlBtn, styles.ctrlHang].join(' ')}
                onClick={() => {
                  setConfirm(false);
                  onHangup();
                }}
              >
                Завершить для всех
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
