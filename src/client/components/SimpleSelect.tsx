import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";

export interface Option {
  value: string;
  label: string;
}

/** A labelled single-choice select over plain options. */
export function SimpleSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
  id,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <Select
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onChange(next as string);
      }}
    >
      <SelectTrigger id={id} aria-label={label} className={className ?? "min-w-36"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
