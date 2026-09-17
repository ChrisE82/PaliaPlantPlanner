/**
 * Keeps a text input in sync with a stored number (or null) while letting
 * the user freely clear and retype. Fixes the bug where clearing a
 * controlled number input and blurring away left it blank or stale, because
 * nothing forced the DOM value back when the store value didn't change (see
 * the project task spec's "Also fix" note).
 *
 * While typing: a parseable value >= min commits immediately; blank commits
 * null only when `allowNull`. Anything else (blank when not allowed, or
 * unparsed/out-of-range text) is left showing as typed, uncommitted.
 * On blur: the field is always resynced to the last committed value, so an
 * abandoned invalid edit reverts instead of staying blank or stale.
 */
import { useEffect, useState, type ChangeEvent, type FocusEventHandler } from 'react';

export interface NumberFieldOptions {
  /** Blank commits null (e.g. "no limit"). Default true. */
  allowNull?: boolean;
  min?: number;
}

export interface NumberFieldControls {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: FocusEventHandler<HTMLInputElement>;
}

function toText(n: number | null): string {
  return n === null ? '' : String(n);
}

export function useNumberField(
  stored: number | null,
  commit: (n: number | null) => void,
  options: NumberFieldOptions = {},
): NumberFieldControls {
  const { allowNull = true, min = 1 } = options;
  const [text, setText] = useState(() => toText(stored));

  // The store can change from elsewhere (reset, another field); follow it
  // whenever we're not effectively already showing it.
  useEffect(() => {
    setText(toText(stored));
  }, [stored]);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setText(raw);
    if (raw === '') {
      if (allowNull) commit(null);
      return;
    }
    const n = Number(raw);
    if (Number.isFinite(n) && n >= min) {
      commit(Math.round(n));
    }
  }

  function onBlur() {
    setText(toText(stored));
  }

  return { value: text, onChange, onBlur };
}
