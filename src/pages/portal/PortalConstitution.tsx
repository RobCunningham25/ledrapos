import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Search, BookOpen, ChevronDown, X } from 'lucide-react';

interface Section {
  id: string;
  title: string;
  body: string;
  sort_order: number | null;
  source: string | null;
}

// PDF extraction leaves hard line wraps mid-sentence; rebuild paragraphs,
// starting a new one on blank lines and numbered-clause starts (e.g. "5.2").
function toParagraphs(body: string): string[] {
  const paras: string[] = [];
  let current = '';
  const flush = () => { if (current.trim()) paras.push(current.trim()); current = ''; };
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) { flush(); continue; }
    if (/^\d{1,2}\.\d{1,2}(\.\d{1,2})?\s/.test(t) || /^[•▪-]\s/.test(t) || /^\([a-z]\)\s/i.test(t)) flush();
    current = current ? current + ' ' + t : t;
  }
  flush();
  return paras;
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  // With a capturing separator, matches land at odd indices of split()
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <mark key={i} style={{ background: 'var(--portal-accent)', color: '#FFFFFF', borderRadius: 2, padding: '0 2px' }}>{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

export default function PortalConstitution() {
  const { member } = usePortalAuth();
  const venueId = member?.venue_id ?? '';
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: sections = [], isLoading } = useQuery({
    queryKey: ['portal-constitution', venueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_knowledge')
        .select('id, title, body, sort_order, source')
        .eq('venue_id', venueId)
        .eq('category', 'constitution')
        .eq('is_published', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as Section[];
    },
    enabled: !!venueId,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  const activeQuery = query.trim();

  // Server-side FTS (stemmed, title-weighted) for queries; TOC otherwise
  const { data: matchIds } = useQuery({
    queryKey: ['portal-constitution-search', venueId, activeQuery],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_knowledge')
        .select('id')
        .eq('venue_id', venueId)
        .eq('category', 'constitution')
        .eq('is_published', true)
        .textSearch('search_tsv', activeQuery, { type: 'websearch', config: 'english' });
      if (error) throw error;
      return new Set((data || []).map(r => r.id));
    },
    enabled: !!venueId && activeQuery.length >= 2,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const searching = activeQuery.length >= 2;
  const visible = useMemo(
    () => (searching && matchIds ? sections.filter(s => matchIds.has(s.id)) : sections),
    [searching, matchIds, sections],
  );
  const terms = useMemo(
    () => (searching ? activeQuery.split(/\s+/).filter(t => t.length >= 3) : []),
    [searching, activeQuery],
  );

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const source = sections[0]?.source;

  return (
    <div style={{ paddingBottom: 100, maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--portal-text-primary)', margin: 0 }}>
        Club Constitution
      </h1>
      {source && (
        <p style={{ fontSize: 14, color: 'var(--portal-text-muted)', margin: '4px 0 0' }}>{source}</p>
      )}

      {/* Search */}
      <div style={{ position: 'relative', margin: '16px 0 20px' }}>
        <Search size={18} color="var(--portal-text-muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search the constitution… e.g. guests, caravan sites, fees"
          style={{
            width: '100%', height: 48, padding: '0 44px',
            background: 'var(--portal-card-bg)', border: `1px solid var(--portal-card-border)`,
            borderRadius: 'var(--portal-card-radius)', boxShadow: 'var(--portal-card-shadow)',
            fontSize: 15, color: 'var(--portal-text-primary)', outline: 'none',
          }}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)',
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {searching && matchIds && (
        <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', margin: '0 0 12px' }}>
          {visible.length === 0
            ? 'No sections match — try fewer or different words.'
            : `${visible.length} section${visible.length === 1 ? '' : 's'} match`}
        </p>
      )}

      {isLoading ? (
        <div>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse" style={{
              height: 52, background: 'var(--portal-card-bg)', border: `1px solid var(--portal-card-border)`,
              borderRadius: 'var(--portal-card-radius)', marginBottom: 8,
            }} />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 160, justifyContent: 'center' }}>
          <BookOpen size={40} color="var(--portal-card-border)" />
          <p style={{ fontSize: 14, color: 'var(--portal-text-muted)', marginTop: 8 }}>Constitution not available yet</p>
        </div>
      ) : (
        <div>
          {visible.map(s => {
            const isOpen = expanded.has(s.id) || (searching && visible.length <= 3);
            return (
              <div key={s.id} style={{
                background: 'var(--portal-card-bg)', border: `1px solid var(--portal-card-border)`,
                borderRadius: 'var(--portal-card-radius)', boxShadow: 'var(--portal-card-shadow)', marginBottom: 8,
              }}>
                <button
                  onClick={() => toggle(s.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: 'var(--portal-primary)',
                    minWidth: 26, textAlign: 'right', flexShrink: 0,
                  }}>
                    {s.sort_order}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--portal-text-primary)', flex: 1 }}>
                    <Highlighted text={s.title} terms={terms} />
                  </span>
                  <ChevronDown
                    size={18}
                    color="var(--portal-text-muted)"
                    style={{ flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
                  />
                </button>
                {isOpen && (
                  <div style={{ padding: '0 16px 16px 54px' }}>
                    {toParagraphs(s.body).map((p, i) => (
                      <p key={i} style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--portal-text-secondary)', margin: '0 0 10px' }}>
                        <Highlighted text={p} terms={terms} />
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
