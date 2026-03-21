'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './CallOverlay.module.css';
import { getRealtimeSocket } from '@/shared/lib/realtimeSocket';

type Props = {
  open: boolean;
  mode: 'outgoing' | 'incoming' | 'in_call';
  initiator: boolean;
  chatId: string;
  callId: string;
  meId: string;
  otherUserId: string;
  onClose: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
};

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

export function CallOverlay({ open, mode, initiator, chatId, callId, meId, otherUserId, onClose, onAccept, onDecline }: Props) {
  const socket = useMemo(() => getRealtimeSocket(), [open]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  const [status, setStatus] = useState<string>('');
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  function cleanup(reason?: string) {
    try {
      pcRef.current?.getSenders().forEach((s) => {
        try {
          s.track?.stop();
        } catch {
          // ignore
        }
      });
      pcRef.current?.close();
    } catch {
      // ignore
    }
    pcRef.current = null;

    try {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      // ignore
    }
    localStreamRef.current = null;
    remoteStreamRef.current = null;

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    if (reason) setStatus(reason);
  }

  async function ensureLocalStream(wantVideo: boolean) {
    // Keep existing audio track if present, but (re)create stream when toggling camera
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: wantVideo ? { facingMode } : false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }

  function ensurePeerConnection() {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    const remote = new MediaStream();
    remoteStreamRef.current = remote;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;

    pc.ontrack = (ev) => {
      for (const track of ev.streams?.[0]?.getTracks?.() ?? []) {
        remote.addTrack(track);
      }
    };

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      socket?.emit('call:signal', { callId, toUserId: otherUserId, data: { t: 'ice', c: ev.candidate } });
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') setStatus('В звонке');
      if (st === 'disconnected' || st === 'failed' || st === 'closed') {
        // remote can temporarily drop; keep UI but allow retry by restarting call
      }
    };

    return pc;
  }

  async function startAsCaller() {
    if (!socket) return;
    setStatus('Подключение…');

    const pc = ensurePeerConnection();
    const stream = await ensureLocalStream(false);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    socket.emit('call:join', { callId });

    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    socket.emit('call:signal', { callId, toUserId: otherUserId, data: { t: 'offer', sdp: offer } });
    setStatus('Ожидание ответа…');
  }

  async function startAsCallee() {
    if (!socket) return;
    setStatus('Подключение…');
    const pc = ensurePeerConnection();
    const stream = await ensureLocalStream(false);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    socket.emit('call:join', { callId });
  }

  async function handleSignal(fromUserId: string, data: any) {
    if (fromUserId !== otherUserId) return;
    const pc = ensurePeerConnection();

    if (data?.t === 'offer') {
      await startAsCallee();
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket?.emit('call:signal', { callId, toUserId: otherUserId, data: { t: 'answer', sdp: answer } });
      setStatus('В звонке');
    } else if (data?.t === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      setStatus('В звонке');
    } else if (data?.t === 'ice' && data?.c) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.c));
      } catch {
        // ignore
      }
    }
  }

  async function toggleVideo() {
    const next = !videoEnabled;
    setVideoEnabled(next);
    const pc = ensurePeerConnection();

    if (next) {
      // add video track and renegotiate
      const stream = await ensureLocalStream(true);
      const videoTrack = stream.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(videoTrack);
      } else {
        pc.addTrack(videoTrack, stream);
      }
    } else {
      // disable: remove video track by replace with null (best-effort)
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      try {
        sender?.track?.stop();
      } catch {
        // ignore
      }
      try {
        await sender?.replaceTrack(null);
      } catch {
        // ignore
      }
    }

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket?.emit('call:signal', { callId, toUserId: otherUserId, data: { t: 'offer', sdp: offer } });
    } catch {
      // ignore
    }
  }

  async function flipCamera() {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    if (!videoEnabled) return;

    // re-acquire video with new facing mode and replace track
    const pc = ensurePeerConnection();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: next } });
    // keep audio from existing local stream; only replace video
    const videoTrack = stream.getVideoTracks()[0];
    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender) await sender.replaceTrack(videoTrack);
    // update local preview
    const current = localStreamRef.current;
    if (current) {
      current.getVideoTracks().forEach((t) => t.stop());
      current.addTrack(videoTrack);
    } else {
      localStreamRef.current = stream;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
  }

  function hangup() {
    socket?.emit('call:end', { chatId, callId });
    cleanup('Звонок завершён');
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    if (!socket) return;

    const onSig = (p: any) => {
      if (p?.callId !== callId) return;
      void handleSignal(String(p?.fromUserId ?? ''), p?.data);
    };
    const onEnd = (p: any) => {
      if (p?.callId !== callId) return;
      cleanup('Звонок завершён');
      onClose();
    };

    socket.on('call:signal', onSig);
    socket.on('call:end', onEnd);

    return () => {
      socket.off('call:signal', onSig);
      socket.off('call:end', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, socket, callId]);

  useEffect(() => {
    if (!open) return;
    setStatus(mode === 'incoming' ? 'Входящий звонок…' : mode === 'outgoing' ? 'Исходящий звонок…' : 'В звонке');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      cleanup();
      return;
    }

    // Caller starts negotiation after callee accepted (mode becomes in_call)
    if (initiator && mode === 'in_call') {
      void startAsCaller();
    }
    // Callee starts when it receives an offer (handleSignal)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initiator]);

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.panel}>
        <div className={styles.videos}>
          <div className={styles.status}>{status}</div>
          <video ref={remoteVideoRef} className={styles.remote} autoPlay playsInline />
          <div className={styles.localWrap}>
            <video ref={localVideoRef} className={styles.local} autoPlay muted playsInline />
          </div>
        </div>

        <div className={styles.controls}>
          {mode === 'incoming' ? (
            <>
              <button
                type="button"
                className={styles.btn}
                onClick={() => {
                  onAccept?.();
                }}
              >
                Принять
              </button>
              <button
                type="button"
                className={[styles.btn, styles.btnDanger].join(' ')}
                onClick={() => {
                  onDecline?.();
                }}
              >
                Отклонить
              </button>
            </>
          ) : (
            <>
              <button type="button" className={styles.btn} onClick={() => void toggleVideo()}>
                {videoEnabled ? 'Выключить видео' : 'Включить видео'}
              </button>
              <button type="button" className={styles.btn} onClick={() => void flipCamera()} disabled={!videoEnabled}>
                Перевернуть камеру
              </button>
              <button type="button" className={[styles.btn, styles.btnDanger].join(' ')} onClick={hangup}>
                Сбросить
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
