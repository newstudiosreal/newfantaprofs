import { NavLink, Route, Routes } from 'react-router-dom';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { listMyConversations } from '@/lib/api';
import { Search } from './Search';
import { Conversations } from './Conversations';
import { Thread } from './Thread';

export default function CommunityLayout() {
  const { profile } = useAuth();
  const me = profile!;
  const convs = useAsync(() => listMyConversations(me.id), [me.id], { interval: 15_000 });
  const unread = (convs.data ?? []).reduce((n, c) => n + c.unread, 0);

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Community">
        <NavLink to="" end className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>Cerca</NavLink>
        <NavLink to="messaggi" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
          Messaggi{unread > 0 ? <span className="dot">{unread > 9 ? '9+' : unread}</span> : null}
        </NavLink>
      </div>
      <main className="page">
        <Routes>
          <Route index element={<Search />} />
          <Route path="messaggi" element={<Conversations data={convs.data} loading={convs.loading} error={convs.error} onReload={convs.reload} />} />
          <Route path="messaggi/:id" element={<Thread />} />
          <Route path="*" element={<p className="muted">Sezione non trovata.</p>} />
        </Routes>
      </main>
    </>
  );
}
