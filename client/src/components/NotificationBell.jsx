import React, { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { Bell, Check } from "lucide-react";
import moment from "moment";
import {
  fetchNotifications,
  fetchUnreadCount,
  markRead,
  markAllRead,
} from "../redux/slices/notificationSlice";
import { getPalette } from "../administrator/utils/palette";

const NotificationBell = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { notifications, unreadCount } = useSelector((s) => s.notification);
  const theme = useSelector((s) => s.theme.theme);
  const user = useSelector((s) => s.auth.user);
  const [open, setOpen] = useState(false);
  const popRef = useRef(null);
  const isDark = theme === "dark";
  const tenantBranding = useSelector((s) => s.tenant.branding);

  const C = getPalette(isDark, tenantBranding);

  useEffect(() => {
    if (!user) return;
    dispatch(fetchUnreadCount());
    const id = setInterval(() => {
      if (document.visibilityState === "visible") dispatch(fetchUnreadCount());
    }, 20000);
    return () => clearInterval(id);
  }, [dispatch, user]);

  useEffect(() => {
    if (open) dispatch(fetchNotifications());
  }, [open, dispatch]);

  useEffect(() => {
    const onClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleClickItem = async (n) => {
    if (!n.isRead) await dispatch(markRead(n._id));
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const handleMarkAll = async () => {
    await dispatch(markAllRead());
    dispatch(fetchNotifications());
  };

  return (
    <div className="relative" ref={popRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg transition-colors"
        style={{ color: C.text }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.surfaceAlt)}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
            style={{ backgroundColor: C.red }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-96 overflow-hidden rounded-xl border shadow-lg z-50 flex flex-col"
          style={{ backgroundColor: C.surface, borderColor: C.border, color: C.text }}
        >
          <div
            className="flex items-center justify-between px-4 py-2.5 border-b"
            style={{ borderColor: C.border }}
          >
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-xs inline-flex items-center gap-1"
                style={{ color: C.navy }}
              >
                <Check className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="text-center text-sm py-10" style={{ color: C.muted }}>
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n._id}
                  onClick={() => handleClickItem(n)}
                  className="w-full text-left p-3 border-b transition-colors"
                  style={{
                    borderColor: C.border,
                    backgroundColor: n.isRead ? "transparent" : C.surfaceAlt,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.surfaceAlt)}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = n.isRead ? "transparent" : C.surfaceAlt)
                  }
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && (
                      <span
                        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: C.red }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm" style={{ color: C.text }}>{n.message}</p>
                      <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                        {moment(n.createdAt).fromNow()}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
