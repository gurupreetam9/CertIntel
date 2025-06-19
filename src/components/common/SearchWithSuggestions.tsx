
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from '@/components/ui/popover';
import { Search, X } from 'lucide-react';

// Type for searchable data items
export interface SearchableItem {
  id: string; // Unique key for the item
  value: string; // The string value to search against and display by default
  display?: React.ReactNode; // Optional custom display for the suggestion
}

interface SearchWithSuggestionsProps {
  onSearch: (searchTerm: string) => void;
  placeholder?: string;
  initialValue?: string;
  searchableData?: SearchableItem[]; // Data to search for suggestions
}

export default function SearchWithSuggestions({
  onSearch,
  placeholder = "Search...",
  initialValue = "",
  searchableData = [],
}: SearchWithSuggestionsProps) {
  const [inputValue, setInputValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<SearchableItem[]>([]);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Sync initialValue if it changes externally
    setInputValue(initialValue);
  }, [initialValue]);

  // Generate suggestions based on inputValue and searchableData
  useEffect(() => {
    if (inputValue.trim().length > 0 && searchableData.length > 0) {
      const lowercasedInput = inputValue.toLowerCase();
      const filteredSuggestions = searchableData
        .filter(item => item.value.toLowerCase().includes(lowercasedInput))
        .slice(0, 7); // Limit to 7 suggestions

      setSuggestions(filteredSuggestions);
      setIsPopoverOpen(filteredSuggestions.length > 0);
    } else {
      setSuggestions([]);
      setIsPopoverOpen(false);
    }
  }, [inputValue, searchableData]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
  };

  const handleSuggestionClick = (suggestion: SearchableItem) => {
    setInputValue(suggestion.value);
    onSearch(suggestion.value); // Immediately trigger search on suggestion click
    setSuggestions([]);
    setIsPopoverOpen(false);
    inputRef.current?.focus();
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
    onSearch("");
    inputRef.current?.focus();
  };
  
  // Handle clicking outside to close popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isPopoverOpen &&
        inputRef.current && !inputRef.current.contains(event.target as Node) &&
        popoverContentRef.current && !popoverContentRef.current.contains(event.target as Node)
      ) {
        setIsPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isPopoverOpen]);


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
              className="pr-20 text-base md:text-sm"
              onFocus={() => { if (suggestions.length > 0) setIsPopoverOpen(true); }}
            />
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
        <PopoverContent 
            ref={popoverContentRef}
            className="w-[--radix-popover-trigger-width] p-0" 
            align="start"
            // Prevent focus from being stolen by PopoverContent, allowing continued typing
            onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {suggestions.length > 0 && (
            <ul className="py-1">
              {suggestions.map((suggestion) => (
                <li key={suggestion.id}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start px-3 py-1.5 h-auto text-sm font-normal"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion.display || suggestion.value}
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
