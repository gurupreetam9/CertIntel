
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from '@/components/ui/popover';
import { Search, Loader2, X } from 'lucide-react';
import type { PredictNextWordsOutput } from '@/ai/flows/predict-next-words';

interface SearchWithSuggestionsProps {
  onSearch: (searchTerm: string) => void;
  placeholder?: string;
  initialValue?: string;
}

export default function SearchWithSuggestions({
  onSearch,
  placeholder = "Search...",
  initialValue = "",
}: SearchWithSuggestionsProps) {
  const [inputValue, setInputValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchSuggestions = useCallback(async (text: string) => {
    if (!text.trim() || text.length < 3) { // Only fetch for reasonably long text
      setSuggestions([]);
      setIsPopoverOpen(false);
      return;
    }
    setIsLoadingSuggestions(true);
    try {
      const response = await fetch('/api/ai/predict-next-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentText: text }),
      });
      if (!response.ok) throw new Error('Failed to fetch suggestions');
      const data: PredictNextWordsOutput = await response.json();
      const uniquePredictions = Array.from(new Set(data.predictions || []));
      setSuggestions(uniquePredictions.slice(0, 5)); // Limit to 5 suggestions
      setIsPopoverOpen(uniquePredictions.length > 0);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      setSuggestions([]);
      setIsPopoverOpen(false);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (inputValue && document.activeElement === inputRef.current) { // Only fetch if input is focused
         fetchSuggestions(inputValue);
      } else {
        setSuggestions([]);
        setIsPopoverOpen(false);
      }
    }, 500); // Debounce: 500ms

    return () => {
      clearTimeout(handler);
    };
  }, [inputValue, fetchSuggestions]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const handleSuggestionClick = (suggestion: string) => {
    const newText = inputValue.substring(0, inputValue.lastIndexOf(' ') + 1) + suggestion + ' ';
    setInputValue(newText);
    setSuggestions([]);
    setIsPopoverOpen(false);
    inputRef.current?.focus();
    // Optionally trigger new suggestions fetch immediately
    // fetchSuggestions(newText); 
  };

  const handleSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setSuggestions([]);
    setIsPopoverOpen(false);
    onSearch(inputValue);
  };

  const handleClearSearch = () => {
    setInputValue("");
    setSuggestions([]);
    setIsPopoverOpen(false);
    onSearch(""); // Trigger search with empty term to reset filters
    inputRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <Popover open={isPopoverOpen && suggestions.length > 0} onOpenChange={setIsPopoverOpen}>
        <PopoverAnchor asChild>
          <div className="relative flex w-full items-center">
            <Input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              value={inputValue}
              onChange={handleInputChange}
              className="pr-20 text-base md:text-sm" // Adjusted padding for icons
              onFocus={() => { if (suggestions.length > 0) setIsPopoverOpen(true); }}
              // onBlur={() => setTimeout(() => setIsPopoverOpen(false), 150)} // Delay to allow click on popover
            />
            <div className="absolute right-10 top-1/2 -translate-y-1/2 flex items-center">
                {isLoadingSuggestions && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            {inputValue && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-10 h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={handleClearSearch}
                    title="Clear search"
                    >
                    <X className="h-4 w-4" />
                </Button>
            )}
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="absolute right-1 h-8 w-8 text-muted-foreground hover:text-primary"
              title="Search"
            >
              <Search className="h-5 w-5" />
            </Button>
          </div>
        </PopoverAnchor>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          {suggestions.length > 0 && (
            <ul className="py-1">
              {suggestions.map((suggestion, index) => (
                <li key={index}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start px-3 py-1.5 h-auto text-sm font-normal"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {inputValue}<strong>{suggestion}</strong>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </form>
  );
}
