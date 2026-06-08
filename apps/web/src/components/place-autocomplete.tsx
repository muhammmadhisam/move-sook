'use client';

import { useEffect, useRef, useState } from 'react';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Input } from '@movesook/ui';

export interface PlaceResult {
  lat: number;
  lng: number;
  address: string;
}

interface PlaceAutocompleteProps {
  onSelect: (result: PlaceResult) => void;
  placeholder?: string;
  className?: string;
}

function AutocompleteInner({
  onSelect,
  placeholder,
}: {
  onSelect: (r: PlaceResult) => void;
  placeholder?: string;
}) {
  const places = useMapsLibrary('places');
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  // Debounced suggestion fetch (TH-restricted), keyed by the typed text.
  useEffect(() => {
    if (!places || text.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let active = true;
    const handle = setTimeout(async () => {
      if (!sessionRef.current) sessionRef.current = new places.AutocompleteSessionToken();
      try {
        const { suggestions: result } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: text,
            includedRegionCodes: ['th'],
            sessionToken: sessionRef.current,
          });
        if (active) {
          setSuggestions(result);
          setOpen(true);
        }
      } catch {
        if (active) setSuggestions([]);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [places, text]);

  const choose = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    const prediction = suggestion.placePrediction;
    if (!prediction) return;
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });
    sessionRef.current = null; // close the billing session after a pick
    const loc = place.location;
    const address = place.formattedAddress ?? prediction.text?.text ?? '';
    setText(address);
    setOpen(false);
    setSuggestions([]);
    if (loc) onSelect({ lat: loc.lat(), lng: loc.lng(), address });
  };

  return (
    <div className="relative">
      <Input
        value={text}
        placeholder={placeholder ?? 'ค้นหาสถานที่'}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover text-popover-foreground shadow-lg">
          {suggestions.map((s, i) => (
            <li key={s.placePrediction?.placeId ?? i}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
              >
                {s.placePrediction?.text?.text ?? ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Google Places autocomplete, themed with the app's Input + dropdown. Typing
 * suggests TH places; selecting one yields coordinates + formatted address.
 * Renders nothing without an API key (the LocationPicker below shows the hint).
 */
export function PlaceAutocomplete({ onSelect, placeholder, className }: PlaceAutocompleteProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  return (
    <div className={className}>
      <APIProvider apiKey={apiKey}>
        <AutocompleteInner onSelect={onSelect} placeholder={placeholder} />
      </APIProvider>
    </div>
  );
}
