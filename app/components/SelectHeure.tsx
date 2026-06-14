"use client";

const CRENEAUX: string[] = (() => {
  const liste: string[] = [];
  let h = 7, m = 30;
  while (h < 19 || (h === 19 && m === 0)) {
    liste.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += 30;
    if (m >= 60) { m -= 60; h++; }
  }
  return liste;
})();

export default function SelectHeure({
  name,
  value,
  defaultValue,
  onChange,
  className,
  required,
}: {
  name: string;
  value?: string;
  defaultValue?: string;
  onChange?: (val: string) => void;
  className?: string;
  required?: boolean;
}) {
  const isControlled = value !== undefined && onChange !== undefined;

  if (isControlled) {
    return (
      <select
        name={name}
        value={value}
        onChange={e => onChange!(e.target.value)}
        className={className}
        required={required}
      >
        <option value="">-- Choisir --</option>
        {CRENEAUX.map(h => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
    );
  }

  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      className={className}
      required={required}
    >
      <option value="">-- Choisir --</option>
      {CRENEAUX.map(h => (
        <option key={h} value={h}>{h}</option>
      ))}
    </select>
  );
}
