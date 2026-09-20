import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';

const SocketContext = createContext(null);

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL.replace(/\/api\/v1\/?$/, '')
    : 'http://localhost:5050');

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      upgrade: false,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
    });

    s.on('connect', () => {
      setConnected(true);
      if (user?.id) {
        s.emit('join_user_room', user.id);
        s.emit('join_role_room', user.role);
      }
    });

    s.on('disconnect', () => {
      setConnected(false);
    });

    // Global Event Handlers for Notifications
    s.on('creator_new_request', (data) => {
      if (user?.role === 'COURSE_CREATOR' || user?.role === 'ADMIN') {
        addToast({
          type: 'info',
          title: 'New Enrollment Application',
          message: data.message || 'A student submitted a new course application.',
        });
      }
    });

    s.on('admin_new_request', (data) => {
      if (user?.role === 'ADMIN') {
        addToast({
          type: 'info',
          title: 'Enrollment Endorsed by Instructor',
          message: data.message || 'An application requires administrative authorization.',
        });
      }
    });

    s.on('enrollment_status_updated', (data) => {
      addToast({
        type: 'info',
        title: 'Application Progress Update',
        message: data.message || 'Your application has advanced to the next stage.',
      });
    });

    s.on('enrollment_approved', (data) => {
      addToast({
        type: 'success',
        title: '🎉 Enrollment Approved!',
        message: data.message || 'Your course enrollment has been authorized.',
      });
    });

    s.on('enrollment_rejected', (data) => {
      addToast({
        type: 'error',
        title: 'Enrollment Application Declined',
        message: data.reason || 'Your application was not approved at this time.',
      });
    });

    // Real-Time Inbox Message Alerts (shown when not actively on the inbox page)
    s.on('new_direct_message', (data) => {
      if (data?.senderId !== user?.id && data?.recipientId === user?.id) {
        if (window.location.pathname !== '/inbox') {
          addToast({
            type: 'info',
            title: `💬 Message from ${data.senderName || 'Member'}`,
            message: data.content || (data.fileName ? `Sent an attachment: ${data.fileName}` : 'New message received.'),
          });
        }
      }
    });

    s.on('new_community_message', (data) => {
      if (data?.senderId === user?.id) return;
      const isStaff = user?.role === 'ADMIN' || user?.role === 'MODERATOR';
      const isSenderStaff = data?.senderRole === 'ADMIN' || data?.senderRole === 'MODERATOR';
      if (isStaff && !isSenderStaff) {
        if (window.location.pathname !== '/inbox') {
          addToast({
            type: 'info',
            title: `🎧 Support Ticket: ${data.senderName || 'User'}`,
            message: data.content || (data.fileName ? `Sent an attachment: ${data.fileName}` : 'New support inquiry.'),
          });
        }
      } else if (!isStaff && isSenderStaff && (data.recipientId === user?.id || !data.recipientId)) {
        if (window.location.pathname !== '/inbox') {
          addToast({
            type: 'info',
            title: `🎧 Support Desk: ${data.senderName || 'Staff'}`,
            message: data.content || (data.fileName ? `Sent an attachment: ${data.fileName}` : 'Support updated your ticket.'),
          });
        }
      }
    });

    s.on('new_announcement', (data) => {
      if (data?.senderId !== user?.id) {
        if (window.location.pathname !== '/inbox') {
          addToast({
            type: 'info',
            title: `📢 Announcement: ${data.senderName || 'Admin'}`,
            message: data.content || 'New platform announcement broadcasted.',
          });
        }
      }
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [user]);

  // Resilient re-joining of user & role rooms whenever connection or auth state updates
  useEffect(() => {
    if (socket && connected && user?.id) {
      socket.emit('join_user_room', user.id);
      socket.emit('join_role_room', user.role);
    }
  }, [socket, connected, user?.id, user?.role]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
