/**
 * @file DbAutocompleteInput.tsx
 * @description Real DB-Connected Search Input Component with Live Typeahead Autocomplete Suggestions.
 * Queries PostgreSQL backend (/api/network-graph/autocomplete) and renders a floating dropdown menu.
 */

import React, { useState, useEffect, useRef } from 'react';

export interface SuggestionItem {
  id: string;
  label: string;
  type: string;
  icon: string;
  sub: string;
  value: string;
  related_case_id?: string;
}

interface DbAutocompleteInputProps {
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  onSelectSuggestion?: (item: SuggestionItem) => void;
  onSearch?: (val: string) => void;
  inputStyle?: React.CSSProperties;
}

export const DbAutocompleteInput: React.FC<DbAutocompleteInputProps> = ({
  placeholder,
  value,
  onChange,
  onSelectSuggestion,
  onSearch,
  inputStyle
}) => {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Execute Search action (by button click or Enter key)
  const executeSearch = () => {
    setIsOpen(false);
    if (focusedIndex >= 0 && focusedIndex < suggestions.length) {
      handleSelect(suggestions[focusedIndex]);
    } else if (onSearch) {
      onSearch(value);
    }
  };

  // Debounced DB query
  useEffect(() => {
    if (!value || value.trim().length < 1) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/network-graph/autocomplete?q=${encodeURIComponent(value.trim())}`);
        if (res.ok) {
          const data = await res.json();
          if (data.suggestions && data.suggestions.length > 0) {
            setSuggestions(data.suggestions);
            setIsOpen(true);
          } else {
            setSuggestions([]);
            setIsOpen(false);
          }
        }
      } catch (err) {
        console.error('Error fetching autocomplete options:', err);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [value]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: SuggestionItem) => {
    onChange(item.value);
    setIsOpen(false);
    if (onSelectSuggestion) {
      onSelectSuggestion(item);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (focusedIndex >= 0 && focusedIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[focusedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', zIndex: 9999 }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setIsOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                executeSearch();
              } else {
                handleKeyDown(e);
              }
            }}
            style={{
              width: '100%',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              color: '#0b1e36',
              padding: '0.7rem 2.5rem 0.7rem 1rem',
              borderRadius: '8px',
              outline: 'none',
              fontSize: '0.9rem',
              fontWeight: 700,
              fontFamily: "'Outfit', sans-serif",
              boxSizing: 'border-box',
              ...inputStyle
            }}
          />

          {value && (
            <button
              onClick={() => {
                onChange('');
                setSuggestions([]);
                setIsOpen(false);
              }}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '1rem',
                cursor: 'pointer',
                padding: 0
              }}
            >
              ✕
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={executeSearch}
          style={{
            background: 'linear-gradient(135deg, #0b1e36 0%, #173259 100%)',
            color: '#c5a059',
            border: '1.5px solid #c5a059',
            padding: '0.7rem 1.2rem',
            borderRadius: '8px',
            fontSize: '0.88rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            boxShadow: '0 4px 12px rgba(11, 30, 54, 0.2)',
            whiteSpace: 'nowrap',
            transition: 'all 0.15s ease'
          }}
        >
          🔍 {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Floating Typeahead Autocomplete Dropdown List */}
      {isOpen && suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '6px',
          background: '#ffffff',
          border: '1.5px solid #cbd5e1',
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(11, 30, 54, 0.15)',
          zIndex: 9999,
          maxHeight: '300px',
          overflowY: 'auto'
        }}>
          <div style={{ padding: '6px 12px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ⚡ DATABASE SEARCH TYPEAHEAD SUGGESTIONS ({suggestions.length})
          </div>

          {suggestions.map((item, index) => (
            <div
              key={`${item.id}-${index}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setFocusedIndex(index)}
              style={{
                padding: '10px 14px',
                borderBottom: index === suggestions.length - 1 ? 'none' : '1px solid #f1f5f9',
                background: focusedIndex === index ? '#f0f9ff' : '#ffffff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                transition: 'background 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ color: '#0b1e36', fontWeight: 800, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>
                    {item.sub}
                  </div>
                </div>
              </div>

              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#0284c7', background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                {item.type}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
