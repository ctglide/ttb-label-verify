"use client";

import type { ApplicationData, BeverageType } from "@/types/label";

interface ApplicationFormProps {
  data: ApplicationData;
  onChange: (data: ApplicationData) => void;
  disabled?: boolean;
}

const BEVERAGE_TYPES: { value: BeverageType; label: string }[] = [
  { value: "distilled_spirits", label: "Distilled Spirits" },
  { value: "wine", label: "Wine" },
  { value: "malt_beverage", label: "Malt Beverage / Beer" },
];

interface FieldDef {
  key: keyof ApplicationData;
  label: string;
  placeholder: string;
  required: boolean;
}

const FIELDS: FieldDef[] = [
  { key: "brandName", label: "Brand Name", placeholder: "OLD TOM DISTILLERY", required: true },
  { key: "classType", label: "Class / Type", placeholder: "Kentucky Straight Bourbon Whiskey", required: true },
  { key: "alcoholContent", label: "Alcohol Content", placeholder: "45% Alc./Vol. (90 Proof)", required: true },
  { key: "netContents", label: "Net Contents", placeholder: "750 mL", required: true },
  { key: "producerName", label: "Producer / Bottler Name", placeholder: "Old Tom Distillery LLC", required: true },
  { key: "producerAddress", label: "Producer / Bottler Address", placeholder: "Louisville, KY 40202", required: true },
  { key: "countryOfOrigin", label: "Country of Origin", placeholder: "USA (leave blank if domestic)", required: false },
];

export default function ApplicationForm({
  data,
  onChange,
  disabled,
}: ApplicationFormProps) {
  const handleChange = (key: keyof ApplicationData, value: string) => {
    onChange({ ...data, [key]: value });
  };

  return (
    <fieldset disabled={disabled} className="space-y-4">
      <legend className="sr-only">Application Data Fields</legend>

      {/* Beverage type selector */}
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Beverage Type <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-3 flex-wrap">
          {BEVERAGE_TYPES.map(({ value, label }) => (
            <label
              key={value}
              className={`
                flex items-center gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer transition-colors
                ${data.beverageType === value
                  ? "border-brand-500 bg-brand-50 text-brand-700 font-medium"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
                }
              `}
            >
              <input
                type="radio"
                name="beverageType"
                value={value}
                checked={data.beverageType === value}
                onChange={() => handleChange("beverageType", value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Text fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FIELDS.map(({ key, label, placeholder, required }) => (
          <div key={key} className={key === "producerAddress" ? "sm:col-span-2" : ""}>
            <label
              htmlFor={`field-${key}`}
              className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1"
            >
              {label}
              {required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <input
              id={`field-${key}`}
              type="text"
              value={(data[key] as string) ?? ""}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={placeholder}
              className="
                w-full rounded-md border border-slate-200 px-3 py-2 text-sm
                text-slate-800 placeholder:text-slate-400
                focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent
                disabled:bg-slate-50 disabled:text-slate-400
              "
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
