
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from '@/components/ui/popover';
import { Search, X } from 'lucide-react';
import { cn } from "@/lib/utils"; // Added this import

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
  const [activeIndex, setActiveIndex] = useState<number>(-1); // -1 means no item is active

  const inputRef = useRef<HTMLInputElement>(null);
  const popoverContentRef = useRef<HTMLDivElement>(null);
  const suggestionRefs = useRef<(HTMLLIElement | null)[]>([]);

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
      setActiveIndex(-1); // Reset active index when suggestions change
      suggestionRefs.current = filteredSuggestions.map(() => null);
    } else {
      setSuggestions([]);
      setIsPopoverOpen(false);
      setActiveIndex(-1);
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
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (activeIndex > -1 && suggestions[activeIndex]) {
      handleSuggestionClick(suggestions[activeIndex]);
    } else {
      onSearch(inputValue);
    }
    setSuggestions([]);
    setIsPopoverOpen(false);
    setActiveIndex(-1);
  };

  const handleClearSearch = () => {
    setInputValue("");
    setSuggestions([]);
    setIsPopoverOpen(false);
    setActiveIndex(-1);
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

  useEffect(() => {
    if (activeIndex > -1 && suggestionRefs.current[activeIndex]) {
      suggestionRefs.current[activeIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeIndex]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isPopoverOpen || suggestions.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex(prev => (prev + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
        if (activeIndex > -1) {
          event.preventDefault(); // Prevent form submission if selecting suggestion
          handleSuggestionClick(suggestions[activeIndex]);
        }
        // If no suggestion active, allow default form submission (handled by form's onSubmit)
        break;
      case 'Escape':
        event.preventDefault();
        setIsPopoverOpen(false);
        setActiveIndex(-1);
        break;
    }
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
              onKeyDown={handleKeyDown}
              className="pr-20 text-base md:text-sm"
              onFocus={() => { if (suggestions.length > 0 && inputValue.trim().length > 0) setIsPopoverOpen(true); }}
              aria-autocomplete="list"
              aria-expanded={isPopoverOpen && suggestions.length > 0}
              aria-controls="suggestions-list"
              aria-activedescendant={activeIndex > -1 ? `suggestion-item-${suggestions[activeIndex]?.id}` : undefined}
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
            className="w-[--radix-popover-trigger-width] p-0 max-h-60 overflow-y-auto" 
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()} // Prevent focus from being stolen by PopoverContent
        >
          {suggestions.length > 0 && (
            <ul id="suggestions-list" role="listbox" className="py-1">
              {suggestions.map((suggestion, index) => (
                <li 
                  key={suggestion.id}
                  id={`suggestion-item-${suggestion.id}`}
                  ref={el => suggestionRefs.current[index] = el}
                  role="option"
                  aria-selected={activeIndex === index}
                  className={cn(
                    "w-full justify-start px-3 py-1.5 h-auto text-sm font-normal cursor-pointer",
                    "hover:bg-accent hover:text-accent-foreground",
                    activeIndex === index && "bg-accent text-accent-foreground"
                  )}
                  onClick={() => handleSuggestionClick(suggestion)}
                  onMouseEnter={() => setActiveIndex(index)} // Optional: highlight on mouse enter
                >
                  {suggestion.display || suggestion.value}
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </form>
  );
}
