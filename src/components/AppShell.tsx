import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { listNotifications, markAllNotificationsRead, markNotificationRead, touchPresence, unreadNotificationsCount } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Avatar, Button, Modal } from './ui';
import { IconBell, IconBook, IconHome, IconMoon, IconNews, IconShield, IconSun, IconUser, IconUsers } from './icons';

const NAV = [
  { to: '/', label: 'Home', Icon: IconHome, end: true },
  { to: '/community', label: 'Community', Icon: IconUsers },
  { to: '/news', label: 'News', Icon: IconNews },
  { to: '/regole', label: 'Regole', Icon: IconBook },
];

function notificationLabel(type: string) {
  switch (type) {
    case 'dm': return '💬 Nuovo messaggio';
    case 'report_status': return '🚩 Segnalazione aggiornata';
    case 'account_sospeso': return '⛔ Account sospeso';
    case 'account_riattivato': return '✅ Account riattivato';
    default: return '🔔 Notifica';
  }
}

function Notifications() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const count = useAsync(() => unreadNotificationsCount(profile!.id), [profile!.id], { interval: 30_000 });
  const list = useAsync(() => listNotifications(profile!.id), [profile!.id], { enabled: open });

  return (
    <>
      <Button variant="ghost" size="sm" aria-label="Notifiche" onClick={() => setOpen(true)} style={{ position: 'relative' }}>
        <IconBell width={18} />
        {!!count.data && <span className="bell-dot">{count.data > 9 ? '9+' : count.data}</span>}
      </Button>
      {open && (
        <Modal title="Notifiche" onClose={() => setOpen(false)}>
          {!list.data?.length && <p className="muted small">Nessuna notifica.</p>}
          <div className="stack">
            {list.data?.map(n => (
              <button key={n.id} className="card-flat" style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', opacity: n.read_at ? .6 : 1 }}
                onClick={async () => {
                  await markNotificationRead(n.id);
                  setOpen(false);
                  if (n.type === 'dm' && n.payload?.conversation_id) nav(`/community/messaggi/${n.payload.conversation_id as string}`);
                  await count.reload();
                }}>
                <b className="small">{notificationLabel(n.type)}</b>
                <div className="tiny muted">{timeAgo(n.created_at)}</div>
              </button>
            ))}
          </div>
          {!!list.data?.length && (
            <Button size="sm" variant="ghost" style={{ marginTop: 10 }}
              onClick={async () => { await markAllNotificationsRead(); await list.reload(); await count.reload(); }}>Segna tutte come lette</Button>
          )}
        </Modal>
      )}
    </>
  );
}

export function AppShell() {
  const { profile, session } = useAuth();
  const { theme, toggle } = useTheme();
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');

  useEffect(() => {
    if (!session) return;
    void touchPresence();
    const id = setInterval(() => { void touchPresence(); }, 60_000);
    return () => clearInterval(id);
  }, [session]);

  return (
    <>
      <header className="topbar">
        <Link to="/" className="logo" aria-label="FantaProf, home"><i />FANTAPROF</Link>
        <nav className="topnav" aria-label="Principale">
          {NAV.filter(n => session || n.to !== '/community').map(n => <NavLink key={n.to} to={n.to} end={n.end} className={cls}>{n.label}</NavLink>)}
          {profile?.is_superadmin && <NavLink to="/admin" className={cls}>SuperAdmin</NavLink>}
        </nav>
        <span className="spacer" />
        {session && profile && <Notifications />}
        <Button variant="ghost" size="sm" onClick={toggle} aria-label={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}>
          {theme === 'dark' ? <IconSun width={18} /> : <IconMoon width={18} />}
        </Button>
        {session && profile ? (
          <Link to="/profilo" aria-label="Il tuo profilo" className="row" style={{ textDecoration: 'none' }}>
            <Avatar profile={profile} />
          </Link>
        ) : (
          <>
            <Link to="/accedi" className="btn btn-sm">Accedi</Link>
            <Link to="/registrati" className="btn btn-sm btn-primary">Registrati</Link>
          </>
        )}
      </header>

      <Outlet />

      {session && (
        <nav className="bottomnav" aria-label="Principale mobile">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} className={cls}><n.Icon />{n.label}</NavLink>
          ))}
          <NavLink to="/profilo" className={cls}><IconUser />Profilo</NavLink>
          {profile?.is_superadmin && <NavLink to="/admin" className={cls}><IconShield />Super admin</NavLink>}
        </nav>
      )}
    </>
  );
}
