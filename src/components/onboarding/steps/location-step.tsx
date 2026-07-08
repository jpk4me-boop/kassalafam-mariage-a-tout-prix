"use client";

import {
  ORIGIN_COUNTRY_MAX,
  REGION_MAX,
} from "@/lib/onboarding/options";
import { Input, Label } from "@/components/ui/field";
import { StepShell } from "@/components/onboarding/step-shell";

export function LocationStep({
  country,
  city,
  originCountry,
  region,
  onCountryChange,
  onCityChange,
  onOriginCountryChange,
  onRegionChange,
  disabled,
}: {
  country: string;
  city: string;
  originCountry: string;
  region: string;
  onCountryChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onOriginCountryChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <StepShell
      title="Où vivez-vous ?"
      description="Votre lieu de résidence et vos origines aident à proposer des rencontres pertinentes."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="country">Pays de résidence</Label>
          <Input
            id="country"
            name="country"
            type="text"
            autoComplete="country-name"
            placeholder="Votre pays"
            value={country}
            onChange={(e) => onCountryChange(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor="city">Ville de résidence</Label>
          <Input
            id="city"
            name="city"
            type="text"
            autoComplete="address-level2"
            placeholder="Votre ville"
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="origin_country">Pays d’origine</Label>
          <Input
            id="origin_country"
            name="origin_country"
            type="text"
            maxLength={ORIGIN_COUNTRY_MAX}
            placeholder="Votre pays d'origine"
            value={originCountry}
            onChange={(e) => onOriginCountryChange(e.target.value)}
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor="region">Région / zone</Label>
          <Input
            id="region"
            name="region"
            type="text"
            maxLength={REGION_MAX}
            placeholder="Par exemple : Dakar, Île-de-France…"
            value={region}
            onChange={(e) => onRegionChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      </div>
    </StepShell>
  );
}
