/* eslint-disable no-console */
'use client';

import { getRealtimeSocket } from '@/shared/lib/realtimeSocket';
import { subscribeRealtimeSocket } from '@/shared/lib/realtimeSocket';
import { PUBLIC_TURN_PASSWORD, PUBLIC_TURN_URLS, PUBLIC_TURN_USERNAME } from '@/shared/config/env';
import { bindAudioUnlock, canPlayUiSounds } from '@/shared/lib/audio';
import type { Socket } from 'socket.io-client';

export type PeerStatus = 'connected' | 'connecting' | 'disconnected' | 'failed';
export type CallConnectionPhase = 'stable' | 'signaling_reconnecting' | 'media_reconnecting';

export type PeerMediaState = {
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
};

export type PeerInfo = {
  userId: string;
  stream: MediaStream | null;
  status: PeerStatus;
  media: PeerMediaState;
  speaking: boolean;
};

export type DeviceOption = {
  deviceId: string;
  label: string;
};

export type DeviceInventory = {
  audioInputs: DeviceOption[];
  videoInputs: DeviceOption[];
  audioOutputs: DeviceOption[];
  selectedAudioInputId: string;
  selectedVideoInputId: string;
  canSelectAudioOutput: boolean;
};

export type DeviceProblem = {
  kind: 'audio' | 'video' | 'system';
  code: 'permission-denied' | 'device-not-found' | 'device-in-use' | 'not-supported' | 'unknown';
  message: string;
  blocking?: boolean;
};

type RuntimeParticipantState = 'joined' | 'reconnecting';

type CallStateParticipantSnapshot = {
  userId: string;
  state: RuntimeParticipantState;
  media: PeerMediaState;
};

type PeerPatch = Omit<Partial<PeerInfo>, 'media'> & {
  media?: Partial<PeerMediaState>;
};

export type RoomCallbacks = {
  onPeerUpdate: (peer: PeerInfo) => void;
  onPeerRemove: (userId: string) => void;
  onPeerJoined?: (userId: string) => void;
  onPeerLeft?: (userId: string, reason?: string) => void;
  onToast: (text: string) => void;
  onConnected: () => void;
  onConnectionHint?: (text: string, tone?: 'info' | 'warning' | 'error') => void;
  onConnectionPhase?: (phase: CallConnectionPhase) => void;
  onDeviceProblem?: (problem: DeviceProblem) => void;
  onDevicesChanged?: (inventory: DeviceInventory) => void;
  onLocalMediaChanged?: (media: PeerMediaState) => void;
  onTakenOver?: () => void;
  onFatalError?: (code: string, message: string) => void;
};

type TurnCredentialsResponse = {
  enabled?: boolean;
  urls?: string[];
  username?: string;
  credential?: string;
  expiresAt?: string;
};

const STUN_ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

function buildFallbackIceServers(): RTCIceServer[] {
  const iceServers: RTCIceServer[] = [...STUN_ICE_SERVERS];
  if (PUBLIC_TURN_URLS.length) {
    iceServers.push({
      urls: PUBLIC_TURN_URLS,
      ...(PUBLIC_TURN_USERNAME ? { username: PUBLIC_TURN_USERNAME } : {}),
      ...(PUBLIC_TURN_PASSWORD ? { credential: PUBLIC_TURN_PASSWORD } : {}),
    });
  }
  return iceServers;
}

function buildRtcConfig(iceServers: RTCIceServer[]): RTCConfiguration {
  return { iceServers, iceCandidatePoolSize: 4 };
}

const FALLBACK_RTC_CONFIG: RTCConfiguration = buildRtcConfig(buildFallbackIceServers());

async function fetchTurnIceServer(): Promise<RTCIceServer | null> {
  try {
    const response = await fetch('/api/backend/calls/turn-credentials', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as TurnCredentialsResponse;
    if (!payload?.enabled) return null;
    if (!Array.isArray(payload.urls) || !payload.urls.length) return null;
    if (typeof payload.username !== 'string' || typeof payload.credential !== 'string') return null;
    return {
      urls: payload.urls,
      username: payload.username,
      credential: payload.credential,
    };
  } catch {
    return null;
  }
}

function logRtc(scope: string, payload: Record<string, unknown>) {
  try {
    console.info(`[rtc:${scope}]`, JSON.stringify(payload));
  } catch {
    console.info(`[rtc:${scope}]`, payload);
  }
}

const DEFAULT_INVENTORY: DeviceInventory = {
  audioInputs: [],
  videoInputs: [],
  audioOutputs: [],
  selectedAudioInputId: '',
  selectedVideoInputId: '',
  canSelectAudioOutput: false,
};

type Signal =
  | { t: 'offer'; sdp: RTCSessionDescriptionInit }
  | { t: 'answer'; sdp: RTCSessionDescriptionInit }
  | { t: 'ice'; c: RTCIceCandidateInit }
  | { t: 'meta'; micOn?: boolean; camOn?: boolean; screenOn?: boolean };

function isSignal(value: unknown): value is Signal {
  return Boolean(value) && typeof value === 'object' && 't' in (value as Signal);
}

function statusFrom(pc: RTCPeerConnection): PeerStatus {
  const state = pc.connectionState;
  if (state === 'connected') return 'connected';
  if (state === 'failed') return 'failed';
  if (state === 'disconnected' || state === 'closed') return 'disconnected';
  return 'connecting';
}

function supportsAudioOutputSelection() {
  return typeof window !== 'undefined' && typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

function describeMediaError(error: unknown, kind: 'audio' | 'video'): DeviceProblem {
  const name = typeof error === 'object' && error && 'name' in error ? String((error as any).name) : 'UnknownError';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return {
      kind,
      code: 'permission-denied',
      message: kind === 'audio' ? 'Microphone access was denied.' : 'Camera access was denied.',
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return {
      kind,
      code: 'device-not-found',
      message: kind === 'audio' ? 'No microphone was found for this call.' : 'No camera was found for this call.',
    };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      kind,
      code: 'device-in-use',
      message: kind === 'audio' ? 'Microphone is busy or unavailable right now.' : 'Camera is busy or unavailable right now.',
    };
  }
  if (name === 'TypeError' || name === 'AbortError') {
    return {
      kind,
      code: 'not-supported',
      message: kind === 'audio' ? 'Microphone access is not supported in this browser.' : 'Camera access is not supported in this browser.',
    };
  }
  return {
    kind,
    code: 'unknown',
    message: kind === 'audio' ? 'Unable to access the microphone.' : 'Unable to access the camera.',
  };
}

export class WebRTCRoom {
  private callId: string;
  private meId: string;
  private socket = getRealtimeSocket();
  private callbacks: RoomCallbacks;
  private pcs = new Map<string, RTCPeerConnection>();
  private peers = new Map<string, PeerInfo>();
  private remoteStreams = new Map<string, MediaStream>();
  private speakingTimers = new Map<string, number>();
  private signalQueues = new Map<string, Promise<void>>();
  private makingOffer = new Map<string, boolean>();
  private ignoreOffer = new Map<string, boolean>();
  private settingRemoteAnswerPending = new Map<string, boolean>();
  private pendingIceCandidates = new Map<string, RTCIceCandidateInit[]>();
  private reconnectRetryTimers = new Map<string, number>();
  private serverParticipantStates = new Map<string, RuntimeParticipantState>();
  private localStream: MediaStream | null = null;
  private localAudioTrack: MediaStreamTrack | null = null;
  private localVideoTrack: MediaStreamTrack | null = null;
  private screenTrack: MediaStreamTrack | null = null;
  private audioCtx: AudioContext | null = null;
  private connectedOnce = false;
  private joining = false;
  private devices: DeviceInventory = { ...DEFAULT_INVENTORY };
  private rtcConfig: RTCConfiguration = FALLBACK_RTC_CONFIG;
  private rtcConfigReady = false;
  private rtcConfigPromise: Promise<void> | null = null;
  private hasJoinedCall = false;
  private joinSyncPromise: Promise<void> | null = null;
  private lastJoinSyncAt = 0;
  private selectedAudioInputId = '';
  private selectedVideoInputId = '';
  private unsubscribeSocketSubscription: (() => void) | null = null;
  private handleDeviceChange = () => {
    void this.refreshDevices().catch(() => null);
  };
  private handlers: {
    callState?: (payload: unknown) => void;
    peers?: (payload: unknown) => void;
    joined?: (payload: unknown) => void;
    left?: (payload: unknown) => void;
    reconnecting?: (payload: unknown) => void;
    reconnected?: (payload: unknown) => void;
    signal?: (payload: unknown) => void;
    screenStarted?: (payload: unknown) => void;
    screenStopped?: (payload: unknown) => void;
    screenForceStop?: (payload: unknown) => void;
    takenOver?: (payload: unknown) => void;
    callError?: (payload: unknown) => void;
    connect?: () => void;
    disconnect?: () => void;
  } = {};
  private meMedia: PeerMediaState = { micOn: true, camOn: false, screenOn: false };
  private phase: CallConnectionPhase = 'stable';

  constructor(callId: string, meId: string, callbacks: RoomCallbacks) {
    this.callId = callId;
    this.meId = meId;
    this.callbacks = callbacks;
    this.unsubscribeSocketSubscription = subscribeRealtimeSocket((next) => {
      void this.handleSocketInstanceChange(next);
    });
  }

  private emitMeta(patch: Partial<PeerMediaState>, toUserId?: string) {
    this.socket?.emit('call:signal', {
      callId: this.callId,
      ...(toUserId ? { toUserId } : {}),
      data: { t: 'meta', ...patch },
    });
  }

  private emitServerMediaState(patch?: Partial<PeerMediaState>) {
    if (!this.hasJoinedCall || !this.socket?.connected) return;
    this.socket?.emit('call:media_state', {
      callId: this.callId,
      media: patch ? { ...patch } : { ...this.meMedia },
    });
  }

  private emitCurrentMeta(toUserId?: string) {
    this.emitMeta({ ...this.meMedia }, toUserId);
  }

  private notifyLocalMedia() {
    this.callbacks.onLocalMediaChanged?.({ ...this.meMedia });
  }

  private setPhase(next: CallConnectionPhase) {
    if (this.phase === next) return;
    this.phase = next;
    this.callbacks.onConnectionPhase?.(next);
    logRtc('phase', { callId: this.callId, phase: next });
  }

  private shouldInitiateOffer(remoteUserId: string) {
    return this.meId.localeCompare(remoteUserId) > 0;
  }

  private isPolite(remoteUserId: string) {
    // Standard perfect-negotiation: the designated offerer is impolite so
    // its offer wins collisions; the other side rolls back and accepts.
    return !this.shouldInitiateOffer(remoteUserId);
  }

  private async ensureSocket(timeoutMs = 2500) {
    if (this.socket) return;
    const started = Date.now();
    while (!this.socket && Date.now() - started < timeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
      this.socket = getRealtimeSocket();
    }
    if (!this.socket) throw new Error('NO_SOCKET');
  }

  private async ensureRtcConfig(force = false) {
    if (this.rtcConfigReady && !force) return;
    if (this.rtcConfigPromise) {
      await this.rtcConfigPromise;
      return;
    }

    this.rtcConfigPromise = (async () => {
      const turnIceServer = await fetchTurnIceServer();
      this.rtcConfig = turnIceServer
        ? buildRtcConfig([...STUN_ICE_SERVERS, turnIceServer])
        : FALLBACK_RTC_CONFIG;
      this.rtcConfigReady = true;
      logRtc('rtc-config', {
        callId: this.callId,
        usingTurn: Boolean(turnIceServer),
        iceServerCount: this.rtcConfig.iceServers?.length ?? 0,
      });
    })().finally(() => {
      this.rtcConfigPromise = null;
    });

    await this.rtcConfigPromise;
  }

  private bindSocketListeners(socket: Socket) {
    if (this.handlers.callState) socket.on('call:state', this.handlers.callState);
    if (this.handlers.peers) socket.on('call:peers', this.handlers.peers);
    if (this.handlers.joined) socket.on('call:peer_joined', this.handlers.joined);
    if (this.handlers.left) socket.on('call:peer_left', this.handlers.left);
    if (this.handlers.reconnecting) socket.on('call:peer_reconnecting', this.handlers.reconnecting);
    if (this.handlers.reconnected) socket.on('call:peer_reconnected', this.handlers.reconnected);
    if (this.handlers.signal) socket.on('call:signal', this.handlers.signal);
    if (this.handlers.screenStarted) socket.on('call:screen_share_started', this.handlers.screenStarted);
    if (this.handlers.screenStopped) socket.on('call:screen_share_stopped', this.handlers.screenStopped);
    if (this.handlers.screenForceStop) socket.on('call:screen_share_force_stop', this.handlers.screenForceStop);
    if (this.handlers.takenOver) socket.on('call:taken_over', this.handlers.takenOver);
    if (this.handlers.callError) socket.on('call:error', this.handlers.callError);
    if (this.handlers.connect) socket.on('connect', this.handlers.connect);
    if (this.handlers.disconnect) socket.on('disconnect', this.handlers.disconnect);
  }

  private unbindSocketListeners(socket: Socket | null) {
    if (!socket) return;
    if (this.handlers.callState) socket.off('call:state', this.handlers.callState);
    if (this.handlers.peers) socket.off('call:peers', this.handlers.peers);
    if (this.handlers.joined) socket.off('call:peer_joined', this.handlers.joined);
    if (this.handlers.left) socket.off('call:peer_left', this.handlers.left);
    if (this.handlers.reconnecting) socket.off('call:peer_reconnecting', this.handlers.reconnecting);
    if (this.handlers.reconnected) socket.off('call:peer_reconnected', this.handlers.reconnected);
    if (this.handlers.signal) socket.off('call:signal', this.handlers.signal);
    if (this.handlers.screenStarted) socket.off('call:screen_share_started', this.handlers.screenStarted);
    if (this.handlers.screenStopped) socket.off('call:screen_share_stopped', this.handlers.screenStopped);
    if (this.handlers.screenForceStop) socket.off('call:screen_share_force_stop', this.handlers.screenForceStop);
    if (this.handlers.takenOver) socket.off('call:taken_over', this.handlers.takenOver);
    if (this.handlers.callError) socket.off('call:error', this.handlers.callError);
    if (this.handlers.connect) socket.off('connect', this.handlers.connect);
    if (this.handlers.disconnect) socket.off('disconnect', this.handlers.disconnect);
  }

  private async handleSocketInstanceChange(next: Socket | null) {
    if (next === this.socket) return;
    const previous = this.socket;
    this.unbindSocketListeners(previous);
    this.socket = next;
    if (!next || !this.handlers.peers) return;
    this.bindSocketListeners(next);
    logRtc('socket-instance-change', {
      callId: this.callId,
      hadPrevious: Boolean(previous),
      connected: next.connected,
    });
    if (next.connected) {
      await this.syncJoinStateInternal('reconnect');
    }
  }

  private upsertPeer(userId: string, patch: PeerPatch) {
    const prev = this.peers.get(userId) ?? {
      userId,
      stream: null,
      status: 'connecting' as PeerStatus,
      media: { micOn: true, camOn: false, screenOn: false },
      speaking: false,
    };
    const nextMedia: PeerMediaState = { ...prev.media };
    if (typeof patch.media?.micOn === 'boolean') nextMedia.micOn = patch.media.micOn;
    if (typeof patch.media?.camOn === 'boolean') nextMedia.camOn = patch.media.camOn;
    if (typeof patch.media?.screenOn === 'boolean') nextMedia.screenOn = patch.media.screenOn;
    const next: PeerInfo = {
      ...prev,
      ...patch,
      media: nextMedia,
    };
    this.peers.set(userId, next);
    this.callbacks.onPeerUpdate(next);
  }

  private normalizePeerMediaState(input: unknown, fallback?: PeerMediaState): PeerMediaState {
    const source = input && typeof input === 'object' ? (input as Partial<PeerMediaState>) : {};
    return {
      micOn: typeof source.micOn === 'boolean' ? source.micOn : fallback?.micOn ?? true,
      camOn: typeof source.camOn === 'boolean' ? source.camOn : fallback?.camOn ?? false,
      screenOn: typeof source.screenOn === 'boolean' ? source.screenOn : fallback?.screenOn ?? false,
    };
  }

  private resetPeerSignalingState(userId: string) {
    this.signalQueues.delete(userId);
    this.makingOffer.delete(userId);
    this.ignoreOffer.delete(userId);
    this.settingRemoteAnswerPending.delete(userId);
    this.pendingIceCandidates.delete(userId);
  }

  private async refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return this.devices;
    const list = await navigator.mediaDevices.enumerateDevices();
    const toOption = (device: MediaDeviceInfo, index: number, prefix: string): DeviceOption => ({
      deviceId: device.deviceId,
      label: device.label || `${prefix} ${index + 1}`,
    });

    const audioInputs = list.filter((d) => d.kind === 'audioinput').map((d, i) => toOption(d, i, 'Microphone'));
    const videoInputs = list.filter((d) => d.kind === 'videoinput').map((d, i) => toOption(d, i, 'Camera'));
    const audioOutputs = list.filter((d) => d.kind === 'audiooutput').map((d, i) => toOption(d, i, 'Speaker'));

    this.devices = {
      audioInputs,
      videoInputs,
      audioOutputs,
      selectedAudioInputId: this.selectedAudioInputId || audioInputs[0]?.deviceId || '',
      selectedVideoInputId: this.selectedVideoInputId || videoInputs[0]?.deviceId || '',
      canSelectAudioOutput: supportsAudioOutputSelection(),
    };

    if (!this.selectedAudioInputId) this.selectedAudioInputId = this.devices.selectedAudioInputId;
    if (!this.selectedVideoInputId) this.selectedVideoInputId = this.devices.selectedVideoInputId;

    this.callbacks.onDevicesChanged?.(this.devices);
    return this.devices;
  }

  private recreatePc(remoteUserId: string) {
    const existing = this.pcs.get(remoteUserId);
    try {
      existing?.close();
    } catch {
      // ignore
    }
    this.pcs.delete(remoteUserId);
    this.resetPeerSignalingState(remoteUserId);
    return this.createPc(remoteUserId);
  }

  private async getTrack(kind: 'audio' | 'video', deviceId?: string) {
    const constraints = kind === 'audio'
      ? { audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false }
      : { video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const track = kind === 'audio' ? stream.getAudioTracks()[0] ?? null : stream.getVideoTracks()[0] ?? null;
    if (!track) {
      stream.getTracks().forEach((item) => item.stop());
      throw new Error('NO_TRACK');
    }
    return { stream, track };
  }

  private setLocalTrack(kind: 'audio' | 'video', track: MediaStreamTrack | null) {
    if (!this.localStream) this.localStream = new MediaStream();
    const previous = kind === 'audio' ? this.localAudioTrack : this.localVideoTrack;
    if (previous && this.localStream.getTracks().some((item) => item.id === previous.id)) {
      this.localStream.removeTrack(previous);
      try {
        previous.stop();
      } catch {
        // ignore
      }
    }
    if (track) this.localStream.addTrack(track);
    if (kind === 'audio') this.localAudioTrack = track;
    else this.localVideoTrack = track;
  }

  private async replaceTrackForPeers(kind: 'audio' | 'video', track: MediaStreamTrack | null) {
    const renegotiateFor: string[] = [];
    for (const [remoteUserId, pc] of this.pcs.entries()) {
      const sender = pc.getSenders().find((item) => item.track?.kind === kind);
      if (sender) {
        await sender.replaceTrack(track);
      } else if (track && this.localStream) {
        pc.addTrack(track, this.localStream);
        renegotiateFor.push(remoteUserId);
      }
    }
    for (const remoteUserId of renegotiateFor) {
      await this.maybeOffer(remoteUserId);
    }
  }

  private async syncExistingPeerSenders() {
    if (!this.pcs.size || !this.localStream) return;
    if (this.localAudioTrack) {
      await this.replaceTrackForPeers('audio', this.localAudioTrack);
    }
    const activeVideoTrack = this.meMedia.screenOn ? this.screenTrack : this.localVideoTrack;
    if (activeVideoTrack) {
      await this.replaceTrackForPeers('video', activeVideoTrack);
    }
  }

  private attachSpeakingDetector(userId: string, stream: MediaStream) {
    try {
      if (this.speakingTimers.has(userId)) return;
      bindAudioUnlock();
      if (!canPlayUiSounds()) return;
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = AudioCtx ? new AudioCtx() : null;
      }
      if (!this.audioCtx) return;
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;
      const source = this.audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const timer = window.setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const value = (data[i] - 128) / 128;
          sum += value * value;
        }
        const speaking = Math.sqrt(sum / data.length) > 0.04;
        const prev = this.peers.get(userId);
        if (prev && prev.speaking !== speaking) this.upsertPeer(userId, { speaking });
      }, 250);
      this.speakingTimers.set(userId, timer);
    } catch {
      // ignore
    }
  }

  private createPc(remoteUserId: string) {
    const pc = new RTCPeerConnection(this.rtcConfig);
    logRtc('pc-create', { callId: this.callId, meId: this.meId, remoteUserId });
    this.pcs.set(remoteUserId, pc);

    const remoteStream = this.remoteStreams.get(remoteUserId) ?? new MediaStream();
    this.remoteStreams.set(remoteUserId, remoteStream);
    this.upsertPeer(remoteUserId, { stream: remoteStream, status: 'connecting' });

    if (this.localAudioTrack && this.localStream) pc.addTrack(this.localAudioTrack, this.localStream);
    if (this.meMedia.screenOn && this.screenTrack) {
      pc.addTrack(this.screenTrack, new MediaStream([this.screenTrack]));
    } else if (this.localVideoTrack && this.localStream) {
      pc.addTrack(this.localVideoTrack, this.localStream);
    }

    pc.ontrack = (event) => {
      const stream = this.remoteStreams.get(remoteUserId) ?? new MediaStream();
      this.remoteStreams.set(remoteUserId, stream);
      if (event.streams?.[0]) {
        for (const track of event.streams[0].getTracks()) {
          if (!stream.getTracks().some((item) => item.id === track.id)) stream.addTrack(track);
        }
      } else if (!stream.getTracks().some((item) => item.id === event.track.id)) {
        stream.addTrack(event.track);
      }
      this.upsertPeer(remoteUserId, { stream, status: statusFrom(pc) });
      this.attachSpeakingDetector(remoteUserId, stream);
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.socket?.emit('call:signal', {
        callId: this.callId,
        toUserId: remoteUserId,
        data: { t: 'ice', c: event.candidate.toJSON() },
      });
    };

    pc.onnegotiationneeded = () => {
      void this.maybeOffer(remoteUserId);
    };

    const syncStatus = () => {
      const status = statusFrom(pc);
      this.upsertPeer(remoteUserId, { status });
      logRtc('pc-state', {
        callId: this.callId,
        remoteUserId,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        signalingState: pc.signalingState,
        status,
      });
      if (!this.connectedOnce && status === 'connected') {
        this.connectedOnce = true;
        this.setPhase('stable');
        this.callbacks.onConnected();
        this.callbacks.onConnectionHint?.('', 'info');
      }
      if (status === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        const current = this.reconnectRetryTimers.get(remoteUserId);
        if (current) {
          window.clearTimeout(current);
          this.reconnectRetryTimers.delete(remoteUserId);
        }
        this.setPhase('stable');
      }
      if (pc.iceConnectionState === 'disconnected') {
        this.setPhase('media_reconnecting');
        this.callbacks.onConnectionHint?.('Связь нестабильна. Восстанавливаем медиапоток…', 'warning');
        this.scheduleIceRestart(remoteUserId, 1400);
      }
      if (pc.iceConnectionState === 'failed') {
        this.setPhase('media_reconnecting');
        logRtc('ice-restart-immediate', { callId: this.callId, remoteUserId, reason: 'failed' });
        void this.restartPeer(remoteUserId, true);
        // Schedule a follow-up retry in case the first restart attempt is
        // lost (for example when signaling is flaky at the same time).
        this.scheduleIceRestart(remoteUserId, 3000);
      }
    };

    pc.onconnectionstatechange = syncStatus;
    pc.oniceconnectionstatechange = syncStatus;
    return pc;
  }

  private getOrCreatePc(remoteUserId: string) {
    return this.pcs.get(remoteUserId) ?? this.createPc(remoteUserId);
  }

  private lastCallStateSignature = '';

  private handleCallStateSnapshot(payload: any) {
    if (String(payload?.callId ?? '') !== this.callId) return;
    if (payload?.active === false) return;

    // Dedupe identical snapshots — avoids re-processing on duplicate deliveries.
    try {
      const signature = JSON.stringify({
        s: String(payload?.screenShareBy ?? ''),
        p: (payload?.participants ?? []).map((it: any) => ({
          u: String(it?.userId ?? ''),
          s: String(it?.state ?? ''),
          m: it?.media ?? null,
        })),
      });
      if (signature === this.lastCallStateSignature) return;
      this.lastCallStateSignature = signature;
    } catch {
      // ignore serialization issues
    }

    const activeScreenShareBy = String(payload?.screenShareBy ?? '');
    const remoteParticipantIds = new Set<string>();
    const participants = Array.isArray(payload?.participants) ? payload.participants : [];

    for (const participant of participants) {
      const userId = String(participant?.userId ?? '');
      if (!userId || userId === this.meId) continue;

      remoteParticipantIds.add(userId);
      const nextState: RuntimeParticipantState = participant?.state === 'reconnecting' ? 'reconnecting' : 'joined';
      const previousState = this.serverParticipantStates.get(userId);
      this.serverParticipantStates.set(userId, nextState);

      const media = this.normalizePeerMediaState(participant?.media, this.peers.get(userId)?.media);
      if (activeScreenShareBy) {
        media.screenOn = activeScreenShareBy === userId;
      }

      const currentPc = this.pcs.get(userId);
      const hasLivePc = Boolean(currentPc && currentPc.connectionState !== 'closed');
      const recoveredFromReconnect = previousState === 'reconnecting' && nextState === 'joined';

      // Peer status is driven exclusively by our local RTCPeerConnection
      // state — the server's "reconnecting" hint must not flip a working
      // peer to disconnected in the UI. We only set an initial 'connecting'
      // status for a peer we haven't seen yet.
      const prevPeer = this.peers.get(userId);
      if (!prevPeer) {
        this.upsertPeer(userId, { status: 'connecting', media });
      } else {
        this.upsertPeer(userId, { media });
      }

      if (nextState !== 'joined') continue;

      // Ensure a PC exists. Never close a live PC here — tearing it down while
      // the other side keeps theirs produces a signaling deadlock.
      if (!hasLivePc) {
        this.getOrCreatePc(userId);
        this.emitCurrentMeta(userId);
        if (this.shouldInitiateOffer(userId)) {
          void this.maybeOffer(userId);
        }
        continue;
      }

      // If the server reported a reconnect recovery, nudge media via an ICE
      // restart from the impolite (initiator) side only. The polite side just
      // waits for the incoming offer.
      if (recoveredFromReconnect && this.shouldInitiateOffer(userId)) {
        this.emitCurrentMeta(userId);
        void this.maybeOffer(userId, true);
      }
    }

    for (const userId of [...this.peers.keys()]) {
      if (remoteParticipantIds.has(userId)) continue;
      this.serverParticipantStates.delete(userId);
      this.removePeer(userId);
    }
  }

  private async maybeOffer(remoteUserId: string, iceRestart = false, attempt = 0) {
    const pc = this.getOrCreatePc(remoteUserId);
    if (this.makingOffer.get(remoteUserId)) return;
    if (pc.signalingState !== 'stable') {
      if (attempt < 4) {
        window.setTimeout(() => {
          void this.maybeOffer(remoteUserId, iceRestart, attempt + 1);
        }, 180 + attempt * 120);
      }
      return;
    }

    this.makingOffer.set(remoteUserId, true);
    try {
      // Perfect-negotiation recipe: just call setLocalDescription() without a
      // pre-created offer. This avoids the window between createOffer() and
      // setLocalDescription() where signalingState may change and the offer
      // would silently be dropped.
      if (iceRestart && 'restartIce' in pc) {
        try { pc.restartIce(); } catch { /* ignore */ }
      }
      await pc.setLocalDescription();
      if (!pc.localDescription) return;
      logRtc('offer', { callId: this.callId, remoteUserId, iceRestart });
      this.socket?.emit('call:signal', {
        callId: this.callId,
        toUserId: remoteUserId,
        data: { t: 'offer', sdp: pc.localDescription.toJSON() },
      });
    } catch {
      // If setLocalDescription races, retry once after a short delay.
      if (attempt < 4) {
        window.setTimeout(() => {
          void this.maybeOffer(remoteUserId, iceRestart, attempt + 1);
        }, 220 + attempt * 150);
      }
    } finally {
      this.makingOffer.set(remoteUserId, false);
    }
  }

  private scheduleIceRestart(remoteUserId: string, delayMs: number) {
    const current = this.reconnectRetryTimers.get(remoteUserId);
    if (current) window.clearTimeout(current);
    const timer = window.setTimeout(() => {
      this.reconnectRetryTimers.delete(remoteUserId);
      const pc = this.pcs.get(remoteUserId);
      if (!pc) return;
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return;
      logRtc('ice-restart-scheduled', { callId: this.callId, remoteUserId });
      void this.restartPeer(remoteUserId, true);
    }, delayMs);
    this.reconnectRetryTimers.set(remoteUserId, timer);
  }

  private async restartPeer(remoteUserId: string, iceRestart = false) {
    const timer = this.reconnectRetryTimers.get(remoteUserId);
    if (timer) {
      window.clearTimeout(timer);
      this.reconnectRetryTimers.delete(remoteUserId);
    }
    const pc = this.getOrCreatePc(remoteUserId);
    try {
      if (iceRestart && 'restartIce' in pc) pc.restartIce();
    } catch {
      // ignore
    }
    await this.maybeOffer(remoteUserId, iceRestart);
  }

  private enqueueSignal(fromUserId: string, fn: () => Promise<void>) {
    const previous = this.signalQueues.get(fromUserId) ?? Promise.resolve();
    const next = previous.then(fn).catch(() => null) as Promise<void>;
    this.signalQueues.set(fromUserId, next);
  }

  private async flushPendingIceCandidates(fromUserId: string, pc: RTCPeerConnection) {
    const queue = this.pendingIceCandidates.get(fromUserId);
    if (!queue?.length || !pc.remoteDescription) return;
    this.pendingIceCandidates.delete(fromUserId);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // ignore stale candidate
      }
    }
  }

  private handleSignal(fromUserId: string, data: unknown) {
    if (!isSignal(data)) return;

    this.enqueueSignal(fromUserId, async () => {
      const pc = this.getOrCreatePc(fromUserId);

      if (data.t === 'meta') {
        const media: Partial<PeerMediaState> = {};
        if (typeof data.micOn === 'boolean') media.micOn = data.micOn;
        if (typeof data.camOn === 'boolean') media.camOn = data.camOn;
        if (typeof data.screenOn === 'boolean') media.screenOn = data.screenOn;
        if (Object.keys(media).length) {
          this.upsertPeer(fromUserId, { media });
        }
        return;
      }

      const polite = this.isPolite(fromUserId);
      const makingOffer = this.makingOffer.get(fromUserId) ?? false;
      const isSettingRemoteAnswerPending = this.settingRemoteAnswerPending.get(fromUserId) ?? false;
      const offerCollision = data.t === 'offer' && (makingOffer || pc.signalingState !== 'stable');
      const shouldIgnoreOffer = !polite && offerCollision;
      this.ignoreOffer.set(fromUserId, shouldIgnoreOffer);
      if (shouldIgnoreOffer) return;

      try {
        logRtc('signal', { callId: this.callId, fromUserId, type: data.t });
      if (data.t === 'offer') {
          if (offerCollision && polite) {
            await Promise.all([
              pc.setLocalDescription({ type: 'rollback' }),
              pc.setRemoteDescription(new RTCSessionDescription(data.sdp)),
            ]);
          } else {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          }
          await this.flushPendingIceCandidates(fromUserId, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.socket?.emit('call:signal', {
            callId: this.callId,
            toUserId: fromUserId,
            data: { t: 'answer', sdp: pc.localDescription?.toJSON() ?? answer },
          });
          return;
        }

        if (data.t === 'answer') {
          this.settingRemoteAnswerPending.set(fromUserId, true);
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          this.settingRemoteAnswerPending.set(fromUserId, false);
          await this.flushPendingIceCandidates(fromUserId, pc);
          return;
        }

        if (data.t === 'ice' && data.c) {
          if (!pc.remoteDescription && !isSettingRemoteAnswerPending) {
            const pending = this.pendingIceCandidates.get(fromUserId) ?? [];
            pending.push(data.c);
            this.pendingIceCandidates.set(fromUserId, pending);
            return;
          }
          await pc.addIceCandidate(new RTCIceCandidate(data.c));
        }
      } catch {
        if (data.t === 'answer') this.settingRemoteAnswerPending.set(fromUserId, false);
      }
    });
  }

  private async syncJoinStateInternal(reason: 'initial' | 'reconnect') {
    if (!this.socket) return;
    const now = Date.now();
    if (reason === 'reconnect' && this.joinSyncPromise) {
      await this.joinSyncPromise;
      return;
    }
    if (reason === 'reconnect' && now - this.lastJoinSyncAt < 900) {
      return;
    }

    let syncPromise!: Promise<void>;
    syncPromise = (async () => {
      this.lastJoinSyncAt = Date.now();
      this.hasJoinedCall = true;
      this.socket?.emit('call:join', { callId: this.callId, reason, media: { ...this.meMedia } });
      this.socket?.emit('call:who', { callId: this.callId, reason });
      this.emitCurrentMeta();
      if (reason === 'reconnect') {
        this.setPhase('signaling_reconnecting');
        this.callbacks.onConnectionHint?.('Восстанавливаем соединение звонка...', 'warning');
        for (const remoteUserId of this.pcs.keys()) {
          if (this.shouldInitiateOffer(remoteUserId)) void this.restartPeer(remoteUserId, true);
        }
      }
    })().finally(() => {
      if (this.joinSyncPromise === syncPromise) {
        this.joinSyncPromise = null;
      }
    });

    this.joinSyncPromise = syncPromise;
    await syncPromise;
  }

  async initLocal({ micOn, camOn }: { micOn: boolean; camOn: boolean }) {
    this.meMedia.micOn = micOn;
    this.meMedia.camOn = camOn;

    let audioTrack: MediaStreamTrack | null = null;
    let videoTrack: MediaStreamTrack | null = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micOn ? (this.selectedAudioInputId ? { deviceId: { exact: this.selectedAudioInputId } } : true) : false,
        video: camOn ? (this.selectedVideoInputId ? { deviceId: { exact: this.selectedVideoInputId } } : true) : false,
      });
      audioTrack = stream.getAudioTracks()[0] ?? null;
      videoTrack = stream.getVideoTracks()[0] ?? null;
    } catch (error) {
      if (micOn) {
        try {
          const audio = await this.getTrack('audio', this.selectedAudioInputId || undefined);
          audioTrack = audio.track;
        } catch (audioError) {
          this.meMedia.micOn = false;
          this.callbacks.onDeviceProblem?.({ ...describeMediaError(audioError, 'audio'), blocking: !camOn });
        }
      }
      if (camOn) {
        try {
          const video = await this.getTrack('video', this.selectedVideoInputId || undefined);
          videoTrack = video.track;
        } catch (videoError) {
          this.meMedia.camOn = false;
          this.callbacks.onDeviceProblem?.({ ...describeMediaError(videoError, 'video'), blocking: !audioTrack });
        }
      }
      if (!audioTrack && !videoTrack && micOn && camOn) {
        const name = typeof error === 'object' && error && 'name' in error ? String((error as any).name) : 'UnknownError';
        const message = name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Camera and microphone permissions were denied.'
          : 'Unable to access camera or microphone for this call.';
        this.callbacks.onConnectionHint?.(message, 'error');
      }
    }

    if (!audioTrack && !videoTrack) {
      this.localStream = null;
      this.localAudioTrack = null;
      this.localVideoTrack = null;
      await this.refreshDevices().catch(() => null);
      return null;
    }

    this.localStream = new MediaStream();
    if (audioTrack) {
      audioTrack.enabled = this.meMedia.micOn;
      this.localStream.addTrack(audioTrack);
    }
    if (videoTrack) {
      videoTrack.enabled = this.meMedia.camOn;
      this.localStream.addTrack(videoTrack);
    }
    this.localAudioTrack = audioTrack;
    this.localVideoTrack = videoTrack;
    await this.syncExistingPeerSenders().catch(() => null);
    await this.refreshDevices().catch(() => null);
    this.emitCurrentMeta();
    this.notifyLocalMedia();
    return this.localStream;
  }

  getLocalStream() {
    return this.localStream;
  }

  getMyMedia() {
    return { ...this.meMedia };
  }

  getDevices() {
    return this.devices;
  }

  async switchAudioInput(deviceId: string) {
    this.selectedAudioInputId = deviceId;
    const { track } = await this.getTrack('audio', deviceId);
    track.enabled = this.meMedia.micOn;
    this.setLocalTrack('audio', track);
    await this.replaceTrackForPeers('audio', track);
    await this.refreshDevices().catch(() => null);
    this.emitMeta({ micOn: this.meMedia.micOn });
  }

  async switchVideoInput(deviceId: string) {
    this.selectedVideoInputId = deviceId;
    const { track } = await this.getTrack('video', deviceId);
    track.enabled = this.meMedia.camOn;
    this.setLocalTrack('video', track);
    if (!this.meMedia.screenOn) {
      await this.replaceTrackForPeers('video', track);
    }
    await this.refreshDevices().catch(() => null);
    this.emitMeta({ camOn: this.meMedia.camOn });
  }

  async setMic(on: boolean) {
    this.meMedia.micOn = on;
    if (!on) {
      if (this.localAudioTrack) this.localAudioTrack.enabled = false;
      this.emitMeta({ micOn: false });
      this.emitServerMediaState({ micOn: false });
      this.notifyLocalMedia();
      return;
    }
    if (!this.localAudioTrack) {
      const { track } = await this.getTrack('audio', this.selectedAudioInputId || undefined);
      track.enabled = true;
      this.setLocalTrack('audio', track);
      await this.replaceTrackForPeers('audio', track);
      await this.refreshDevices().catch(() => null);
    } else {
      this.localAudioTrack.enabled = true;
    }
    this.emitMeta({ micOn: true });
    this.emitServerMediaState({ micOn: true });
    this.notifyLocalMedia();
  }

  async setCamera(on: boolean) {
    this.meMedia.camOn = on;
    if (!on) {
      if (this.localVideoTrack) this.localVideoTrack.enabled = false;
      this.emitMeta({ camOn: false });
      this.emitServerMediaState({ camOn: false });
      this.notifyLocalMedia();
      return;
    }
    if (!this.localVideoTrack) {
      const { track } = await this.getTrack('video', this.selectedVideoInputId || undefined);
      track.enabled = true;
      this.setLocalTrack('video', track);
      if (!this.meMedia.screenOn) await this.replaceTrackForPeers('video', track);
      await this.refreshDevices().catch(() => null);
    } else {
      this.localVideoTrack.enabled = true;
    }
    this.emitMeta({ camOn: true });
    this.emitServerMediaState({ camOn: true });
    this.notifyLocalMedia();
  }

  async startScreenShare() {
    if (this.meMedia.screenOn) return null;
    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = displayStream.getVideoTracks()[0] ?? null;
    if (!track) return null;
    this.screenTrack = track;
    this.meMedia.screenOn = true;
    await this.replaceTrackForPeers('video', track);
    this.emitMeta({ screenOn: true });
    if (this.hasJoinedCall) {
      this.socket?.emit('call:screen_share', { callId: this.callId, enabled: true });
    }
    this.notifyLocalMedia();
    track.onended = () => {
      void this.stopScreenShare();
    };
    return displayStream;
  }

  async stopScreenShare() {
    if (!this.meMedia.screenOn) return;
    this.meMedia.screenOn = false;
    this.emitMeta({ screenOn: false });
    if (this.hasJoinedCall) {
      this.socket?.emit('call:screen_share', { callId: this.callId, enabled: false });
    }
    this.notifyLocalMedia();
    try {
      this.screenTrack?.stop();
    } catch {
      // ignore
    }
    this.screenTrack = null;
    await this.replaceTrackForPeers('video', this.meMedia.camOn ? this.localVideoTrack : null);
  }

  async join() {
    await this.ensureSocket().catch(() => {
      this.callbacks.onConnectionHint?.('Realtime connection is unavailable.', 'error');
      return;
    });
    if (!this.socket || this.joining) return;
    this.joining = true;
    await this.ensureRtcConfig();

    const onCallState = (payload: any) => {
      if (String(payload?.callId ?? '') !== this.callId) return;
      this.handleCallStateSnapshot(payload);
    };

    const onPeers = (payload: any) => {
      if (String(payload?.callId ?? '') !== this.callId) return;
      const list: string[] = Array.isArray(payload?.peers) ? Array.from(new Set(payload.peers.map(String))) : [];
      for (const userId of list) {
        if (!userId || userId === this.meId) continue;
        this.upsertPeer(userId, { status: 'connecting' });
        this.getOrCreatePc(userId);
        this.emitCurrentMeta(userId);
        if (this.shouldInitiateOffer(userId)) void this.maybeOffer(userId);
      }
    };

    const onJoined = (payload: any) => {
      if (String(payload?.callId ?? '') !== this.callId) return;
      const userId = String(payload?.userId ?? '');
      if (!userId || userId === this.meId) return;
      const alreadyKnown = this.peers.has(userId);
      if (!alreadyKnown) this.callbacks.onPeerJoined?.(userId);
      this.serverParticipantStates.set(userId, 'joined');
      this.upsertPeer(userId, { status: 'connecting' });
      this.getOrCreatePc(userId);
      this.emitCurrentMeta(userId);
      if (this.shouldInitiateOffer(userId)) void this.maybeOffer(userId);
    };

    const onLeft = (payload: any) => {
      if (String(payload?.callId ?? '') !== this.callId) return;
      const userId = String(payload?.userId ?? '');
      if (!userId) return;
      this.serverParticipantStates.delete(userId);
      this.callbacks.onPeerLeft?.(userId, typeof payload?.reason === 'string' ? payload.reason : undefined);
      this.removePeer(userId);
    };

    const onPeerReconnecting = (payload: any) => {
      if (String(payload?.callId ?? '') !== this.callId) return;
      const userId = String(payload?.userId ?? '');
      if (!userId || userId === this.meId) return;
      this.serverParticipantStates.set(userId, 'reconnecting');
      this.upsertPeer(userId, { status: 'disconnected' });
      this.setPhase('media_reconnecting');
      this.callbacks.onConnectionHint?.('Участник переподключается…', 'warning');
    };

    const onPeerReconnected = (payload: any) => {
      if (String(payload?.callId ?? '') !== this.callId) return;
      const userId = String(payload?.userId ?? '');
      if (!userId || userId === this.meId) return;
      this.serverParticipantStates.set(userId, 'joined');
      this.upsertPeer(userId, { status: 'connecting' });
      // Do NOT close the live PC — issue an ICE restart from the initiator
      // side so existing media tracks stay attached.
      if (!this.pcs.get(userId)) this.getOrCreatePc(userId);
      this.emitCurrentMeta(userId);
      if (this.shouldInitiateOffer(userId)) void this.maybeOffer(userId, true);
      this.setPhase('media_reconnecting');
      this.callbacks.onConnectionHint?.('Соединение восстановлено.', 'info');
    };

    const onTakenOver = (payload: any) => {
      if (String(payload?.callId ?? '') !== this.callId) return;
      logRtc('taken-over', { callId: this.callId });
      this.callbacks.onConnectionHint?.('Звонок переведён в другую вкладку.', 'warning');
      this.callbacks.onTakenOver?.();
    };

    const onSignal = (payload: any) => {
      if (String(payload?.callId ?? '') !== this.callId) return;
      const fromUserId = String(payload?.fromUserId ?? '');
      if (!fromUserId || fromUserId === this.meId) return;
      this.handleSignal(fromUserId, payload?.data);
    };

    const onScreenStarted = (payload: any) => {
      if (String(payload?.callId ?? '') !== this.callId) return;
      const userId = String(payload?.userId ?? '');
      if (!userId || userId === this.meId) return;
      this.upsertPeer(userId, { media: { screenOn: true } });
      this.callbacks.onToast('A participant started sharing screen');
    };

    const onScreenStopped = (payload: any) => {
      if (String(payload?.callId ?? '') !== this.callId) return;
      const userId = String(payload?.userId ?? '');
      if (!userId || userId === this.meId) return;
      this.upsertPeer(userId, { media: { screenOn: false } });
      this.callbacks.onToast('Screen sharing stopped');
    };

    const onScreenForceStop = (payload: any) => {
      if (String(payload?.callId ?? '') !== this.callId) return;
      if (!this.meMedia.screenOn) return;
      void this.stopScreenShare();
      this.callbacks.onConnectionHint?.('Another participant started screen sharing.', 'info');
    };

    const onCallError = (payload: any) => {
      const code = String(payload?.code ?? '');
      if (!code) return;
      const payloadCallId = String(payload?.callId ?? '');
      if (payloadCallId && payloadCallId !== this.callId) return;
      const message = String(payload?.message ?? 'Call error');
      if (code === 'CALL_NOT_FOUND' || code === 'CALL_JOIN_FORBIDDEN' || code === 'CALL_PARTICIPANT_REQUIRED') {
        logRtc('fatal-error', { callId: this.callId, code });
        this.callbacks.onFatalError?.(code, message);
        return;
      }
      this.callbacks.onConnectionHint?.(message, 'warning');
    };

    const onSocketConnect = () => {
      logRtc('socket-connect', { callId: this.callId });
      this.setPhase('media_reconnecting');
      void this.syncJoinStateInternal('reconnect');
    };

    const onSocketDisconnect = () => {
      logRtc('socket-disconnect', { callId: this.callId, online: navigator.onLine });
      this.setPhase('signaling_reconnecting');
      const message = navigator.onLine ? 'Realtime connection lost. Reconnecting...' : 'You are offline. Waiting for network...';
      this.callbacks.onConnectionHint?.(message, navigator.onLine ? 'warning' : 'error');
    };

    this.handlers = {
      callState: onCallState,
      peers: onPeers,
      joined: onJoined,
      left: onLeft,
      reconnecting: onPeerReconnecting,
      reconnected: onPeerReconnected,
      signal: onSignal,
      screenStarted: onScreenStarted,
      screenStopped: onScreenStopped,
      screenForceStop: onScreenForceStop,
      takenOver: onTakenOver,
      callError: onCallError,
      connect: onSocketConnect,
      disconnect: onSocketDisconnect,
    };

    this.bindSocketListeners(this.socket);

    navigator.mediaDevices?.addEventListener?.('devicechange', this.handleDeviceChange);

    try {
      await this.syncJoinStateInternal('initial');
    } finally {
      this.joining = false;
    }
  }

  async resume(reason: 'visibility' | 'pageshow' | 'online') {
    await this.ensureSocket().catch(() => null);
    if (!this.socket) return;

    if (!this.socket.connected) {
      this.setPhase('signaling_reconnecting');
      const message = navigator.onLine ? 'Restoring call connection...' : 'You are offline. Waiting for network...';
      this.callbacks.onConnectionHint?.(message, navigator.onLine ? 'warning' : 'error');
      this.socket.connect();
      return;
    }

    await this.ensureRtcConfig(true).catch(() => null);
    logRtc('resume', { callId: this.callId, reason });
    await this.syncJoinStateInternal('reconnect');
  }

  private removePeer(userId: string) {
    const timer = this.reconnectRetryTimers.get(userId);
    if (timer) {
      window.clearTimeout(timer);
      this.reconnectRetryTimers.delete(userId);
    }
    const pc = this.pcs.get(userId);
    this.resetPeerSignalingState(userId);
    try {
      pc?.close();
    } catch {
      // ignore
    }
    this.pcs.delete(userId);
    this.remoteStreams.delete(userId);
    const speakingTimer = this.speakingTimers.get(userId);
    if (speakingTimer) {
      window.clearInterval(speakingTimer);
      this.speakingTimers.delete(userId);
    }
    this.peers.delete(userId);
    this.serverParticipantStates.delete(userId);
    this.callbacks.onPeerRemove(userId);
  }

  destroy() {
    try {
      this.unbindSocketListeners(this.socket);
    } catch {
      // ignore
    }
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.handleDeviceChange);
    this.unsubscribeSocketSubscription?.();
    this.unsubscribeSocketSubscription = null;
    this.handlers = {};
    this.phase = 'stable';
    this.hasJoinedCall = false;
    this.joinSyncPromise = null;
    this.lastJoinSyncAt = 0;

    this.pendingIceCandidates.clear();
    this.serverParticipantStates.clear();
    for (const userId of [...this.pcs.keys()]) this.removePeer(userId);
    for (const timer of this.reconnectRetryTimers.values()) window.clearTimeout(timer);
    this.reconnectRetryTimers.clear();

    try {
      this.screenTrack?.stop();
    } catch {
      // ignore
    }
    this.screenTrack = null;

    try {
      this.localStream?.getTracks().forEach((track) => track.stop());
    } catch {
      // ignore
    }
    this.localStream = null;
    this.localAudioTrack = null;
    this.localVideoTrack = null;

    try {
      this.audioCtx?.close();
    } catch {
      // ignore
    }
    this.audioCtx = null;
  }
}
