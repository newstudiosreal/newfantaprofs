import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Avatar, Button } from './ui';
import { IconBook, IconHome, IconMoon, IconNews, IconShield, IconSun, IconTrophy, IconUser } from './icons';

const NAV = [
  { to: '/', label: 'Home', Icon: IconHome, end: true },
  { to: '/hof', label: 'Hall of Fame', Icon: IconTrophy },
  { to: '/news', label: 'News', Icon: IconNews },
  { to: '/regole', label: 'Regole', Icon: IconBook },
];

export function AppShell() {
  const { profile, session } = useAuth();
  const { theme, toggle } = useTheme();
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');

  return (
    <>
      <header className="topbar">
        <Link to="/" className="logo" aria-label="FantaProf, home"><i />FANTAPROF</Link>
        <nav className="topnav" aria-label="Principale">
          {NAV.filter(n => session || n.to !== '/hof').map(n => <NavLink key={n.to} to={n.to} end={n.end} className={cls}>{n.label}</NavLink>)}
          {profile?.is_superadmin && <NavLink to="/admin" className={cls}>SuperAdmin</NavLink>}
        </nav>
        <span className="spacer" />
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
            <NavLink key={n.to} to={n.to} end={n.end} className={cls}><n.Icon />{n.label === 'Hall of Fame' ? 'Hall' : n.label}</NavLink>
          ))}
          <NavLink to="/profilo" className={cls}><IconUser />Profilo</NavLink>
          {profile?.is_superadmin && <NavLink to="/admin" className={cls}><IconShield />Super admin</NavLink>}
        </nav>
      )}
    </>
  );
}
