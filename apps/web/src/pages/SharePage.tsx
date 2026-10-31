import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useMutation } from '@tanstack/react-query';
import { ErrorBox } from '../components/ui';
import { api, errorMessage } from '../lib/api';

interface Preview {
  title: string;
  description: string;
  educator: string;
  lessons: { id: string; title: string; content: string | null }[];
}

/** Public page for a password-protected course preview link. No account needed. */
export function SharePage() {
  const { token = '' } = useParams();
  const [password, setPassword] = useState('');
  const unlock = useMutation({
    mutationFn: async () => (await api.post<{ course: Preview }>(`/api/share/${token}/unlock`, { password })).data.course,
  });

  if (unlock.data) {
    const c = unlock.data;
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">Preview shared by {c.educator}</p>
        <h1 className="text-3xl font-bold">{c.title}</h1>
        <p className="text-slate-600">{c.description}</p>
        <ol className="card list-decimal space-y-1 py-4 pl-10 pr-4 text-sm">
          {c.lessons.map((l) => (
            <li key={l.id}>{l.title}</li>
          ))}
        </ol>
        {c.lessons[0]?.content && (
          <div className="card prose-lesson p-6">
            <ReactMarkdown>{c.lessons[0].content}</ReactMarkdown>
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      className="mx-auto mt-16 max-w-sm card space-y-4 p-8"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        unlock.mutate();
      }}
    >
      <h1 className="text-xl font-bold">This preview is password-protected</h1>
      <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="btn-primary w-full" disabled={!password || unlock.isPending}>
        Unlock preview
      </button>
      {unlock.isError && <ErrorBox message={errorMessage(unlock.error)} />}
    </form>
  );
}
