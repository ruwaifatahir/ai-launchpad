import { useId, useState, type KeyboardEvent } from 'react';
import { CloseIcon } from '@/shared/ui/icon';
import { TOPIC_LIMITS } from '../config/persona-limits';

type TopicsFieldProps = {
  topics: string[];
  error: string | undefined;
  onChange: (topics: string[]) => void;
};

/** Topics as chips: type one and press Enter to add it, or remove one with its button. */
export function TopicsField({ topics, error, onChange }: TopicsFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const full = topics.length >= TOPIC_LIMITS.count;

  function add() {
    const topic = draft.trim();
    if (!topic || full) return;
    // Already there, in any letter case: nothing to add, and the draft clears as if it were.
    if (!topics.some((existing) => existing.toLowerCase() === topic.toLowerCase())) onChange([...topics, topic]);
    setDraft('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' || event.key === ',') {
      // Enter adds a Topic here; it must not save the whole form.
      event.preventDefault();
      add();
    } else if (event.key === 'Backspace' && draft === '' && topics.length > 0) {
      onChange(topics.slice(0, -1));
    }
  }

  return (
    <div className="agent-field">
      <div className="agent-field-top">
        <label htmlFor={id}>Topics</label>
        <span id={`${id}-count`} className="agent-count">
          {topics.length} / {TOPIC_LIMITS.count}
          <span className="sr-only"> topics</span>
        </span>
      </div>
      <div className="agent-topics" data-invalid={error ? true : undefined}>
        {topics.length > 0 && (
          <ul className="agent-chips" aria-label="Topics">
            {topics.map((topic, index) => (
              <li key={topic} className="agent-chip">
                <span>{topic}</span>
                <button
                  type="button"
                  aria-label={`Remove ${topic}`}
                  onClick={() => onChange(topics.filter((_, other) => other !== index))}
                >
                  <CloseIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          id={id}
          className="agent-topics-input"
          name="topic"
          type="text"
          value={draft}
          maxLength={TOPIC_LIMITS.length}
          disabled={full}
          placeholder={full ? 'Ten topics is the most an agent takes' : 'Add a topic and press Enter…'}
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint ${id}-count${error ? ` ${id}-error` : ''}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
        />
      </div>
      <p id={`${id}-hint`} className="agent-field-hint">
        What your agent talks about, up to {TOPIC_LIMITS.count}, each up to {TOPIC_LIMITS.length} characters.
      </p>
      {error && (
        <p id={`${id}-error`} className="agent-field-error">
          {error}
        </p>
      )}
    </div>
  );
}
