import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium ${isActive ? 'text-brand-600' : 'text-slate-600 hover:text-slate-900'}`;

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link to="/" className="text-lg font-bold text-brand-700">
          TalentEd
        </Link>
        <NavLink to="/" end className={linkClass}>
          Courses
        </NavLink>
        {user && (
          <NavLink to="/my-learning" className={linkClass}>
            My learning
          </NavLink>
        )}
        {user?.role === 'EDUCATOR' && (
          <NavLink to="/educator" className={linkClass}>
            Teach
          </NavLink>
        )}
        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <>
              <span className="hidden text-sm text-slate-500 sm:inline">
                {user.name} · {user.role.toLowerCase()}
              </span>
              <button
                className="btn-secondary"
                onClick={async () => {
                  await logout();
                  navigate('/');
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-secondary">
                Log in
              </Link>
              <Link to="/signup" className="btn-primary">
                Sign up
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
