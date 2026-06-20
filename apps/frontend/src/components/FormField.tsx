import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

/**
 * Form-field primitive — wraps a label + control + (optional) error
 * + helper. Used by every form in the app so the visual rhythm is
 * consistent and the error path is the same everywhere.
 */

export interface FieldBase {
  label: string;
  name: string;
  required?: boolean;
  error?: string | null;
  helper?: string;
}

export interface TextFieldProps extends FieldBase, Omit<InputHTMLAttributes<HTMLInputElement>, 'name'> {
  type?: 'text' | 'email' | 'url' | 'number';
}

export function TextField({ label, name, required, error, helper, type = 'text', ...rest }: TextFieldProps) {
  const errorId = error ? `${name}-error` : undefined;
  const helperId = helper ? `${name}-helper` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-stone-800">
        {label}
        {required ? <span className="ml-0.5 text-clay-500">*</span> : null}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        aria-invalid={Boolean(error)}
        aria-describedby={[errorId, helperId].filter(Boolean).join(' ') || undefined}
        className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-forest-500/30 ${
          error
            ? 'border-clay-500 bg-clay-500/5 focus:border-clay-500'
            : 'border-stone-200 bg-white focus:border-forest-500'
        }`}
        {...rest}
      />
      {helper && !error ? <p id={helperId} className="text-xs text-stone-500">{helper}</p> : null}
      {error ? <p id={errorId} className="text-xs text-clay-500">{error}</p> : null}
    </div>
  );
}

export interface TextAreaFieldProps extends FieldBase, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'name'> {}

export function TextAreaField({ label, name, required, error, helper, ...rest }: TextAreaFieldProps) {
  const errorId = error ? `${name}-error` : undefined;
  const helperId = helper ? `${name}-helper` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-stone-800">
        {label}
        {required ? <span className="ml-0.5 text-clay-500">*</span> : null}
      </label>
      <textarea
        id={name}
        name={name}
        rows={4}
        aria-invalid={Boolean(error)}
        aria-describedby={[errorId, helperId].filter(Boolean).join(' ') || undefined}
        className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-forest-500/30 ${
          error
            ? 'border-clay-500 bg-clay-500/5 focus:border-clay-500'
            : 'border-stone-200 bg-white focus:border-forest-500'
        }`}
        {...rest}
      />
      {helper && !error ? <p id={helperId} className="text-xs text-stone-500">{helper}</p> : null}
      {error ? <p id={errorId} className="text-xs text-clay-500">{error}</p> : null}
    </div>
  );
}

export interface SelectFieldProps extends FieldBase, Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'name'> {
  children: ReactNode;
}

export function SelectField({ label, name, required, error, helper, children, ...rest }: SelectFieldProps) {
  const errorId = error ? `${name}-error` : undefined;
  const helperId = helper ? `${name}-helper` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-stone-800">
        {label}
        {required ? <span className="ml-0.5 text-clay-500">*</span> : null}
      </label>
      <select
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={[errorId, helperId].filter(Boolean).join(' ') || undefined}
        className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-forest-500/30 ${
          error
            ? 'border-clay-500 bg-clay-500/5 focus:border-clay-500'
            : 'border-stone-200 bg-white focus:border-forest-500'
        }`}
        {...rest}
      >
        {children}
      </select>
      {helper && !error ? <p id={helperId} className="text-xs text-stone-500">{helper}</p> : null}
      {error ? <p id={errorId} className="text-xs text-clay-500">{error}</p> : null}
    </div>
  );
}