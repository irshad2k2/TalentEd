import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { askSchema } from '@talented/shared';
import { api, errorMessage } from '../lib/api';

interface Citation {
  lessonId: string;
  lessonTitle: string;
  snippet: string;
}
interface Message {
  role: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
}

/** Chat with the course's AI tutor. Answers come only from this course's lessons, with sources. */
export function TutorPanel({ courseId }: { courseId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [sessionId, setSessionId] = useState<string>();
  const [validation, setValidation] = useState('');

  const ask = useMutation({
    mutationFn: async (q: string) =>
      (await api.post<{ answer: string; citations: Citation[]; sessionId: string }>(`/api/courses/${courseId}/ai/ask`, {
        question: q,
        sessionId,
      })).data,
    onSuccess: (data) => {
      setSessionId(data.sessionId); // follow-up questions keep context
      setMessages((m) => [...m, { role: 'assistant', text: data.answer, citations: data.citations }]);
    },
    onError: (err) => setMessages((m) => [...m, { role: 'assistant', text: `⚠ ${errorMessage(err)}` }]),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = askSchema.safeParse({ question });
    if (!parsed.success) return setValidation(parsed.error.issues[0].message);
    setValidation('');
    setMessages((m) => [...m, { role: 'user', text: parsed.data.question }]);
    setQuestion('');
    ask.mutate(parsed.data.question);
  }

  return (
    <aside className="card flex h-[32rem] flex-col">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold">AI tutor</h2>
        <p className="text-xs text-slate-500">Answers come from this course's lessons, with sources.</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-slate-400">Ask anything about this course, e.g. "When should I use let instead of const?"</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div
              className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-sm ${
                m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {m.text}
            </div>
            {m.citations && m.citations.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {m.citations.map((c, j) => (
                  <Link
                    key={`${c.lessonId}-${j}`}
                    to={`/courses/${courseId}/lessons/${c.lessonId}`}
                    title={c.snippet}
                    className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-brand-500"
                  >
                    [{j + 1}] {c.lessonTitle}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
        {ask.isPending && <p className="text-sm text-slate-400">Thinking...</p>}
      </div>
      <form onSubmit={submit} className="border-t border-slate-200 p-3">
        <div className="flex gap-2">
          <input
            className="input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask the tutor"
            maxLength={1000}
          />
          <button className="btn-primary" disabled={ask.isPending || !question.trim()}>
            Ask
          </button>
        </div>
        {validation && <p className="mt-1 text-xs text-red-600">{validation}</p>}
      </form>
    </aside>
  );
}
